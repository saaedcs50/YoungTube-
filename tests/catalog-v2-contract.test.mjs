import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const route = fs.readFileSync(path.join(root, 'worker/routes/catalog-v2.ts'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.ts'), 'utf8');
const catalogClient = fs.readFileSync(path.join(root, 'src/services/catalogV2Feed.ts'), 'utf8');
const kidFeed = fs.readFileSync(path.join(root, 'src/features/feed/useKidFeed.ts'), 'utf8');
const cors = fs.readFileSync(path.join(root, 'worker/lib/cors.ts'), 'utf8');

test('Shorts path behavior is observed only for pilot batches and not treated as verified evidence', () => {
  assert.match(route, /b\.pilot===true\?await probeShortsPath\(id\):null/);
  assert.match(route, /usedForDecision:false/);
  assert.match(route, /shorts_path_signal=0/);
  assert.match(route, /thumbnailIsPortrait:dims \? dims\.height > dims\.width : null/);
});

test('approval and generation publishing keep the Shorts and duration gates independent of topic classification', () => {
  assert.match(route, /v\.shorts_check_status!=='NOT_SHORTS'/);
  assert.match(route, /Number\(v\.duration_seconds\)<=0/);
  assert.match(route, /review_status='APPROVED' AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0/);
  assert.doesNotMatch(route, /duration_seconds>=120/);
});

test('the default feed excludes opt-in gaming and no-music songs do not leak into the ordinary song path', () => {
  assert.match(route, /FROM base WHERE primary_category_id!='gaming'/);
  assert.match(route, /primary_category_id NOT IN \('music_songs','music_songs_no_music'\)/);
});

test('archive migration is shadow-only and preserves the legacy KV feed until generation publication', () => {
  assert.match(route, /CHANNELS_LATEST_MERGED/);
  assert.match(route, /'catalog_mode','shadow'/);
  assert.match(route, /activeGenerationUnchanged:true/);
  assert.match(route, /JSON.stringify\(\{mode:'published',schemaVersion:2/);
});


test('kid app activates Catalog V2 only for a matching fully published generation', () => {
  assert.ok(catalogClient.includes("if (envelope.mode !== 'published' || !envelope.manifest) return null;"));
  assert.ok(catalogClient.includes('activeGeneration !== manifestGeneration'));
  assert.ok(catalogClient.includes("data.mode !== 'published' || data.generationId !== activeGeneration"));
  assert.ok(kidFeed.includes('fetchPublishedCatalogFeed(enabledOptInCategories)'));
  assert.ok(kidFeed.includes('previousGeneration !== publishedCatalog.generationId'));
  assert.ok(kidFeed.includes("catalogMode: 'published'"));
  assert.ok(kidFeed.includes("settings?.catalogMode !== 'published'"));
  assert.ok(kidFeed.includes("settings?.catalogMode === 'published'"));
  assert.ok(kidFeed.includes('do not let deep search bypass its approved-only feed contract'));
});

test('client feed uses video-level taxonomy and applies minimum duration only with the family key', () => {
  assert.ok(kidFeed.includes('video.primaryCategoryId'));
  assert.ok(kidFeed.includes('video.secondaryCategoryIds || []'));
  assert.ok(kidFeed.includes('item.videoDuration >= MIN_VIDEO_DURATION_SECONDS'));
  assert.ok(catalogClient.includes('primaryCategoryId: row.primaryCategoryId'));
  assert.ok(catalogClient.includes("row.format === 'SONG_OR_NASHEED'"));
});


test('public Catalog V2 read routes use the existing rate limiter', () => {
  assert.ok(cors.includes("'/api/catalog/v2/manifest'"));
  assert.ok(cors.includes("'/api/catalog/v2/feed'"));
});


test('catalog metadata retention is refreshed before age-out and stale pages cannot be published', () => {
  assert.ok(route.includes('metadata_refresh_queued_at'));
  assert.ok(route.includes("datetime(metadata_checked_at)<=datetime('now','-20 days')"));
  assert.ok(route.includes('export async function scheduleCatalogMetadataRefresh'));
  assert.ok(workerIndex.includes('await scheduleCatalogMetadataRefresh(env)'));
  assert.ok(route.includes('metadataCheckedAtFloor'));
  assert.ok(route.includes('{expiration:expiresAt}'));
  assert.ok(route.includes('catalog_page_metadata_stale'));
  assert.ok(route.includes("UPDATE catalog_generation_items SET payload_json='{}'"));
});

test('published feed is reconciled against current approved D1 records instead of trusting KV alone', () => {
  assert.ok(route.includes("v.review_status='APPROVED'"));
  assert.ok(route.includes("v.shorts_check_status='NOT_SHORTS'"));
  assert.ok(route.includes("v.metadata_checked_at>=datetime('now','-30 days')"));
  assert.ok(route.includes("gen!==active"));
  assert.ok(kidFeed.includes('isFreshCatalogMetadata(cached.catalogMetadataCheckedAt)'));
  assert.ok(catalogClient.includes('isFreshMetadataTimestamp(row.metadataCheckedAt)'));
});
