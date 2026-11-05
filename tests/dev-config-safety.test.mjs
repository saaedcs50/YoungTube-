import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
test('Vite is patched and dev servers bind to loopback by default', () => {
 assert.equal(pkg.devDependencies.vite, '^6.4.5');
 assert.equal(lock.packages['node_modules/vite'].version, '6.4.5');
 assert.ok(pkg.scripts.dev.includes('127.0.0.1'));
 assert.ok(pkg.scripts.preview.includes('127.0.0.1'));
 assert.equal(pkg.scripts.dev.includes('0.0.0.0'), false);
 assert.equal(pkg.scripts.preview.includes('0.0.0.0'), false);
});
test('development config never fabricates Worker responses', () => {
 assert.equal(config.includes('worker-proxy-plugin'), false);
 assert.equal(config.includes("worker: 'ready'"), false);
 assert.equal(config.includes('count: 50'), false);
 assert.equal(config.includes('channels_seed.json'), false);
});
test('confirmed unused server dependencies are removed', () => {
 for (const name of ['express', 'dotenv', 'vite']) assert.equal(pkg.dependencies?.[name], undefined);
 assert.equal(pkg.devDependencies?.['@types/express'], undefined);
});
