import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FeedItem, ChildPlaylist } from '../../db';
import db from '../../db';
import { VideoCard } from '../../components/VideoCard';
import { PlaylistManager } from '../../components/PlaylistManager';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { Heart, ArrowRight, Search, ListPlus, Plus } from 'lucide-react';

const AddByUrlCard = React.lazy(() => import('../../components/AddByUrlCard'));

export interface FavoritesViewProps {
  filteredFavorites: FeedItem[];
  debouncedSearch: string;
  channelMap: Map<string, { title: string; categories: string[]; thumbnail?: string; enabled?: boolean }>;
  onSelectVideo?: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
  onOpenDemoPlayer?: () => void;
  onChannelSelect: (id: string, title: string) => void;
  onCloseFavorites: () => void;
  onClearSearch: () => void;
  onFavoritesChanged: () => void;
  onAddToPlaylist?: (video: FeedItem) => void;
}

export function FavoritesView({
  filteredFavorites,
  debouncedSearch,
  channelMap,
  onSelectVideo,
  onOpenDemoPlayer,
  onChannelSelect,
  onCloseFavorites,
  onClearSearch,
  onFavoritesChanged,
  onAddToPlaylist,
}: FavoritesViewProps) {
  const [playlists, setPlaylists] = useState<ChildPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<FeedItem[]>([]);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [playlistActionVideo, setPlaylistActionVideo] = useState<FeedItem | null>(null);

  const loadPlaylists = useCallback(async () => {
    const rows = await db.childPlaylists.orderBy('updatedAt').reverse().toArray();
    setPlaylists(rows);
    if (selectedPlaylistId && !rows.some((p) => p.id === selectedPlaylistId)) {
      setSelectedPlaylistId(null);
    }
  }, [selectedPlaylistId]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedPlaylistId) {
        setPlaylistVideos([]);
        return;
      }
      const playlist = await db.childPlaylists.get(selectedPlaylistId);
      if (!playlist || playlist.videoIds.length === 0) {
        if (!cancelled) setPlaylistVideos([]);
        return;
      }
      const [rows, interactions, channels, settings] = await Promise.all([
        db.feedCache.where('videoId').anyOf(playlist.videoIds).toArray(),
        db.interactions.where('videoId').anyOf(playlist.videoIds).toArray(),
        db.channels.toArray(),
        db.settings.get('main'),
      ]);
      const rowMap = new Map(rows.map((r) => [r.videoId, r]));
      const interactionMap = new Map(interactions.map((r) => [r.videoId, r]));
      const disabled = new Set(channels.filter((c) => c.enabled === false).map((c) => c.sourceId));
      const blocks = loadCachedBlocks();
      const blocked = new Set(blocks.channelIds);
      const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());
      const safe = playlist.videoIds.flatMap((videoId) => {
        const cached = rowMap.get(videoId);
        const inter = interactionMap.get(videoId);
        if (!cached || cached.hidden === true || cached.isPortrait === true) return [];
        if (disabled.has(cached.channelId) || blocked.has(cached.channelId)) return [];
        if (hasFamilyKey && typeof cached.videoDuration === 'number' && cached.videoDuration < 120) return [];
        return [{
          ...cached,
          title: cached.title || inter?.title || 'فيديو أطفال',
        }];
      });
      if (!cancelled) setPlaylistVideos(safe);
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedPlaylistId, playlists]);

  const visiblePlaylistVideos = useMemo(() => {
    if (!debouncedSearch) return playlistVideos;
    return playlistVideos.filter((video) => {
      const channelInfo = channelMap.get(video.channelId);
      return (
        video.title.toLowerCase().includes(debouncedSearch) ||
        channelInfo?.title.toLowerCase().includes(debouncedSearch)
      );
    });
  }, [playlistVideos, debouncedSearch, channelMap]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || null;
  const videosToShow = selectedPlaylistId ? visiblePlaylistVideos : filteredFavorites;

  return (
    <div id="kid-favorites-view" className="space-y-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <Suspense fallback={null}>
          <AddByUrlCard target="loved" onAdded={onFavoritesChanged} />
        </Suspense>

        <div className="flex flex-col gap-4 bg-yt-surface/95 p-4 sm:p-5 rounded-3xl border border-rose-100 shadow-[0_2px_12px_rgba(244,63,94,0.05)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100 shadow-sm">
                {selectedPlaylistId ? <ListPlus className="w-6 h-6" /> : <Heart className="w-6 h-6 fill-rose-500" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-black text-yt-text flex items-center gap-2 flex-wrap">
                  <span>{selectedPlaylist ? selectedPlaylist.name : 'فيديوهاتي المفضلة'}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">
                    {videosToShow.length} فيديو
                  </span>
                </h2>
                <p className="text-xs text-yt-text-muted">
                  {selectedPlaylist ? 'قائمة تشغيل أنشأها الطفل من داخل YoungTube.' : 'الفيديوهات التي نالت إعجابك وتستمتع بمشاهدتها دائماً.'}
                </p>
              </div>
            </div>

            <button
              id="back-to-home-feed-btn"
              type="button"
              onClick={onCloseFavorites}
              className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-2xl bg-yt-surface-muted hover:bg-yt-border text-yt-text text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer shadow-sm"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة للفيديوهات</span>
            </button>
          </div>

          <div className="rounded-2xl border border-yt-border bg-yt-surface-muted/60 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center">
                  <ListPlus className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-yt-text">قوائم التشغيل</div>
                  <div className="text-[10px] text-yt-text-muted">اعمل، سمّي، وعدّل قوائمك بنفسك.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaylistManager((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yt-brand text-yt-brand-text text-[11px] font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {showPlaylistManager ? 'إخفاء الإدارة' : 'إدارة القوائم'}
              </button>
            </div>

            {playlists.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedPlaylistId(null)}
                  className={`shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${!selectedPlaylistId ? 'bg-rose-500 text-white border-rose-500' : 'bg-yt-surface text-yt-text-muted border-yt-border'}`}
                >
                  المفضلة
                </button>
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => setSelectedPlaylistId(playlist.id)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${selectedPlaylistId === playlist.id ? 'bg-yt-brand text-yt-brand-text border-yt-brand' : 'bg-yt-surface text-yt-text-muted border-yt-border'}`}
                  >
                    {playlist.name} · {playlist.videoIds.length}
                  </button>
                ))}
              </div>
            )}

            {showPlaylistManager && (
              <div className="mt-3 rounded-2xl border border-yt-border bg-yt-surface p-3 sm:p-4">
                <PlaylistManager mode="manage" onChanged={loadPlaylists} />
              </div>
            )}
          </div>
        </div>
      </div>

      {videosToShow.length === 0 ? (
        debouncedSearch ? (
          <div className="max-w-lg mx-auto my-6 px-4">
            <div className="bg-yt-surface/90 rounded-3xl border border-rose-100 p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-yt-text">مفيش نتائج بالبحث ده</h3>
              <button type="button" onClick={onClearSearch} className="px-5 py-2.5 rounded-full bg-yt-brand text-yt-brand-text text-xs font-bold cursor-pointer">مسح البحث</button>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto my-8 px-4 text-center text-yt-text-muted text-sm font-medium">
            {selectedPlaylistId ? 'القائمة دي لسه فاضية. أضف فيديوهات ليها من الفيد أو المشغل.' : 'لسه مفيش فيديوهات مفضلة.'}
          </div>
        )
      ) : (
        <div className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6">
            {videosToShow.map((video) => {
              const channelInfo = channelMap.get(video.channelId);
              return (
                <VideoCard
                  key={video.videoId}
                  video={video}
                  channelTitle={channelInfo?.title || 'قناة أطفال'}
                  channelThumbnail={channelInfo?.thumbnail}
                  isFavorite={!selectedPlaylistId}
                  onSelectVideo={onSelectVideo}
                  onOpenDemoPlayer={onOpenDemoPlayer}
                  onChannelSelect={onChannelSelect}
                  onAddToPlaylist={onAddToPlaylist || ((v) => setPlaylistActionVideo(v))}
                />
              );
            })}
          </div>
        </div>
      )}

      {playlistActionVideo && (
        <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onMouseDown={() => setPlaylistActionVideo(null)}>
          <div className="w-full max-w-md bg-yt-surface rounded-3xl border border-yt-border shadow-2xl p-4 sm:p-5 max-h-[80vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
            <PlaylistManager
              mode="add"
              video={playlistActionVideo}
              onClose={() => setPlaylistActionVideo(null)}
              onChanged={async () => { await loadPlaylists(); setPlaylistActionVideo(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FavoritesView;
