import React, { useEffect, useState } from 'react';
import db, { FeedItem } from '../db';
import { WORKER_URL } from '../config';
import { VideoCard } from './VideoCard';
import { X, Tv, Film, Loader2, Search, Download, KeyRound } from 'lucide-react';

export interface ChannelVideosModalProps {
  sourceId: string;
  channelTitle: string;
  onClose: () => void;
  onSelectVideo: (
    videoId: string,
    title: string,
    channelTitle: string,
    channelId?: string
  ) => void;
}

export default function ChannelVideosModal({
  sourceId,
  channelTitle,
  onClose,
  onSelectVideo,
}: ChannelVideosModalProps) {
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FeedItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDeepening, setIsDeepening] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [familyApiKey, setFamilyApiKey] = useState<string | null>(null);
  const [blacklistWords, setBlacklistWords] = useState<string[]>([]);

  // 1. Initial Load: Read settings & fetch channel archive (no deepen for speed)
  useEffect(() => {
    let isMounted = true;

    async function initAndFetch() {
      setLoading(true);
      try {
        const settings = await db.settings.get('main');
        const key = settings?.familyYoutubeApiKey || null;
        const bWords = settings?.blacklistWords || [];

        if (isMounted) {
          setFamilyApiKey(key);
          setBlacklistWords(bWords);
        }

        const headers: Record<string, string> = {};
        if (key) {
          headers['X-Family-Youtube-Key'] = key;
        }

        let res: Response;
        try {
          res = await fetch(
            `${WORKER_URL}/api/channel-archive?id=${encodeURIComponent(sourceId)}`,
            { headers }
          );
        } catch {
          res = await fetch(
            `/api/channel-archive?id=${encodeURIComponent(sourceId)}`,
            { headers }
          );
        }

        if (!res.ok) {
          if (isMounted) {
            setVideos([]);
            setLoading(false);
          }
          return;
        }

        const data = await res.json();
        const rawVideos = Array.isArray(data.videos) ? data.videos : [];
        if (data.nextPageToken) {
          setNextPageToken(data.nextPageToken);
        }

        const filtered: FeedItem[] = filterAndMapRawVideos(rawVideos, sourceId, bWords);

        if (isMounted) {
          setVideos(filtered);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch channel archive:', err);
        if (isMounted) {
          setVideos([]);
          setLoading(false);
        }
      }
    }

    void initAndFetch();

    return () => {
      isMounted = false;
    };
  }, [sourceId]);

  // Helper to sanitize & filter videos against blacklist
  function filterAndMapRawVideos(
    rawVideos: any[],
    cId: string,
    bWords: string[]
  ): FeedItem[] {
    const list: FeedItem[] = [];
    for (const raw of rawVideos) {
      if (!raw || !raw.videoId || !raw.title) continue;
      const titleLower = String(raw.title).toLowerCase();

      const isBlacklisted = bWords.some((word) => {
        const w = word.trim().toLowerCase();
        return w ? titleLower.includes(w) : false;
      });

      if (!isBlacklisted) {
        list.push({
          videoId: String(raw.videoId),
          channelId: cId,
          title: String(raw.title),
          publishedAt: raw.publishedAt ? String(raw.publishedAt) : undefined,
          fetchedAt: Date.now(),
          hidden: false,
        });
      }
    }
    return list;
  }

  // 2. Debounced Server Search (400ms) when searchQuery >= 2
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const headers: Record<string, string> = {};
        if (familyApiKey) {
          headers['X-Family-Youtube-Key'] = familyApiKey;
        }

        const searchUrl = `${WORKER_URL}/api/channel-search?sourceId=${encodeURIComponent(sourceId)}&q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(searchUrl, { headers });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          if (errData?.error === 'no_api_key' || res.status === 400) {
            setApiKeyMissing(true);
          }
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        const data = await res.json();
        const rawVideos = Array.isArray(data.videos) ? data.videos : [];
        const filtered = filterAndMapRawVideos(rawVideos, sourceId, blacklistWords);
        setSearchResults(filtered);
      } catch (err) {
        console.error('Channel search error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, sourceId, familyApiKey, blacklistWords]);

  // 3. Handle "Load More from YouTube" (deepen)
  async function handleLoadMoreDeepen() {
    setIsDeepening(true);
    setApiKeyMissing(false);
    try {
      const headers: Record<string, string> = {};
      if (familyApiKey) {
        headers['X-Family-Youtube-Key'] = familyApiKey;
      }

      let res: Response;
      if (nextPageToken) {
        const pageUrl = `${WORKER_URL}/api/channel-videos-page?sourceId=${encodeURIComponent(sourceId)}&pageToken=${encodeURIComponent(nextPageToken)}&pageSize=50`;
        res = await fetch(pageUrl, { headers });
      } else {
        const deepenUrl = `${WORKER_URL}/api/channel-archive?id=${encodeURIComponent(sourceId)}&deepen=1&max=800`;
        res = await fetch(deepenUrl, { headers });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (errData?.error === 'no_api_key' || res.status === 400) {
          setApiKeyMissing(true);
        }
        setIsDeepening(false);
        return;
      }

      const data = await res.json();
      const rawNew = Array.isArray(data.videos) ? data.videos : [];
      if (data.nextPageToken) {
        setNextPageToken(data.nextPageToken);
      } else {
        setNextPageToken(null);
      }

      const filteredNew = filterAndMapRawVideos(rawNew, sourceId, blacklistWords);

      setVideos((prev) => {
        const existingMap = new Map<string, FeedItem>();
        for (const v of prev) {
          existingMap.set(v.videoId, v);
        }
        for (const v of filteredNew) {
          existingMap.set(v.videoId, v);
        }
        const merged = Array.from(existingMap.values());
        merged.sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        });
        return merged;
      });
    } catch (err) {
      console.error('Failed to deepen channel archive:', err);
    } finally {
      setIsDeepening(false);
    }
  }

  // Local title filter on loaded videos
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const localFilteredVideos = trimmedSearch
    ? videos.filter((v) => v.title.toLowerCase().includes(trimmedSearch))
    : videos;

  // Deduplicated search results (avoid duplicating videos that are already in localFilteredVideos)
  const extraSearchResults = searchResults.filter(
    (s) => !localFilteredVideos.some((l) => l.videoId === s.videoId)
  );

  return (
    <div
      id="channel-videos-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-sm overflow-y-auto flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        id="channel-videos-modal"
        className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-stone-200/80 overflow-hidden flex flex-col max-h-[88vh] my-auto"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 bg-amber-500/10 border-b border-amber-200/60 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-900">
                    أرشيف القناة
                  </span>
                  {!loading && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-200/70 text-amber-900">
                      {videos.length} فيديو
                    </span>
                  )}
                </div>
                <h2
                  id="channel-videos-modal-title"
                  className="text-lg sm:text-xl font-extrabold text-stone-900 leading-snug"
                >
                  {channelTitle}
                </h2>
              </div>
            </div>

            <button
              id="close-channel-modal-btn"
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في هذه القناة…"
              className="w-full pr-10 pl-10 py-2.5 bg-white rounded-2xl border border-stone-200/90 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm font-medium text-stone-900 placeholder:text-stone-400 outline-none transition shadow-xs"
            />
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* API Key Missing Banner */}
        {apiKeyMissing && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-amber-900">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
            <span>ضع مفتاح YouTube API في الإعدادات لجلب فيديوهات أقدم</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto grow space-y-6">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto" />
              <p className="text-sm font-bold text-stone-600">
                جاري تحميل أرشيف فيديوهات القناة...
              </p>
            </div>
          ) : videos.length === 0 ? (
            /* Empty State 1: No archive loaded yet */
            <div className="py-12 text-center space-y-4 max-w-sm mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm border border-amber-100">
                <Film className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900">
                  لا يوجد أرشيف بعد — جرّب تحميل المزيد
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed font-medium mt-1">
                  انقر على الزر أدناه لجلب أرشيف الفيديوهات مباشرة من يوتيوب.
                </p>
              </div>

              <button
                type="button"
                onClick={handleLoadMoreDeepen}
                disabled={isDeepening}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {isDeepening ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>تحميل المزيد من يوتيوب</span>
              </button>
            </div>
          ) : (
            /* Main Content View */
            <div className="space-y-6">
              {/* Local / Loaded Videos Grid */}
              {localFilteredVideos.length > 0 && (
                <div className="space-y-3">
                  {searchQuery.trim().length >= 2 && (
                    <h3 className="text-xs font-bold text-stone-500 px-1">
                      الفيديوهات المحملة ({localFilteredVideos.length})
                    </h3>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                    {localFilteredVideos.map((video) => (
                      <VideoCard
                        key={video.videoId}
                        video={video}
                        channelTitle={channelTitle}
                        onSelectVideo={(vId, vTitle, cTitle, cId) => {
                          onSelectVideo(
                            vId,
                            vTitle || video.title,
                            cTitle || channelTitle,
                            cId || sourceId
                          );
                          onClose();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Searching Indicator */}
              {isSearching && (
                <div className="py-6 text-center space-y-2">
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-stone-500">
                    جاري البحث في القناة عبر يوتيوب…
                  </p>
                </div>
              )}

              {/* Extra Server Search Results Section */}
              {trimmedSearch.length >= 2 && !isSearching && extraSearchResults.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-stone-100">
                  <h3 className="text-xs font-extrabold text-amber-900 bg-amber-50/80 px-3 py-1.5 rounded-xl border border-amber-200/50 inline-block">
                    نتائج البحث الإضافية من يوتيوب ({extraSearchResults.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                    {extraSearchResults.map((video) => (
                      <VideoCard
                        key={video.videoId}
                        video={video}
                        channelTitle={channelTitle}
                        onSelectVideo={(vId, vTitle, cTitle, cId) => {
                          onSelectVideo(
                            vId,
                            vTitle || video.title,
                            cTitle || channelTitle,
                            cId || sourceId
                          );
                          onClose();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty Search Results */}
              {trimmedSearch.length >= 2 &&
                !isSearching &&
                localFilteredVideos.length === 0 &&
                extraSearchResults.length === 0 && (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-sm font-bold text-stone-600">
                      لم يتم العثور على نتائج تطابق «{searchQuery}»
                    </p>
                    <p className="text-xs text-stone-400">
                      جرب كلمة بحث أخرى أو انقر على تحميل المزيد.
                    </p>
                  </div>
                )}

              {/* Load More Button at bottom */}
              <div className="pt-4 border-t border-stone-100 text-center">
                <button
                  type="button"
                  onClick={handleLoadMoreDeepen}
                  disabled={isDeepening}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 text-xs font-extrabold rounded-2xl transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isDeepening ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  ) : (
                    <Download className="w-4 h-4 text-amber-600" />
                  )}
                  <span>تحميل المزيد من يوتيوب</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
