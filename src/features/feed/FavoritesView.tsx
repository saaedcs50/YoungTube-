import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, GripVertical, Heart, ListPlus, Play, Plus, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
import type { FeedItem, ChildPlaylist } from '../../db';
import { VideoCard } from '../../components/VideoCard';
import { PlaylistManager } from '../../components/PlaylistManager';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { listPlaylists, removePlaylistItem, reorderPlaylistItem } from '../../services/playlists/playlistRepository';
import { resolvePlaylistItemViews, type PlaylistItemView } from '../../services/playlists/playlistSelectors';
import type { PlaylistPlaybackContext } from '../../services/playlists/playlistTypes';

const AddByUrlCard = React.lazy(() => import('../../components/AddByUrlCard'));

export interface FavoritesViewProps {
  filteredFavorites: FeedItem[];
  debouncedSearch: string;
  channelMap: Map<string, { title: string; categories: string[]; thumbnail?: string; enabled?: boolean }>;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string,
    options?: { localPath?: string; fromDownloads?: boolean; playlistContext?: PlaylistPlaybackContext },
  ) => void;
  onOpenDemoPlayer?: () => void;
  onChannelSelect: (id: string, title: string) => void;
  onCloseFavorites: () => void;
  onClearSearch: () => void;
  onFavoritesChanged: () => void;
  onAddToPlaylist?: (video: FeedItem) => void;
}

function reasonLabel(reason?: PlaylistItemView['reason']): string {
  switch (reason) {
    case 'blocked_channel':
    case 'hidden':
    case 'portrait':
    case 'too_short':
    case 'short':
      return 'غير متاح حاليًا';
    case 'offline_unavailable':
      return 'غير متاح دون إنترنت';
    default:
      return 'غير متاح';
  }
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
  const [playlistViews, setPlaylistViews] = useState<PlaylistItemView[]>([]);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [playlistActionVideo, setPlaylistActionVideo] = useState<FeedItem | null>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);

  const loadPlaylists = useCallback(async () => {
    const rows = await listPlaylists();
    setPlaylists(rows);
    if (selectedPlaylistId && !rows.some((p) => p.id === selectedPlaylistId)) setSelectedPlaylistId(null);
  }, [selectedPlaylistId]);

  const loadSelectedPlaylist = useCallback(async () => {
    if (!selectedPlaylistId) {
      setPlaylistViews([]);
      return;
    }
    setLoadingPlaylist(true);
    try {
      setPlaylistViews(await resolvePlaylistItemViews(selectedPlaylistId));
    } finally {
      setLoadingPlaylist(false);
    }
  }, [selectedPlaylistId]);

  useEffect(() => { void loadPlaylists(); }, [loadPlaylists]);
  useEffect(() => { void loadSelectedPlaylist(); }, [loadSelectedPlaylist]);

  const blocks = useMemo(() => loadCachedBlocks(), []);
  const favoriteCount = filteredFavorites.length;

  const selectedPlaylist = selectedPlaylistId ? playlists.find((p) => p.id === selectedPlaylistId) : null;

  const playPlaylist = useCallback((view?: PlaylistItemView, shuffle = false) => {
    if (!selectedPlaylist || !onSelectVideo) return;
    const sourceViews = shuffle ? [...playlistViews].filter((v) => v.playable).sort(() => Math.random() - 0.5) : playlistViews.filter((v) => v.playable);
    const target = view?.playable ? view : sourceViews[0];
    if (!target?.feed) return;
    onSelectVideo(
      target.feed.videoId,
      target.feed.title,
      channelMap.get(target.feed.channelId)?.title,
      target.feed.channelId,
      { localPath: target.localPath, playlistContext: { source: 'playlist', playlistId: selectedPlaylist.id, playlistItemId: target.item.id, shuffle } },
    );
  }, [selectedPlaylist, onSelectVideo, playlistViews, channelMap]);

  const moveItem = async (itemId: string, direction: -1 | 1) => {
    if (!selectedPlaylist) return;
    const index = playlistViews.findIndex((view) => view.item.id === itemId);
    if (index < 0) return;
    const target = Math.max(0, Math.min(playlistViews.length - 1, index + direction));
    if (target === index) return;
    await reorderPlaylistItem(selectedPlaylist.id, itemId, target);
    await loadSelectedPlaylist();
    await loadPlaylists();
  };

  const removeItem = async (itemId: string) => {
    if (!selectedPlaylist) return;
    await removePlaylistItem(selectedPlaylist.id, itemId);
    await loadSelectedPlaylist();
    await loadPlaylists();
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-10 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onCloseFavorites} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-yt-border bg-yt-surface text-yt-text-muted text-[11px] font-bold cursor-pointer">
          <ArrowRight className="w-4 h-4" />
          الفيديوهات
        </button>
        <div className="text-right">
          <div className="text-sm font-black text-yt-text">المفضلة وقوائم التشغيل</div>
          <div className="text-[10px] text-yt-text-muted">{favoriteCount} فيديو مفضل محفوظ محليًا</div>
        </div>
      </div>

      <section className="rounded-2xl border border-yt-border bg-yt-surface p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Heart className="w-4 h-4" /></div>
            <div><div className="text-xs font-black text-yt-text">المفضلة</div><div className="text-[10px] text-yt-text-muted">مجموعة نظامية مستقلة عن قوائمك.</div></div>
          </div>
        </div>
        {filteredFavorites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-yt-border p-8 text-center text-xs text-yt-text-muted">مفيش فيديوهات مفضلة تطابق البحث.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFavorites.slice(0, 60).map((video) => (
              <VideoCard
                key={video.videoId}
                video={video}
                channelTitle={channelMap.get(video.channelId)?.title || 'قناة أطفال موثوقة'}
                channelThumbnail={channelMap.get(video.channelId)?.thumbnail}
                isFavorite
                onSelectVideo={onSelectVideo}
                onChannelSelect={onChannelSelect}
                onOpenDemoPlayer={onOpenDemoPlayer}
                onTasteReacted={onFavoritesChanged}
                onAddToPlaylist={onAddToPlaylist}
              />
            ))}
          </div>
        )}
        {filteredFavorites.length > 60 && <div className="mt-3 text-[10px] text-yt-text-muted">تم عرض أول 60 نتيجة لتقليل الحمل على الجهاز.</div>}
      </section>

      <section className="rounded-2xl border border-yt-border bg-yt-surface p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center"><ListPlus className="w-4 h-4" /></div>
            <div><div className="text-xs font-black text-yt-text">قوائم التشغيل</div><div className="text-[10px] text-yt-text-muted">ترتيب ثابت ومجموعة تشغيل حقيقية.</div></div>
          </div>
          <button type="button" onClick={() => setShowPlaylistManager((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yt-brand text-yt-brand-text text-[11px] font-bold cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            {showPlaylistManager ? 'إخفاء الإدارة' : 'إدارة القوائم'}
          </button>
        </div>

        {showPlaylistManager && (
          <div className="mb-4">
            <PlaylistManager mode="manage" onClose={() => setShowPlaylistManager(false)} onChanged={() => void loadPlaylists()} />
          </div>
        )}

        {playlists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-yt-border p-8 text-center">
            <ListPlus className="w-7 h-7 mx-auto text-yt-text-muted mb-2" />
            <div className="text-xs font-black text-yt-text">اعمل أول قائمة تشغيل</div>
            <div className="text-[10px] text-yt-text-muted mt-1">من أي فيديو اضغط علامة القائمة، أو أنشئها هنا.</div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  className={`shrink-0 min-w-36 text-right px-3 py-2.5 rounded-xl border cursor-pointer ${selectedPlaylistId === playlist.id ? 'bg-yt-brand text-yt-brand-text border-yt-brand' : 'bg-yt-surface-muted text-yt-text border-yt-border'}`}
                >
                  <div className="text-xs font-black truncate">{playlist.name}</div>
                  <div className={`text-[10px] mt-0.5 ${selectedPlaylistId === playlist.id ? 'opacity-80' : 'text-yt-text-muted'}`}>{playlistViews.length && selectedPlaylistId === playlist.id ? playlistViews.length : 'فتح للتفاصيل'}</div>
                </button>
              ))}
            </div>

            {selectedPlaylist && (
              <div className="mt-3 rounded-2xl border border-yt-border bg-yt-surface-muted/60 p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-black text-yt-text">{selectedPlaylist.name}</div>
                    <div className="text-[10px] text-yt-text-muted">
                      {playlistViews.filter((v) => v.playable).length} متاح من {playlistViews.length} محفوظ
                      {playlistViews.some((v) => !v.playable) && ' — العناصر غير المتاحة مخفية عن تشغيل الطفل.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => playPlaylist(undefined, false)} disabled={loadingPlaylist || !playlistViews.some((v) => v.playable)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yt-brand text-yt-brand-text text-[11px] font-bold cursor-pointer disabled:opacity-40"><Play className="w-3.5 h-3.5" /> تشغيل الكل</button>
                    <button type="button" onClick={() => playPlaylist(undefined, true)} disabled={loadingPlaylist || !playlistViews.some((v) => v.playable)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-yt-border bg-yt-surface text-yt-text text-[11px] font-bold cursor-pointer disabled:opacity-40"><Shuffle className="w-3.5 h-3.5" /> عشوائي</button>
                  </div>
                </div>

                {loadingPlaylist ? (
                  <div className="py-10 text-center text-xs text-yt-text-muted"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />جاري تحميل القائمة…</div>
                ) : playlistViews.length === 0 ? (
                  <div className="py-10 text-center text-xs text-yt-text-muted">القائمة فاضية.</div>
                ) : (
                  <div className="space-y-2">
                    {playlistViews.map((view, index) => {
                      const feed = view.feed;
                      const title = view.playable ? (feed?.title || view.item.titleSnapshot || view.item.videoId) : 'فيديو غير متاح حاليًا';
                      const channelName = feed ? (channelMap.get(feed.channelId)?.title || 'قناة أطفال موثوقة') : 'غير متاح';
                      return (
                        <div key={view.item.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${view.playable ? 'border-yt-border bg-yt-surface' : 'border-yt-border/70 bg-yt-surface-muted opacity-70'}`}>
                          <span className="w-5 text-center text-[10px] font-black text-yt-text-muted">{index + 1}</span>
                          <GripVertical className="w-4 h-4 text-yt-text-muted shrink-0" />
                          <div className="w-24 sm:w-32 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                            {view.playable && feed?.videoId && <img src={`https://i.ytimg.com/vi/${feed.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />}
                          </div>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-right cursor-pointer disabled:cursor-default"
                            onClick={() => playPlaylist(view)}
                            disabled={!view.playable}
                          >
                            <div className="text-xs font-black text-yt-text line-clamp-2">{title}</div>
                            <div className="text-[10px] text-yt-text-muted mt-0.5 truncate">{channelName}</div>
                            {!view.playable && <div className="text-[10px] font-bold text-amber-700 mt-1">{reasonLabel(view.reason)}</div>}
                          </button>
                          <div className="flex items-center gap-1">
                            {view.playable && <button type="button" onClick={() => playPlaylist(view)} className="p-2 rounded-lg hover:bg-yt-surface-muted text-yt-text cursor-pointer" aria-label={`تشغيل ${title}`}><Play className="w-3.5 h-3.5" /></button>}
                            <button type="button" onClick={() => void moveItem(view.item.id, -1)} disabled={index === 0} className="p-2 rounded-lg hover:bg-yt-surface-muted text-yt-text-muted disabled:opacity-30 cursor-pointer" aria-label="نقل لأعلى">↑</button>
                            <button type="button" onClick={() => void moveItem(view.item.id, 1)} disabled={index === playlistViews.length - 1} className="p-2 rounded-lg hover:bg-yt-surface-muted text-yt-text-muted disabled:opacity-30 cursor-pointer" aria-label="نقل لأسفل">↓</button>
                            <button type="button" onClick={() => void removeItem(view.item.id)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer" aria-label={`إزالة ${title} من القائمة`}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {playlistActionVideo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-lg">
            <PlaylistManager
              video={playlistActionVideo}
              mode="add"
              onClose={() => setPlaylistActionVideo(null)}
              onChanged={() => { onFavoritesChanged(); void loadPlaylists(); }}
            />
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <AddByUrlCard onAdded={onFavoritesChanged} />
      </Suspense>

      {debouncedSearch && (
        <div className="text-[10px] text-yt-text-muted flex items-center gap-1">
          {blocks.channelIds.length} قناة محجوبة عالميًا تؤثر على النتائج الحالية.
          <button type="button" onClick={onClearSearch} className="underline cursor-pointer">مسح البحث</button>
        </div>
      )}
    </div>
  );
}
