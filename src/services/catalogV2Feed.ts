import { WORKER_URL } from '../config';
import type { FeedItem } from '../db';

interface CatalogManifestCategory {
  id: string;
  itemCount?: number;
  pageCount?: number;
}
interface CatalogManifestResponse {
  mode?: string;
  activeGeneration?: string;
  manifest?: {
    generationId?: string;
    categories?: CatalogManifestCategory[];
  } | null;
}
interface CatalogFeedItem {
  videoId?: string;
  title?: string;
  publishedAt?: string | null;
  sourceId?: string;
  sourceTitle?: string;
  primaryCategoryId?: string | null;
  format?: string | null;
  musicVariant?: string | null;
  musicClassificationJson?: string | null;
  videoDuration?: number | null;
  metadataCheckedAt?: string | null;
}
interface CatalogFeedPage {
  mode?: string;
  generationId?: string;
  categoryId?: string;
  items?: CatalogFeedItem[];
}
export interface PublishedCatalogFeed {
  generationId: string;
  items: FeedItem[];
}

const CATALOG_METADATA_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ALL_FEED_PAGES = 2;
const MAX_PAGES_PER_CATEGORY = 1;

let cachedFeed: PublishedCatalogFeed | null = null;
let cachedOptInKey = '';

function getUrl(path: string): URL {
  return new URL(path, WORKER_URL.endsWith('/') ? WORKER_URL : WORKER_URL + '/');
}

function parseClassification(value?: string | null): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function isFreshMetadataTimestamp(value?: string | null): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  const age = Date.now() - parsed;
  return Number.isFinite(parsed) && age >= 0 && age < CATALOG_METADATA_MAX_AGE_MS;
}

function mapCatalogItem(row: CatalogFeedItem): FeedItem | null {
  if (!isFreshMetadataTimestamp(row.metadataCheckedAt)) return null;
  const videoId = String(row.videoId || '').trim();
  const title = String(row.title || '').trim();
  const channelId = String(row.sourceId || '').trim();
  const duration = Number(row.videoDuration);
  if (!videoId || !title || !channelId || !Number.isFinite(duration) || duration <= 0) return null;

  const classification = parseClassification(row.musicClassificationJson);
  const variant = String(row.musicVariant || 'STANDARD_OR_UNSPECIFIED');
  return {
    videoId,
    channelId,
    title,
    videoDuration: duration,
    publishedAt: row.publishedAt ? String(row.publishedAt) : undefined,
    fetchedAt: Date.now(),
    catalogMetadataCheckedAt: String(row.metadataCheckedAt),
    hidden: false,
    // Catalog publish already requires a successful NOT_SHORTS decision.
    isPortrait: false,
    primaryCategoryId: row.primaryCategoryId ? String(row.primaryCategoryId) : undefined,
    contentFormat: row.format === 'SONG_OR_NASHEED' ? 'song' : (row.format ? String(row.format) : undefined),
    songVariant: variant !== 'STANDARD_OR_UNSPECIFIED' ? variant : undefined,
    songVariantEvidence: classification?.matchedPhrase ? String(classification.matchedPhrase) : undefined,
    songVariantMatchedField:
      classification?.matchedField === 'title' || classification?.matchedField === 'description'
        ? classification.matchedField
        : null,
    songVariantConfidence:
      classification?.confidence === 'HIGH' || classification?.confidence === 'MEDIUM' || classification?.confidence === 'LOW'
        ? classification.confidence
        : undefined,
    songVariantStatus:
      classification?.classificationStatus === 'AUTO_CLASSIFIED' ||
      classification?.classificationStatus === 'NEEDS_REVIEW' ||
      classification?.classificationStatus === 'UNSPECIFIED'
        ? classification.classificationStatus
        : undefined,
    songVariantRuleVersion: classification?.ruleVersion ? String(classification.ruleVersion) : undefined,
    songVariantClassifiedAt: classification?.classifiedAt ? String(classification.classifiedAt) : undefined,
  };
}

/**
 * Returns the active published Catalog V2 feed, or null while the service is in
 * shadow mode / unavailable. It never treats an empty/error response as an
 * approved feed. A bounded sample is cached per generation in memory.
 */
export async function fetchPublishedCatalogFeed(
  enabledOptInCategories: string[] = [],
): Promise<PublishedCatalogFeed | null> {
  const wantsGaming = enabledOptInCategories.includes('gaming');
  const optInKey = wantsGaming ? 'gaming:on' : 'gaming:off';
  try {
    const manifestResponse = await fetch(getUrl('/api/catalog/v2/manifest').toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!manifestResponse.ok) return null;
    const envelope = await manifestResponse.json() as CatalogManifestResponse;
    if (envelope.mode !== 'published' || !envelope.manifest) return null;

    const activeGeneration = String(envelope.activeGeneration || '');
    const manifestGeneration = String(envelope.manifest.generationId || '');
    if (!activeGeneration || activeGeneration === 'legacy-kv' || activeGeneration !== manifestGeneration) return null;

    if (cachedFeed?.generationId === activeGeneration && cachedOptInKey === optInKey) {
      const freshItems = cachedFeed.items.filter((item) => isFreshMetadataTimestamp(item.catalogMetadataCheckedAt));
      if (freshItems.length === cachedFeed.items.length && freshItems.length > 0) return cachedFeed;
      cachedFeed = freshItems.length > 0 ? { generationId: activeGeneration, items: freshItems } : null;
    }

    const categories = Array.isArray(envelope.manifest.categories) ? envelope.manifest.categories : [];
    const all = categories.find((category) => category.id === 'all');
    if (!all || Number(all.pageCount || 0) < 1) return null;

    const targets: Array<{ id: string; pageCount: number }> = [
      { id: 'all', pageCount: Math.min(MAX_ALL_FEED_PAGES, Math.max(0, Number(all.pageCount || 0))) },
    ];
    for (const category of categories) {
      if (category.id === 'all') continue;
      if (category.id === 'gaming' && !wantsGaming) continue;
      const count = Math.max(0, Number(category.pageCount || 0));
      if (count > 0) {
        targets.push({
          id: category.id,
          pageCount: Math.min(category.id === 'gaming' ? MAX_PAGES_PER_CATEGORY : MAX_PAGES_PER_CATEGORY, count),
        });
      }
    }

    const collected = new Map<string, FeedItem>();
    const pages = targets.flatMap((target) =>
      Array.from({ length: target.pageCount }, (_, page) => ({ categoryId: target.id, page }))
    );
    const responses = await Promise.all(pages.map(async ({ categoryId, page }) => {
      const url = getUrl('/api/catalog/v2/feed');
      url.searchParams.set('category', categoryId);
      url.searchParams.set('page', String(page));
      url.searchParams.set('generation', activeGeneration);
      const response = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('catalog_page_http_' + response.status);
      const data = await response.json() as CatalogFeedPage;
      if (data.mode !== 'published' || data.generationId !== activeGeneration || !Array.isArray(data.items)) {
        throw new Error('catalog_page_contract_mismatch');
      }
      return data.items;
    }));

    for (const pageItems of responses) {
      for (const row of pageItems) {
        const item = mapCatalogItem(row);
        if (item) collected.set(item.videoId, item);
      }
    }
    if (collected.size === 0) return null;

    cachedFeed = { generationId: activeGeneration, items: [...collected.values()] };
    cachedOptInKey = optInKey;
    return cachedFeed;
  } catch {
    return null;
  }
}
