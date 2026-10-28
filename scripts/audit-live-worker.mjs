import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDIT_STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', BLOCKED: 'BLOCKED' });

export const DEFAULTS = Object.freeze({
  repository: 'saaedcs50/YoungTube-',
  ref: 'main',
  workerName: 'youngtube-worker',
  workerBaseUrl: 'https://youngtube-worker.saaedbelal.workers.dev',
  timeoutMs: 8000,
});

const REQUIRED_BINDINGS = Object.freeze([
  { name: 'CATALOG_DB', kind: 'd1', expectedTypes: ['d1', 'd1_database'] },
  { name: 'CHANNELS_ARCHIVE', kind: 'kv', expectedTypes: ['kv_namespace', 'kv'] },
  { name: 'CATALOG_DISCOVERY_QUEUE', kind: 'queue', expectedTypes: ['queue'] },
  { name: 'CATALOG_PROCESSING_QUEUE', kind: 'queue', expectedTypes: ['queue'] },
]);

function check(id, area, status, summary, evidence = {}) {
  return { id, area, status, summary, evidence };
}

function summarizeStatus(reportChecks) {
  const summary = { PASS: 0, FAIL: 0, UNKNOWN: 0, BLOCKED: 0, total: reportChecks.length, overallStatus: 'PASS' };
  for (const item of reportChecks) summary[item.status] += 1;
  if (summary.FAIL > 0) summary.overallStatus = 'FAIL';
  else if (summary.BLOCKED > 0) summary.overallStatus = 'BLOCKED';
  else if (summary.UNKNOWN > 0) summary.overallStatus = 'UNKNOWN';
  return summary;
}

function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|timed out|abort/i.test(String(error?.name || ''));
}

async function getJson(fetchImpl, url, { headers = {}, timeoutMs = DEFAULTS.timeoutMs } = {}) {
  let response;
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
    response = await fetchImpl(url, {
      method: 'GET',
      headers,
      ...(signal ? { signal } : {}),
      redirect: 'error',
    });
  } catch (error) {
    return { kind: 'network_error', timeout: isTimeoutError(error) };
  }

  if (!response?.ok) return { kind: 'http_error', status: Number(response?.status) || 0 };
  try {
    return { kind: 'ok', status: response.status, body: await response.json() };
  } catch {
    return { kind: 'invalid_json', status: response.status };
  }
}

function requestFailureStatus(result) {
  if (!result || result.kind === 'network_error' || result.kind === 'invalid_json') return AUDIT_STATUS.UNKNOWN;
  if (result.kind === 'http_error') {
    if (result.status === 401 || result.status === 403) return AUDIT_STATUS.BLOCKED;
    if (result.status >= 500 || result.status === 0) return AUDIT_STATUS.UNKNOWN;
    return AUDIT_STATUS.FAIL;
  }
  return AUDIT_STATUS.UNKNOWN;
}

function requestFailureEvidence(result) {
  if (!result) return { reason: 'no_result' };
  if (result.kind === 'http_error') return { reason: 'http_error', httpStatus: result.status };
  if (result.kind === 'invalid_json') return { reason: 'invalid_json', httpStatus: result.status };
  if (result.kind === 'network_error') return { reason: result.timeout ? 'timeout_or_abort' : 'network_error' };
  return { reason: 'unknown_error' };
}

function tomlScalar(raw) {
  const value = raw.trim().replace(/\s+#.*$/, '');
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

/** Minimal TOML reader for Wrangler's repeated binding sections; no dependency is added. */
export function parseWranglerBindings(toml) {
  const result = { d1: [], kv: [], queues: [] };
  const targets = {
    d1_databases: { collection: 'd1', fields: new Set(['binding', 'database_id', 'id']) },
    kv_namespaces: { collection: 'kv', fields: new Set(['binding', 'id']) },
    'queues.producers': { collection: 'queues', fields: new Set(['binding', 'queue']) },
  };
  let current = null;

  for (const rawLine of String(toml || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const section = line.match(/^\[\[([^\]]+)\]\]$/);
    if (section) {
      const target = targets[section[1]];
      current = target ? { target, row: {} } : null;
      if (current) result[target.collection].push(current.row);
      continue;
    }
    if (line.startsWith('[')) {
      current = null;
      continue;
    }
    if (!current) continue;
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (!assignment || !current.target.fields.has(assignment[1])) continue;
    current.row[assignment[1]] = tomlScalar(assignment[2]);
  }
  return result;
}

function configIdentity(config, kind) {
  if (kind === 'd1') return config?.database_id ?? config?.id ?? null;
  if (kind === 'kv') return config?.id ?? null;
  return null;
}

function liveIdentity(binding, kind) {
  if (kind === 'd1') return binding?.id ?? binding?.database_id ?? binding?.databaseId ?? null;
  if (kind === 'kv') return binding?.namespace_id ?? binding?.id ?? binding?.namespaceId ?? null;
  return null;
}

function expectedBinding(config, spec) {
  if (spec.kind === 'd1') return config.d1.find((item) => item.binding === spec.name) || null;
  if (spec.kind === 'kv') return config.kv.find((item) => item.binding === spec.name) || null;
  return config.queues.find((item) => item.binding === spec.name) || null;
}

function bindingCheck(spec, config, settingsResult, cloudflareReady) {
  const configured = expectedBinding(config, spec);
  if (!configured) {
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', AUDIT_STATUS.FAIL,
      `Required binding ${spec.name} is missing from wrangler.toml.`, { configured: false, live: false });
  }

  if (!cloudflareReady) {
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', AUDIT_STATUS.BLOCKED,
      `Binding ${spec.name} could not be checked because Cloudflare credentials are missing.`, {
        configured: true, liveSettingsAvailable: false, requestMade: false,
      });
  }

  if (!settingsResult || settingsResult.kind !== 'ok' || settingsResult.body?.success !== true) {
    const status = settingsResult?.kind === 'ok' ? AUDIT_STATUS.UNKNOWN : requestFailureStatus(settingsResult);
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', status,
      `Could not verify ${spec.name} against live Worker settings.`, {
        configured: true,
        liveSettingsAvailable: false,
        ...(settingsResult?.kind === 'ok' ? { reason: 'cloudflare_api_reported_failure' } : requestFailureEvidence(settingsResult)),
      });
  }

  const root = settingsResult.body.result && typeof settingsResult.body.result === 'object'
    ? settingsResult.body.result : settingsResult.body;
  const live = Array.isArray(root?.bindings) ? root.bindings.find((item) => item?.name === spec.name) : null;
  if (!live) {
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', AUDIT_STATUS.FAIL,
      `Required live binding ${spec.name} is missing.`, { configured: true, live: false, expectedKind: spec.kind });
  }

  const liveType = String(live.type || '').toLowerCase();
  if (!spec.expectedTypes.includes(liveType)) {
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', AUDIT_STATUS.FAIL,
      `Live binding ${spec.name} has an unexpected type.`, {
        configured: true, live: true, typeMatches: false, liveType, expectedKind: spec.kind,
      });
  }

  if (spec.kind === 'queue') {
    const expectedQueue = String(configured.queue || '');
    const actualQueue = String(live.queue_name ?? live.queueName ?? '');
    if (!expectedQueue || !actualQueue) {
      return check(`binding.${spec.name.toLowerCase()}`, 'bindings', AUDIT_STATUS.UNKNOWN,
        `The queue identity for ${spec.name} could not be proven.`, {
          configured: true, live: true, typeMatches: true, queueIdentityAvailable: false,
        });
    }
    const matches = expectedQueue === actualQueue;
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', matches ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL,
      matches ? `Live queue binding ${spec.name} matches wrangler.toml.` : `Live queue binding ${spec.name} does not match wrangler.toml.`, {
        configured: true, live: true, typeMatches: true, queueNameMatches: matches,
      });
  }

  const expectedId = configIdentity(configured, spec.kind);
  const actualId = liveIdentity(live, spec.kind);
  if (!expectedId || !actualId) {
    return check(`binding.${spec.name.toLowerCase()}`, 'bindings', AUDIT_STATUS.UNKNOWN,
      `The resource identity for ${spec.name} could not be proven.`, {
        configured: true, live: true, typeMatches: true, resourceIdentityAvailable: false,
      });
  }
  const matches = String(expectedId) === String(actualId);
  return check(`binding.${spec.name.toLowerCase()}`, 'bindings', matches ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL,
    matches ? `Live binding ${spec.name} matches wrangler.toml.` : `Live binding ${spec.name} does not match wrangler.toml.`, {
      configured: true, live: true, typeMatches: true, resourceIdMatches: matches,
    });
}

function listDeployments(body) {
  const result = body?.result;
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.deployments)) return result.deployments;
  if (Array.isArray(body?.deployments)) return body.deployments;
  return null;
}

function sortLatestFirst(deployments) {
  return [...deployments].sort((a, b) => {
    const at = Date.parse(String(a?.created_on || ''));
    const bt = Date.parse(String(b?.created_on || ''));
    if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at;
    if (Number.isFinite(at)) return -1;
    if (Number.isFinite(bt)) return 1;
    return 0;
  });
}

function inspectTraffic(deployment) {
  const versions = Array.isArray(deployment?.versions) ? deployment.versions : null;
  if (!versions || versions.length === 0) {
    return check('deployment.traffic', 'deployment', AUDIT_STATUS.UNKNOWN,
      'The latest deployment did not expose a usable versions/traffic distribution.', {
        deploymentId: deployment?.id || null, versionDistributionAvailable: false,
      });
  }
  const distribution = versions.map((version) => ({
    versionId: typeof version?.version_id === 'string' ? version.version_id : null,
    percentage: typeof version?.percentage === 'number' ? version.percentage : null,
  }));
  const total = distribution.every((version) => Number.isFinite(version.percentage))
    ? distribution.reduce((sum, version) => sum + version.percentage, 0) : null;
  const singleFull = distribution.length === 1 && total !== null && Math.abs(distribution[0].percentage - 100) < 0.001;
  const validTotal = total !== null && Math.abs(total - 100) < 0.001;
  const status = singleFull ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL;
  return check('deployment.traffic', 'deployment', status,
    singleFull ? 'The latest deployment directs 100% of traffic to one Worker version.' : 'The latest deployment is split, has an invalid traffic total, or does not direct 100% to one version.', {
      deploymentId: deployment?.id || null,
      versionCount: distribution.length,
      trafficTotalPercent: total,
      trafficTotalIs100Percent: validTotal,
      distribution,
    });
}

function annotationStrings(deployment) {
  const candidates = [deployment?.annotations, deployment?.metadata?.annotations];
  const strings = [];
  for (const object of candidates) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) continue;
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'string' && /message|annotation|commit|sha/i.test(key)) strings.push(value);
    }
  }
  return strings;
}

export function inspectDeploymentSha(deployment, githubSha) {
  const values = annotationStrings(deployment);
  if (values.length === 0) {
    return check('deployment.sha_matches_github', 'source-linkage', AUDIT_STATUS.UNKNOWN,
      'The latest deployment has no readable source annotation; GitHub main linkage is unproven.', {
        deploymentId: deployment?.id || null, annotationPresent: false, githubShaKnown: Boolean(githubSha),
      });
  }
  const tokens = values.flatMap((value) => [...value.matchAll(/\b([a-f0-9]{7,40})\b/gi)].map((match) => match[1].toLowerCase()));
  const uniqueTokens = [...new Set(tokens)];
  if (uniqueTokens.length === 0 || !githubSha) {
    return check('deployment.sha_matches_github', 'source-linkage', AUDIT_STATUS.UNKNOWN,
      uniqueTokens.length === 0
        ? 'The deployment annotation exists but does not contain a parseable Git SHA.'
        : 'A deployment SHA candidate exists, but the current GitHub SHA is unavailable.', {
          deploymentId: deployment?.id || null,
          annotationPresent: true,
          shaCandidatePresent: uniqueTokens.length > 0,
          githubShaKnown: Boolean(githubSha),
        });
  }
  const normalizedSha = String(githubSha).toLowerCase();
  const matching = uniqueTokens.filter((token) => normalizedSha.startsWith(token));
  const status = matching.length > 0 ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL;
  return check('deployment.sha_matches_github', 'source-linkage', status,
    matching.length > 0
      ? 'A SHA in the latest deployment annotation is an exact SHA or a valid prefix of current GitHub main.'
      : 'The latest deployment annotation contains a SHA candidate that is not a prefix of current GitHub main.', {
        deploymentId: deployment?.id || null,
        annotationPresent: true,
        githubShaKnown: true,
        shaCandidates: uniqueTokens.slice(0, 5),
        matchingPrefixFound: matching.length > 0,
      });
}

export function inspectHealth(statusCode, body, parseOk = true) {
  if (statusCode !== 200) return check('worker.health', 'public-endpoints', AUDIT_STATUS.FAIL,
    'GET /api/health did not return HTTP 200.', { httpStatus: statusCode });
  const timestampValid = typeof body?.timestamp === 'string'
    && Number.isFinite(Date.parse(body.timestamp))
    && (() => { try { return new Date(body.timestamp).toISOString() === body.timestamp; } catch { return false; } })();
  const valid = parseOk && body && !Array.isArray(body) && typeof body === 'object'
    && body.status === 'ok'
    && body.service === DEFAULTS.workerName
    && timestampValid;
  return check('worker.health', 'public-endpoints', valid ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL,
    valid ? 'GET /api/health matches the current source contract.' : 'GET /api/health returned an invalid JSON shape or source contract.', {
      httpStatus: statusCode,
      jsonValid: parseOk,
      statusFieldMatches: body?.status === 'ok',
      serviceFieldMatches: body?.service === DEFAULTS.workerName,
      timestampValid,
    });
}

export function inspectCategories(statusCode, body, parseOk = true) {
  if (statusCode !== 200) return check('worker.categories', 'public-endpoints', AUDIT_STATUS.FAIL,
    'GET /api/categories did not return HTTP 200.', { httpStatus: statusCode });
  const categories = Array.isArray(body) ? body : null;
  const validObjects = categories?.every((item) => item && typeof item === 'object' && !Array.isArray(item)
    && typeof (item.id ?? item.categoryId) === 'string' && String(item.id ?? item.categoryId).trim().length > 0
    && typeof (item.label ?? item.name) === 'string' && String(item.label ?? item.name).trim().length > 0) ?? false;
  const ids = categories?.map((item) => String(item.id ?? item.categoryId).trim()) ?? [];
  const unique = new Set(ids).size === ids.length;
  const hasAll = ids.includes('all');
  const valid = parseOk && Array.isArray(categories) && categories.length > 0 && validObjects && unique && hasAll;
  return check('worker.categories', 'public-endpoints', valid ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL,
    valid ? 'GET /api/categories matches the current source contract.' : 'GET /api/categories returned an invalid JSON shape or category contract.', {
      httpStatus: statusCode,
      jsonValid: parseOk,
      arrayResponse: Array.isArray(body),
      categoryCount: categories?.length ?? 0,
      categoriesHaveIdAndLabel: validObjects,
      idsAreUnique: unique,
      allCategoryPresent: hasAll,
    });
}

function normalizeApiBody(result) {
  if (!result || result.kind !== 'ok') return null;
  const body = result.body;
  if (!body || typeof body !== 'object' || body.success !== true) return null;
  return body;
}

function cloudflareApiCheck(id, response, description) {
  if (!response || response.kind !== 'ok') {
    const status = requestFailureStatus(response);
    return check(id, 'cloudflare-api', status, `${description} could not be read from Cloudflare.`, requestFailureEvidence(response));
  }
  if (!normalizeApiBody(response)) {
    return check(id, 'cloudflare-api', AUDIT_STATUS.UNKNOWN, `${description} API did not return a successful Cloudflare result.`, {
      httpStatus: response.status,
      successFlagPresent: typeof response.body?.success === 'boolean',
      success: response.body?.success === true,
    });
  }
  return null;
}

function safeWorkerEndpointUrl(baseUrl, path) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') throw new Error('worker_base_url_must_use_https');
  base.pathname = path;
  base.search = '';
  base.hash = '';
  base.username = '';
  base.password = '';
  return base.toString();
}

export async function runAudit(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());
  const timeoutMs = Number(options.timeoutMs || DEFAULTS.timeoutMs);
  const repository = String(env.GITHUB_REPOSITORY || DEFAULTS.repository).trim();
  const ref = String(env.GITHUB_REF || DEFAULTS.ref).trim();
  const workerBaseUrl = String(env.WORKER_BASE_URL || DEFAULTS.workerBaseUrl).trim();
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cloudflareToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  const githubToken = String(env.GITHUB_TOKEN || '').trim();
  const generatedAt = (() => { const value = now(); return (value instanceof Date ? value : new Date(value)).toISOString(); })();
  const checks = [];
  const report = {
    schemaVersion: 1,
    generatedAt,
    overallStatus: 'UNKNOWN',
    summary: {},
    source: { repository, ref, sha: null },
    worker: { name: DEFAULTS.workerName, baseHost: null },
    checks,
  };

  let wranglerText = options.wranglerText;
  let wranglerReadError = false;
  if (typeof wranglerText !== 'string') {
    try {
      wranglerText = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
    } catch {
      wranglerText = '';
      wranglerReadError = true;
    }
  }
  const wranglerConfig = parseWranglerBindings(wranglerText);
  const configOk = !wranglerReadError && REQUIRED_BINDINGS.every((spec) => Boolean(expectedBinding(wranglerConfig, spec)));
  checks.push(check('source.wrangler_config', 'source-config', configOk ? AUDIT_STATUS.PASS : AUDIT_STATUS.FAIL,
    configOk ? 'wrangler.toml contains all four required binding declarations.' : 'wrangler.toml could not be read or is missing one or more required binding declarations.', {
      readable: !wranglerReadError,
      requiredDeclarationsPresent: REQUIRED_BINDINGS.map((spec) => ({ name: spec.name, present: Boolean(expectedBinding(wranglerConfig, spec)) })),
    }));

  let parsedWorkerUrl = null;
  try {
    parsedWorkerUrl = new URL(workerBaseUrl);
    if (parsedWorkerUrl.protocol !== 'https:') throw new Error('https_required');
    report.worker.baseHost = parsedWorkerUrl.host;
  } catch {
    checks.push(check('worker.base_url', 'configuration', AUDIT_STATUS.FAIL,
      'WORKER_BASE_URL is not a valid HTTPS URL.', { validHttpsUrl: false }));
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !ref) {
    checks.push(check('github.main_sha', 'source', AUDIT_STATUS.FAIL,
      'GITHUB_REPOSITORY or GITHUB_REF is malformed.', { repositoryFormatValid: false, refPresent: Boolean(ref) }));
  } else {
    const [owner, repo] = repository.split('/');
    const githubUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`;
    const githubResponse = await getJson(fetchImpl, githubUrl, {
      timeoutMs,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      },
    });
    if (githubResponse.kind === 'ok') {
      const sha = githubResponse.body?.sha;
      if (typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha)) {
        report.source.sha = sha.toLowerCase();
        checks.push(check('github.main_sha', 'source', AUDIT_STATUS.PASS,
          'GitHub returned the current commit SHA for the requested ref.', { sha: report.source.sha }));
      } else {
        checks.push(check('github.main_sha', 'source', AUDIT_STATUS.UNKNOWN,
          'GitHub responded, but a valid full commit SHA was not available.', { responseShapeValid: false }));
      }
    } else {
      checks.push(check('github.main_sha', 'source', requestFailureStatus(githubResponse),
        'The current GitHub commit SHA could not be read.', requestFailureEvidence(githubResponse)));
    }
  }

  const cloudflareReady = Boolean(accountId && cloudflareToken);
  checks.push(check('cloudflare.credentials', 'cloudflare-api', cloudflareReady ? AUDIT_STATUS.PASS : AUDIT_STATUS.BLOCKED,
    cloudflareReady ? 'Required Cloudflare read-only credentials are present.' : 'Cloudflare checks are blocked because CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is missing.', {
      accountIdPresent: Boolean(accountId),
      apiTokenPresent: Boolean(cloudflareToken),
      tokenValueLogged: false,
    }));

  let deploymentsResult = null;
  let settingsResult = null;
  let latestDeployment = null;

  if (cloudflareReady) {
    report.worker.accountIdPresent = true;
    const accountPath = `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(DEFAULTS.workerName)}`;
    const cloudflareHeaders = { Authorization: `Bearer ${cloudflareToken}`, Accept: 'application/json' };
    [deploymentsResult, settingsResult] = await Promise.all([
      getJson(fetchImpl, `https://api.cloudflare.com/client/v4${accountPath}/deployments?per_page=100&page=1`, { timeoutMs, headers: cloudflareHeaders }),
      getJson(fetchImpl, `https://api.cloudflare.com/client/v4${accountPath}/settings`, { timeoutMs, headers: cloudflareHeaders }),
    ]);

    const deploymentApiCheck = cloudflareApiCheck('cloudflare.deployments_api', deploymentsResult, 'Worker deployments');
    if (deploymentApiCheck) checks.push(deploymentApiCheck);
    const settingsApiCheck = cloudflareApiCheck('cloudflare.settings_api', settingsResult, 'Worker settings');
    if (settingsApiCheck) checks.push(settingsApiCheck);

    const deploymentBody = normalizeApiBody(deploymentsResult);
    const deployments = deploymentBody ? listDeployments(deploymentBody) : null;
    if (!deployments) {
      const status = deploymentsResult?.kind === 'ok' ? AUDIT_STATUS.UNKNOWN : requestFailureStatus(deploymentsResult);
      checks.push(check('cloudflare.latest_deployment', 'deployment', status,
        'The latest deployment could not be determined from the Cloudflare API response.', {
          responseAvailable: Boolean(deploymentBody),
          deploymentListShapeValid: false,
          ...(deploymentsResult?.kind === 'ok' ? { httpStatus: deploymentsResult.status } : requestFailureEvidence(deploymentsResult)),
        }));
    } else if (deployments.length === 0) {
      checks.push(check('cloudflare.latest_deployment', 'deployment', AUDIT_STATUS.FAIL,
        'Cloudflare returned no deployments for the Worker.', { deploymentCount: 0 }));
    } else {
      latestDeployment = sortLatestFirst(deployments)[0];
      checks.push(check('cloudflare.latest_deployment', 'deployment', AUDIT_STATUS.PASS,
        'The latest Worker deployment was retrieved from live Cloudflare metadata.', {
          deploymentId: latestDeployment?.id || null,
          createdOn: latestDeployment?.created_on || null,
          source: latestDeployment?.source || null,
          deploymentCountReturned: deployments.length,
        }));
    }

    checks.push(latestDeployment ? inspectTraffic(latestDeployment) : check(
      'deployment.traffic', 'deployment', deploymentsResult?.kind === 'ok' && deploymentsResult.body?.success === true
        ? AUDIT_STATUS.UNKNOWN : requestFailureStatus(deploymentsResult),
      'Traffic distribution could not be verified without a latest deployment.', { deploymentAvailable: false },
    ));
    checks.push(latestDeployment
      ? inspectDeploymentSha(latestDeployment, report.source.sha)
      : check('deployment.sha_matches_github', 'source-linkage', deploymentsResult?.kind === 'ok' && deploymentsResult.body?.success === true
        ? AUDIT_STATUS.UNKNOWN : requestFailureStatus(deploymentsResult),
        'Source linkage is unknown because the latest deployment could not be read.', { deploymentAvailable: false, githubShaKnown: Boolean(report.source.sha) }));
  } else {
    checks.push(check('cloudflare.deployments_api', 'cloudflare-api', AUDIT_STATUS.BLOCKED,
      'Cloudflare deployments were not queried because credentials are missing.', { requestMade: false }));
    checks.push(check('cloudflare.settings_api', 'cloudflare-api', AUDIT_STATUS.BLOCKED,
      'Cloudflare settings were not queried because credentials are missing.', { requestMade: false }));
    checks.push(check('cloudflare.latest_deployment', 'deployment', AUDIT_STATUS.BLOCKED,
      'The latest deployment is unavailable without Cloudflare credentials.', { requestMade: false }));
    checks.push(check('deployment.traffic', 'deployment', AUDIT_STATUS.BLOCKED,
      'Traffic distribution is blocked because Cloudflare credentials are missing.', { requestMade: false }));
    checks.push(check('deployment.sha_matches_github', 'source-linkage', AUDIT_STATUS.BLOCKED,
      'Deployment SHA linkage is blocked because Cloudflare credentials are missing.', { requestMade: false, githubShaKnown: Boolean(report.source.sha) }));
  }

  for (const spec of REQUIRED_BINDINGS) {
    checks.push(bindingCheck(spec, wranglerConfig, settingsResult, cloudflareReady));
  }

  if (parsedWorkerUrl) {
    for (const endpoint of [
      { path: '/api/health', inspect: inspectHealth },
      { path: '/api/categories', inspect: inspectCategories },
    ]) {
      let url;
      try {
        url = safeWorkerEndpointUrl(workerBaseUrl, endpoint.path);
      } catch {
        checks.push(check(endpoint.path === '/api/health' ? 'worker.health' : 'worker.categories', 'public-endpoints', AUDIT_STATUS.FAIL,
          `The Worker endpoint URL for ${endpoint.path} is invalid.`, { validHttpsUrl: false }));
        continue;
      }
      const result = await getJson(fetchImpl, url, { timeoutMs, headers: { Accept: 'application/json' } });
      if (result.kind === 'network_error') {
        checks.push(check(endpoint.path === '/api/health' ? 'worker.health' : 'worker.categories', 'public-endpoints', AUDIT_STATUS.UNKNOWN,
          `GET ${endpoint.path} could not be reached.`, requestFailureEvidence(result)));
      } else if (result.kind === 'invalid_json') {
        checks.push(endpoint.inspect(result.status, null, false));
      } else if (result.kind === 'http_error') {
        checks.push(endpoint.inspect(result.status, null, false));
      } else {
        checks.push(endpoint.inspect(result.status, result.body, true));
      }
    }
  } else {
    checks.push(check('worker.health', 'public-endpoints', AUDIT_STATUS.BLOCKED,
      'Health endpoint was not queried because WORKER_BASE_URL is invalid.', { requestMade: false }));
    checks.push(check('worker.categories', 'public-endpoints', AUDIT_STATUS.BLOCKED,
      'Categories endpoint was not queried because WORKER_BASE_URL is invalid.', { requestMade: false }));
  }

  report.summary = summarizeStatus(checks);
  report.overallStatus = report.summary.overallStatus;
  return report;
}

async function main() {
  const report = await runAudit();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.overallStatus !== AUDIT_STATUS.PASS) process.exitCode = 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().catch(() => {
    // Fail closed without printing exception text, environment values, or credentials.
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      overallStatus: 'UNKNOWN',
      summary: { PASS: 0, FAIL: 0, UNKNOWN: 1, BLOCKED: 0, total: 1, overallStatus: 'UNKNOWN' },
      checks: [check('audit.runtime', 'runtime', 'UNKNOWN', 'The audit could not complete. Raw exception details were intentionally omitted.', {})],
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  });
}
