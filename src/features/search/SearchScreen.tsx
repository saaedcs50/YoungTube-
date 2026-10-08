import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock3, ListVideo, Search, X } from 'lucide-react';
import type { FeedItem, ChildPlaylist } from '../../db';
import db from '../../db';
import { listRegistryChannels } from '../../data/channelRegistry';
import { searchAndRankNamedItems, searchAndRankVideos, getAutocompleteSuggestions, normalizeSearchText } from '../../services/kidSearch';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { getFamilyYoutubeApiHeaders } from '../../services/youtubeApiKey';
import { MIN_VIDEO_DURATION_SECONDS } from '../../filtering';
import { loadBoundedFeed } from '../feed/useKidFeed';
import { WORKER_URL } from '../../config';
import { listPlaylists, getPlaylistItems } from '../../services/playlists/playlistRepository';
import { YoungTubeVideoRow } from '../../components/YoungTubeVideoRow';
import { YoungTubeVideoCard } from '../../components/YoungTubeVideoCard';
import { VideoOverflowSheet } from '../../components/VideoOverflowSheet';

interface Props {
  onBack: () => void;
  onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
  onOpenChannel: (channelId: string, title: string) => void;
  onOpenPlaylist: (playlistId: string, title: string) => void;
}

type ResultTab = 'all' | 'videos' | 'channels' | 'playlists';
const RECENTS_KEY = 'youngtube_search_recent_v1';

type SearchChannelInfo = {
  title: string;
  categories: string[];
  thumbnail?: string;
  enabled?: boolean;
  autoDisabled?: boolean;
  blocked?: boolean;
};

type DeepSearchResult = {
  videoId: string;
  title: string;
  publishedAt: string;
  sourceId: string;
  videoDuration?: number;
  isPortrait: boolean;
  hasMusic: boolean;
};

function readRecents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, 8) : [];
  } catch { return []; }
}

function saveRecent(value: string) {
  const q = value.trim();
  if (!q) return;
  const next = [q, ...readRecents().filter((item) => normalizeSearchText(item) !== normalizeSearchText(q))].slice(0, 8);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch {}
}

export const SearchScreen: React.FC<Props> = ({ onBack, onSelectVideo, onOpenChannel, onOpenPlaylist }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(readRecents);
  const [tab, setTab] = useState<ResultTab>('all');
  const [searchStage, setSearchStage] = useState<'landing' | 'results'>(() => window.history.state?.searchStage === 'results' ? 'results' : 'landing');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [overflowVideo, setOverflowVideo] = useState<FeedItem | null>(null);
  const [playlists, setPlaylists] = useState<ChildPlaylist[]>([]);
  const [playlistCounts, setPlaylistCounts] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [favoritesVideos, setFavoritesVideos] = useState<FeedItem[]>([]);
  const [savedAndLovedVideos, setSavedAndLovedVideos] = useState<FeedItem[]>([]);
  const [channelMap, setChannelMap] = useState<Map<string, SearchChannelInfo>>(new Map());
  const [localDataReady, setLocalDataReady] = useState(false);
  const [deepSearchResults, setDeepSearchResults] = useState<DeepSearchResult[]>([]);
  const [isDeepSearching, setIsDeepSearching] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
    void (async () => {
      const rows = await listPlaylists();
      setPlaylists(rows);
      const counts = await Promise.all(rows.map(async (playlist) => [playlist.id, (await getPlaylistItems(playlist.id)).length] as const));
      setPlaylistCounts(Object.fromEntries(counts));
    })();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    const loadLocalSearchData = async () => {
      try {
        const [settings, registryChannels] = await Promise.all([
          db.settings.get('main'),
          listRegistryChannels(),
        ]);
        const blocks = loadCachedBlocks();
        const blockedChannelSet = new Set(blocks.channelIds);
        const registryMap = new Map(registryChannels.map((channel) => [channel.sourceId, channel]));
        const nextChannelMap = new Map<string, SearchChannelInfo>();
        for (const channel of registryChannels) {
          if (!channel.sourceId) continue;
          nextChannelMap.set(channel.sourceId, {
            title: channel.title || 'قناة أطفال موثوقة',
            categories: Array.isArray(channel.category) ? channel.category : [],
            thumbnail: channel.thumbnail,
            enabled: channel.enabled,
            autoDisabled: channel.autoDisabled,
            blocked: blockedChannelSet.has(channel.sourceId),
          });
        }

        const enabledChannelIds = registryChannels
          .filter((channel) => channel.enabled !== false && channel.autoDisabled !== true && !blockedChannelSet.has(channel.sourceId))
          .map((channel) => channel.sourceId);
        const hideMusicVideos = settings?.hideMusicVideos === true;
        const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());
        const safeVideos = await loadBoundedFeed(enabledChannelIds, hideMusicVideos, hasFamilyKey);

        const interactions = await db.interactions
          .filter(
            (i) =>
              i.childLoved === true ||
              i.childReaction === 'liked' ||
              i.parentRating === 'liked' ||
              i.savedByParent === true
          )
          .toArray();

        for (const interaction of interactions) {
          if (interaction.parentRating === 'liked' && !interaction.childLoved) {
            interaction.childLoved = true;
            interaction.parentRating = undefined;
            void db.interactions.update(interaction.videoId, {
              childLoved: true,
              parentRating: undefined,
            });
          }
        }
        interactions.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));

        const videoIds = interactions.map((interaction) => interaction.videoId);
        const cachedRows = videoIds.length > 0
          ? await db.feedCache.where('videoId').anyOf(videoIds).toArray()
          : [];
        const cachedMap = new Map(cachedRows.map((row) => [row.videoId, row]));
        const interMap = new Map(interactions.map((interaction) => [interaction.videoId, interaction]));
        const safeSavedAndLoved: FeedItem[] = [];

        for (const interaction of interactions) {
          const cached = cachedMap.get(interaction.videoId);
          if (!cached || cached.hidden === true || cached.isPortrait === true) continue;

          const targetChannelId = interaction.channelId || cached.channelId;
          if (!targetChannelId) continue;
          const registryChannel = registryMap.get(targetChannelId);
          if (blockedChannelSet.has(targetChannelId)) continue;
          if (registryChannel?.enabled === false || registryChannel?.autoDisabled === true) continue;
          if (hideMusicVideos && cached.hasMusic === true) continue;
          if (hasFamilyKey && (
            typeof cached.videoDuration !== 'number' ||
            !Number.isFinite(cached.videoDuration) ||
            cached.videoDuration < MIN_VIDEO_DURATION_SECONDS
          )) continue;

          safeSavedAndLoved.push({
            videoId: interaction.videoId,
            channelId: targetChannelId,
            title: interaction.title || cached.title || 'فيديو أطفال',
            videoDuration: cached.videoDuration,
            hasMusic: cached.hasMusic,
            isPortrait: cached.isPortrait,
            fetchedAt: interaction.lastWatched || Date.now(),
            hidden: false,
            viewCount: cached.viewCount,
            viewCountFetchedAt: cached.viewCountFetchedAt,
          });
        }

        const safeLovedVideos = safeSavedAndLoved.filter((item) => {
          const interaction = interMap.get(item.videoId);
          return (
            interaction?.childLoved === true ||
            interaction?.childReaction === 'liked' ||
            interaction?.parentRating === 'liked'
          );
        });

        if (cancelled) return;
        setChannelMap(nextChannelMap);
        setVideos(safeVideos);
        setSavedAndLovedVideos(safeSavedAndLoved);
        setFavoritesVideos(safeLovedVideos);
        setLocalDataReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load local Search data:', err);
          setLocalDataReady(true);
        }
      }
    };

    void loadLocalSearchData();
    return () => { cancelled = true; };
  }, []);

  const query = debouncedSearch.trim();
  const localVideos = useMemo(() => searchAndRankVideos(
    [...videos, ...favoritesVideos],
    query,
    channelMap,
    { isSavedOrLovedItem: () => false }
  ).filter((item, index, arr) => arr.findIndex((x) => x.videoId === item.videoId) === index), [videos, favoritesVideos, query, channelMap]);

  const searchSuggestions = useMemo(() => getAutocompleteSuggestions({
    query: searchInput,
    channelMap,
    feedVideos: videos,
    favoritesVideos,
    savedAndLovedVideos,
    limit: 7,
  }), [searchInput, channelMap, videos, favoritesVideos, savedAndLovedVideos]);

  const channelResults = useMemo(() => {
    if (!query) return [];
    const candidates = Array.from(channelMap.entries())
      .filter(([, info]) => info.enabled !== false && info.autoDisabled !== true)
      .map(([id, info]) => ({ id, name: info.title, channelId: id, info }));
    return searchAndRankNamedItems(candidates, query, { useChannelAliases: true, maxResults: 20 })
      .map(({ id, info }) => [id, info] as const);
  }, [channelMap, query]);
  const playlistResults = useMemo(() => {
    if (!query) return [];
    return searchAndRankNamedItems(playlists, query, { maxResults: 20 });
  }, [playlists, query]);

  useEffect(() => {
    if (!localDataReady || !debouncedSearch) {
      setDeepSearchResults([]);
      setIsDeepSearching(false);
      return;
    }

    if (debouncedSearch.length <= 2 || localVideos.length >= 3) {
      setDeepSearchResults([]);
      setIsDeepSearching(false);
      return;
    }

    let cancelled = false;
    setIsDeepSearching(true);

    const runDeepSearch = async () => {
      try {
        const [familyYoutubeApiHeaders, settings, registryChannels] = await Promise.all([
          getFamilyYoutubeApiHeaders(),
          db.settings.get('main'),
          listRegistryChannels(),
        ]);
        const requestInit: RequestInit = { headers: familyYoutubeApiHeaders };
        let res: Response;
        try {
          res = await fetch(
            `${WORKER_URL}/api/search-archive?q=${encodeURIComponent(debouncedSearch)}`,
            requestInit
          );
        } catch {
          res = await fetch(
            `/api/search-archive?q=${encodeURIComponent(debouncedSearch)}`,
            requestInit
          );
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data && Array.isArray(data.results)) {
          const localIds = new Set(localVideos.map((video) => video.videoId));
          const blockedChannelSet = new Set(loadCachedBlocks().channelIds);
          const registryChannelMap = new Map(registryChannels.map((channel) => [channel.sourceId, channel]));
          const archiveIds = data.results
            .map((item: any) => item?.videoId)
            .filter((videoId: unknown): videoId is string => typeof videoId === 'string' && videoId.length > 0);
          const localRows = archiveIds.length > 0
            ? await db.feedCache.where('videoId').anyOf(archiveIds).toArray()
            : [];
          const locallyHiddenIds = new Set(
            localRows.filter((row) => row.hidden === true).map((row) => row.videoId)
          );
          const hasFamilyKey = Boolean(familyYoutubeApiHeaders['X-Family-Youtube-Key']);
          const hideMusicVideos = settings?.hideMusicVideos === true;

          const safetyFilteredArchiveResults: DeepSearchResult[] = data.results.filter((item: any) => {
            if (!item?.videoId || !item?.sourceId) return false;
            if (blockedChannelSet.has(item.sourceId)) return false;
            const registryChannel = registryChannelMap.get(item.sourceId);
            if (registryChannel?.enabled === false || registryChannel?.autoDisabled === true) return false;
            if (locallyHiddenIds.has(item.videoId)) return false;
            if (item.isPortrait === true) return false;
            if (hideMusicVideos && item.hasMusic === true) return false;
            if (hasFamilyKey && (
              typeof item.videoDuration !== 'number' ||
              !Number.isFinite(item.videoDuration) ||
              item.videoDuration < MIN_VIDEO_DURATION_SECONDS
            )) return false;
            return typeof item.hasMusic === 'boolean' && typeof item.isPortrait === 'boolean';
          });

          const uniqueArchiveResults = safetyFilteredArchiveResults.filter(
            (item) => !localIds.has(item.videoId)
          );
          setDeepSearchResults(uniqueArchiveResults);
        } else {
          setDeepSearchResults([]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to deep search archive:', err);
          setDeepSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsDeepSearching(false);
      }
    };

    void runDeepSearch();
    return () => { cancelled = true; };
  }, [localDataReady, debouncedSearch, localVideos]);

  const enterResults = useCallback((value: string) => {
    const q = value.trim();
    if (!q) return;
    if (searchStage !== 'results') {
      window.history.pushState({ ...window.history.state, ytNavigation: true, searchStage: 'results', query: q }, '');
      setSearchStage('results');
    } else if (window.history.state?.searchStage === 'results') {
      window.history.replaceState({ ...window.history.state, query: q }, '');
    }
    saveRecent(q);
    setRecent(readRecents());
  }, [searchStage]);

  const submit = useCallback((value: string) => {
    const q = value.trim();
    setSearchInput(value);
    setShowSuggestions(false);
    if (q) enterResults(value);
  }, [enterResults, setSearchInput]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (event.state?.searchStage === 'landing') {
        setSearchStage('landing');
        return;
      }
      if (!event.state?.searchStage && searchStage === 'results') {
        setSearchStage('landing');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [searchStage]);

  const handleFieldChange = (value: string) => {
    setSearchInput(value);
    setShowSuggestions(value.trim().length > 0);
    if (value.trim() && searchStage !== 'results') enterResults(value);
  };

  const handleBack = () => {
    if (searchStage === 'results') {
      window.history.back();
      return;
    }
    onBack();
  };

  const clear = () => {
    setSearchInput('');
    setTab('all');
    setShowSuggestions(false);
    setSearchStage('landing');
    if (window.history.state?.searchStage === 'results') {
      window.history.back();
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-[70] bg-yt-bg text-yt-text overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-8">
        <div className="sticky top-0 z-20 bg-yt-bg/96 backdrop-blur-md py-2 border-b border-yt-border">
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleBack} className="w-10 h-10 rounded-full hover:bg-yt-surface-muted flex items-center justify-center cursor-pointer" aria-label="رجوع"><ArrowRight className="w-5 h-5" /></button>
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yt-text-muted pointer-events-none" />
              <input ref={inputRef} value={searchInput} onChange={(e) => handleFieldChange(e.target.value)} onFocus={() => setShowSuggestions(searchInput.trim().length > 0)} onKeyDown={(e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); setShowSuggestions(false); handleBack(); return; } if (e.key === 'Enter') submit(searchInput); }} placeholder="ابحث في الفيديوهات المسموحة..." className="w-full h-11 rounded-full bg-yt-surface-muted border border-yt-border pl-10 pr-10 text-sm font-medium outline-none focus:ring-2 focus:ring-yt-brand/25" aria-label="البحث في الفيديوهات المسموحة" />
              {searchInput && <button type="button" onClick={clear} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full hover:bg-yt-border/40 flex items-center justify-center cursor-pointer" aria-label="مسح البحث"><X className="w-4 h-4" /></button>}
              {showSuggestions && searchSuggestions.length > 0 && <div className="absolute top-full inset-x-0 mt-2 rounded-2xl border border-yt-border bg-yt-surface shadow-xl p-1 max-h-72 overflow-y-auto z-30">{searchSuggestions.map((item) => <button key={item.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(item.text)} className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-yt-surface-muted text-right cursor-pointer"><Search className="w-4 h-4 text-yt-text-muted shrink-0" /><span className="truncate text-sm font-medium flex-1">{item.text}</span>{item.type === 'channel' && <span className="text-[10px] font-bold text-yt-brand bg-yt-brand-soft rounded-full px-2 py-1">قناة</span>}</button>)}</div>}
            </div>
          </div>
        </div>

        {searchStage === 'landing' ? (
          <section className="py-6">
            <div className="flex items-center justify-between"><h1 className="text-base font-black">عمليات البحث الأخيرة</h1><button type="button" onClick={() => { try { localStorage.removeItem(RECENTS_KEY); } catch {} setRecent([]); }} className="text-xs font-bold text-yt-text-muted cursor-pointer">مسح</button></div>
            <div className="mt-3 space-y-1">{recent.length ? recent.map((item) => <button key={item} type="button" onClick={() => submit(item)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer"><Clock3 className="w-4 h-4 text-yt-text-muted" /><span className="text-sm font-semibold">{item}</span></button>) : <p className="py-10 text-center text-sm text-yt-text-muted">لا توجد عمليات بحث محفوظة على هذا الجهاز.</p>}</div>
          </section>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-none py-4"><button type="button" onClick={() => setTab('all')} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${tab === 'all' ? 'bg-yt-text text-yt-text-inverse' : 'bg-yt-surface-muted text-yt-text'}`}>الكل</button><button type="button" onClick={() => setTab('videos')} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${tab === 'videos' ? 'bg-yt-text text-yt-text-inverse' : 'bg-yt-surface-muted text-yt-text'}`}>فيديوهات</button><button type="button" onClick={() => setTab('channels')} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${tab === 'channels' ? 'bg-yt-text text-yt-text-inverse' : 'bg-yt-surface-muted text-yt-text'}`}>قنوات</button><button type="button" onClick={() => setTab('playlists')} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${tab === 'playlists' ? 'bg-yt-text text-yt-text-inverse' : 'bg-yt-surface-muted text-yt-text'}`}>قوائم</button></div>

            {isDeepSearching && <div className="py-3 text-xs text-yt-text-muted">جاري البحث في أرشيف القنوات الموسع...</div>}

            {query && debouncedSearch !== query && (
              <div className="space-y-3 pb-5 animate-pulse">
                {[0, 1, 2, 3, 4, 5].map((id) => (
                  <div key={id} className="h-20 rounded-2xl bg-yt-surface-muted border border-yt-border" />
                ))}
              </div>
            )}

            {(tab === 'all' || tab === 'channels') && channelResults.length > 0 && <section className="mb-6"><h2 className="text-sm font-black mb-2">القنوات</h2><div className="space-y-1">{channelResults.slice(0, tab === 'all' ? 5 : 20).map(([id, info]) => <button key={id} type="button" onClick={() => onOpenChannel(id, info.title)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer"><span className="w-11 h-11 rounded-full overflow-hidden bg-yt-surface-muted border border-yt-border flex items-center justify-center font-bold">{info.thumbnail ? <img src={info.thumbnail} alt="" className="w-full h-full object-cover" /> : info.title.charAt(0)}</span><span className="font-bold flex-1 truncate">{info.title}</span></button>)}</div></section>}

            {(tab === 'all' || tab === 'playlists') && playlistResults.length > 0 && <section className="mb-6"><h2 className="text-sm font-black mb-2">القوائم</h2><div className="space-y-1">{playlistResults.slice(0, tab === 'all' ? 5 : 20).map((playlist) => <button key={playlist.id} type="button" onClick={() => onOpenPlaylist(playlist.id, playlist.name)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer"><span className="w-20 aspect-video rounded-xl bg-yt-surface-muted flex items-center justify-center overflow-hidden">{playlist.thumbnailVideoId ? <img src={`https://i.ytimg.com/vi/${playlist.thumbnailVideoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" /> : <ListVideo className="w-6 h-6 text-yt-text-muted" />}</span><span className="min-w-0 flex-1"><span className="block font-bold truncate">{playlist.name}</span><span className="block text-[10px] text-yt-text-muted">{playlistCounts[playlist.id] ?? 0} فيديو</span></span></button>)}</div></section>}

            {(tab === 'all' || tab === 'videos') && (
              <section>
                <h2 className="text-sm font-black mb-2">الفيديوهات</h2>
                {localVideos.length > 0 && (
                  <div className="space-y-1">
                    {localVideos.map((video) => (
                      <YoungTubeVideoRow
                        key={video.videoId}
                        video={video}
                        channelTitle={channelMap.get(video.channelId)?.title || 'قناة أطفال'}
                        channelThumbnail={channelMap.get(video.channelId)?.thumbnail}
                        onSelect={() => onSelectVideo(video.videoId, video.title, channelMap.get(video.channelId)?.title, video.channelId)}
                        onChannelSelect={() => onOpenChannel(video.channelId, channelMap.get(video.channelId)?.title || 'قناة أطفال')}
                        onOverflow={() => setOverflowVideo(video)}
                      />
                    ))}
                  </div>
                )}
                {deepSearchResults.map((item) => {
                  const video: FeedItem = {
                    videoId: item.videoId,
                    channelId: item.sourceId,
                    title: item.title,
                    publishedAt: item.publishedAt,
                    fetchedAt: Date.now(),
                  };
                  const info = channelMap.get(item.sourceId);
                  return (
                    <YoungTubeVideoCard
                      key={`archive-${item.videoId}`}
                      video={video}
                      channelTitle={info?.title || 'قناة أطفال'}
                      channelThumbnail={info?.thumbnail}
                      onSelectVideo={() => onSelectVideo(video.videoId, video.title, info?.title, video.channelId)}
                      onChannelSelect={() => onOpenChannel(video.channelId, info?.title || 'قناة أطفال')}
                      onOverflow={setOverflowVideo}
                    />
                  );
                })}
              </section>
            )}

            {localVideos.length === 0 && channelResults.length === 0 && playlistResults.length === 0 && deepSearchResults.length === 0 && !isDeepSearching && <div className="py-16 text-center"><Search className="w-10 h-10 mx-auto text-yt-text-muted mb-3" /><p className="font-black">لا توجد نتائج</p><p className="text-xs text-yt-text-muted mt-1">بحثك: {query}</p></div>}
          </>
        )}
      </div>
      <VideoOverflowSheet video={overflowVideo} channelTitle={overflowVideo ? channelMap.get(overflowVideo.channelId)?.title : undefined} onClose={() => setOverflowVideo(null)} />
    </div>
  );
};

export default SearchScreen;
