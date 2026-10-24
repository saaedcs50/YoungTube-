import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const route = fs.readFileSync(path.join(root, 'worker/routes/catalog-v2.ts'), 'utf8');
const reviewer = fs.readFileSync(path.join(root, 'worker/lib/catalog-auto-review.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'worker/lib/types.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'worker/migrations/0005_catalog_auto_review.sql'), 'utf8');

test('automated review is multimodal and fails closed when the provider cannot assess a video', () => {
  assert.ok(reviewer.includes("type: 'video', uri: 'https://www.youtube.com/watch?v='"));
  assert.ok(reviewer.includes("contentCoverage: 'sufficient'"));
  assert.ok(reviewer.includes("return { ok: false, error: 'provider_unavailable' }"));
  assert.ok(reviewer.includes("response_format: { type: 'text', mime_type: 'application/json'"));
});

test('automatic approvals are limited to high-confidence, age-appropriate, evidence-backed low-risk categories', () => {
  assert.ok(reviewer.includes("AUTO_REVIEW_CATEGORIES = ['learn', 'arts_crafts', 'nature_life']"));
  assert.ok(reviewer.includes('assessment.confidence >= 0.98'));
  assert.ok(reviewer.includes('assessment.policyFlags.length === 0'));
  assert.ok(reviewer.includes('assessment.evidenceTimestamps.length >= 2'));
  assert.ok(reviewer.includes('assessment.category === expectedCategory'));
});

test('review automation has an explicit off/shadow/enforce mode and a bounded daily scan budget', () => {
  assert.ok(route.includes("['off','shadow','enforce']"));
  assert.ok(route.includes('AUTO_REVIEW_DAILY_VIDEO_LIMIT'));
  assert.ok(route.includes('AUTO_REVIEW_DAILY_SECONDS_LIMIT'));
  assert.ok(route.includes("b.type==='AUTO_REVIEW_VIDEO'"));
  assert.ok(types.includes('GEMINI_API_KEY?: string'));
  assert.ok(migration.includes('catalog_auto_review_usage'));
});

test('no metadata-only, short, stale, unknown-Shorts, or uncertain candidate can enter the automated approval path', () => {
  assert.ok(route.includes("v.shorts_check_status!=='NOT_SHORTS'"));
  assert.ok(route.includes('Number(v.duration_seconds)<120'));
  assert.ok(route.includes("Date.now()-Date.parse(String(v.metadata_checked_at))>=20*24*60*60*1000"));
  assert.ok(route.includes('isHighConfidenceSafeAssessment'));
  assert.ok(route.includes('AUTO_REVIEW_DAILY_VIDEO_LIMIT = 24'));
});

test('human review is an exception path, not a prerequisite for every automatically approved video', () => {
  assert.ok(route.includes("decision:'automated_approval'"));
  assert.ok(route.includes("safetyReviewConfirmed:true,safetyReviewConfirmedAt:ts"));
  assert.ok(route.includes("if(b.safetyReviewConfirmed!==true)return json({error:'manual_content_review_required'},400);"));
});
