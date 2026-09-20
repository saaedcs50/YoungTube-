import React, { useState, useEffect, useCallback } from 'react';
import db, { Channel, FeedItem } from '../db';
import { OPT_IN_CATEGORY_IDS, DEFAULT_KID_CATEGORIES } from '../categories';
import {
  ShieldAlert,
  Tv,
  Film,
  Plus,
  Trash2,
  RotateCcw,
  Eye,
  Check,
  AlertTriangle,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

const OPT_IN_CATEGORY_META: Record<string, { label: string; emoji: string; description: string }> = {
  gaming: {
    label: 'ألعاب مناسبة',
    emoji: '🎮',
    description: 'قنوات ألعاب هادئة ومناسبة للأطفال — معطّلة افتراضيًا، فعّلها لو حابب طفلك يشوفها.',
  },
};

interface FilteringTabProps {
  onFilterChanged?: () => void;
}

export const FilteringTab: React.FC<FilteringTabProps> = ({ onFilterChanged }) => {
  const [activeSubTab, setActiveSubTab] = useState<'blacklist' | 'channels' | 'videos'>('blacklist');

  // Opt-in Categories
  const [enabledOptInCategories, setEnabledOptInCategories] = useState<string[]>([]);

  // Blacklist words
  const [blacklistWords, setBlacklistWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState<string>('');

  // Disabled channels
  const [blockedChannels, setBlockedChannels] = useState<Channel[]>([]);

  // Hidden videos
  const [hiddenVideos, setHiddenVideos] = useState<FeedItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  // Load all filtering data
  const loadData = useCallback(async () => {
    try {
      const [settings, channels, videos] = await Promise.all([
        db.settings.get('main'),
        db.channels.filter((c) => c.enabled === false).toArray(),
        db.feedCache.filter((v) => v.hidden === true).toArray(),
      ]);

      setEnabledOptInCategories(settings?.enabledOptInCategories || []);
      setBlacklistWords(settings?.blacklistWords || []);
      setBlockedChannels(channels);
      setHiddenVideos(videos);
    } catch (err) {
      console.error('Failed to load filtering data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 0. Opt-in Category Toggle Handler
  const handleOptInToggle = async (catId: string, enabled: boolean) => {
    const current = await db.settings.get('main');
    const existing = current?.enabledOptInCategories || [];
    const updated = enabled
      ? Array.from(new Set([...existing, catId]))
      : existing.filter((id) => id !== catId);

    try {
      if (current) {
        await db.settings.update('main', { enabledOptInCategories: updated });
      } else {
        await db.settings.put({
          id: 'main',
          blacklistWords: [],
          enabledOptInCategories: updated,
        });
      }
      setEnabledOptInCategories(updated);
      showFeedback(enabled ? 'تم تفعيل ظهور التصنيف للطفل' : 'تم إخفاء التصنيف عن الطفل');
      onFilterChanged?.();
    } catch (err) {
      console.error('Failed to update enabledOptInCategories:', err);
    }
  };

  // 1. Blacklist word handlers
  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = newWord.trim();
    if (!word) return;

    if (blacklistWords.includes(word)) {
      showFeedback('هذه الكلمة مضافة بالفعل في قائمة الحظر');
      return;
    }

    const updated = [...blacklistWords, word];
    try {
      await db.settings.update('main', { blacklistWords: updated });
      setBlacklistWords(updated);
      setNewWord('');
      showFeedback(`تمت إضافة "${word}" إلى الكلمات المحظورة`);
      onFilterChanged?.();
    } catch (err) {
      console.error('Failed to add blacklist word:', err);
    }
  };

  const handleRemoveWord = async (wordToRemove: string) => {
    const updated = blacklistWords.filter((w) => w !== wordToRemove);
    try {
      await db.settings.update('main', { blacklistWords: updated });
      setBlacklistWords(updated);
      showFeedback(`تم حذف "${wordToRemove}" من قائمة الحظر`);
      onFilterChanged?.();
    } catch (err) {
      console.error('Failed to remove blacklist word:', err);
    }
  };

  // 2. Re-enable channel handler
  const handleReEnableChannel = async (channel: Channel) => {
    if (!channel.id) return;
    try {
      await db.channels.update(channel.id, { enabled: true });
      setBlockedChannels((prev) => prev.filter((c) => c.id !== channel.id));
      showFeedback(`تمت إعادة تفعيل قناة "${channel.title}"`);
      onFilterChanged?.();
    } catch (err) {
      console.error('Failed to re-enable channel:', err);
    }
  };

  // 3. Unhide video handler
  const handleUnhideVideo = async (video: FeedItem) => {
    try {
      await db.feedCache.update(video.videoId, { hidden: false });
      setHiddenVideos((prev) => prev.filter((v) => v.videoId !== video.videoId));
      showFeedback(`تمت استعادة فيديو "${video.title}" للظهور مجدداً`);
      onFilterChanged?.();
    } catch (err) {
      console.error('Failed to unhide video:', err);
    }
  };

  return (
    <div id="filtering-tab" className="space-y-5 max-w-4xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span>إدارة الفلترة والمحتوى المحجوب</span>
          </h3>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            إدارة الكلمات المحظورة لمنع ظهور أي فيديوهات بها، ومراجعة القنوات الموقوفة والفيديوهات المخفية.
          </p>
        </div>

        {feedbackMessage && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 animate-fade-in self-start sm:self-auto">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>{feedbackMessage}</span>
          </span>
        )}
      </div>

      {/* Opt-in Categories Approval Section */}
      <div
        id="opt-in-categories-card"
        className="rounded-2xl border border-stone-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-500" />
            <h4 className="text-xs sm:text-sm font-bold text-stone-900">
              تصنيفات تحتاج موافقة الوالدين
            </h4>
          </div>
          <span className="text-[11px] text-stone-400 font-mono">Opt-in Categories</span>
        </div>
        <p className="text-xs text-stone-500 leading-relaxed">
          هذه التصنيفات معطّلة ومخفية افتراضيًا عن الطفل لحماية وقته واهتمامه، ويمكنك تفعيل ظهورها حسب رغبتك.
        </p>

        <div className="divide-y divide-stone-100 border border-stone-200/70 rounded-xl bg-stone-50/50 overflow-hidden">
          {OPT_IN_CATEGORY_IDS.map((catId) => {
            const meta = OPT_IN_CATEGORY_META[catId] || {
              label: DEFAULT_KID_CATEGORIES.find((c) => c.id === catId)?.label || catId,
              emoji: DEFAULT_KID_CATEGORIES.find((c) => c.id === catId)?.emoji || '📁',
              description: 'تصنيف اختياري يتطلب موافقة صريحة من الوالدين للظهور.',
            };
            const isEnabled = enabledOptInCategories.includes(catId);

            return (
              <div
                key={catId}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-stone-50/60 transition"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">{meta.emoji}</span>
                    <span className="text-xs sm:text-sm font-bold text-stone-900">
                      {meta.label}
                    </span>
                    {!isEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                        معطّل افتراضيًا (مخفي)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        مفعّل ومتاح للطفل
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {meta.description}
                  </p>
                </div>

                <label
                  htmlFor={`opt-in-toggle-${catId}`}
                  className="flex items-center gap-2.5 cursor-pointer select-none self-start sm:self-center shrink-0 min-h-[44px]"
                >
                  <input
                    id={`opt-in-toggle-${catId}`}
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => handleOptInToggle(catId, e.target.checked)}
                    className="w-5 h-5 rounded border-stone-300 focus:ring-amber-500 cursor-pointer accent-amber-500"
                  />
                  <span className="text-xs font-bold text-stone-700 sm:hidden">
                    {isEnabled ? 'مفعّل' : 'معطّل'}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-Tabs Selector */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white border border-stone-200/80 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveSubTab('blacklist')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[44px] ${
            activeSubTab === 'blacklist'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>الكلمات المحظورة</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
              activeSubTab === 'blacklist'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-stone-700'
            }`}
          >
            {blacklistWords.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('channels')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[44px] ${
            activeSubTab === 'channels'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>القنوات المحظورة</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
              activeSubTab === 'channels'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-stone-700'
            }`}
          >
            {blockedChannels.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('videos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer min-h-[44px] ${
            activeSubTab === 'videos'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>الفيديوهات المخفية</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
              activeSubTab === 'videos'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-stone-700'
            }`}
          >
            {hiddenVideos.length}
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-stone-400">
          جاري تحميل بيانات الحظر...
        </div>
      ) : (
        <>
          {/* TAB 1: BLACKLIST WORDS */}
          {activeSubTab === 'blacklist' && (
            <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-sm space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-stone-900">
                  إدارة الكلمات المحظورة
                </h4>
                <p className="text-xs text-stone-500 leading-relaxed">
                  أي فيديو يحتوي عنوانه على أي من هذه الكلمات سيتم حجبه فوراً وتلقائياً عن طفلك.
                </p>
              </div>

              {/* Add Word Form */}
              <form onSubmit={handleAddWord} className="flex flex-col sm:flex-row gap-2 max-w-xl">
                <input
                  id="tab-blacklist-word-input"
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="أدخل كلمة لحظرها (مثال: رعب، مقلب، تحدي)..."
                  className="grow min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                />
                <button
                  id="tab-add-blacklist-word-btn"
                  type="submit"
                  disabled={!newWord.trim()}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة للكلمات المحظورة</span>
                </button>
              </form>

              {/* Words Chips List */}
              <div className="pt-2">
                {blacklistWords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {blacklistWords.map((word, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-50 text-stone-800 text-xs font-bold border border-stone-200/80 shadow-2xs"
                      >
                        <span>{word}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(word)}
                          className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="حذف الكلمة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 rounded-2xl bg-stone-50 border border-stone-200/60 text-center space-y-1">
                    <p className="text-xs sm:text-sm font-bold text-stone-700">
                      لا توجد كلمات محظورة مسجلة حالياً.
                    </p>
                    <p className="text-xs text-stone-400">
                      يمكنك حظر كلمات محددة مثل أسماء برامج أو مقالب غير مناسبة للطفل.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BLOCKED CHANNELS */}
          {activeSubTab === 'channels' && (
            <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-sm space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-stone-900">
                  القنوات المحظورة والمعطلة
                </h4>
                <p className="text-xs text-stone-500 leading-relaxed">
                  هذه القنوات تم تعطيلها مؤقتاً ولن تظهر فيديوهاتها لطفلك في الواجهة الرئيسية.
                </p>
              </div>

              {blockedChannels.length > 0 ? (
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/80 bg-stone-50/50 overflow-hidden">
                  {blockedChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-white transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {channel.thumbnail ? (
                          <img
                            src={channel.thumbnail}
                            alt={channel.title}
                            className="w-11 h-11 rounded-xl object-cover shrink-0 bg-stone-200 border border-stone-200 opacity-60"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center shrink-0 border border-stone-200">
                            <Tv className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h5 className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                            {channel.title}
                          </h5>
                          <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                            <span className="text-rose-600 font-bold">معطلة حالياً</span>
                            <span>•</span>
                            <span>{channel.sourceType === 'playlist' ? 'قائمة تشغيل' : 'قناة'}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReEnableChannel(channel)}
                        className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer border border-emerald-200 shadow-2xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إعادة تفعيل</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-stone-50 border border-stone-200/60 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-stone-800">
                    لا توجد أي قنوات محظورة!
                  </p>
                  <p className="text-xs text-stone-400">
                    جميع القنوات في مكتبتك مفعلة ومتاحة لطفلك.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HIDDEN VIDEOS */}
          {activeSubTab === 'videos' && (
            <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-sm space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-stone-900">
                  الفيديوهات المخفية يدوياً
                </h4>
                <p className="text-xs text-stone-500 leading-relaxed">
                  الفيديوهات التي قمت بإخفائها من شاشة المشغل أو الرئيسية لمنع الطفل من مشاهدتها.
                </p>
              </div>

              {hiddenVideos.length > 0 ? (
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/80 bg-stone-50/50 overflow-hidden">
                  {hiddenVideos.map((video) => (
                    <div
                      key={video.videoId}
                      className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-white transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {video.thumbnail ? (
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-14 h-10 rounded-xl object-cover shrink-0 bg-stone-200 border border-stone-200 opacity-60"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-14 h-10 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center shrink-0 border border-stone-200">
                            <Film className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h5 className="text-xs sm:text-sm font-bold text-stone-900 truncate" title={video.title}>
                            {video.title}
                          </h5>
                          <span className="text-[11px] text-rose-600 font-bold block mt-0.5">
                            مخفي عن شاشة الطفل
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnhideVideo(video)}
                        className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer border border-amber-200 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-600" />
                        <span>إظهار مرة أخرى</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-stone-50 border border-stone-200/60 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-stone-800">
                    لا توجد فيديوهات مخفية حالياً
                  </p>
                  <p className="text-xs text-stone-400">
                    يمكنك إخفاء أي فيديو في أي وقت مباشرة من زر الحظر أثناء المشاهدة.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
