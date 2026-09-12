import React, { useState, useEffect } from 'react';
import db, { Channel } from '../db';
import { CURATION_CATEGORIES } from '../categories';
import {
  Search,
  KeyRound,
  Tv,
  ListVideo,
  Plus,
  Check,
  AlertCircle,
  Loader2,
  Settings2,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface YoutubeSearchResult {
  sourceType: 'channel' | 'playlist';
  sourceId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle?: string;
}

interface YoutubeSearchBarProps {
  onChannelAdded?: () => void;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(str, 'text/html');
  return doc.documentElement.textContent || str;
}

export const YoutubeSearchBar: React.FC<YoutubeSearchBarProps> = ({ onChannelAdded }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [tempKeyInput, setTempKeyInput] = useState<string>('');
  const [isEditingKey, setIsEditingKey] = useState<boolean>(false);

  const [query, setQuery] = useState<string>('');
  const [searchType, setSearchType] = useState<'channel' | 'playlist'>('channel');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<YoutubeSearchResult[]>([]);

  // State to track added channels by sourceId: maps sourceId -> db.channels id and assigned categories
  const [addedChannels, setAddedChannels] = useState<Record<string, { dbId: number; category: string[] }>>({});

  // Load API key & pre-existing channels on mount
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const settings = await db.settings.get('main');
        if (settings?.familyYoutubeApiKey && isMounted) {
          setApiKey(settings.familyYoutubeApiKey);
          setTempKeyInput(settings.familyYoutubeApiKey);
        }

        const allChannels = await db.channels.toArray();
        if (isMounted) {
          const map: Record<string, { dbId: number; category: string[] }> = {};
          for (const ch of allChannels) {
            if (ch.id) {
              map[ch.sourceId] = { dbId: ch.id, category: ch.category || [] };
            }
          }
          setAddedChannels(map);
        }
      } catch (err) {
        console.error('Error loading settings or channels in YoutubeSearchBar:', err);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = tempKeyInput.trim();
    if (!cleanKey) return;

    try {
      await db.settings.update('main', { familyYoutubeApiKey: cleanKey });
      setApiKey(cleanKey);
      setIsEditingKey(false);
      setErrorMessage(null);
    } catch (err) {
      console.error('Failed to save API key:', err);
      setErrorMessage('فشل حفظ مفتاح الـ API في قاعدة البيانات المحلية');
    }
  };

  const handleRemoveApiKey = async () => {
    if (window.confirm('هل تريد إزالة مفتاح YouTube API المحفوظ؟')) {
      try {
        await db.settings.update('main', { familyYoutubeApiKey: undefined });
        setApiKey('');
        setTempKeyInput('');
        setIsEditingKey(false);
        setResults([]);
        setErrorMessage(null);
      } catch (err) {
        console.error('Failed to remove API key:', err);
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    if (!apiKey) {
      setErrorMessage('يرجى حفظ مفتاح YouTube API أولاً للتمكن من البحث');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Direct browser-to-YouTube API call with user's private key — never passes through our worker
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=${searchType}&q=${encodeURIComponent(
        cleanQuery
      )}&maxResults=8&key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        const errorReason = data?.error?.errors?.[0]?.reason || '';
        const rawMsg = data?.error?.message || 'خطأ غير معروف';
        if (errorReason === 'quotaExceeded' || res.status === 403) {
          throw new Error('تم استنفاد الحصة اليومية المجانية لهذا المفتاح أو الحساب غير مفعل (Quota Exceeded)');
        } else if (errorReason === 'keyInvalid' || res.status === 400) {
          throw new Error('مفتاح YouTube API غير صالح. تأكد من تفعيل YouTube Data API v3 للمفتاح.');
        } else {
          throw new Error(rawMsg);
        }
      }

      const items: any[] = data.items || [];
      const formattedResults: YoutubeSearchResult[] = items.map((item) => {
        const sourceId = searchType === 'channel' ? item.id.channelId : item.id.playlistId;
        return {
          sourceType: searchType,
          sourceId,
          title: decodeHtmlEntities(item.snippet?.title || ''),
          description: decodeHtmlEntities(item.snippet?.description || ''),
          thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
          channelTitle: decodeHtmlEntities(item.snippet?.channelTitle || ''),
        };
      });

      setResults(formattedResults);

      // Refresh addedChannels mapping to ensure accurate state
      const existing = await db.channels.toArray();
      const map: Record<string, { dbId: number; category: string[] }> = {};
      for (const ch of existing) {
        if (ch.id) {
          map[ch.sourceId] = { dbId: ch.id, category: ch.category || [] };
        }
      }
      setAddedChannels(map);
    } catch (err: any) {
      console.error('YouTube Search API Error:', err);
      setErrorMessage(err.message || 'تعذر جلب نتائج البحث من يوتيوب.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddChannel = async (item: YoutubeSearchResult) => {
    try {
      // Check if already in DB
      const existing = await db.channels.where('sourceId').equals(item.sourceId).first();
      let recordId: number;

      if (existing && existing.id) {
        recordId = existing.id;
      } else {
        recordId = (await db.channels.add({
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          title: item.title,
          thumbnail: item.thumbnail,
          category: [],
          isPreloaded: false,
          enabled: true,
        })) as number;
      }

      setAddedChannels((prev) => ({
        ...prev,
        [item.sourceId]: { dbId: recordId, category: existing?.category || [] },
      }));

      onChannelAdded?.();
    } catch (err) {
      console.error('Failed to add channel to DB:', err);
      setErrorMessage('فشل إضافة القناة إلى قاعدة البيانات المحلية');
    }
  };

  const handleToggleCategory = async (sourceId: string, catId: string) => {
    const channelInfo = addedChannels[sourceId];
    if (!channelInfo) return;

    const currentCats = channelInfo.category || [];
    const nextCats = currentCats.includes(catId)
      ? currentCats.filter((c) => c !== catId)
      : [...currentCats, catId];

    try {
      await db.channels.update(channelInfo.dbId, { category: nextCats });
      setAddedChannels((prev) => ({
        ...prev,
        [sourceId]: { ...channelInfo, category: nextCats },
      }));
      onChannelAdded?.();
    } catch (err) {
      console.error('Failed to update category for channel:', err);
    }
  };

  return (
    <div id="youtube-search-bar" className="space-y-4">
      {/* 1. API Key Setup or Config Bar */}
      {!apiKey || isEditingKey ? (
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <KeyRound className="w-4 h-4" />
            </div>
            <div className="space-y-1 grow">
              <h4 className="text-xs font-bold text-amber-900">
                مفتاح YouTube Data API v3 الخاص بالعائلة
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                أدخل مفتاح YouTube API الخاص بعائلتك للبحث عن قنوات وقوائم تشغيل جديدة وإضافتها لتطبيق طفلك.
              </p>
              <p className="text-[11px] text-amber-700/90 font-medium">
                🔒 تنبيه الخصوصية: هذا المفتاح يُخزن محلياً على هذا الجهاز فقط ولا يُرسل أبداً لأي خادم وسيط.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveApiKey} className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              id="youtube-api-key-input"
              type="password"
              value={tempKeyInput}
              onChange={(e) => setTempKeyInput(e.target.value)}
              placeholder="ألصق مفتاح AIzaSy... هنا"
              className="grow p-2.5 text-xs rounded-xl border border-amber-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
            />
            <div className="flex gap-2">
              <button
                id="save-api-key-btn"
                type="submit"
                disabled={!tempKeyInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 transition disabled:opacity-50 cursor-pointer"
              >
                حفظ المفتاح
              </button>
              {apiKey && isEditingKey && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingKey(false);
                    setTempKeyInput(apiKey);
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  إلغاء
                </button>
              )}
            </div>
          </form>

          <div className="text-[10px] text-slate-500 flex items-center gap-1 pt-1">
            <span>ملاحظة: يمكنك الحصول على مفتاح مجاني من</span>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-sky-600 hover:underline inline-flex items-center gap-0.5"
            >
              <span>Google Cloud Console</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100/80 border border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
            <span>مفتاح YouTube API نشط ومحفوظ محلياً</span>
            <span className="text-[10px] font-mono text-slate-400">
              (••••{apiKey.slice(-4)})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditingKey(true)}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="تعديل المفتاح"
            >
              <Settings2 className="w-3 h-3" />
              <span>تغيير</span>
            </button>
            <button
              type="button"
              onClick={handleRemoveApiKey}
              className="p-1 rounded-lg text-slate-400 hover:text-red-600 transition cursor-pointer"
              title="إزالة المفتاح"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Search Box with channel/playlist toggle */}
      {apiKey && !isEditingKey && (
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search Type Toggle */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setSearchType('channel')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  searchType === 'channel'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>قناة</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchType('playlist')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  searchType === 'playlist'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListVideo className="w-3.5 h-3.5" />
                <span>قائمة تشغيل</span>
              </button>
            </div>

            {/* Input & Submit */}
            <div className="relative grow">
              <input
                id="youtube-search-query-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  searchType === 'channel'
                    ? 'ابحث باسم القناة (مثال: كرتون إسلامي، تجارب علمية للأطفال)...'
                    : 'ابحث باسم قائمة التشغيل (مثال: قصص الأنبياء للصغار)...'
                }
                className="w-full pl-3 pr-9 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>

            <button
              id="execute-youtube-search-btn"
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري البحث...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>بحث</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* 3. Error message box */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">تنبيه البحث:</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* 4. Results List */}
      {results.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>نتائج البحث ({results.length}):</span>
            <span>اضغط "إضافة" ثم اختر التصنيفات المناسبة للقناة</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((item) => {
              const channelInfo = addedChannels[item.sourceId];
              const isAdded = !!channelInfo;

              return (
                <div
                  key={item.sourceId}
                  className={`p-3 rounded-2xl border transition ${
                    isAdded
                      ? 'bg-amber-50/40 border-amber-300'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-100 border border-slate-200"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200">
                        {item.sourceType === 'channel' ? <Tv className="w-6 h-6" /> : <ListVideo className="w-6 h-6" />}
                      </div>
                    )}

                    <div className="grow min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                          {item.title}
                        </h5>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono shrink-0">
                          {item.sourceType === 'channel' ? 'قناة' : 'قائمة'}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}

                      <div className="pt-2 flex items-center justify-between">
                        {!isAdded ? (
                          <button
                            type="button"
                            onClick={() => handleAddChannel(item)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة للقائمة</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2 py-1 rounded-lg">
                            <Check className="w-3.5 h-3.5" />
                            <span>تمت الإضافة</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Category Picker once added */}
                  {isAdded && (
                    <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 block">
                        اختر التصنيفات المناسبة لهذا المحتوى:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {CURATION_CATEGORIES.map((cat) => {
                          const isCatSelected = channelInfo.category.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleToggleCategory(item.sourceId, cat.id)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition active:scale-95 cursor-pointer ${
                                isCatSelected
                                  ? 'bg-amber-500 text-white shadow-2xs'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                              }`}
                            >
                              <span>{cat.emoji}</span>
                              <span>{cat.label}</span>
                              {isCatSelected && <Check className="w-2.5 h-2.5" />}
                            </button>
                          );
                        })}
                      </div>
                      {channelInfo.category.length === 0 && (
                        <p className="text-[10px] text-amber-700 font-medium">
                          ⚠️ يرجى تحديد تصنيف واحد على الأقل لتظهر الفيديوهات في القسم المخصص للطفل.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
