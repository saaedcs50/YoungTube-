import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BASELINE_BINDINGS,
  createGetOnlyFetch,
  evaluateBindings,
  evaluateCategories,
  evaluateHealth,
  evaluateTraffic,
  findShaInDeployment,
  parseWranglerToml,
  runAudit,
  scrubSecrets,
} from '../scripts/audit-live-worker.mjs';

const FULL_SHA = '5b494b726d407d2881afec4e403b04e096de568e';
const PREFIX = FULL_SHA.slice(0, 7);

const WRANGLER_SAMPLE = `
name = "youngtube-worker"
[[kv_namespaces]]
binding = "CHANNELS_ARCHIVE"
id = "b933debea57649fc921e173185619ffb"
[[d1_databases]]
binding = "CATALOG_DB"
database_name = "youngtube-catalog-v2"
[[queues.producers]]
binding = "CATALOG_DISCOVERY_QUEUE"
queue = "youngtube-catalog-discovery"
[[queues.producers]]
binding = "CATALOG_PROCESSING_QUEUE"
queue = "youngtube-catalog-processing"
`;

// Fake fetch factory. `routes` maps a URL substring to a handler returning
// { status, body } or throwing. Supports abort-aware timeout simulation.
function fakeFetch(routes) {
  return async (url, options = {}) => {
    for (const [needle, handler] of routes) {
      if (url.includes(needle)) {
        const result = await handler(url, options);
        return {
          ok: result.status >= 200 && result.status < 300,
          status: result.status,
          text: async () => (typeof result.body === 'string' ? result.body : JSON.stringify(result.body)),
        };
      }
    }
    throw new Error(`unexpected url in fake fetch: ${url}`);
  };
}

function jsonResponse(body, status = 200) {
  return { status, body };
}

function baseEnv(overrides = {}) {
  return {
    GITHUB_REPOSITORY: 'saaedcs50/YoungTube-',
    GITHUB_REF: 'main',
    WORKER_NAME: 'youngtube-worker',
    WORKER_BASE_URL: 'https://youngtube-worker.saaedbelal.workers.dev',
    CLOUDFLARE_ACCOUNT_ID: 'fake-account-id-for-tests',
    CLOUDFLARE_API_TOKEN: 'fake-token-for-tests',
    ...overrides,
  };
}

function fullFake(overrides = {}) {
  const deployment = overrides.deployment ?? {
    id: 'dep-1',
    created_on: '2026-10-27T05:21:31Z',
    source: 'wrangler',
    strategy: 'percentage',
    versions: [{ percentage: 100, version_id: 'ver-1' }],
    annotations: { 'workers/message': `deploy ${FULL_SHA}`, 'workers/triggered_by': 'deployment' },
  };
  const settings = overrides.settings ?? {
    result: {
      bindings: [
        { name: 'CATALOG_DB', type: 'd1' },
        { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace' },
        { name: 'CATALOG_DISCOVERY_QUEUE', type: 'queue' },
        { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue' },
      ],
    },
  };
  const health = overrides.health ?? { status: 'ok', service: 'youngtube-worker', timestamp: '2026-10-28T00:00:00.000Z' };
  const categories = overrides.categories ?? [
    { id: 'all', name: 'x', label: 'x', icon: 'x', emoji: 'x', order: 0 },
    { id: 'learn', name: 'y', label: 'y', icon: 'y', emoji: 'y', order: 1 },
  ];
  return fakeFetch([
    ['api.github.com', async () => jsonResponse({ sha: FULL_SHA })],
    ['/deployments', async () => jsonResponse({ result: { deployments: [deployment] } })],
    ['/settings', async () => jsonResponse(settings)],
    ['/api/health', async () => (health === null ? { status: 500, body: 'boom' } : jsonResponse(health, health.__status ?? 200))],
    ['/api/categories', async () => {
      if (categories === null) return { status: 500, body: 'boom' };
      if (typeof categories === 'string') return { status: 200, body: categories };
      return jsonResponse(categories);
    }],
  ]);
}

function checkOf(report, id) {
  const found = report.checks.find((c) => c.id === id);
  assert.ok(found, `expected check ${id} to exist`);
  return found;
}

test('full SHA match in the deployment annotation passes linkage and the whole audit', async () => {
  const { report, exitCode } = await runAudit({
    fetchImpl: fullFake(),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(exitCode, 0);
  assert.equal(report.summary.overall, 'PASS');
  assert.equal(report.github.sha, FULL_SHA);
  assert.equal(report.cloudflare.deploymentId, 'dep-1');
  assert.equal(report.cloudflare.versionId, 'ver-1');
  assert.equal(report.cloudflare.annotationField, 'annotations.workers/message');
  assert.equal(report.cloudflare.annotationValue, FULL_SHA);
  const link = checkOf(report, 'sha_linkage');
  assert.equal(link.status, 'PASS');
  assert.equal(link.evidence.match, 'full');
  assert.equal(checkOf(report, 'traffic').status, 'PASS');
  assert.equal(checkOf(report, 'bindings').status, 'PASS');
  assert.equal(checkOf(report, 'live_health').status, 'PASS');
  assert.equal(checkOf(report, 'live_categories').status, 'PASS');
});

test('valid short-prefix match passes linkage with prefix evidence', async () => {
  const { report, exitCode } = await runAudit({
    fetchImpl: fullFake({
      deployment: {
        id: 'dep-2', created_on: '2026-10-27T05:21:31Z', source: 'wrangler', strategy: 'percentage',
        versions: [{ percentage: 100, version_id: 'ver-2' }],
        annotations: { 'workers/message': `wrangler deploy ${PREFIX} (short sha)` },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(exitCode, 0);
  assert.equal(report.summary.overall, 'PASS');
  const link = checkOf(report, 'sha_linkage');
  assert.equal(link.status, 'PASS');
  assert.equal(link.evidence.match, 'prefix');
  assert.equal(report.cloudflare.annotationValue, PREFIX);
  assert.equal(report.cloudflare.annotationValue.length, 7);
});

test('SHA mismatch in the annotation fails linkage (and only linkage)', async () => {
  const other = 'a'.repeat(40);
  const { report, exitCode } = await runAudit({
    fetchImpl: fullFake({
      deployment: {
        id: 'dep-3', created_on: '2026-10-27T05:21:31Z', source: 'wrangler', strategy: 'percentage',
        versions: [{ percentage: 100, version_id: 'ver-3' }],
        annotations: { 'workers/message': `deploy ${other}` },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(exitCode, 1);
  assert.equal(report.summary.overall, 'FAIL');
  const link = checkOf(report, 'sha_linkage');
  assert.equal(link.status, 'FAIL');
  assert.equal(link.evidence.match, 'mismatch');
  assert.equal(link.evidence.annotationValue, null);
  assert.equal(checkOf(report, 'traffic').status, 'PASS');
});

test('missing annotation is UNKNOWN, never PASS, and blocks overall PASS', async () => {
  const { report, exitCode } = await runAudit({
    fetchImpl: fullFake({
      deployment: {
        id: 'dep-4', created_on: '2026-10-27T05:21:31Z', source: 'wrangler', strategy: 'percentage',
        versions: [{ percentage: 100, version_id: 'ver-4' }],
        annotations: { 'workers/triggered_by': 'deployment' },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(exitCode, 1);
  assert.equal(report.summary.overall, 'UNKNOWN');
  assert.equal(checkOf(report, 'sha_linkage').status, 'UNKNOWN');
  assert.equal(report.cloudflare.annotationValue, null);
});

test('traffic split fails the traffic check with the split as evidence', async () => {
  const { report } = await runAudit({
    fetchImpl: fullFake({
      deployment: {
        id: 'dep-5', created_on: '2026-10-27T05:21:31Z', source: 'wrangler', strategy: 'percentage',
        versions: [
          { percentage: 90, version_id: 'ver-old' },
          { percentage: 10, version_id: 'ver-new' },
        ],
        annotations: { 'workers/message': `deploy ${FULL_SHA}` },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  const traffic = checkOf(report, 'traffic');
  assert.equal(traffic.status, 'FAIL');
  assert.deepEqual(traffic.evidence.traffic, [
    { versionId: 'ver-old', percentage: 90 },
    { versionId: 'ver-new', percentage: 10 },
  ]);
  assert.equal(report.cloudflare.versionId, null);
  assert.equal(report.summary.overall, 'FAIL');
  // Pure helper agrees.
  assert.equal(evaluateTraffic([{ percentage: 50, version_id: 'a' }, { percentage: 50, version_id: 'b' }]).status, 'FAIL');
  assert.equal(evaluateTraffic([{ percentage: 100, version_id: 'a' }]).status, 'PASS');
});

test('missing binding fails bindings with the binding name as evidence', async () => {
  const { report } = await runAudit({
    fetchImpl: fullFake({
      settings: {
        result: {
          bindings: [
            { name: 'CATALOG_DB', type: 'd1' },
            { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace' },
            { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue' },
          ],
        },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  const bindings = checkOf(report, 'bindings');
  assert.equal(bindings.status, 'FAIL');
  assert.deepEqual(bindings.evidence.missing, ['CATALOG_DISCOVERY_QUEUE']);
  assert.equal(report.summary.overall, 'FAIL');
  // Pure helper agrees.
  assert.deepEqual(
    evaluateBindings(BASELINE_BINDINGS, [{ name: 'CATALOG_DB', type: 'd1' }]).missing,
    ['CHANNELS_ARCHIVE', 'CATALOG_DISCOVERY_QUEUE', 'CATALOG_PROCESSING_QUEUE'],
  );
});

test('type-mismatched binding fails bindings with expected and actual types', async () => {
  const { report } = await runAudit({
    fetchImpl: fullFake({
      settings: {
        result: {
          bindings: [
            { name: 'CATALOG_DB', type: 'kv_namespace' },
            { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace' },
            { name: 'CATALOG_DISCOVERY_QUEUE', type: 'queue' },
            { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue' },
          ],
        },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  const bindings = checkOf(report, 'bindings');
  assert.equal(bindings.status, 'FAIL');
  assert.deepEqual(bindings.evidence.mismatched, [
    { name: 'CATALOG_DB', expectedType: 'd1', actualType: 'kv_namespace' },
  ]);
});

test('Cloudflare API error blocks the Cloudflare checks with an error class only', async () => {
  const failing = fakeFetch([
    ['api.github.com', async () => jsonResponse({ sha: FULL_SHA })],
    ['/deployments', async () => ({ status: 500, body: { message: 'internal boom with secrets?' } })],
    ['/settings', async () => ({ status: 500, body: 'boom' })],
    ['/api/health', async () => jsonResponse({ status: 'ok', service: 'youngtube-worker', timestamp: 't' })],
    ['/api/categories', async () => jsonResponse([{ id: 'all', label: 'x' }])],
  ]);
  const { report, exitCode } = await runAudit({
    fetchImpl: failing,
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(exitCode, 1);
  assert.equal(report.summary.overall, 'BLOCKED');
  assert.equal(checkOf(report, 'cloudflare_deployment').status, 'BLOCKED');
  assert.match(checkOf(report, 'cloudflare_deployment').detail, /http_500/);
  assert.equal(checkOf(report, 'traffic').status, 'BLOCKED');
  assert.equal(checkOf(report, 'sha_linkage').status, 'BLOCKED');
  assert.equal(checkOf(report, 'bindings').status, 'BLOCKED');
  assert.equal(checkOf(report, 'live_health').status, 'PASS');
  assert.ok(!JSON.stringify(report).includes('internal boom'));
});

test('fetch timeout blocks the affected check with class timeout', async () => {
  const hanging = async (_url, options = {}) => {
    const signal = options.signal;
    await new Promise((resolve, reject) => {
      if (signal) {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'TimeoutError';
          reject(error);
        });
      }
    });
    throw new Error('unreachable');
  };
  const routed = fakeFetch([
    ['api.github.com', async () => jsonResponse({ sha: FULL_SHA })],
    ['/deployments', hanging],
    ['/settings', async () => jsonResponse({ result: { bindings: [] } })],
    ['/api/health', async () => jsonResponse({ status: 'ok', service: 'youngtube-worker', timestamp: 't' })],
    ['/api/categories', async () => jsonResponse([{ id: 'all', label: 'x' }])],
  ]);
  const { report } = await runAudit({
    fetchImpl: routed,
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(checkOf(report, 'cloudflare_deployment').status, 'BLOCKED');
  assert.match(checkOf(report, 'cloudflare_deployment').detail, /timeout/);
});

test('health pass, health fail on non-200, bad JSON, and wrong shape', async () => {
  const good = evaluateHealth({ status: 200, parseOk: true, parsed: { status: 'ok', service: 'youngtube-worker', timestamp: 't' } });
  assert.equal(good.status, 'PASS');
  assert.deepEqual(good.keys, ['service', 'status', 'timestamp']);
  assert.equal(evaluateHealth({ status: 503, parseOk: true, parsed: {} }).status, 'FAIL');
  assert.equal(evaluateHealth({ status: 200, parseOk: false, parsed: null }).status, 'FAIL');
  assert.equal(evaluateHealth({ status: 200, parseOk: true, parsed: { status: 'error', service: 'youngtube-worker', timestamp: 't' } }).status, 'FAIL');
  assert.equal(evaluateHealth({ status: 200, parseOk: true, parsed: { status: 'ok', service: 'other', timestamp: 't' } }).status, 'FAIL');
  assert.equal(evaluateHealth({ transportError: 'timeout' }).status, 'BLOCKED');

  const { report } = await runAudit({
    fetchImpl: fullFake({ health: { status: 'ok', service: 'youngtube-worker' } }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(checkOf(report, 'live_health').status, 'FAIL');
  assert.equal(report.summary.overall, 'FAIL');
});

test('invalid categories responses fail: non-array, empty, and item without id', async () => {
  assert.equal(evaluateCategories({ status: 200, parseOk: true, parsed: { categories: [] } }).status, 'FAIL');
  assert.equal(evaluateCategories({ status: 200, parseOk: true, parsed: [] }).status, 'FAIL');
  assert.equal(evaluateCategories({ status: 200, parseOk: true, parsed: [{ label: 'no id' }] }).status, 'FAIL');
  assert.equal(evaluateCategories({ status: 200, parseOk: true, parsed: [{ id: 'all', label: 'x' }] }).status, 'PASS');
  assert.equal(evaluateCategories({ transportError: 'network' }).status, 'BLOCKED');

  const { report } = await runAudit({
    fetchImpl: fullFake({ categories: 'not json at all{{{' }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(checkOf(report, 'live_categories').status, 'FAIL');
});

test('missing credentials block all Cloudflare checks and name the missing variables', async () => {
  const { report, exitCode } = await runAudit({
    fetchImpl: fullFake(),
    env: baseEnv({ CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_API_TOKEN: '' }),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(exitCode, 1);
  assert.equal(report.summary.overall, 'BLOCKED');
  for (const id of ['cloudflare_deployment', 'traffic', 'sha_linkage', 'bindings']) {
    const c = checkOf(report, id);
    assert.equal(c.status, 'BLOCKED');
    assert.match(c.detail, /CLOUDFLARE_ACCOUNT_ID/);
    assert.match(c.detail, /CLOUDFLARE_API_TOKEN/);
  }
  assert.equal(checkOf(report, 'github_sha').status, 'PASS');
  assert.equal(checkOf(report, 'live_health').status, 'PASS');
  assert.equal(checkOf(report, 'live_categories').status, 'PASS');
  assert.ok(!JSON.stringify(report).includes('fake-token-for-tests'));
});

test('non-GET requests are rejected by the GET-only helper', async () => {
  const inner = async () => ({ ok: true, status: 200, text: async () => '{}' });
  const getOnly = createGetOnlyFetch(inner);
  await assert.rejects(() => getOnly('https://example.invalid/x', { method: 'POST' }), /non-GET/);
  await assert.rejects(() => getOnly('https://example.invalid/x', { method: 'put' }), /non-GET/);
  await assert.rejects(() => getOnly('https://example.invalid/x', { method: 'DELETE' }), /non-GET/);
  const ok = await getOnly('https://example.invalid/x');
  assert.equal(ok.status, 200);
  const explicit = await getOnly('https://example.invalid/x', { method: 'get' });
  assert.equal(explicit.status, 200);
});

test('secret and token redaction: a token-like annotation never reaches the report', async () => {
  // Deliberately contains no >= 7-char hex run, so linkage is UNKNOWN
  // (no SHA-like token) rather than a mismatch FAIL.
  const sneaky = 'leaked token ghp_abcdef-TEST-TOKEN-xyz';
  const { report } = await runAudit({
    fetchImpl: fullFake({
      deployment: {
        id: 'dep-9', created_on: '2026-10-27T05:21:31Z', source: 'wrangler', strategy: 'percentage',
        versions: [{ percentage: 100, version_id: 'ver-9' }],
        annotations: { 'workers/message': sneaky },
      },
    }),
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('ghp_abcdef-TEST-TOKEN-xyz'));
  assert.ok(!serialized.includes('fake-token-for-tests'));
  assert.ok(!serialized.includes('fake-account-id-for-tests'));
  assert.equal(checkOf(report, 'sha_linkage').status, 'UNKNOWN');
  assert.equal(report.cloudflare.annotationValue, null);

  // Scrub layer: an exact secret embedded in any string is replaced.
  const scrubbed = scrubSecrets(
    { note: 'leak fake-token-for-tests here', nested: ['ok', 'fake-account-id-for-tests'] },
    ['fake-token-for-tests', 'fake-account-id-for-tests'],
  );
  assert.equal(scrubbed.note, '[redacted]');
  assert.deepEqual(scrubbed.nested, ['ok', '[redacted]']);
});

test('wrangler.toml parsing yields the four baseline bindings with types', () => {
  const parsed = parseWranglerToml(WRANGLER_SAMPLE);
  assert.deepEqual(
    parsed.map((b) => [b.name, b.type]),
    [
      ['CHANNELS_ARCHIVE', 'kv_namespace'],
      ['CATALOG_DB', 'd1'],
      ['CATALOG_DISCOVERY_QUEUE', 'queue'],
      ['CATALOG_PROCESSING_QUEUE', 'queue'],
    ],
  );
  for (const baseline of BASELINE_BINDINGS) {
    assert.ok(parsed.some((b) => b.name === baseline.name && b.type === baseline.type));
  }
});

test('overall rule: FAIL beats BLOCKED beats UNKNOWN, PASS needs all PASS', async () => {
  // All PASS except one UNKNOWN -> UNKNOWN (covered above); here FAIL + BLOCKED -> FAIL.
  const mixed = fakeFetch([
    ['api.github.com', async () => ({ status: 500, body: 'no' })],
    ['/deployments', async () => jsonResponse({
      result: {
        deployments: [{
          id: 'd', created_on: 't', source: 'wrangler', strategy: 'percentage',
          versions: [{ percentage: 50, version_id: 'a' }, { percentage: 50, version_id: 'b' }],
          annotations: { 'workers/message': 'hello' },
        }],
      },
    })],
    ['/settings', async () => jsonResponse({ result: { bindings: [] } })],
    ['/api/health', async () => jsonResponse({ status: 'ok', service: 'youngtube-worker', timestamp: 't' })],
    ['/api/categories', async () => jsonResponse([{ id: 'all', label: 'x' }])],
  ]);
  const { report } = await runAudit({
    fetchImpl: mixed,
    env: baseEnv(),
    readFile: () => WRANGLER_SAMPLE,
  });
  assert.equal(checkOf(report, 'github_sha').status, 'BLOCKED');
  assert.equal(checkOf(report, 'traffic').status, 'FAIL');
  assert.equal(report.summary.overall, 'FAIL');
  assert.equal(report.summary.counts.FAIL, 2); // traffic + bindings (empty live list)
});
