export interface KidCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const KID_CATEGORIES: KidCategory[] = [
  { id: 'all', label: 'الكل', emoji: '✨', description: 'جميع الفيديوهات والبرامج' },
  { id: 'stories', label: 'قصص وحكايات', emoji: '📖', description: 'قصص ممتعة ومغامرات هادفة' },
  { id: 'songs', label: 'أناشيد وأغاني', emoji: '🎵', description: 'أناشيد جميلة ومرحة' },
  { id: 'learn', label: 'تعليم واستكشاف', emoji: '💡', description: 'علوم وحروف وأرقام' },
  { id: 'faith', label: 'إيمانيات وقيم', emoji: '🕌', description: 'أخلاق وسير وقيم نبيلة' },
  { id: 'calm', label: 'هدوء واسترخاء', emoji: '🌙', description: 'موسيقى هادئة وقصص قبل النوم' },
  { id: 'active', label: 'حركة ونشاط', emoji: '🏃', description: 'تمارين وألعاب حركية' },
  { id: 'sports', label: 'رياضة وتحديات', emoji: '⚽', description: 'مهارات رياضية وحماس' },
  { id: 'arts', label: 'أشغال وفنون', emoji: '✂️', description: 'أعمال يدوية وابتكار' },
  { id: 'drawing', label: 'رسم وتلوين', emoji: '🎨', description: 'تعلم الرسم والتلوين' },
  { id: 'gaming', label: 'ألعاب مناسبة', emoji: '🎮', description: 'ألعاب ذكاء ومرح عائلي' },
  { id: 'shows', label: 'كرتون وبرامج', emoji: '📺', description: 'مسلسلات وبرامج رسوم' },
  { id: 'reading', label: 'قراءة وكتب', emoji: '📚', description: 'قراءة كتب وقصص مصورة' },
  { id: 'cooking', label: 'طبخ الصغار', emoji: '🍳', description: 'وصفات لذيذة وسهلة' },
];

export const CURATION_CATEGORIES: KidCategory[] = KID_CATEGORIES.filter(c => c.id !== 'all');
