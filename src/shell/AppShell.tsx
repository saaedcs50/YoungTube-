import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listDownloads } from '../services/downloadManager';
import type { PlaylistPlaybackContext } from '../services/playlists/playlistTypes';
import KidHomeScreen from '../features/feed/KidHomeScreen';
import { ChannelsScreen } from '../features/channels/ChannelsScreen';
import { PlaylistsScreen } from '../features/playlists/PlaylistsScreen';
import { YouScreen } from '../features/you/YouScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { ChannelScreen } from '../features/channel/ChannelScreen';
import { PlaylistDetailScreen } from '../features/playlists/PlaylistDetailScreen';
import { FavoritesScreen } from '../features/feed/FavoritesScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { BottomNav } from './BottomNav';
import { TopAppBar } from './TopAppBar';
import {
  handleNavigationPopState,
  popOverlay,
  pushOverlay,
  recordCurrentScroll,
  restoreRootScroll,
  scrollRootToTop,
  switchRoot,
  useNavigation,
  type RootId,
  type Overlay,
} from './navigationStore';
import DownloadsModal from '../components/DownloadsModal';

type SelectVideo = (
  videoId: string,
  title?: string,
  channelName?: string,
  channelId?: string,
  options?: { localPath?: string; fromDownloads?: boolean; playlistContext?: PlaylistPlaybackContext }
) => void;

export interface AppShellProps {
  onOpenDemoPlayer: () => void;
  onSelectVideo: SelectVideo;
  onOpenParentDashboard: () => void;
  onCast: () => void;
  refreshTrigger?: number;
  suppressedVideoIds?: string[];
  isPlayerOpen: boolean;
  isPlayerMinimized: boolean;
  isDevModeParam?: boolean;
  devForceStop?: boolean;
  onToggleDevForceStop?: () => void;
}

function calculateDownloadCount(): Promise<number> {
  return listDownloads()
    .then((items: any[]) => items.filter((item) => item.status === 'downloading' || item.status === 'queued').length)
    .catch(() => 0);
}

export function AppShell({
  onOpenDemoPlayer,
  onSelectVideo,
  onOpenParentDashboard,
  onCast,
  refreshTrigger = 0,
  suppressedVideoIds = [],
  isPlayerOpen,
  isPlayerMinimized,
  isDevModeParam = false,
  devForceStop = false,
  onToggleDevForceStop,
}: AppShellProps) {
  const nav = useNavigation();
  const root = nav?.root ?? 'home';
  const overlayStack = nav?.overlayStack ?? nav?.stack ?? [];
  const activeOverlay = useMemo(() => overlayStack[overlayStack.length - 1] ?? null, [overlayStack]);
  const previousRootRef = useRef(root);
  const [activeDownloadCount, setActiveDownloadCount] = useState(0);

  const refreshDownloadCount = useCallback(async () => {
    setActiveDownloadCount(await calculateDownloadCount());
  }, []);

  useEffect(() => {
    void refreshDownloadCount();
    const timer = window.setInterval(() => void refreshDownloadCount(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshDownloadCount]);

  useEffect(() => {
    let raf = 0;
    const handleScroll = () => {
      if (overlayStack.length > 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recordCurrentScroll(root));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [root, overlayStack.length]);

  useEffect(() => {
    if (previousRootRef.current === root) return;
    previousRootRef.current = root;
    requestAnimationFrame(() => restoreRootScroll(root));
  }, [root]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      handleNavigationPopState(event, isPlayerOpen && !isPlayerMinimized);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isPlayerOpen, isPlayerMinimized]);

  useEffect(() => {
    const onOpenChannel = (event: Event) => {
      const channelId = (event as CustomEvent<string>).detail;
      if (channelId) pushOverlay({ type: 'channel', channelId });
    };
    window.addEventListener('youngtube-open-channel', onOpenChannel as EventListener);
    return () => window.removeEventListener('youngtube-open-channel', onOpenChannel as EventListener);
  }, []);

  const openOverlay = useCallback((overlay: Overlay) => {
    pushOverlay(overlay);
  }, []);

  const goHome = useCallback(() => {
    if (root !== 'home' || overlayStack.length) {
      switchRoot('home');
      requestAnimationFrame(() => scrollRootToTop('home'));
      return;
    }
    scrollRootToTop('home');
  }, [root, overlayStack.length]);

  const closeOverlay = useCallback(() => {
    if (overlayStack.length > 0) popOverlay();
  }, [overlayStack.length]);

  const handleChannelOpen = useCallback((channelId: string) => {
    openOverlay({ type: 'channel', channelId });
  }, [openOverlay]);

  const handlePlaylistOpen = useCallback((playlistId: string) => {
    openOverlay({ type: 'playlist', playlistId });
  }, [openOverlay]);

  const handleSearchOpen = useCallback(() => {
    openOverlay({ type: 'search' });
  }, [openOverlay]);

  const handleFavoriteOpen = useCallback(() => {
    openOverlay({ type: 'favorites' });
  }, [openOverlay]);

  const handleDownloadsOpen = useCallback(() => {
    openOverlay({ type: 'downloads' });
  }, [openOverlay]);

  const handleDownloadsClose = useCallback(() => {
    closeOverlay();
    void refreshDownloadCount();
  }, [closeOverlay, refreshDownloadCount]);

  const handleHistoryOpen = useCallback(() => {
    openOverlay({ type: 'history' });
  }, [openOverlay]);

  const handleRootChange = useCallback((nextRoot: RootId) => {
    if (nextRoot === 'playlists' && root === 'playlists') {
      scrollRootToTop('playlists');
      return;
    }
    switchRoot(nextRoot);
  }, [root]);

  const handleYouPlaylists = useCallback(() => {
    handleRootChange('playlists');
    requestAnimationFrame(() => restoreRootScroll('playlists'));
  }, [handleRootChange]);

  const bottomPaddingClass = isPlayerMinimized
    ? 'pb-[calc(56px+env(safe-area-inset-bottom)+112px)]'
    : 'pb-[calc(56px+env(safe-area-inset-bottom))]';

  const showGlobalChrome = !activeOverlay && (!isPlayerOpen || isPlayerMinimized);

  const renderRoot = () => {
    switch (root) {
      case 'channels':
        return (
          <ChannelsScreen
            onSelectVideo={onSelectVideo}
            onOpenChannel={handleChannelOpen}
          />
        );
      case 'playlists':
        return (
          <PlaylistsScreen onOpenPlaylist={handlePlaylistOpen} />
        );
      case 'you':
        return (
          <YouScreen
            onOpenFavorites={handleFavoriteOpen}
            onOpenDownloads={handleDownloadsOpen}
            onOpenParentLock={onOpenParentDashboard}
            onOpenHistory={handleHistoryOpen}
            onOpenPlaylists={handleYouPlaylists}
          />
        );
      case 'home':
      default:
        return (
          <KidHomeScreen
            onOpenDemoPlayer={onOpenDemoPlayer}
            onSelectVideo={onSelectVideo}
            refreshTrigger={refreshTrigger}
            suppressedVideoIds={suppressedVideoIds}
            isPlayerOpen={isPlayerOpen && !isPlayerMinimized}
          />
        );
    }
  };

  const renderOverlay = () => {
    if (!activeOverlay) return null;
    switch (activeOverlay.type) {
      case 'search':
        return (
          <SearchScreen
            onBack={closeOverlay}
            onSelectVideo={onSelectVideo}
            onOpenChannel={handleChannelOpen}
            onOpenPlaylist={handlePlaylistOpen}
          />
        );
      case 'channel':
        return (
          <ChannelScreen
            channelId={activeOverlay.channelId}
            onBack={closeOverlay}
            onSelectVideo={onSelectVideo}
            onOpenPlaylist={handlePlaylistOpen}
          />
        );
      case 'playlist':
        return (
          <PlaylistDetailScreen
            playlistId={activeOverlay.playlistId}
            onBack={closeOverlay}
            onSelectVideo={onSelectVideo}
          />
        );
      case 'favorites':
        return (
          <FavoritesScreen
            onBack={closeOverlay}
            onSelectVideo={onSelectVideo}
            onOpenChannel={handleChannelOpen}
          />
        );
      case 'history':
        return (
          <HistoryScreen
            onBack={closeOverlay}
            onSelectVideo={onSelectVideo}
            onOpenChannel={handleChannelOpen}
          />
        );
      case 'downloads':
        return (
          <DownloadsModal
            isOpen
            onClose={handleDownloadsClose}
            onSelectVideo={onSelectVideo}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div id="youngtube-app-shell" dir="rtl" className="min-h-screen bg-yt-bg text-yt-text">
      {showGlobalChrome && (
        <TopAppBar
          root={root}
          onHome={goHome}
          onSearch={handleSearchOpen}
          onCast={onCast}
          onParentLock={onOpenParentDashboard}
        />
      )}

      <main key={root} className={showGlobalChrome ? bottomPaddingClass : ''} style={{ animation: 'yt-root-crossfade 120ms ease-out both' }}>{renderRoot()}</main>

      {showGlobalChrome && (
        <BottomNav
          selected={root}
          onSelect={handleRootChange}
          activeDownloadCount={activeDownloadCount}
        />
      )}

      {activeOverlay && (
        <div className="fixed inset-0 z-[70] bg-yt-bg text-yt-text overflow-hidden">
          {renderOverlay()}
        </div>
      )}

      {isDevModeParam && root === 'home' && !activeOverlay && !isPlayerOpen && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-3 z-[62] flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2">
          <button
            type="button"
            id="floating-open-demo-player-btn"
            onClick={onOpenDemoPlayer}
            className="px-3 py-1.5 rounded-full bg-indigo-900/90 hover:bg-indigo-900 text-indigo-200 text-xs font-medium shadow-md backdrop-blur-sm transition cursor-pointer"
            title="شاشة المشغل التجريبية"
          >
            ▶ شاشة المشغل التجريبية
          </button>
          {onToggleDevForceStop && (
            <button
              type="button"
              id="floating-force-stop-toggle-btn"
              onClick={onToggleDevForceStop}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shadow-md backdrop-blur-sm transition cursor-pointer ${
                devForceStop ? 'bg-rose-600 text-white' : 'bg-black/80 hover:bg-black/90 text-yt-brand'
              }`}
              title="اختبار إشارة إيقاف المشغل forceStop"
            >
              {devForceStop ? '⛔ forceStop: مفعّل' : '🧪 اختبار forceStop'}
            </button>
          )}
        </div>
      )}

    </div>
  );
}
