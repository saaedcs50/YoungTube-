// Read-only live-version audit for the YoungTube Worker.
//
// GET-ONLY BY CONSTRUCTION: every HTTP call in this tool goes through
// createGetOnlyFetch(), which throws on any method other than GET. There is
// no code path in this file that issues a state-changing request, touches D1
// or KV, sends a queue message, or calls an admin path.
//
// EVIDENCE IS ALLOW-LISTED: the report copies only SHAs, deployment/version
// ids, traffic percentages, binding names/types, HTTP status codes, response
// shape keys/counts, and check statuses. It never copies response bodies,
// free-form notes (unless the note is exactly a SHA or a prefix of it),
// credentials, or account identifiers. As a second layer, scrubSecrets()
// removes any exact occurrence of the supplied token/account id from the
// final report object before it is printed.
//
// Live contracts encoded here (verified against worker source at YoungTube-
// main 5b494b726d407d2881afec4e403b04e096de568e):
//   GET /api/health     -> 200, JSON { status: 'ok',
//                           service: 'youngtube-worker', timestamp: string }
//                           (worker/routes/public-read.ts, health handler)
//   GET /api/categories -> 200, JSON top-level array; the catalog-v2 handler
//                           runs before the public-read handler
//                           (worker/index.ts), so the live shape is the
//                           getCategories() array: every item is an object
//                           with a non-empty string `id` and a string
//                           `label`. Item values are NOT recorded: they may
//                           come from KV, so only keys and counts are kept.
//
// Cloudflare API endpoints (Cloudflare Workers API documentation):
//   GET /accounts/{account}/workers/scripts/{script}/deployments
//       -> result.deployments[]; the first entry is the latest deployment
//          actively serving traffic. Each entry: id, created_on, source,
//          strategy, versions[{ percentage, version_id }],
//          annotations{ "workers/message", "workers/triggered_by" }.
//   GET /accounts/{account}/workers/scripts/{script}/settings
//       -> result.bindings[{ name, type, ... }]. On a 404 this tool retries
//          once against .../script-settings (the non-versioned settings
//          path) and records which endpoint answered; both are GET-only.
//   Accepted token permission for the deployments read, per the same
//   documentation page, includes "Workers Scripts Read".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_REPOSITORY = 'saaedcs50/YoungTube-';
export const DEFAULT_REF = 'main';
export const DEFAULT_WORKER = 'youngtube-worker';
export const DEFAULT_BASE_URL = 'https://youngtube-worker.saaedbelal.workers.dev';
export const FETCH_TIMEOUT_MS = 15000;

// Binding types as exposed by the Cloudflare script-settings API, keyed by
// the wrangler.toml section that declares them. These literals come from the
// Cloudflare TypeScript SDK binding reference (kv_namespace, d1, queue);
// if the live API ever returns a different literal for a present binding,
// the bindings check reports FAIL with both values as evidence so the
// expectation itself is diagnosable instead of silently passing.
export const EXPECTED_BINDING_TYPES = Object.freeze({
  d1_databases: 'd1',
  kv_namespaces: 'kv_namespace',
  'queues.producers': 'queue',
});

// The four baseline bindings from wrangler.toml at the base SHA. They are
// hard-checked in addition to whatever wrangler.toml declares at run time,
// and any name mapping between the two is reported explicitly.
export const BASELINE_BINDINGS = Object.freeze([
  { name: 'CATALOG_DB', type: 'd1' },
  { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace' },
  { name: 'CATALOG_DISCOVERY_QUEUE', type: 'queue' },
  { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue' },
]);

const SHA_RE = /^[0-9a-f]{40}$/;
const HEX_TOKEN_RE = /[0-9a-f]{7,40}/g;

// ---------------------------------------------------------------------------
// GET-only request layer
// ---------------------------------------------------------------------------

// Returns a fetch wrapper that ONLY issues GET requests. Any other method
// (including an explicit method option) throws before any network call.
// Other method names are deliberately not spelled out here: the single
// comparison below is the whole enforcement point.
export function createGetOnlyFetch(fetchImpl) {
  return async (url, options = {}) => {
    const method = String(options.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      throw new Error(`read-only audit refuses non-GET method: ${method}`);
    }
    return fetchImpl(url, { ...options, method: 'GET' });
  };
}

function errorClass(error, status) {
  if (status !== undefined && status !== null) return `http_${status}`;
  const name = String(error?.name ?? '');
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') return 'network';
  return 'fetch_error';
}

// GETs a URL and parses JSON. Throws an Error carrying `errorClass` and, for
// HTTP failures, `status`. Raw error bodies are never propagated.
export async function getJson(getFetch, url, headers = {}) {
  let response;
  try {
    response = await getFetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const wrapped = new Error('fetch failed');
    wrapped.errorClass = errorClass(error);
    throw wrapped;
  }
  if (!response.ok) {
    const wrapped = new Error('http failure');
    wrapped.status = response.status;
    wrapped.errorClass = `http_${response.status}`;
    throw wrapped;
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    const wrapped = new Error('body read failed');
    wrapped.errorClass = errorClass(error);
    throw wrapped;
  }
  try {
    return JSON.parse(text);
  } catch {
    const wrapped = new Error('invalid json');
    wrapped.errorClass = 'invalid_json';
    throw wrapped;
  }
}

// GETs a URL and returns { status, parsed, parseOk } without throwing for
// HTTP or JSON failures: public-endpoint contract violations are FAIL, while
// transport failures (timeout/network) are BLOCKED, and the caller decides.
export async function getPublic(getFetch, url) {
  let response;
  try {
    response = await getFetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    return { transportError: errorClass(error) };
  }
  const status = response.status;
  let text = '';
  try {
    text = await response.text();
  } catch {
    return { status, parseOk: false, parsed: null };
  }
  try {
    return { status, parseOk: true, parsed: JSON.parse(text) };
  } catch {
    return { status, parseOk: false, parsed: null };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without any network)
// ---------------------------------------------------------------------------

// Minimal wrangler.toml parser for the binding sections this audit cares
// about. Returns [{ name, type, section }] in file order.
export function parseWranglerToml(text) {
  const bindings = [];
  let section = null;
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim();
    const header = line.match(/^\[\[([^\]]+)\]\]$/);
    if (header) {
      section = header[1];
      continue;
    }
    if (line.startsWith('[')) {
      section = null;
      continue;
    }
    const match = line.match(/^binding\s*=\s*"([^"]+)"$/);
    if (match && section && EXPECTED_BINDING_TYPES[section]) {
      bindings.push({
        name: match[1],
        type: EXPECTED_BINDING_TYPES[section],
        section,
      });
    }
  }
  return bindings;
}

// Compares live settings bindings against expected bindings.
// `live` is [{ name, type }] (type may be null when the API omits it).
// Returns { status, missing, mismatched, extra, liveNames }.
export function evaluateBindings(expected, live) {
  if (!Array.isArray(live)) {
    return { status: 'UNKNOWN', missing: [], mismatched: [], extra: [], liveNames: [] };
  }
  const liveByName = new Map(live.map((b) => [b.name, b.type ?? null]));
  const missing = [];
  const mismatched = [];
  for (const want of expected) {
    if (!liveByName.has(want.name)) {
      missing.push(want.name);
    } else {
      const actualType = liveByName.get(want.name);
      if (actualType !== null && actualType !== want.type) {
        mismatched.push({ name: want.name, expectedType: want.type, actualType });
      }
    }
  }
  const wanted = new Set(expected.map((b) => b.name));
  const extra = live.map((b) => b.name).filter((n) => !wanted.has(n));
  const status = missing.length > 0 || mismatched.length > 0 ? 'FAIL' : 'PASS';
  return { status, missing, mismatched, extra, liveNames: live.map((b) => b.name) };
}

// Evaluates a deployment's traffic split. `versions` is
// [{ percentage, version_id }]. Single version at 100% -> PASS for the
// traffic check itself; anything else -> FAIL. Traffic alone never proves a
// SHA linkage (that is the separate sha_linkage check).
export function evaluateTraffic(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return { status: 'UNKNOWN', traffic: [] };
  }
  const traffic = versions.map((v) => ({
    versionId: v.version_id ?? null,
    percentage: v.percentage ?? null,
  }));
  const singleFull =
    versions.length === 1 && Number(versions[0].percentage) === 100;
  return { status: singleFull ? 'PASS' : 'FAIL', traffic };
}

// Searches a deployment record's annotation string fields for the GitHub
// SHA. A full match -> PASS; a hex token (>= 7 chars) that is an actual
// prefix of the full SHA (case-sensitive) -> PASS with prefix evidence; a
// hex token that looks SHA-like but is not a prefix -> FAIL (mismatch); no
// hex token at all -> UNKNOWN (never claim production equals main).
// Only the matched SHA/prefix is ever returned; non-matching token values
// are never copied into evidence (length only).
export function findShaInDeployment(deployment, fullSha) {
  const annotations = deployment?.annotations;
  const fields = [];
  if (annotations && typeof annotations === 'object') {
    for (const [key, value] of Object.entries(annotations)) {
      if (typeof value === 'string') {
        fields.push({ field: `annotations.${key}`, value });
      }
    }
  }
  if (fields.length === 0) {
    return { status: 'UNKNOWN', field: null, value: null, detail: 'deployment carries no annotation string field' };
  }
  let mismatch = null;
  for (const { field, value } of fields) {
    if (value.includes(fullSha)) {
      return { status: 'PASS', field, value: fullSha, match: 'full', detail: 'deployment annotation contains the full GitHub SHA' };
    }
    for (const token of value.match(HEX_TOKEN_RE) ?? []) {
      if (fullSha.startsWith(token)) {
        return { status: 'PASS', field, value: token, match: 'prefix', detail: `deployment annotation contains a ${token.length}-character prefix of the GitHub SHA` };
      }
      if (!mismatch) mismatch = { field, tokenLength: token.length };
    }
  }
  if (mismatch) {
    return { status: 'FAIL', field: mismatch.field, value: null, match: 'mismatch', detail: `deployment annotation carries a SHA-like token (${mismatch.tokenLength} hex chars) that is not a prefix of the GitHub SHA` };
  }
  return { status: 'UNKNOWN', field: null, value: null, detail: 'deployment annotations contain no SHA-like token' };
}

// Health contract, proven by worker source: 200 + JSON object with
// status 'ok', service 'youngtube-worker', and a string timestamp.
export function evaluateHealth(result) {
  if (result.transportError) {
    return { status: 'BLOCKED', detail: `health request failed: ${result.transportError}` };
  }
  if (result.status !== 200) {
    return { status: 'FAIL', detail: `health returned HTTP ${result.status}, expected 200` };
  }
  if (!result.parseOk || !result.parsed || typeof result.parsed !== 'object' || Array.isArray(result.parsed)) {
    return { status: 'FAIL', detail: 'health response is not a JSON object' };
  }
  const keys = Object.keys(result.parsed).sort();
  if (result.parsed.status !== 'ok' || result.parsed.service !== 'youngtube-worker' || typeof result.parsed.timestamp !== 'string') {
    return { status: 'FAIL', detail: 'health JSON does not match the proven contract (status ok, service youngtube-worker, string timestamp)' };
  }
  return { status: 'PASS', detail: 'health matches the proven contract', keys };
}

// Categories contract, proven by worker source (catalog-v2 handler wins):
// 200 + JSON top-level array, non-empty, every item an object with a
// non-empty string id and a string label. Only keys/counts are recorded.
export function evaluateCategories(result) {
  if (result.transportError) {
    return { status: 'BLOCKED', detail: `categories request failed: ${result.transportError}` };
  }
  if (result.status !== 200) {
    return { status: 'FAIL', detail: `categories returned HTTP ${result.status}, expected 200` };
  }
  if (!result.parseOk || !Array.isArray(result.parsed)) {
    return { status: 'FAIL', detail: 'categories response is not a JSON array' };
  }
  if (result.parsed.length === 0) {
    return { status: 'FAIL', detail: 'categories array is empty' };
  }
  const allValid = result.parsed.every(
    (item) =>
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof item.id === 'string' && item.id.length > 0 &&
      typeof item.label === 'string',
  );
  if (!allValid) {
    return { status: 'FAIL', detail: 'at least one category item lacks a non-empty string id or a string label' };
  }
  const firstKeys =
    result.parsed[0] && typeof result.parsed[0] === 'object'
      ? Object.keys(result.parsed[0]).sort()
      : [];
  return { status: 'PASS', detail: 'categories match the proven contract', keys: firstKeys, count: result.parsed.length };
}

// Recursively replaces any string containing an exact secret value with a
// redaction marker. Used on the final report so that even a future evidence
// field can never leak a token or account id.
export function scrubSecrets(value, secrets) {
  const live = (secrets ?? []).filter((s) => typeof s === 'string' && s.length >= 8);
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, live));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubSecrets(v, live)]));
  }
  if (typeof value === 'string' && live.some((s) => value.includes(s))) return '[redacted]';
  return value;
}

function check(id, name, status, evidence, detail) {
  return { id, name, status, evidence, detail };
}

function overallFrom(checks) {
  if (checks.every((c) => c.status === 'PASS')) return 'PASS';
  if (checks.some((c) => c.status === 'FAIL')) return 'FAIL';
  if (checks.some((c) => c.status === 'BLOCKED')) return 'BLOCKED';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Main audit (dependency-injected for tests; no real network in tests)
// ---------------------------------------------------------------------------

export async function runAudit(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const getFetch = createGetOnlyFetch(fetchImpl);
  const env = options.env ?? process.env;
  const readFile = options.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));

  const repository = env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
  const ref = env.GITHUB_REF ?? DEFAULT_REF;
  const worker = env.WORKER_NAME ?? DEFAULT_WORKER;
  const baseUrl = (env.WORKER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? '';
  const apiToken = env.CLOUDFLARE_API_TOKEN ?? '';
  const wranglerPath =
    options.wranglerPath ?? path.join(process.cwd(), 'wrangler.toml');

  const checks = [];
  let githubSha = null;
  let deploymentId = null;
  let versionId = null;
  let traffic = null;
  let annotationField = null;
  let annotationValue = null;

  // 1. GitHub SHA (public, unauthenticated).
  try {
    const commit = await getJson(
      getFetch,
      `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`,
      { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    );
    if (typeof commit?.sha === 'string' && SHA_RE.test(commit.sha)) {
      githubSha = commit.sha;
      checks.push(check('github_sha', 'GitHub ref resolves to a full SHA', 'PASS', { sha: githubSha, ref }, `ref ${ref} resolves to ${githubSha}`));
    } else {
      checks.push(check('github_sha', 'GitHub ref resolves to a full SHA', 'BLOCKED', { sha: null, ref }, 'GitHub response carried no full SHA'));
    }
  } catch (error) {
    checks.push(check('github_sha', 'GitHub ref resolves to a full SHA', 'BLOCKED', { sha: null, ref }, `GitHub request failed: ${error.errorClass ?? 'fetch_error'}`));
  }

  // 2-4. Cloudflare deployment / traffic / SHA linkage.
  const missingVars = [
    !accountId ? 'CLOUDFLARE_ACCOUNT_ID' : null,
    !apiToken ? 'CLOUDFLARE_API_TOKEN' : null,
  ].filter(Boolean);
  let deployment = null;
  if (missingVars.length > 0) {
    const detail = `missing credentials: ${missingVars.join(', ')}; no Cloudflare call was attempted`;
    checks.push(check('cloudflare_deployment', 'Latest Cloudflare deployment is readable', 'BLOCKED', { deploymentId: null }, detail));
    checks.push(check('traffic', '100% of traffic is on a single version', 'BLOCKED', { traffic: null }, detail));
    checks.push(check('sha_linkage', 'Live deployment annotation matches the GitHub SHA', 'BLOCKED', { annotationField: null, annotationValue: null }, detail));
  } else {
    const cfHeaders = { Authorization: `Bearer ${apiToken}` };
    try {
      const list = await getJson(
        getFetch,
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(worker)}/deployments?per_page=5`,
        cfHeaders,
      );
      const deployments = Array.isArray(list?.result)
        ? list.result
        : Array.isArray(list?.result?.deployments)
          ? list.result.deployments
          : null;
      if (!deployments || deployments.length === 0) {
        checks.push(check('cloudflare_deployment', 'Latest Cloudflare deployment is readable', 'UNKNOWN', { deploymentId: null }, 'deployments list is empty or has an unrecognized shape'));
        checks.push(check('traffic', '100% of traffic is on a single version', 'UNKNOWN', { traffic: null }, 'no deployment record to read traffic from'));
        checks.push(check('sha_linkage', 'Live deployment annotation matches the GitHub SHA', 'UNKNOWN', { annotationField: null, annotationValue: null }, 'no deployment record to search for the SHA'));
      } else {
        deployment = deployments[0];
        deploymentId = typeof deployment.id === 'string' ? deployment.id : null;
        checks.push(check('cloudflare_deployment', 'Latest Cloudflare deployment is readable', 'PASS', { deploymentId, createdOn: typeof deployment.created_on === 'string' ? deployment.created_on : null, source: typeof deployment.source === 'string' ? deployment.source : null }, 'latest deployment (first in list) read successfully'));

        const trafficEval = evaluateTraffic(deployment.versions);
        traffic = trafficEval.traffic;
        if (trafficEval.status === 'PASS') versionId = traffic[0]?.versionId ?? null;
        checks.push(check('traffic', '100% of traffic is on a single version', trafficEval.status, { traffic }, trafficEval.status === 'PASS' ? 'single version at 100% of traffic' : trafficEval.status === 'UNKNOWN' ? 'deployment record carries no versions array' : `traffic is split across ${traffic.length} version(s)`));

        if (!githubSha) {
          checks.push(check('sha_linkage', 'Live deployment annotation matches the GitHub SHA', 'BLOCKED', { annotationField: null, annotationValue: null }, 'GitHub SHA is unavailable, so linkage cannot be evaluated'));
        } else {
          const link = findShaInDeployment(deployment, githubSha);
          annotationField = link.field;
          annotationValue = link.value;
          checks.push(check('sha_linkage', 'Live deployment annotation matches the GitHub SHA', link.status, { annotationField, annotationValue, match: link.match ?? null }, link.detail));
        }
      }
    } catch (error) {
      const detail = `Cloudflare deployments request failed: ${error.errorClass ?? 'fetch_error'}`;
      checks.push(check('cloudflare_deployment', 'Latest Cloudflare deployment is readable', 'BLOCKED', { deploymentId: null }, detail));
      checks.push(check('traffic', '100% of traffic is on a single version', 'BLOCKED', { traffic: null }, detail));
      checks.push(check('sha_linkage', 'Live deployment annotation matches the GitHub SHA', 'BLOCKED', { annotationField: null, annotationValue: null }, detail));
    }
  }

  // 5. Bindings: live settings vs wrangler.toml reference + baseline names.
  let referenceBindings = [];
  let referenceNote = null;
  try {
    referenceBindings = parseWranglerToml(readFile(wranglerPath));
  } catch {
    referenceNote = 'wrangler.toml could not be read from the repo root';
  }
  const expectedByName = new Map();
  for (const b of referenceBindings) expectedByName.set(b.name, b.type);
  for (const b of BASELINE_BINDINGS) {
    if (!expectedByName.has(b.name)) expectedByName.set(b.name, b.type);
  }
  const expected = [...expectedByName.entries()].map(([name, type]) => ({ name, type }));
  const baselineOnly = BASELINE_BINDINGS.filter(
    (b) => !referenceBindings.some((r) => r.name === b.name),
  ).map((b) => b.name);
  if (missingVars.length > 0) {
    checks.push(check('bindings', 'Live bindings match wrangler.toml', 'BLOCKED', { expected, live: null, baselineOnly }, `missing credentials: ${missingVars.join(', ')}; no Cloudflare call was attempted`));
  } else if (referenceNote) {
    checks.push(check('bindings', 'Live bindings match wrangler.toml', 'BLOCKED', { expected, live: null, baselineOnly }, referenceNote));
  } else {
    const cfHeaders = { Authorization: `Bearer ${apiToken}` };
    let settings = null;
    let settingsEndpoint = null;
    let settingsError = null;
    for (const suffix of ['settings', 'script-settings']) {
      try {
        settings = await getJson(
          getFetch,
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(worker)}/${suffix}`,
          cfHeaders,
        );
        settingsEndpoint = suffix;
        break;
      } catch (error) {
        if (error.status === 404 && suffix === 'settings') continue;
        settingsError = error;
        break;
      }
    }
    if (!settings) {
      checks.push(check('bindings', 'Live bindings match wrangler.toml', 'BLOCKED', { expected, live: null, baselineOnly }, `Cloudflare settings request failed: ${settingsError?.errorClass ?? 'fetch_error'}`));
    } else {
      const liveRaw = settings?.result?.bindings;
      const live = Array.isArray(liveRaw)
        ? liveRaw.map((b) => ({ name: b.name, type: typeof b.type === 'string' ? b.type : null }))
        : null;
      const evalResult = evaluateBindings(expected, live);
      const detail =
        evalResult.status === 'PASS'
          ? `all ${expected.length} expected bindings present with matching types (settings endpoint: ${settingsEndpoint})`
          : evalResult.status === 'UNKNOWN'
            ? `settings response carries no bindings array (settings endpoint: ${settingsEndpoint})`
            : `missing: ${evalResult.missing.join(', ') || 'none'}; type-mismatched: ${evalResult.mismatched.map((m) => `${m.name} (expected ${m.expectedType}, got ${m.actualType})`).join(', ') || 'none'} (settings endpoint: ${settingsEndpoint})`;
      checks.push(check('bindings', 'Live bindings match wrangler.toml', evalResult.status, { expected, live, missing: evalResult.missing, mismatched: evalResult.mismatched, baselineOnly, settingsEndpoint }, detail));
    }
  }

  // 6. Live public health endpoint (GET only, no credentials).
  const healthResult = await getPublic(getFetch, `${baseUrl}/api/health`);
  const healthEval = evaluateHealth(healthResult);
  checks.push(check('live_health', 'Live /api/health matches the proven contract', healthEval.status, { status: healthResult.status ?? null, keys: healthEval.keys ?? null }, healthEval.detail));

  // 7. Live public categories endpoint (GET only; keys/counts only, never
  // content, because values may come from KV).
  const categoriesResult = await getPublic(getFetch, `${baseUrl}/api/categories`);
  const categoriesEval = evaluateCategories(categoriesResult);
  checks.push(check('live_categories', 'Live /api/categories matches the proven contract', categoriesEval.status, { status: categoriesResult.status ?? null, count: categoriesEval.count ?? null, itemKeys: categoriesEval.keys ?? null }, categoriesEval.detail));

  const counts = {
    PASS: checks.filter((c) => c.status === 'PASS').length,
    FAIL: checks.filter((c) => c.status === 'FAIL').length,
    UNKNOWN: checks.filter((c) => c.status === 'UNKNOWN').length,
    BLOCKED: checks.filter((c) => c.status === 'BLOCKED').length,
  };
  const overall = overallFrom(checks);

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: { repository, ref, worker, baseUrl },
    github: { sha: githubSha, ref },
    cloudflare: { deploymentId, versionId, traffic, annotationField, annotationValue },
    checks,
    summary: { counts, overall },
  };
  // Second-layer redaction: never emit the token or account id, even if a
  // future evidence field accidentally picked one up.
  const clean = scrubSecrets(report, [apiToken, accountId]);
  return { report: clean, exitCode: overall === 'PASS' ? 0 : 1 };
}

async function main() {
  const { report, exitCode } = await runAudit();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`audit failed: ${error?.message ?? 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
