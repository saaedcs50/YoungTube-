export interface KidCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

/**
 * Standard default fallback categories as specified in requirements:
 * - all: كل الفيديوهات / الرئيسية
 * - quran: قرآن كريم وأذكار
 * - stories: قصص وحكايات
 * - cartoons: كرتون وأناشيد
 * - education: تعليم ولغات
 * - science: علوم واستكشاف
 * - crafts: رسم وفنون
 * - sports: حركة ورياضة
 * + additional rich categories to preserve channel curation backwards-compatibility
 */
export const DEFAULT_KID_CATEGORIES: KidCategory[] = [
  { id: 'all', label: 'كل الفيديوهات', emoji: '✨', description: 'كل الفيديوهات والبرامج الرئيسية' },
  { id: 'quran', label: 'قرآن كريم وأذكار', emoji: '🕌', description: 'تلاوات خاشعة وأذكار يومية وقصص الأنبياء' },
  { id: 'stories', label: 'قصص وحكايات', emoji: '📖', description: 'قصص ممتعة ومغامرات هادفة ومسلية' },
  { id: 'cartoons', label: 'كرتون وأناشيد', emoji: '📺', description: 'أناشيد كرتونية وبرامج رسوم متحركة مبهجة' },
  { id: 'education', label: 'تعليم ولغات', emoji: '💡', description: 'حروف وأرقام وتعلم اللغات والمفاهيم الأساسية' },
  { id: 'science', label: 'علوم واستكشاف', emoji: '🔬', description: 'تجارب علمية واستكشاف العالم الطبيعي' },
  { id: 'crafts', label: 'رسم وفنون', emoji: '🎨', description: 'تعلم الرسم والتلوين والأشغال اليدوية المبتكرة' },
  { id: 'sports', label: 'حركة ورياضة', emoji: '⚽', description: 'تمارين وألعاب حركية وتحديات رياضية ممتعة' },
  { id: 'gaming', label: 'ألعاب مناسبة', emoji: '🎮', description: 'ألعاب ذكاء ومرح عائلي مناسبة للأطفال' },
  { id: 'cooking', label: 'طبخ الصغار', emoji: '🍳', description: 'وصفات لذيذة وسهلة للأطفال' },
  { id: 'calm', label: 'هدوء واسترخاء', emoji: '🌙', description: 'موسيقى هادئة وقصص ما قبل النوم' },
];

export const KID_CATEGORIES: KidCategory[] = DEFAULT_KID_CATEGORIES;

export const CURATION_CATEGORIES: KidCategory[] = DEFAULT_KID_CATEGORIES.filter((c) => c.id !== 'all');

/**
 * Category IDs that require explicit parent opt-in before appearing in child-visible tabs.
 * Defaults to disabled/hidden for safety.
 */
export const OPT_IN_CATEGORY_IDS: string[] = ['gaming'];

/**
 * Aliases and tag mapping to flexibly match channel seed tags with dynamic category keys
 */
export const CATEGORY_TAG_ALIASES: Record<string, string[]> = {
  all: ['all', 'الكل', 'الرئيسية'],
  quran: [
    'quran',
    'faith',
    'islamic',
    'islam',
    'deen',
    'deeny',
    'religion',
    'religious',
    'duas',
    'azkar',
    'prophets',
    'quran_recitation',
    'nasheed',
    'قرآن',
    'قرآن كريم',
    'أذكار',
    'إيمانيات',
    'دين',
    'إسلاميات',
    'سير وقيم',
    'قصص الأنبياء',
  ],
  stories: [
    'stories',
    'story',
    'storytime',
    'reading',
    'books',
    'book',
    'tales',
    'fairy_tales',
    'fairytales',
    'bedtime_stories',
    'قصص',
    'حكايات',
    'قراءة',
    'كتب',
    'مغامرات',
    'حكاية',
    'قصة',
  ],
  cartoons: [
    'cartoons',
    'cartoon',
    'shows',
    'show',
    'animation',
    'series',
    'songs',
    'song',
    'music',
    'nursery_rhymes',
    'rhymes',
    'anashid',
    'kids_songs',
    'tv',
    'episodes',
    'كرتون',
    'أناشيد',
    'أغاني',
    'برامج',
    'رسوم متحركة',
    'مسلسلات',
    'طرب الصغار',
  ],
  education: [
    'education',
    'educational',
    'learn',
    'learning',
    'language',
    'languages',
    'english',
    'arabic',
    'math',
    'mathematics',
    'numbers',
    'letters',
    'alphabet',
    'alphablocks',
    'numberblocks',
    'phonics',
    'grammar',
    'preschool',
    'kindergarten',
    'study',
    'skills',
    'تعليم',
    'لغات',
    'أرقام',
    'حروف',
    'رياضيات',
    'لغة عربية',
    'لغة إنجليزية',
    'دراسة',
    'مهارات',
  ],
  science: [
    'science',
    'stem',
    'experiments',
    'experiment',
    'nature',
    'discovery',
    'discoveries',
    'space',
    'astronomy',
    'physics',
    'biology',
    'chemistry',
    'animals',
    'wildlife',
    'earth',
    'technology',
    'tech',
    'how_it_works',
    'علوم',
    'استكشاف',
    'تجارب',
    'طبيعة',
    'فضاء',
    'حيوانات',
    'تكنولوجيا',
    'ابتكار',
  ],
  crafts: [
    'crafts',
    'craft',
    'arts',
    'art',
    'drawing',
    'draw',
    'coloring',
    'colors',
    'origami',
    'diy',
    'painting',
    'paint',
    'sketch',
    'handicrafts',
    'clay',
    'making',
    'رسم',
    'فنون',
    'أشغال',
    'أعمال يدوية',
    'تلوين',
    'أشغال يدوية',
    'ابتكار وفنون',
  ],
  sports: [
    'sports',
    'sport',
    'active',
    'activity',
    'fitness',
    'movement',
    'move',
    'exercise',
    'workout',
    'yoga',
    'gymnastics',
    'football',
    'soccer',
    'games',
    'play',
    'challenges',
    'حركة',
    'رياضة',
    'نشاط',
    'تمارين',
    'لياقة',
    'ألعاب حركية',
    'يوغا',
    'تحديات',
  ],
};

/**
 * Checks if a channel's categories match the target category (supports exact IDs & aliases).
 */
export function matchCategory(channelCategories: string | string[] | undefined, targetCategoryId: string): boolean {
  if (!targetCategoryId || targetCategoryId === 'all') return true;
  if (!channelCategories) return false;

  const cats = Array.isArray(channelCategories) ? channelCategories : [channelCategories];
  const targetLower = targetCategoryId.toLowerCase().trim();
  const aliases = CATEGORY_TAG_ALIASES[targetLower] || [targetLower];

  for (const cat of cats) {
    if (!cat) continue;
    const catLower = String(cat).toLowerCase().trim();
    if (catLower === targetLower) return true;
    if (aliases.includes(catLower)) return true;
    // Check if any alias of the channel category matches the target
    const catAliases = CATEGORY_TAG_ALIASES[catLower];
    if (catAliases && catAliases.includes(targetLower)) return true;
  }

  return false;
}
