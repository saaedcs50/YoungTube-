import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

// Compile the route modules with the project's TypeScript compiler, then test the real handler
// using a deterministic Durable Object stub. Storage SQL/Cloudflare runtime is separately checked
// with Wrangler validation when dependencies and network access are available.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-parent-inbox-test-'));
let handleParentInboxRoutes;
let ParentInboxStore;
let storeCalls = [];
const sample = {
  id: 'm_12345678-1234-4234-9234-123456789012', deviceId: 'device_123456789',
  createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
  type: 'question', body: 'رسالة اختبار عادية', contact: '', appVersion: '1.0.1', platform: 'android',
  status: 'new', readAt: null, reply: null, repliedAt: null, adminNote: 'private admin note',
};

function compile(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const outputPath = path.join(tempRoot, relativePath.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: sourcePath, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10 },
  });
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  fs.writeFileSync(outputPath, result.outputText);
}

function sqliteState() {
  const database = new DatabaseSync(':memory:');
  const sql = {
    exec(statement, ...parameters) {
      const text = statement.trim();
      if (/^(CREATE|DROP|ALTER)\b/i.test(text)) {
        database.exec(text);
        return { toArray: () => [] };
      }
      if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(text)) {
        database.prepare(text).run(...parameters);
        return { toArray: () => [] };
      }
      return { toArray: () => database.prepare(text).all(...parameters) };
    },
  };
  return {
    storage: {
      sql,
      transactionSync(callback) {
        database.exec('BEGIN IMMEDIATE');
        try { const value = callback(); database.exec('COMMIT'); return value; }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    },
    blockConcurrencyWhile(callback) { callback(); return Promise.resolve(); },
  };
}
function createStore() { return new ParentInboxStore(sqliteState()); }
function storeRequest(store, path, method = 'GET', body) {
  return store.fetch(new Request(`https://store.test${path}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }));
}

function mockEnv() {
  const stub = {
    async fetch(url, init = {}) {
      const parsed = new URL(url);
      storeCalls.push({ path: parsed.pathname + parsed.search, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
      if (parsed.pathname === '/create') return new Response(JSON.stringify({ ok: true, message: sample }), { status: 201 });
      if (parsed.pathname === '/device') return new Response(JSON.stringify({ ok: true, messages: [{ ...sample, deviceId: 'device_123456789' }] }), { status: 200 });
      if (parsed.pathname === '/admin') return new Response(JSON.stringify({ ok: true, messages: [sample], newCount: 1, retainedCount: 1 }), { status: 200 });
      if (parsed.pathname === '/admin-action') return new Response(JSON.stringify({ ok: true, message: sample }), { status: 200 });
      return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });
    },
  };
  return { ADMIN_KEY: 'test-admin-key-not-real', PARENT_INBOX_DO: { idFromName: () => 'mock-id', get: () => stub } };
}
function request(path, method = 'GET', body, headers = {}) {
  return new Request(`https://unit.test${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

before(() => {
  compile('worker/lib/cors.ts');
  compile('worker/routes/parent-inbox.ts');
  compile('worker/parent_inbox_do.ts');
  ({ handleParentInboxRoutes } = require(path.join(tempRoot, 'worker/routes/parent-inbox.js')));
  ({ ParentInboxStore } = require(path.join(tempRoot, 'worker/parent_inbox_do.js')));
});
after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test('unauthenticated admin GET and POST are rejected before storage access', async () => {
  storeCalls = [];
  const env = mockEnv();
  const get = await handleParentInboxRoutes(request('/api/admin/parent-inbox'), env, new URL('https://unit.test/api/admin/parent-inbox'));
  const post = await handleParentInboxRoutes(request('/api/admin/parent-inbox/m_12345678-1234-4234-9234-123456789012', 'POST', { action: 'close' }), env, new URL('https://unit.test/api/admin/parent-inbox/m_12345678-1234-4234-9234-123456789012'));
  assert.equal(get.status, 401);
  assert.equal(post.status, 401);
  assert.equal(storeCalls.length, 0);
});

test('public message creation validates input and never returns adminNote', async () => {
  storeCalls = [];
  const env = mockEnv();
  const bad = await handleParentInboxRoutes(request('/api/parent-inbox', 'POST', { deviceId: 'bad', type: 'question', body: 'hello' }), env, new URL('https://unit.test/api/parent-inbox'));
  assert.equal(bad.status, 400);
  assert.equal(storeCalls.length, 0);
  const validBody = { deviceId: 'device_123456789', type: 'question', body: 'رسالة اختبار عادية', contact: '', appVersion: '1.0.1', platform: 'android' };
  const created = await handleParentInboxRoutes(request('/api/parent-inbox', 'POST', validBody), env, new URL('https://unit.test/api/parent-inbox'));
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.message.id, sample.id);
  assert.equal('adminNote' in payload.message, false);
  assert.equal(storeCalls.length, 1);
});

test('device GET requires a deviceId and public projection excludes private fields', async () => {
  storeCalls = [];
  const env = mockEnv();
  const invalid = await handleParentInboxRoutes(request('/api/parent-inbox'), env, new URL('https://unit.test/api/parent-inbox'));
  assert.equal(invalid.status, 400);
  const response = await handleParentInboxRoutes(request('/api/parent-inbox?deviceId=device_123456789'), env, new URL('https://unit.test/api/parent-inbox?deviceId=device_123456789'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.messages.length, 1);
  assert.equal('adminNote' in payload.messages[0], false);
  assert.equal('deviceId' in payload.messages[0], false);
});

test('authenticated admin request forwards Bearer-authorized action and private note remains admin-only', async () => {
  storeCalls = [];
  const env = mockEnv();
  const headers = { Authorization: 'Bearer test-admin-key-not-real' };
  const response = await handleParentInboxRoutes(request('/api/admin/parent-inbox', 'GET', undefined, headers), env, new URL('https://unit.test/api/admin/parent-inbox'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.newCount, 1);
  assert.equal(payload.messages[0].adminNote, 'private admin note');
  const action = await handleParentInboxRoutes(request(`/api/admin/parent-inbox/${sample.id}`, 'POST', { action: 'mark_read' }, headers), env, new URL(`https://unit.test/api/admin/parent-inbox/${sample.id}`));
  assert.equal(action.status, 200);
  assert.equal(storeCalls.at(-1).path, '/admin-action');
  assert.equal(storeCalls.at(-1).body.id, sample.id);
  assert.equal(storeCalls.at(-1).body.action, 'mark_read');
});

test('public input cannot submit internal fields and admin authorization uses the expected Bearer header', async () => {
  storeCalls = [];
  const env = mockEnv();
  const injection = await handleParentInboxRoutes(request('/api/parent-inbox', 'POST', {
    deviceId: 'device_123456789', type: 'question', body: 'hello world', status: 'replied', adminNote: 'bad',
  }), env, new URL('https://unit.test/api/parent-inbox'));
  assert.equal(injection.status, 400);
  const wrongAuth = await handleParentInboxRoutes(request('/api/admin/parent-inbox', 'GET', undefined, { Authorization: 'Basic test-admin-key-not-real' }), env, new URL('https://unit.test/api/admin/parent-inbox'));
  assert.equal(wrongAuth.status, 401);
});

test('SQLite-backed store atomically enforces five messages per device per rolling 24 hours', async () => {
  const store = createStore();
  const deviceId = 'same_device_12345';
  const submissions = await Promise.all(Array.from({ length: 6 }, (_, index) => storeRequest(store, '/create', 'POST', {
    deviceId, type: 'bug', body: `Message body number ${index}`, contact: '', appVersion: '1.0.1', platform: 'android',
  })));
  assert.equal(submissions.filter((res) => res.status === 201).length, 5);
  assert.equal(submissions.filter((res) => res.status === 429).length, 1);
  const afterLimit = await submissions.find((res) => res.status === 429).json();
  assert.equal(afterLimit.error, 'rate_limited');
  const otherDevice = await storeRequest(store, '/create', 'POST', {
    deviceId: 'another_device_12345', type: 'question', body: 'Different device message', contact: '', appVersion: '1.0.1', platform: 'android',
  });
  assert.equal(otherDevice.status, 201);
});

test('SQLite-backed store supports reply, private note, pin, archive, and keeps archive distinct from status', async () => {
  const store = createStore();
  const created = await storeRequest(store, '/create', 'POST', {
    deviceId: 'admin_action_device_123', type: 'question', body: 'Can you clarify this?', contact: '', appVersion: '1.0.1', platform: 'web',
  });
  const createdPayload = await created.json();
  const id = createdPayload.message.id;
  assert.equal(created.status, 201);
  assert.equal((await storeRequest(store, '/admin-action', 'POST', { id, action: 'mark_read' })).status, 200);
  assert.equal((await storeRequest(store, '/admin-action', 'POST', { id, action: 'reply', reply: 'Thanks, we will follow up.' })).status, 200);
  assert.equal((await storeRequest(store, '/admin-action', 'POST', { id, action: 'note', note: 'private investigation' })).status, 200);
  assert.equal((await storeRequest(store, '/admin-action', 'POST', { id, action: 'pin', pinned: true })).status, 200);
  assert.equal((await storeRequest(store, '/admin-action', 'POST', { id, action: 'archive', archived: true })).status, 200);
  const result = await (await storeRequest(store, '/admin')).json();
  const record = result.messages.find((message) => message.id === id);
  assert.equal(record.status, 'replied');
  assert.equal(record.archived, true);
  assert.equal(record.pinned, true);
  assert.equal(record.adminNote, 'private investigation');
  assert.equal(record.reply, 'Thanks, we will follow up.');
});

test('SQLite-backed store retains the newest 500 messages', async () => {
  const store = createStore();
  let firstId = '';
  let lastId = '';
  for (let i = 0; i < 501; i++) {
    const response = await storeRequest(store, '/create', 'POST', {
      deviceId: `device_${String(i).padStart(8, '0')}`, type: 'suggestion', body: `Message number ${i}`, contact: '', appVersion: '1.0.1', platform: 'web',
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    if (i === 0) firstId = payload.message.id;
    if (i === 500) lastId = payload.message.id;
  }
  const admin = await (await storeRequest(store, '/admin')).json();
  assert.equal(admin.retainedCount, 500);
  assert.equal(admin.messages.length, 500);
  assert.equal(admin.messages.some((message) => message.id === firstId), false);
  assert.equal(admin.messages.some((message) => message.id === lastId), true);
});

test('device quota resets after 24 hours and closed messages require reopening before reply', async () => {
  const originalNow = Date.now;
  let currentTime = 1_792_000_000_000;
  Date.now = () => currentTime;
  try {
    const store = createStore();
    const deviceId = 'rolling_window_device';
    let messageId = '';
    for (let i = 0; i < 5; i++) {
      const created = await storeRequest(store, '/create', 'POST', {
        deviceId, type: 'question', body: `Rolling window message ${i}`, contact: '', appVersion: '1.0.1', platform: 'web',
      });
      assert.equal(created.status, 201);
      const payload = await created.json();
      messageId = payload.message.id;
    }
    assert.equal((await storeRequest(store, '/create', 'POST', {
      deviceId, type: 'question', body: 'Sixth message should fail', contact: '', appVersion: '1.0.1', platform: 'web',
    })).status, 429);
    await storeRequest(store, '/admin-action', 'POST', { id: messageId, action: 'close' });
    assert.equal((await storeRequest(store, '/admin-action', 'POST', { id: messageId, action: 'reply', reply: 'Should require reopen' })).status, 409);
    assert.equal((await storeRequest(store, '/admin-action', 'POST', { id: messageId, action: 'reopen' })).status, 200);
    assert.equal((await storeRequest(store, '/admin-action', 'POST', { id: messageId, action: 'reply', reply: 'Now can reply.' })).status, 200);
    currentTime += 24 * 60 * 60 * 1000 + 1;
    const afterExpiry = await storeRequest(store, '/create', 'POST', {
      deviceId, type: 'question', body: 'Quota should reset after 24 hours', contact: '', appVersion: '1.0.1', platform: 'web',
    });
    assert.equal(afterExpiry.status, 201);
  } finally {
    Date.now = originalNow;
  }
});

test('messages remain scoped by device, search is bounded to the latest 200, and body stays plain text', async () => {
  const store = createStore();
  const privateMarkup = '<script>alert("x")</script> plain text';
  const first = await storeRequest(store, '/create', 'POST', {
    deviceId: 'scope_device_A_123', type: 'bug', body: privateMarkup, contact: '', appVersion: '1.0.1', platform: 'web',
  });
  assert.equal(first.status, 201);
  const firstId = (await first.json()).message.id;
  const other = await storeRequest(store, '/create', 'POST', {
    deviceId: 'scope_device_B_123', type: 'question', body: 'Another device owns this', contact: '', appVersion: '1.0.1', platform: 'web',
  });
  assert.equal(other.status, 201);
  const scoped = await (await storeRequest(store, '/device?deviceId=scope_device_A_123')).json();
  assert.equal(scoped.messages.length, 1);
  assert.equal(scoped.messages[0].id, firstId);
  assert.equal(scoped.messages[0].body, privateMarkup);

  for (let i = 0; i < 201; i++) {
    const result = await storeRequest(store, '/create', 'POST', {
      deviceId: `search_device_${String(i).padStart(5, '0')}`, type: 'suggestion', body: `Recent filler item ${i}`, contact: '', appVersion: '1.0.1', platform: 'web',
    });
    assert.equal(result.status, 201);
  }
  const olderSearch = await (await storeRequest(store, '/admin?search=scope_device_A')).json();
  assert.equal(olderSearch.messages.some((message) => message.id === firstId), false);
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const parentUiPath = path.join(projectRoot, 'src/components/dashboard/ParentInboxSection.tsx');
  if (fs.existsSync(parentUiPath)) {
    const parentUi = fs.readFileSync(parentUiPath, 'utf8');
    assert.equal(parentUi.includes('dangerouslySetInnerHTML'), false);
    assert.equal(parentUi.includes('message.body}</p>'), true);
  } else {
    const routeSource = fs.readFileSync(path.join(projectRoot, 'worker/routes/parent-inbox.ts'), 'utf8');
    assert.equal(routeSource.includes('function publicMessage'), true);
  }
});
