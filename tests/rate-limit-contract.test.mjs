import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const durableObject = fs.readFileSync(path.join(root, 'worker/telemetry_do.ts'), 'utf8');
const rateLimit = fs.readFileSync(path.join(root, 'worker/lib/cors.ts'), 'utf8');
test('Durable Object rate-limit counters persist in SQLite with an atomic upsert', () => {
 assert.ok(durableObject.includes('CREATE TABLE IF NOT EXISTS public_rate_limit_windows'));
 assert.ok(durableObject.includes('ON CONFLICT(rate_key) DO UPDATE'));
 assert.ok(durableObject.includes('RETURNING request_count, reset_at_ms'));
 assert.equal(durableObject.includes('rateLimitMap'), false);
});
test('a configured Durable Object failure denies requests, not an isolate-local fallback', () => {
 const start = rateLimit.indexOf('if (env.TELEMETRY_DO)');
 const end = rateLimit.indexOf('return checkFallbackRateLimit', start);
 assert.ok(start >= 0 && end > start);
 const boundPath = rateLimit.slice(start, end);
 assert.ok(boundPath.includes('return false'));
 assert.ok(boundPath.includes('data?.allowed === true'));
});
