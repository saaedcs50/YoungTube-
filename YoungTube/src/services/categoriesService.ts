import { WORKER_URL } from '../config';
import { KidCategory, DEFAULT_KID_CATEGORIES } from '../data/categoryRegistry';

const CATEGORIES_CACHE_KEY = 'yt_categories_cache';
const CATEGORIES_CACHE_TIMESTAMP_KEY = 'yt_categories_cache_ts';

export interface CategoryApiResponse {
  categories?: KidCategory[];
  items?: KidCategory[];
  [key: string]: any;
}

/**
 * Gets cached categories from localStorage synchronously for instant first paint.
 */
export function getCachedCategories(): KidCategory[] {
  if (typeof window === 'undefined') return DEFAULT_KID_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeCategoriesList(parsed);
      }
    }
  } catch (err) {
    console.warn('Failed to parse cached categories:', err);
  }
  return DEFAULT_KID_CATEGORIES;
}

/**
 * Normalizes categories ensuring "all" is first and fields are clean.
 */
export function normalizeCategoriesList(cats: any[]): KidCategory[] {
  if (!Array.isArray(cats) || cats.length === 0) {
    return DEFAULT_KID_CATEGORIES;
  }

  const normalized: KidCategory[] = [];
  const seenIds = new Set<string>();

  // Ensure "all" is always present and first
  const allCat = cats.find((c) => c && (c.id === 'all' || c.categoryId === 'all'));
  if (allCat) {
    normalized.push({
      id: 'all',
      label: allCat.label || allCat.name || 'الكل',
      emoji: allCat.emoji || allCat.icon || '✨',
      description: allCat.description || 'كل الفيديوهات / الرئيسية',
    });
  } else {
    normalized.push(DEFAULT_KID_CATEGORIES[0]);
  }
  seenIds.add('all');

  for (const c of cats) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id || c.categoryId || '').trim().toLowerCase();
    if (!id || seenIds.has(id)) continue;

    seenIds.add(id);
    normalized.push({
      id,
      label: String(c.label || c.name || id).trim(),
      emoji: String(c.emoji || c.icon || '🌟').trim(),
      description: String(c.description || '').trim(),
    });
  }

  return normalized.length > 1 ? normalized : DEFAULT_KID_CATEGORIES;
}

/**
 * Fetches dynamic categories from the Cloudflare Worker endpoint (/api/categories).
 * Saves successful responses in localStorage and falls back to cached/default on error.
 */
export async function fetchCategories(): Promise<KidCategory[]> {
  const url = `${WORKER_URL.replace(/\/+$/, '')}/api/categories`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      let rawList: any[] = [];

      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.categories)) rawList = data.categories;
        else if (Array.isArray(data.items)) rawList = data.items;
        else if (Array.isArray(data.data)) rawList = data.data;
      }

      if (rawList.length > 0) {
        const normalized = normalizeCategoriesList(rawList);
        try {
          localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(normalized));
          localStorage.setItem(CATEGORIES_CACHE_TIMESTAMP_KEY, Date.now().toString());
        } catch {
          // Ignore quota errors
        }
        return normalized;
      }
    }
  } catch (err) {
    // Network or timeout error — gracefully fallback
    console.warn('Dynamic category fetch failed, falling back to cached/defaults:', err);
  }

  return getCachedCategories();
}
