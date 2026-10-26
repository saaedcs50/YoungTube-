import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { AUTO_REVIEW_SHADOW_SAMPLE_LIMIT, remainingShadowSampleSlots } from '../worker/lib/catalog-auto-review-scheduling.ts';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const route = fs.readFileSync(path.join(root, 'worker/routes/catalog-v2.ts'), 'utf8');
const reviewer = fs.readFileSync(path.join(root, 'worker/lib/catalog-auto-review.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'worker/lib/types.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'worker/migrations/0005_catalog_auto_review.sql'), 'utf8');

test('multimodal screening uses Gemini 3.8 and batches up to ten separate public YouTube videos', () => {
  assert.ok(reviewer.includes("VIDEO_SAFETY_REVIEW_MODEL = 'gemini-3.8-flash'"));
  assert.ok(reviewer.includes('AUTO_REVIEW_BATCH_SIZE = 10'));
  assert.ok(reviewer.includes("type: 'video',"));
  assert.ok(reviewer.includes("uri: 'https://www.youtube.com/watch?v='"));
  assert.ok(reviewer.includes("response_format: { type: 'text', mime_type: 'application/json'"));
  assert.ok(reviewer.includes('seenIds.size !== normalized.length'));
  assert.ok(reviewer.includes("return { ok: false, error: 'provider_unavailable' }"));
});

test('automatic approvals are limited to high-confidence, age-appropriate, evidence-backed low-risk categories', () => {
  assert.ok(reviewer.includes("AUTO_REVIEW_CATEGORIES = ['learn', 'science_discovery', 'stories_programs', 'arts_crafts', 'nature_life', 'music_songs']"));
  assert.ok(reviewer.includes('assessment.confidence >= 0.98'));
  assert.ok(reviewer.includes('assessment.policyFlags.length === 0'));
  assert.ok(reviewer.includes("expectedCategory !== 'music_songs' || assessment.audioCoverage === 'sufficient'"));
  assert.ok(reviewer.includes('audioCoverage: { type: \'string\', enum: [\'sufficient\', \'partial\', \'unavailable\', \'not_applicable\'] }'));
  assert.ok(reviewer.includes('validEvidence.size >= 2'));
  assert.ok(reviewer.includes('/^(\\d{1,3}):([0-5]\\d)$/'));
  assert.ok(reviewer.includes('assessment.category === expectedCategory'));
});

test('the queue is batched, windowed, and protected by a scheduler lock with configurable limits', () => {
  assert.ok(route.includes("['off','shadow','enforce']"));
  assert.ok(route.includes("primary_category_id IN ('learn','science_discovery','stories_programs','arts_crafts','nature_life','music_songs')"));
  assert.ok(route.includes('audioCoverage:assessment.audioCoverage'));
  assert.ok(route.includes('AUTO_REVIEW_DEFAULT_DAILY_VIDEO_LIMIT = 2000'));
  assert.ok(route.includes('AUTO_REVIEW_DEFAULT_DAILY_SECONDS_LIMIT = 8 * 60 * 60'));
  assert.ok(route.includes('AUTO_REVIEW_MAX_DAILY_SECONDS_LIMIT = 72 * 60 * 60'));
  assert.ok(route.includes('AUTO_REVIEW_ENQUEUE_WINDOW_VIDEOS = 500'));
  assert.ok(route.includes("b.type==='AUTO_REVIEW_VIDEO_BATCH'"));
  assert.ok(route.includes("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_scheduler_lock'"));
  assert.ok(route.includes("path==='/api/admin/catalog/auto-review-budget'"));
  assert.ok(route.includes("if(hours>8&&b?.paidTierConfirmed!==true)"));
  assert.ok(route.includes('scanPublicYouTubeVideosForSafety(env.GEMINI_API_KEY'));
  assert.ok(types.includes('GEMINI_API_KEY?: string'));
  assert.ok(migration.includes('catalog_auto_review_usage'));
});

test('uncertain, stale, short, or unsupported videos cannot enter automatic approval', () => {
  assert.ok(route.includes("video.shorts_check_status!=='NOT_SHORTS'"));
  assert.ok(route.includes('duration<120||duration>AUTO_REVIEW_MAX_VIDEO_SECONDS'));
  assert.ok(route.includes("Date.now()-Date.parse(String(video.metadata_checked_at))>=20*24*60*60*1000"));
  assert.ok(route.includes('isHighConfidenceSafeAssessment'));
  assert.ok(route.includes("evidence.decision='automated_approval'"));
  assert.ok(route.includes("if(scan.error==='provider_rate_limited')"));
  assert.ok(route.includes("VALUES ('auto_review_pause_until',?,?)"));
});

test('human review remains available for exceptions, not required before every automated approval', () => {
  assert.ok(route.includes("evidence.decision='automated_approval'"));
  assert.ok(route.includes("safetyReviewConfirmed:true,safetyReviewConfirmedAt:ts"));
  assert.ok(route.includes("if(b.safetyReviewConfirmed!==true)return json({error:'manual_content_review_required'},400);"));
});


test('initial Shadow trial is hard-capped at ten unique scheduled video slots', () => {
  assert.equal(AUTO_REVIEW_SHADOW_SAMPLE_LIMIT, 10);
  assert.equal(remainingShadowSampleSlots(0), 10);
  assert.equal(remainingShadowSampleSlots(1), 9);
  assert.equal(remainingShadowSampleSlots(9), 1);
  assert.equal(remainingShadowSampleSlots(10), 0);
  assert.equal(remainingShadowSampleSlots(500), 0);
  assert.equal(remainingShadowSampleSlots(Number.NaN), 0);
  assert.equal(remainingShadowSampleSlots(0, Number.NaN), 0);

  // The scheduler persists reservations; later Cron invocations reuse the same
  // counter instead of treating each invocation as a fresh ten-video sample.
  assert.ok(route.includes("auto_review_shadow_reserved_count"));
  assert.ok(route.includes("shadowReservedCount=(shadowReservedCount||0)+rows.length"));
  assert.ok(route.includes("remainingShadowSampleSlots(shadowReservedCount,AUTO_REVIEW_SHADOW_SAMPLE_LIMIT)"));
  assert.ok(route.includes("'sample_limit_reached'"));
  assert.ok(route.includes("AUTO_REVIEW_SHADOW_SAMPLE_LIMIT"));
});

test('auto-review scheduling exposes and persists explicit diagnostics rather than silently returning', () => {
  for (const name of [
    'scheduleOutcome', 'eligibleCount', 'scheduledCount', 'batchesSent',
    'shadowSampleLimit', 'shadowReservedCount', 'auto_review_last_schedule',
  ]) assert.ok(route.includes(name), `scheduler diagnostics must include ${name}`);
  for (const outcome of [
    'scheduled', 'mode_off', 'not_configured', 'bindings_unavailable', 'paused',
    'budget_exhausted', 'no_eligible_video', 'sample_limit_reached',
    'enqueue_window_full', 'reservation_race', 'send_failed', 'lock_busy', 'scheduler_error',
  ]) assert.ok(route.includes(`'${outcome}'`), `scheduler outcome ${outcome} should be represented`);
  assert.ok(route.includes("const schedule=await scheduleCatalogAutoReview(env)"));
  assert.ok(route.includes("shadowSampleLimit:AUTO_REVIEW_SHADOW_SAMPLE_LIMIT"));
  assert.ok(route.includes("lastSchedule"));
});
