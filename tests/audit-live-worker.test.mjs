import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUDIT_STATUS,
  DEFAULTS,
  inspectCategories,
  inspectDeploymentSha,
  inspectHealth,
  parseWranglerBindings,
  runAudit,
} from '../scripts/audit-live-worker.mjs';

const GITHUB_SHA = '5b494b726d407d2881afec4e403b04e096de568e';
const WRANGLER = `
name = "youngtube-worker"
main = "worker/index.ts"

[[kv_namespaces]]
binding = "CHANNELS_ARCHIVE"
id = "kv-id"

[[d1_databases]]
binding = "CATALOG_DB"
database_name = "youngtube-catalog-v2"
database_id = "d1-id"

[[queues.producers]]
binding = "CATALOG_DISCOVERY_QUEUE"
queue = "youngtube-catalog-discovery"

[[queues.producers]]
binding = "CATALOG_PROCESSING_QUEUE"
queue = "youngtube-catalog-processing"
`;
const HEALTH = { status: 'ok', service: 'youngtube-worker', timestamp: '2026-10-28T00:00:00.000Z' };
const CATEGORIES = [
  { id: 'all', label: 'All', name: 'All' },
  { id: 'learn', label: 'Learn', name: 'Learn' },
];
const BASE_ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'account-test-id',
  CLOUDFLARE_API_TOKEN: 'TOKEN_MUST_NOT_APPEAR_IN_REPORT',
  GITHUB_REPOSITORY: 'saaedcs50/YoungTube-',
  GITHUB_REF: 'main',
  WORKER_BASE_URL: DEFAULTS.workerBaseUrl,
};

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function fixture(overrides = {}) {
  const deployment = {
    id: 'deployment-current',
    created_on: '2026-10-27T05:21:40.484074Z',
    source: 'api',
    strategy: 'percentage',
    annotations: { 'workers/message': `Deploy from main ${GITHUB_SHA.slice(0, 7)}` },
    versions: [{ version_id: 'version-current', percentage: 100 }],
    ...(overrides.deployment || {}),
  };
  const settings = {
    success: true,
    result: {
      bindings: [
        { name: 'CATALOG_DB', type: 'd1', id: 'd1-id' },
        { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace', namespace_id: 'kv-id' },
        { name: 'CATALOG_DISCOVERY_QUEUE', type: 'queue', queue_name: 'youngtube-catalog-discovery' },
        { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue', queue_name: 'youngtube-catalog-processing' },
        { name: 'A_SECRET_BINDING', type: 'secret_text', text: 'SENSITIVE_BINDING_VALUE_MUST_NOT_APPEAR' },
      ],
    },
    ...(overrides.settingsBody || {}),
  };
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url: url.toString(), method: init.method || 'GET', headers: init.headers || {}, hasBody: init.body !== undefined });
    if ((init.method || 'GET') !== 'GET') throw new Error('non-GET request was attempted');
    const type = url.hostname === 'api.github.com' ? 'github'
      : url.hostname === 'api.cloudflare.com' ? (url.pathname.endsWith('/deployments') ? 'deployments' : 'settings')
        : url.pathname === '/api/health' ? 'health'
          : url.pathname === '/api/categories' ? 'categories' : 'unexpected';
    if (overrides.throw?.[type]) throw overrides.throw[type];
    if (overrides.http?.[type]) return jsonResponse({ success: false, error: 'opaque failure' }, overrides.http[type]);
    switch (type) {
      case 'github': return jsonResponse({ sha: overrides.githubSha ?? GITHUB_SHA });
      case 'deployments': return jsonResponse(overrides.deploymentsBody ?? { success: true, result: { deployments: [deployment] } });
      case 'settings': return jsonResponse(overrides.settingsBody ?? settings);
      case 'health': return jsonResponse(overrides.healthBody ?? HEALTH, overrides.healthStatus ?? 200);
      case 'categories': return jsonResponse(overrides.categoriesBody ?? CATEGORIES, overrides.categoriesStatus ?? 200);
      default: return jsonResponse({ error: 'not found' }, 404);
    }
  };
  return { fetchImpl, calls, deployment, settings };
}

async function audit(overrides = {}, envOverrides = {}) {
  const fake = fixture(overrides);
  const report = await runAudit({
    env: { ...BASE_ENV, ...envOverrides },
    fetchImpl: fake.fetchImpl,
    wranglerText: WRANGLER,
    now: () => new Date('2026-10-28T08:30:00.000Z'),
    timeoutMs: 50,
  });
  return { report, ...fake };
}

const find = (report, id) => report.checks.find((item) => item.id === id);

test('Wrangler parser reads D1, KV, and queue producer bindings without dependencies', () => {
  const parsed = parseWranglerBindings(WRANGLER);
  assert.equal(parsed.d1[0].database_id, 'd1-id');
  assert.equal(parsed.kv[0].binding, 'CHANNELS_ARCHIVE');
  assert.equal(parsed.queues.length, 2);
});

test('full deployment SHA in annotation matches current GitHub SHA', () => {
  const result = inspectDeploymentSha({ annotations: { 'workers/message': `commit ${GITHUB_SHA}` } }, GITHUB_SHA);
  assert.equal(result.status, AUDIT_STATUS.PASS);
});

test('an actual short SHA prefix matches, but arbitrary substring does not', () => {
  assert.equal(inspectDeploymentSha({ annotations: { 'workers/message': `deploy ${GITHUB_SHA.slice(0, 7)}` } }, GITHUB_SHA).status, AUDIT_STATUS.PASS);
  assert.equal(inspectDeploymentSha({ annotations: { 'workers/message': `deploy ${GITHUB_SHA.slice(2, 9)}` } }, GITHUB_SHA).status, AUDIT_STATUS.FAIL);
  assert.equal(inspectDeploymentSha({ annotations: { 'workers/message': `deploy ${GITHUB_SHA.slice(0, 7)} and 0123456789abcdef` } }, GITHUB_SHA).status, AUDIT_STATUS.UNKNOWN);
});

test('a deployment annotation with a non-matching SHA fails source linkage', async () => {
  const { report } = await audit({ deployment: { annotations: { 'workers/message': 'deploy from 0123456789abcdef' } } });
  assert.equal(find(report, 'deployment.sha_matches_github').status, AUDIT_STATUS.FAIL);
});

test('missing deployment annotation is UNKNOWN and never PASS', async () => {
  const { report } = await audit({ deployment: { annotations: undefined } });
  assert.equal(find(report, 'deployment.sha_matches_github').status, AUDIT_STATUS.UNKNOWN);
});

test('a traffic percentage without an identifiable version cannot pass', async () => {
  const { report } = await audit({ deployment: { versions: [{ percentage: 100 }] } });
  assert.equal(find(report, 'deployment.traffic').status, AUDIT_STATUS.UNKNOWN);
  assert.notEqual(report.overallStatus, AUDIT_STATUS.PASS);
});

test('split traffic across versions fails deployment traffic audit', async () => {
  const { report } = await audit({ deployment: { versions: [
    { version_id: 'version-a', percentage: 75 },
    { version_id: 'version-b', percentage: 25 },
  ] } });
  assert.equal(find(report, 'deployment.traffic').status, AUDIT_STATUS.FAIL);
  assert.equal(find(report, 'deployment.traffic').evidence.trafficTotalPercent, 100);
  assert.equal(find(report, 'deployment.traffic').evidence.versionCount, 2);
});

test('missing required live binding fails', async () => {
  const settingsBody = { success: true, result: { bindings: [
    { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace', namespace_id: 'kv-id' },
    { name: 'CATALOG_DISCOVERY_QUEUE', type: 'queue', queue_name: 'youngtube-catalog-discovery' },
    { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue', queue_name: 'youngtube-catalog-processing' },
  ] } };
  const { report } = await audit({ settingsBody });
  assert.equal(find(report, 'binding.catalog_db').status, AUDIT_STATUS.FAIL);
});

test('binding resource id and queue-name mismatches fail', async () => {
  const settingsBody = { success: true, result: { bindings: [
    { name: 'CATALOG_DB', type: 'd1', id: 'wrong-d1-id' },
    { name: 'CHANNELS_ARCHIVE', type: 'kv_namespace', namespace_id: 'kv-id' },
    { name: 'CATALOG_DISCOVERY_QUEUE', type: 'queue', queue_name: 'wrong-queue' },
    { name: 'CATALOG_PROCESSING_QUEUE', type: 'queue', queue_name: 'youngtube-catalog-processing' },
  ] } };
  const { report } = await audit({ settingsBody });
  assert.equal(find(report, 'binding.catalog_db').status, AUDIT_STATUS.FAIL);
  assert.equal(find(report, 'binding.catalog_discovery_queue').status, AUDIT_STATUS.FAIL);
});

test('Cloudflare API HTTP errors and timeouts are recorded without pretending success', async () => {
  const error = new Error('simulated timeout');
  error.name = 'TimeoutError';
  const { report: httpReport } = await audit({ http: { deployments: 503 } });
  assert.equal(find(httpReport, 'cloudflare.deployments_api').status, AUDIT_STATUS.UNKNOWN);
  assert.notEqual(httpReport.overallStatus, AUDIT_STATUS.PASS);

  const { report: timeoutReport } = await audit({ throw: { settings: error } });
  assert.equal(find(timeoutReport, 'cloudflare.settings_api').status, AUDIT_STATUS.UNKNOWN);
  assert.equal(find(timeoutReport, 'binding.catalog_db').status, AUDIT_STATUS.UNKNOWN);
});

test('valid health payload passes and unhealthy/malformed health fails', async () => {
  assert.equal(inspectHealth(200, HEALTH).status, AUDIT_STATUS.PASS);
  assert.equal(inspectHealth(503, HEALTH).status, AUDIT_STATUS.FAIL);
  assert.equal(inspectHealth(200, { status: 'down', service: 'youngtube-worker', timestamp: 'invalid' }).status, AUDIT_STATUS.FAIL);
  const { report } = await audit({ healthBody: { status: 'not-ok' } });
  assert.equal(find(report, 'worker.health').status, AUDIT_STATUS.FAIL);
});

test('categories require the current direct-array contract and valid unique category ids', async () => {
  assert.equal(inspectCategories(200, CATEGORIES).status, AUDIT_STATUS.PASS);
  assert.equal(inspectCategories(200, { categories: CATEGORIES }).status, AUDIT_STATUS.FAIL);
  const { report: malformed } = await audit({ categoriesBody: { items: CATEGORIES } });
  assert.equal(find(malformed, 'worker.categories').status, AUDIT_STATUS.FAIL);
  const { report: duplicates } = await audit({ categoriesBody: [CATEGORIES[0], CATEGORIES[0]] });
  assert.equal(find(duplicates, 'worker.categories').status, AUDIT_STATUS.FAIL);
});

test('missing Cloudflare credentials blocks Cloudflare checks and causes no Cloudflare request', async () => {
  const { report, calls } = await audit({}, { CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_API_TOKEN: '' });
  assert.equal(find(report, 'cloudflare.credentials').status, AUDIT_STATUS.BLOCKED);
  assert.equal(find(report, 'cloudflare.deployments_api').status, AUDIT_STATUS.BLOCKED);
  assert.equal(find(report, 'binding.catalog_db').status, AUDIT_STATUS.BLOCKED);
  assert.equal(calls.some((call) => new URL(call.url).hostname === 'api.cloudflare.com'), false);
  assert.notEqual(report.overallStatus, AUDIT_STATUS.PASS);
});

test('all network requests use GET and report never includes authorization headers, tokens, or secret binding values', async () => {
  const { report, calls } = await audit();
  assert.ok(calls.length >= 5);
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.ok(calls.every((call) => call.hasBody === false));
  const json = JSON.stringify(report);
  assert.equal(json.includes('TOKEN_MUST_NOT_APPEAR_IN_REPORT'), false);
  assert.equal(json.includes('SENSITIVE_BINDING_VALUE_MUST_NOT_APPEAR'), false);
  assert.equal(json.includes('Authorization'), false);
  assert.equal(json.includes('workers.dev/api'), false);
});

test('overall status refuses to convert UNKNOWN or BLOCKED checks into PASS', async () => {
  const { report } = await audit({ deployment: { annotations: undefined } });
  assert.equal(report.overallStatus, AUDIT_STATUS.UNKNOWN);
  const { report: blocked } = await audit({}, { CLOUDFLARE_API_TOKEN: '' });
  assert.equal(blocked.overallStatus, AUDIT_STATUS.BLOCKED);
});
