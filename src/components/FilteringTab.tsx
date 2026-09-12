import React, { useState, useEffect, useCallback } from 'react';
import db, { Channel, FeedItem } from '../db';
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
} from 'lucide-react';

interface FilteringTabProps {
  onFilterChanged?: () => void;
}

export const FilteringTab: React.FC<FilteringTabProps> = ({ onFilterChanged }) => {
  const [activeSubTab, setActiveSubTab] = useState<'blacklist' | 'channels' | 'videos'>('blacklist');

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
    <div id="filtering-tab" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>إدارة الفلترة والمحتوى المحجوب (Filtering & Blocklist)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الكلمات المحظورة لمنع ظهور أي فيديوهات بها، ومراجعة القنوات الموقوفة والفيديوهات المخفية.
          </p>
        </div>

        {feedbackMessage && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>{feedbackMessage}</span>
          </span>
        )}
      </div>

      {/* Sub-Tabs Selector */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/80">
        <button
          type="button"
          onClick={() => setActiveSubTab('blacklist')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'blacklist'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
          <span>الكلمات المحظورة</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeSubTab === 'blacklist'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {blacklistWords.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('channels')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'channels'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Tv className="w-3.5 h-3.5 text-sky-600" />
          <span>القنوات المحظورة</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeSubTab === 'channels'
                ? 'bg-sky-100 text-sky-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {blockedChannels.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('videos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeSubTab === 'videos'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Film className="w-3.5 h-3.5 text-indigo-600" />
          <span>الفيديوهات المخفية</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeSubTab === 'videos'
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {hiddenVideos.length}
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          جاري تحميل بيانات الحظر...
        </div>
      ) : (
        <>
          {/* TAB 1: BLACKLIST WORDS */}
          {activeSubTab === 'blacklist' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-800">
                  إدارة الكلمات المحظورة (Blacklist Words)
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  أي فيديو يحتوي عنوانه على أي من هذه الكلمات سيتم حجبه فوراً وتلقائياً عن طفلك.
                </p>
              </div>

              {/* Add Word Form */}
              <form onSubmit={handleAddWord} className="flex gap-2 max-w-md">
                <input
                  id="tab-blacklist-word-input"
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="أدخل كلمة لحظرها (مثال: رعب، مقلب، تحدي)..."
                  className="grow p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition"
                />
                <button
                  id="tab-add-blacklist-word-btn"
                  type="submit"
                  disabled={!newWord.trim()}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة</span>
                </button>
              </form>

              {/* Words Chips List */}
              <div className="pt-2">
                {blacklistWords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {blacklistWords.map((word, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200/90 shadow-2xs"
                      >
                        <span>{word}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(word)}
                          className="p-0.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="حذف الكلمة"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/60 text-center space-y-1">
                    <p className="text-xs text-slate-500">
                      لا توجد كلمات محظورة مسجلة حالياً.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      يمكنك حظر كلمات محددة مثل أسماء برامج أو مقالب غير مناسبة للطفل.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BLOCKED CHANNELS */}
          {activeSubTab === 'channels' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-800">
                  القنوات المحظورة والمعطلة
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  هذه القنوات تم تعطيلها مؤقتاً ولن تظهر فيديوهاتها لطفلك في الواجهة الرئيسية.
                </p>
              </div>

              {blockedChannels.length > 0 ? (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  {blockedChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {channel.thumbnail ? (
                          <img
                            src={channel.thumbnail}
                            alt={channel.title}
                            className="w-11 h-11 rounded-xl object-cover shrink-0 bg-slate-200 border border-slate-200 opacity-60"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
                            <Tv className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-slate-800 truncate">
                            {channel.title}
                          </h5>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="text-rose-600 font-medium">معطلة حالياً</span>
                            <span>•</span>
                            <span>{channel.sourceType === 'playlist' ? 'قائمة تشغيل' : 'قناة'}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReEnableChannel(channel)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer border border-emerald-200"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إعادة تفعيل</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/60 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    لا توجد أي قنوات محظورة!
                  </p>
                  <p className="text-[11px] text-slate-400">
                    جميع القنوات في مكتبتك مفعلة ومتاحة لطفلك.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HIDDEN VIDEOS */}
          {activeSubTab === 'videos' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-800">
                  الفيديوهات المخفية يدوياً
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  الفيديوهات التي قمت بإخفائها من شاشة المشغل أو الرئيسية لمنع الطفل من مشاهدتها.
                </p>
              </div>

              {hiddenVideos.length > 0 ? (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  {hiddenVideos.map((video) => (
                    <div
                      key={video.videoId}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {video.thumbnail ? (
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-14 h-10 rounded-lg object-cover shrink-0 bg-slate-200 border border-slate-200 opacity-60"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-14 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
                            <Film className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-slate-800 truncate" title={video.title}>
                            {video.title}
                          </h5>
                          <span className="text-[10px] text-rose-600 block mt-0.5">
                            مخفي عن شاشة الطفل
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnhideVideo(video)}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer border border-indigo-200"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>إظهار مرة أخرى</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/60 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    لا توجد فيديوهات مخفية حالياً
                  </p>
                  <p className="text-[11px] text-slate-400">
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
