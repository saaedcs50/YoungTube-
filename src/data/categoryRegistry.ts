import { WORKER_URL } from '../config';

export interface KidCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
  scope?: 'source' | 'video' | 'both';
}

import {
  CONTENT_CENTERS,
  SONG_VARIANT_CATEGORIES,
  LEGACY_CATEGORY_IDS,
  LEGACY_CATEGORY_TO_CENTER,
  CONTENT_CATEGORY_TAG_ALIASES,
  canonicalizeCategoryId,
  isVideoOnlyCategory,
} from '../../shared/contentTaxonomy';
import { isLikelySongContentTitle, matchesPublicSongCategory } from '../../shared/musicClassification';

export const DEFAULT_KID_CATEGORIES: KidCategory[] = [
  { id: 'all', label: 'كل الفيديوهات', emoji: '✨', description: 'كل الفيديوهات والبرامج الرئيسية', scope: 'both' },
  ...CONTENT_CENTERS.map((category) => ({
    id: category.id, label: category.label, emoji: category.emoji,
    description: category.description, scope: 'source' as const,
  })),
  ...SONG_VARIANT_CATEGORIES.map((category) => ({
    id: category.id, label: category.label, emoji: category.emoji,
    description: category.description, scope: 'video' as const,
  })),
];

export const KID_CATEGORIES: KidCategory[] = DEFAULT_KID_CATEGORIES;
export const CURATION_CATEGORIES: KidCategory[] = DEFAULT_KID_CATEGORIES.filter(
  (category) => category.id !== 'all' && category.scope !== 'video'
);
export const OPT_IN_CATEGORY_IDS: string[] = ['gaming'];
export const LEGACY_CATEGORY_ID_SET = new Set<string>(LEGACY_CATEGORY_IDS);

/**
 * Synchronous access to static default categories
 */
export function getBuiltinCategories(): KidCategory[] {
  return DEFAULT_KID_CATEGORIES;
}

/**
 * Returns read-only array of opt-in gated category IDs
 */
export function getOptInCategoryIds(): readonly string[] {
  return OPT_IN_CATEGORY_IDS;
}

/**
 * Aliases and tag mapping to flexibly match channel seed tags with dynamic category keys
 */
export const CATEGORY_TAG_ALIASES: Record<string, string[]> = {
  all: ['all', 'الكل', 'الرئيسية'],
  ...Object.fromEntries(Object.entries(CONTENT_CATEGORY_TAG_ALIASES).map(([id, aliases]) => [id, [...aliases]])),
  quran: ['quran', 'faith', 'islamic', 'islam', 'deen', 'deeny', 'religion', 'religious', 'duas', 'azkar', 'prophets', 'quran_recitation', 'nasheed', 'قرآن', 'قرآن كريم', 'أذكار', 'إيمانيات', 'دين', 'إسلاميات', 'سير وقيم', 'قصص الأنبياء'],
  stories: ['stories', 'story', 'storytime', 'reading', 'books', 'book', 'tales', 'fairy_tales', 'fairytales', 'bedtime_stories', 'قصص', 'حكايات', 'قراءة', 'كتب', 'مغامرات', 'حكاية', 'قصة'],
  cartoons: ['cartoons', 'cartoon', 'shows', 'show', 'animation', 'series', 'tv', 'episodes', 'كرتون', 'برامج', 'رسوم متحركة', 'مسلسلات'],
  education: ['education', 'educational', 'learn', 'learning', 'language', 'languages', 'english', 'arabic', 'math', 'mathematics', 'numbers', 'letters', 'alphabet', 'alphablocks', 'numberblocks', 'phonics', 'grammar', 'preschool', 'kindergarten', 'study', 'skills', 'تعليم', 'لغات', 'أرقام', 'حروف', 'رياضيات', 'لغة عربية', 'لغة إنجليزية', 'دراسة', 'مهارات'],
  science: ['science', 'stem', 'experiments', 'experiment', 'nature', 'discovery', 'discoveries', 'space', 'astronomy', 'physics', 'biology', 'chemistry', 'animals', 'wildlife', 'earth', 'technology', 'tech', 'how_it_works', 'علوم', 'استكشاف', 'تجارب', 'طبيعة', 'فضاء', 'حيوانات', 'تكنولوجيا', 'ابتكار'],
  crafts: ['crafts', 'craft', 'arts', 'art', 'drawing', 'draw', 'coloring', 'colors', 'origami', 'diy', 'painting', 'paint', 'sketch', 'handicrafts', 'clay', 'making', 'رسم', 'فنون', 'أشغال', 'أعمال يدوية', 'تلوين', 'أشغال يدوية', 'ابتكار وفنون'],
  sports: ['sports', 'sport', 'active', 'activity', 'fitness', 'movement', 'move', 'exercise', 'workout', 'yoga', 'gymnastics', 'football', 'soccer', 'challenges', 'حركة', 'رياضة', 'نشاط', 'تمارين', 'لياقة', 'ألعاب حركية', 'يوغا', 'تحديات'],
  gaming: ['gaming', 'ألعاب'],
  cooking: ['cooking', 'food', 'kitchen', 'طبخ'],
  calm: ['calm', 'sleep', 'relax', 'هدوء', 'نوم'],
};

/**
 * Checks if a channel's categories match the target category (supports exact IDs & aliases).
 */
export function channelMatchesCategory(
  channelCategories: string | string[] | undefined,
  targetCategoryId: string
): boolean {
  if (!targetCategoryId || targetCategoryId === 'all') return true;
  if (!channelCategories || isVideoOnlyCategory(targetCategoryId)) return false;
  const rawTarget = targetCategoryId.toLowerCase().trim();
  const targetLower = canonicalizeCategoryId(rawTarget);
  const aliases = CATEGORY_TAG_ALIASES[targetLower] || CATEGORY_TAG_ALIASES[rawTarget] || [targetLower];
  const cats = Array.isArray(channelCategories) ? channelCategories : [channelCategories];
  for (const category of cats) {
    if (!category) continue;
    const catLower = String(category).toLowerCase().trim();
    const canonicalCat = canonicalizeCategoryId(catLower);
    if (catLower === targetLower || canonicalCat === targetLower) return true;
    if (aliases.includes(catLower)) return true;
    const catAliases = CATEGORY_TAG_ALIASES[catLower] || [];
    if (catAliases.includes(targetLower) || catAliases.some((alias) => aliases.includes(alias))) return true;
  }
  return false;
}

/** Video-aware matching keeps music variant routing at the individual-video level. */
export function videoMatchesCategory(
  title: string,
  channelCategories: string | string[] | undefined,
  targetCategoryId: string,
  explicitSongContent?: boolean
): boolean {
  if (targetCategoryId === 'all') return true;
  if (targetCategoryId === 'music_songs' || targetCategoryId === 'music_songs_no_music') {
    const isSong = explicitSongContent === true || isLikelySongContentTitle(title || '');
    return matchesPublicSongCategory({ title: title || '', isSongContent: isSong }, targetCategoryId);
  }
  return channelMatchesCategory(channelCategories, targetCategoryId);
}

/** Legacy alias for channelMatchesCategory */
export const matchCategory = channelMatchesCategory;

/**
 * Video-aware category match. Music paths are determined per video title, never
 * by declaring every video in a channel to be a song. Legacy topic categories
 * continue to match against channel/source category hints during migration.
 */
export function videoMatchesCategory(
  title: string,
  channelCategories: string | string[] | undefined,
  targetCategoryId: string,
  explicitSongContent?: boolean
): boolean {
  if (targetCategoryId === 'all') return true;
  if (targetCategoryId === 'music_songs' || targetCategoryId === 'music_songs_no_music') {
    const isSong = explicitSongContent === true || isLikelySongContentTitle(title || '');
    return matchesPublicSongCategory({ title: title || '', isSongContent: isSong }, targetCategoryId);
  }
  return channelMatchesCategory(channelCategories, targetCategoryId);
}

/** Legacy alias for channelMatchesCategory */
export const matchCategory = channelMatchesCategory;

/** Legacy alias for channelMatchesCategory */
export const matchCategory = channelMatchesCategory;

/**
 * Helper to compute curation & kid category lists applying opt-in gating
 */
export function listCategoriesForKidUi(
  baseCategories: KidCategory[] = DEFAULT_KID_CATEGORIES,
  customCats: KidCategory[] = [],
  enabledOptInCats: string[] = []
): {
  curationCategories: KidCategory[];
  kidCategories: KidCategory[];
} {
  const allCategory = baseCategories.find((c) => c.id === 'all') || DEFAULT_KID_CATEGORIES[0];
  const otherBase = baseCategories.filter((c) => c.id !== 'all');

  const isCategoryAllowed = (catId: string) => {
    if (!OPT_IN_CATEGORY_IDS.includes(catId)) return true;
    return enabledOptInCats.includes(catId);
  };

  const filteredOtherBase = otherBase.filter((c) => isCategoryAllowed(c.id));
  const filteredCustomCats = customCats.filter((c) => isCategoryAllowed(c.id));

  const curationCategories: KidCategory[] = [...filteredOtherBase, ...filteredCustomCats];
  const kidCategories: KidCategory[] = [allCategory, ...filteredOtherBase, ...filteredCustomCats];

  return { curationCategories, kidCategories };
}

/**
 * Async list of all available categories merged (defaults + custom Dexie categories)
 */
export async function listAllCategories(): Promise<KidCategory[]> {
  let custom: KidCategory[] = [];
  try {
    const customRows = await db.customCategories.toArray();
    custom = customRows.map((r) => ({
      id: r.categoryId,
      label: r.label,
      emoji: r.emoji,
      description: '',
    }));
  } catch {
    // Ignore db errors
  }

  let enabledOptIn: string[] = [];
  try {
    const settings = await db.settings.get('main');
    enabledOptIn = settings?.enabledOptInCategories || [];
  } catch {
    // Ignore db errors
  }

  const { kidCategories } = listCategoriesForKidUi(DEFAULT_KID_CATEGORIES, custom, enabledOptIn);
  return kidCategories;
}
