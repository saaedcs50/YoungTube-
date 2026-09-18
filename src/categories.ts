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
];

export const KID_CATEGORIES: KidCategory[] = DEFAULT_KID_CATEGORIES;

export const CURATION_CATEGORIES: KidCategory[] = DEFAULT_KID_CATEGORIES.filter((c) => c.id !== 'all');

/**
 * Aliases and tag mapping to flexibly match channel seed tags with dynamic category keys
 */
export const CATEGORY_TAG_ALIASES: Record<string, string[]> = {
  all: ['all'],
  quran: ['quran', 'faith', 'islamic', 'duas', 'religion', 'قرآن', 'أذكار', 'إيمانيات'],
  stories: ['stories', 'reading', 'books', 'fairy_tales', 'tales', 'قصص', 'حكايات', 'قراءة'],
  cartoons: ['cartoons', 'shows', 'songs', 'music', 'animation', 'series', 'كرتون', 'أناشيد', 'أغاني', 'برامج'],
  education: ['education', 'learn', 'language', 'english', 'arabic', 'math', 'alphablocks', 'numberblocks', 'تعليم', 'لغات'],
  science: ['science', 'experiments', 'nature', 'discovery', 'space', 'stem', 'علوم', 'استكشاف'],
  crafts: ['crafts', 'arts', 'drawing', 'coloring', 'origami', 'diy', 'رسم', 'فنون', 'أشغال', 'تلوين'],
  sports: ['sports', 'active', 'yoga', 'movement', 'exercise', 'games', 'حركة', 'رياضة', 'نشاط'],
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
