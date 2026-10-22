/**
 * Versioned, canonical content taxonomy for the kid-facing browse surfaces.
 *
 * The old category IDs remain accepted as migration aliases. Channel tags are hints,
 * not approval of every video from a source. Song variant is a video-level dimension.
 */
export const CONTENT_TAXONOMY_VERSION = 'youngtube-content-taxonomy-v1';

export type ContentCenterId =
  | 'learn'
  | 'science_discovery'
  | 'stories_programs'
  | 'music_songs'
  | 'arts_crafts'
  | 'cooking_food'
  | 'nature_life'
  | 'movement_play';

export interface ContentCenterDefinition {
  id: ContentCenterId;
  label: string;
  emoji: string;
  description: string;
  sourceSelectable: boolean;
  launchTier: 'P1' | 'P2' | 'P3';
}

export const CONTENT_CENTERS: readonly ContentCenterDefinition[] = [
  {
    id: 'learn',
    label: 'تعلّم',
    emoji: '💡',
    description: 'الحروف والقراءة واللغات والأرقام والمعرفة الأساسية',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'science_discovery',
    label: 'علوم واكتشاف',
    emoji: '🔬',
    description: 'العلوم والفضاء والتجارب الآمنة والهندسة والآلات',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'stories_programs',
    label: 'قصص وبرامج',
    emoji: '📺',
    description: 'القصص والحكايات والكرتون والبرامج المناسبة للعمر',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'music_songs',
    label: 'أغاني وأناشيد',
    emoji: '🎵',
    description: 'الأغاني والأناشيد التي تُعرف من إشارات الفيديو نفسه',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'arts_crafts',
    label: 'ارسم واصنع',
    emoji: '🎨',
    description: 'الرسم والتلوين والحرف البسيطة وصناعة النماذج الآمنة',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'cooking_food',
    label: 'طبخ وطعام',
    emoji: '🍳',
    description: 'الطعام والوصفات منخفضة المخاطر؛ الحرارة والشفرات تحتاج مراجعة',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'nature_life',
    label: 'طبيعة وحياة',
    emoji: '🌿',
    description: 'الحيوانات والنباتات والبستنة والبيئة ومهارات الحياة',
    sourceSelectable: true,
    launchTier: 'P1',
  },
  {
    id: 'movement_play',
    label: 'تحرّك والعب',
    emoji: '⚽',
    description: 'الحركة والرياضة وألعاب التفكير؛ الألعاب الرقمية تظل خاضعة لإعداد الأسرة',
    sourceSelectable: true,
    launchTier: 'P1',
  },
] as const;

/** Secondary categories that require explicit family opt-in; not main browse centers. */
export const OPT_IN_CATEGORY_IDS: readonly string[] = ['gaming'];

export const OPT_IN_CATEGORY_DEFINITIONS = [
  {
    id: 'gaming',
    label: 'ألعاب رقمية مناسبة',
    emoji: '🎮',
    description: 'ألعاب رقمية مناسبة للعمر؛ لا تظهر إلا بعد تفعيل ولي الأمر',
    sourceSelectable: true,
    launchTier: 'P2',
  },
] as const;

/** This is a video-only category; it must never be stored as a source/channel category. */
export const SONG_VARIANT_CATEGORIES = [
  {
    id: 'music_songs_no_music' as const,
    label: 'أغاني وأناشيد بدون موسيقى',
    emoji: '🔇',
    description: 'نسخ تحمل عناوينها تصريحًا واضحًا بأنها بدون موسيقى؛ لا يعني ذلك فحصًا صوتيًا',
    sourceSelectable: false as const,
  },
] as const;

export const LEGACY_CATEGORY_IDS = [
  'quran', 'stories', 'cartoons', 'education', 'science',
  'crafts', 'sports', 'gaming', 'cooking', 'calm',
] as const;

export const LEGACY_CATEGORY_TO_CENTER: Readonly<Record<string, ContentCenterId | null>> = {
  quran: 'stories_programs',
  stories: 'stories_programs',
  cartoons: 'stories_programs',
  education: 'learn',
  science: 'science_discovery',
  crafts: 'arts_crafts',
  sports: 'movement_play',
  gaming: null,
  cooking: 'cooking_food',
  // Calm/sleep describes context or mood, not a durable topic.
  calm: null,
};

export const CONTENT_CATEGORY_TAG_ALIASES: Readonly<Record<string, readonly string[]>> = {
  learn: [
    'learn', 'learning', 'education', 'educational', 'language', 'languages',
    'english', 'arabic', 'math', 'mathematics', 'numbers', 'letters', 'alphabet',
    'reading', 'phonics', 'grammar', 'preschool', 'kindergarten', 'study', 'skills',
    'تعليم', 'لغات', 'أرقام', 'حروف', 'قراءة', 'رياضيات', 'لغة عربية', 'لغة إنجليزية',
  ],
  science_discovery: [
    'science', 'stem', 'experiments', 'experiment', 'discovery', 'discoveries',
    'space', 'astronomy', 'physics', 'biology', 'chemistry', 'technology', 'tech',
    'engineering', 'robots', 'vehicles', 'how_it_works', 'علوم', 'استكشاف',
    'تجارب', 'فضاء', 'تكنولوجيا', 'ابتكار', 'هندسة', 'روبوتات',
  ],
  stories_programs: [
    'stories', 'story', 'storytime', 'books', 'book', 'tales', 'fairy_tales',
    'fairytales', 'bedtime_stories', 'cartoons', 'cartoon', 'shows', 'show',
    'animation', 'series', 'tv', 'episodes', 'quran', 'faith', 'religion',
    'قصص', 'حكايات', 'قصة', 'كرتون', 'برامج', 'رسوم متحركة', 'مسلسلات',
    'قرآن', 'قرآن كريم', 'أذكار', 'قيم', 'قصص الأنبياء',
  ],
  music_songs: [
    'songs', 'song', 'music', 'nursery_rhymes', 'rhymes', 'anashid', 'nasheed',
    'kids_songs', 'music_songs', 'أناشيد', 'أغاني', 'أغنية', 'نشيد', 'اناشيد', 'اغاني',
  ],
  arts_crafts: [
    'crafts', 'craft', 'arts', 'art', 'drawing', 'draw', 'coloring', 'colors',
    'origami', 'diy', 'painting', 'paint', 'sketch', 'handicrafts', 'clay', 'making',
    'رسم', 'فنون', 'أشغال', 'أعمال يدوية', 'تلوين', 'حرف', 'طين',
  ],
  cooking_food: [
    'cooking', 'food', 'kitchen', 'recipes', 'baking', 'nutrition', 'طبخ',
    'طعام', 'وصفات', 'خبز', 'تغذية',
  ],
  nature_life: [
    'nature', 'animals', 'wildlife', 'pets', 'plants', 'gardening', 'garden',
    'farming', 'outdoors', 'environment', 'life_skills', 'safety', 'careers',
    'حيوانات', 'حياة برية', 'نباتات', 'بستنة', 'زراعة', 'بيئة', 'مهارات الحياة',
  ],
  movement_play: [
    'sports', 'sport', 'active', 'activity', 'fitness', 'movement', 'move',
    'exercise', 'workout', 'yoga', 'gymnastics', 'football', 'soccer', 'play',
    'puzzles', 'logic', 'board_games', 'حركة', 'رياضة', 'نشاط', 'تمارين', 'لياقة',
    'ألعاب حركية', 'يوغا', 'ألغاز', 'منطق',
  ],
};

export function canonicalizeCategoryId(categoryId: string): string {
  const value = String(categoryId || '').trim().toLowerCase();
  return LEGACY_CATEGORY_TO_CENTER[value] || value;
}

export function normalizeCategoryIds(categoryIds: string[]): string[] {
  return [...new Set((categoryIds || []).map(canonicalizeCategoryId).filter(Boolean))];
}

export function isVideoOnlyCategory(categoryId: string): boolean {
  return categoryId === 'music_songs_no_music';
}
