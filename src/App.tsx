import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import db, { Settings } from './db';
import { WORKER_URL } from './config';
import { checkAndRequestStoragePersistence, StoragePersistenceResult } from './storage';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useSessionTimer } from './hooks/useSessionTimer';
import { ensureChannelsArchiveSynced } from './filtering';
import KidHomeScreen from './screens/KidHomeScreen';
import { PlayerView } from './screens/PlayerView';
import SessionEndScreen from './components/SessionEndScreen';

// Lazy-load heavy surfaces so kid-facing feed route starts immediately
const Onboarding = React.lazy(() => import('./components/Onboarding'));
const PinLockModal = React.lazy(() => import('./components/PinLockModal'));
const AdBlockNotice = React.lazy(() => import('./components/AdBlockNotice'));
const ChannelsCountCard = React.lazy(() => import('./components/ChannelsCountCard'));
const FilteringResultCard = React.lazy(() => import('./components/FilteringResultCard'));
const TempAdminTool = React.lazy(() => import('./components/TempAdminTool'));
const ChildProfileSection = React.lazy(() => import('./components/ChildProfileSection').then((m) => ({ default: m.ChildProfileSection })));
const TimerSection = React.lazy(() => import('./components/dashboard/TimerSection').then((m) => ({ default: m.TimerSection })));
const TasteShiftCard = React.lazy(() => import('./components/TasteShiftCard').then((m) => ({ default: m.TasteShiftCard })));
const ChannelCurationByCategory = React.lazy(() => import('./components/ChannelCurationByCategory').then((m) => ({ default: m.ChannelCurationByCategory })));
const FilteringTab = React.lazy(() => import('./components/FilteringTab').then((m) => ({ default: m.FilteringTab })));
const SavedVideosTab = React.lazy(() => import('./components/SavedVideosTab').then((m) => ({ default: m.SavedVideosTab })));
const TimerTestCard = React.lazy(() => import('./components/TimerTestCard'));
import { DashboardShell } from './components/dashboard/DashboardShell';
import { DashboardSectionId } from './components/dashboard/DashboardNav';

// Unified dashboard section loading skeleton
const SectionLoadingSkeleton: React.FC = () => (
  <div className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm animate-pulse space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-amber-100/70" />
      <div className="space-y-1.5 flex-1">
        <div className="h-4 bg-stone-200/70 rounded-full w-1/4" />
        <div className="h-3 bg-stone-100 rounded-full w-1/2" />
      </div>
    </div>
    <div className="h-28 bg-stone-50 rounded-xl border border-stone-100" />
  </div>
);
import {
  Database,
  Cloud,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  TableProperties,
  Layers,
  Lock,
  Unlock,
  SlidersHorizontal,
  KeyRound,
  Plus,
  Trash2,
  HelpCircle,
  Wifi,
  WifiOff,
  Clock,
  Sparkles,
  User,
  FolderKanban,
  Bookmark,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TestResult {
  loading: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  timestamp?: string;
}

interface WorkerResult {
  loading: boolean;
  success?: boolean;
  isFromCache?: boolean;
  data?: Record<string, unknown>;
  error?: string;
  message?: string;
  timestamp?: string;
}

interface StorageState {
  loading: boolean;
  result?: StoragePersistenceResult;
}

export default function App() {
  const [dbResult, setDbResult] = useState<TestResult>({ loading: true });
  const [workerResult, setWorkerResult] = useState<WorkerResult>({ loading: true });
  const [storageResult, setStorageResult] = useState<StorageState>({ loading: true });

  // Onboarding & Settings State
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mainSettings, setMainSettings] = useState<Settings | null>(null);

  // Stage 5 Refresh trigger for channels count card
  const [channelsRefreshTrigger, setChannelsRefreshTrigger] = useState(0);
  const [channelsData, setChannelsData] = useState<any[] | null>(null);

  // Stable callback — prevents infinite re-fetch loop in ChannelsCountCard
  const handleChannelsLoaded = useCallback((data: any[]) => {
    setChannelsData(data);
  }, []);

  // Stable callback for admin backfill refresh
  const handleBackfillSuccess = useCallback(() => {
    setChannelsRefreshTrigger((prev) => prev + 1);
  }, []);

  // Hide a single video: drop it locally. Do NOT refetch the Worker archive.
  const handleVideoHidden = useCallback((videoId?: string) => {
    if (videoId) {
      setSuppressedVideoIds((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
    }
  }, []);

  // Check if ?dev=1 is requested in URL
  const isDevModeParam = typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('dev') === '1' || window.location.hash.includes('dev=1'));

  // Parent Dashboard & PIN Lock State
  const [showPinModal, setShowPinModal] = useState(false);
  const [isDashboardUnlocked, setIsDashboardUnlocked] = useState(false);
  // Default is 'kids' (real kid-facing interface)
  const [viewMode, setViewMode] = useState<'kids' | 'dashboard' | 'dev'>(isDevModeParam ? 'dev' : 'kids');
  const [showAdBlockModal, setShowAdBlockModal] = useState(false);
  const [showDemoPlayer, setShowDemoPlayer] = useState(false);
  const [activePlaybackVideo, setActivePlaybackVideo] = useState<{
    videoId: string;
    title?: string;
    channelName?: string;
    channelId?: string;
  } | null>(null);
  const [devForceStop, setDevForceStop] = useState(false);
  const [suppressedVideoIds, setSuppressedVideoIds] = useState<string[]>([]);

  // Fix 2: Player fullscreen and mini-player states tracked in App.tsx
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const isPlayerFullscreenRef = useRef(false);

  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const isPlayerMinimizedRef = useRef(false);

  const updatePlayerFullscreen = useCallback((val: boolean) => {
    setIsPlayerFullscreen(val);
    isPlayerFullscreenRef.current = val;
  }, []);

  const updatePlayerMinimized = useCallback((val: boolean) => {
    setIsPlayerMinimized(val);
    isPlayerMinimizedRef.current = val;
  }, []);

  const handleOpenDemoPlayer = useCallback(() => {
    updatePlayerMinimized(false);
    if (typeof window !== 'undefined' && !window.history.state?.ytPlayer) {
      window.history.pushState({ ytPlayer: true, fullscreen: false }, '');
    }
    setShowDemoPlayer(true);
  }, [updatePlayerMinimized]);

  const handleSelectVideo = useCallback((videoId: string, title?: string, channelName?: string, channelId?: string) => {
    updatePlayerMinimized(false);
    if (typeof window !== 'undefined' && !window.history.state?.ytPlayer) {
      window.history.pushState({ ytPlayer: true, fullscreen: false }, '');
    }
    setActivePlaybackVideo({ videoId, title, channelName, channelId });
  }, [updatePlayerMinimized]);

  const handlePlayerEnterFullscreen = useCallback(() => {
    if (typeof window !== 'undefined' && !window.history.state?.fullscreen) {
      window.history.pushState({ ytPlayer: true, fullscreen: true }, '');
    }
    updatePlayerFullscreen(true);
  }, [updatePlayerFullscreen]);

  const handlePlayerExitFullscreen = useCallback(() => {
    updatePlayerFullscreen(false);
  }, [updatePlayerFullscreen]);

  const handlePlayerEnterMinimized = useCallback(() => {
    if (typeof window !== 'undefined' && !window.history.state?.minimized) {
      window.history.pushState({ ytPlayer: true, fullscreen: false, minimized: true }, '');
    }
    updatePlayerMinimized(true);
  }, [updatePlayerMinimized]);

  const handlePlayerExitMinimized = useCallback(() => {
    updatePlayerMinimized(false);
  }, [updatePlayerMinimized]);

  // Fix 2: Ensure Level 1 history entry exists when PlayerView opens
  useEffect(() => {
    if (
      (activePlaybackVideo || showDemoPlayer) &&
      typeof window !== 'undefined' &&
      !window.history.state?.ytPlayer
    ) {
      window.history.pushState({ ytPlayer: true, fullscreen: false }, '');
    }
  }, [activePlaybackVideo, showDemoPlayer]);

  // Fix 2: Single popstate listener (only one place in the whole app)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // 1. Hardware Back while minimized: expand back to full Portrait!
      const wasMinimized = isPlayerMinimizedRef.current;
      const isMiniExpand = wasMinimized && Boolean(e.state?.ytPlayer && !e.state?.minimized);

      if (isMiniExpand) {
        updatePlayerMinimized(false);
        return;
      }

      // 2. Hardware Back while fullscreen: exit fullscreen only
      const wasFullscreen = isPlayerFullscreenRef.current;
      const isFullscreenExit =
        (e.state?.ytPlayer && e.state?.fullscreen) ||
        wasFullscreen;

      if (isFullscreenExit) {
        // Exit fullscreen only: stay on PlayerView in Portrait. Do NOT close the player.
        updatePlayerFullscreen(false);
        try {
          if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
            if (typeof document.exitFullscreen === 'function') {
              document.exitFullscreen().catch(() => {});
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen();
            }
          }
        } catch {}
        try {
          if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          }
        } catch {}
        return;
      }

      // 3. Otherwise, pop means "close the player entirely": clear playingVideoId, return to KidHomeScreen.
      if (!e.state?.ytPlayer) {
        setActivePlaybackVideo(null);
        setShowDemoPlayer(false);
        updatePlayerFullscreen(false);
        updatePlayerMinimized(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [updatePlayerFullscreen, updatePlayerMinimized]);

  // Phase 8: Session Timer
  const sessionTimer = useSessionTimer(viewMode === 'kids');

  // Parent Dashboard Navigation Section
  const [dashboardSection, setDashboardSection] = useState<DashboardSectionId>('child');

  // Tools nav visibility (persisted in localStorage or enabled via ?tools or ?dev=1 or 5 taps on title)
  const [showTools, setShowTools] = useState<boolean>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('tools') || urlParams.get('dev') === '1') return true;
      return localStorage.getItem('youngtube_show_tools') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleTools = useCallback(() => {
    setShowTools((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('youngtube_show_tools', String(next));
      } catch (e) {
        console.warn('Failed to save showTools state', e);
      }
      if (!next && dashboardSection === 'tools') {
        setDashboardSection('child');
      }
      return next;
    });
  }, [dashboardSection]);

  useEffect(() => {
    if (!showTools && dashboardSection === 'tools') {
      setDashboardSection('child');
    }
  }, [showTools, dashboardSection]);

  // Check if main settings record exists
  const checkMainSettings = useCallback(async () => {
    try {
      const record = await db.settings.get('main');
      if (!record || !record.pinHash) {
        setShowOnboarding(true);
        setMainSettings(null);
      } else {
        // Ensure scheduleWindow and sessionLimitMinutes defaults if missing
        if (!record.scheduleWindow || typeof record.sessionLimitMinutes !== 'number') {
          const updatedRecord: Settings = {
            ...record,
            scheduleWindow: record.scheduleWindow || { start: '00:00', end: '23:59' },
            sessionLimitMinutes: record.sessionLimitMinutes ?? 60,
          };
          await db.settings.put(updatedRecord);
          setMainSettings(updatedRecord);
        } else {
          setMainSettings(record);
        }
        setShowOnboarding(false);
      }
    } catch {
      // Fallback
    }
  }, []);

  const runDatabaseTest = useCallback(async () => {
    setDbResult({ loading: true });
    const startTime = performance.now();
    try {
      // 1. Write test record
      const testId = '__test__';
      await db.settings.put({
        id: testId,
        blacklistWords: ['test_keyword'],
        sessionLimitMinutes: 45,
        preloadedListVersion: 1,
      });

      // 2. Read back and verify
      const retrieved = await db.settings.get(testId);
      if (!retrieved || retrieved.id !== testId) {
        throw new Error('فشل قراءة السجل التجريبي بعد كتابته مباشرة.');
      }

      // 3. Delete test record
      await db.settings.delete(testId);

      // 4. Verify deletion
      const afterDelete = await db.settings.get(testId);
      if (afterDelete) {
        throw new Error('فشل حذف السجل التجريبي من جدول الإعدادات.');
      }

      const durationMs = Math.round(performance.now() - startTime);

      setDbResult({
        loading: false,
        success: true,
        message: `تم التحقق بنجاح من قاعدة البيانات IndexedDB (Dexie v1). تم تنفيذ عمليات الكتابة، القراءة، والمسح بدقة خلال ${durationMs}ms.`,
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      });
    } catch (err) {
      setDbResult({
        loading: false,
        success: false,
        error: err instanceof Error ? err.message : 'حدث خطأ غير معروف أثناء فحص قاعدة البيانات.',
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      });
    }
  }, []);

  const runWorkerTest = useCallback(async () => {
    setWorkerResult({ loading: true });
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    try {
      const res = await fetch(WORKER_URL);
      if (!res.ok) {
        throw new Error(`خطأ في استجابة الـ Worker: كود ${res.status}`);
      }
      const data = await res.json();

      // Check if response was retrieved while offline or from Service Worker cache
      const isFromCache = !isOnline;

      setWorkerResult({
        loading: false,
        success: true,
        isFromCache,
        data,
        message: isFromCache ? 'من الكاش (بدون اتصال حالي)' : 'متصل ويرد بنجاح',
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      });
    } catch (err) {
      // Fallback check: attempt to read cached data or local fallback
      try {
        const fallbackRes = await fetch('/api/test-worker');
        const fallbackData = await fallbackRes.json();
        setWorkerResult({
          loading: false,
          success: true,
          isFromCache: !isOnline,
          data: fallbackData,
          message: !isOnline ? 'من الكاش (بدون اتصال حالي)' : 'متصل ويرد بنجاح (محلي)',
          timestamp: new Date().toLocaleTimeString('ar-EG'),
        });
      } catch {
        setWorkerResult({
          loading: false,
          success: false,
          error: err instanceof Error ? err.message : 'تعذر الاتصال بالـ Worker الخارجي.',
          timestamp: new Date().toLocaleTimeString('ar-EG'),
        });
      }
    }
  }, []);

  const runStoragePersistenceTest = useCallback(async () => {
    setStorageResult({ loading: true });
    const result = await checkAndRequestStoragePersistence();
    setStorageResult({
      loading: false,
      result,
    });
  }, []);

  useEffect(() => {
    checkMainSettings();
    // Persist storage on all modes (protects Dexie). Skip diagnostic Worker/DB tests in kids mode.
    void runStoragePersistenceTest();
  }, [checkMainSettings, runStoragePersistenceTest]);

  useEffect(() => {
    if (viewMode !== 'dev' && dashboardSection !== 'tools' && !isDevModeParam) return;
    runDatabaseTest();
    runWorkerTest();

    const handleConnectivityChange = () => {
      runWorkerTest();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [viewMode, isDevModeParam, runDatabaseTest, runWorkerTest]);

  // Dashboard first-run: populate Dexie without mounting the giant archive cards into React state
  useEffect(() => {
    if (viewMode !== 'dashboard') return;
    let cancelled = false;
    let timer: number | undefined;
    const delays = [0, 15_000, 45_000];
    let attempt = 0;

    const run = async () => {
      const ok = await ensureChannelsArchiveSynced();
      if (cancelled || ok) return;
      attempt += 1;
      if (attempt < delays.length) {
        timer = window.setTimeout(() => {
          void run();
        }, delays[attempt]);
      }
    };

    timer = window.setTimeout(() => {
      void run();
    }, delays[0]);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [viewMode]);

  // Open Dashboard handler
  const handleOpenDashboard = () => {
    if (isDashboardUnlocked) {
      setViewMode('dashboard');
    } else {
      setShowPinModal(true);
    }
  };

  const handleUnlockSuccess = () => {
    setIsDashboardUnlocked(true);
    setShowPinModal(false);
    setViewMode('dashboard');
    checkMainSettings();
  };

  const handleLockDashboard = () => {
    setIsDashboardUnlocked(false);
    setViewMode('kids');
  };

  // Finish first-run setup & navigate to KidHomeScreen
  const handleFinishFirstSetup = async () => {
    try {
      await db.settings.update('main', { hasCompletedFirstSetup: true });
      if (mainSettings) {
        setMainSettings({ ...mainSettings, hasCompletedFirstSetup: true });
      }
      setIsDashboardUnlocked(false);
      setViewMode('kids');
    } catch (err) {
      console.error('Failed to finish first setup:', err);
      setIsDashboardUnlocked(false);
      setViewMode('kids');
    }
  };

  // Reset Onboarding (for testing purposes)
  const handleResetForOnboardingTest = async () => {
    if (window.confirm('هل تريد إعادة تعيين إعدادات main واختبار شاشة Onboarding مجدداً؟')) {
      await db.settings.delete('main');
      setIsDashboardUnlocked(false);
      setViewMode('kids');
      checkMainSettings();
    }
  };

  // Phase 8: Session end determination (limit reached or outside schedule window)
  const isSessionEnded = sessionTimer.isLimitReached || !sessionTimer.isWithinScheduleWindow;

  // Session safety: if session ends while player (or mini-player) is open, ensure it fully closes
  useEffect(() => {
    if (isSessionEnded) {
      if (isPlayerMinimizedRef.current) {
        updatePlayerMinimized(false);
      }
      if (isPlayerFullscreenRef.current) {
        updatePlayerFullscreen(false);
      }
      setActivePlaybackVideo(null);
      setShowDemoPlayer(false);
    }
  }, [isSessionEnded, updatePlayerMinimized, updatePlayerFullscreen]);

  return (
    <div className="min-h-screen font-sans">
      {/* Onboarding Modal */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <Onboarding
            onComplete={async () => {
              setShowOnboarding(false);
              await checkMainSettings();
              // First-run flow: land directly on Dashboard with first-run guidance banner
              setIsDashboardUnlocked(true);
              setViewMode('dashboard');
            }}
          />
        </Suspense>
      )}

      {/* PIN Lock Modal */}
      <Suspense fallback={null}>
        <PinLockModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          onUnlockSuccess={handleUnlockSuccess}
        />
      </Suspense>

      {/* Phase 9: AdBlock Notice Modal */}
      {showAdBlockModal && (
        <Suspense fallback={null}>
          <AdBlockNotice
            mode="modal"
            onClose={() => setShowAdBlockModal(false)}
          />
        </Suspense>
      )}

      {/* Real Video Player Overlay */}
      {(activePlaybackVideo || showDemoPlayer) && (
        <PlayerView
          videoId={activePlaybackVideo?.videoId || 's6X_Q54_PBs'}
          videoTitle={activePlaybackVideo?.title || 'Alphablocks - مغامرة الحروف الإنجليزية والكلمات السحرية للأطفال'}
          channelTitle={activePlaybackVideo?.channelName || 'Alphablocks'}
          channelId={activePlaybackVideo?.channelId}
          onVideoHidden={handleVideoHidden}
          onChannelBlocked={handleBackfillSuccess}
          onClose={() => {
            updatePlayerMinimized(false);
            updatePlayerFullscreen(false);
            setActivePlaybackVideo(null);
            setShowDemoPlayer(false);
            if (typeof window !== 'undefined') {
              if (window.history.state?.minimized) {
                window.history.go(-2);
              } else if (window.history.state?.ytPlayer) {
                window.history.back();
              }
            }
          }}
          onEnded={() => {
            console.log('Video finished playing cleanly');
          }}
          forceStop={isSessionEnded || devForceStop}
          isFullscreen={isPlayerFullscreen}
          onEnterFullscreen={handlePlayerEnterFullscreen}
          onExitFullscreen={handlePlayerExitFullscreen}
          isMinimized={isPlayerMinimized}
          onEnterMinimized={handlePlayerEnterMinimized}
          onExitMinimized={handlePlayerExitMinimized}
        />
      )}

      {/* Background archive sync lives in ensureChannelsArchiveSynced (kids + dashboard).
          Do not mount hidden ChannelsCountCard/FilteringResultCard here — they put the
          full Worker payload into React state and double-fetch in some modes. */}

      {/* Phase 8: Full-Screen Session Takeover when limit reached or outside schedule window */}
      {isSessionEnded && viewMode !== 'dashboard' ? (
        <SessionEndScreen
          isLimitReached={sessionTimer.isLimitReached}
          isWithinScheduleWindow={sessionTimer.isWithinScheduleWindow}
          onParentUnlock={handleOpenDashboard}
          onResetForTesting={sessionTimer.resetTodayUsage}
        />
      ) : viewMode === 'kids' ? (
        <>
          {/* VIEW 0: REAL KID-FACING UI (Default View) */}
          <KidHomeScreen
            onOpenParentDashboard={handleOpenDashboard}
            onOpenDemoPlayer={handleOpenDemoPlayer}
            onSelectVideo={handleSelectVideo}
            refreshTrigger={channelsRefreshTrigger}
            suppressedVideoIds={suppressedVideoIds}
          />

          {/* If ?dev=1 was present in URL, provide quick dev switch floating badge */}
          {isDevModeParam && (
            <div className="fixed bottom-3 left-3 z-30 flex items-center gap-2">
              <button
                type="button"
                id="floating-open-demo-player-btn"
                onClick={handleOpenDemoPlayer}
                className="px-3 py-1.5 rounded-full bg-indigo-900/90 hover:bg-indigo-900 text-indigo-200 text-xs font-medium shadow-md backdrop-blur-sm transition cursor-pointer"
                title="شاشة المشغل التجريبية"
              >
                ▶ شاشة المشغل التجريبية
              </button>
              <button
                type="button"
                id="floating-force-stop-toggle-btn"
                onClick={() => setDevForceStop((prev) => !prev)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium shadow-md backdrop-blur-sm transition cursor-pointer ${
                  devForceStop
                    ? 'bg-rose-600 text-white'
                    : 'bg-stone-900/90 hover:bg-stone-800 text-amber-300'
                }`}
                title="اختبار إشارة إيقاف المشغل forceStop"
              >
                {devForceStop ? '⛔ forceStop: مفعّل' : '🧪 اختبار forceStop'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDashboardSection('tools');
                  setViewMode('dashboard');
                }}
                className="px-3 py-1.5 rounded-full bg-stone-900/80 hover:bg-stone-900 text-amber-300 text-xs font-mono shadow-md backdrop-blur-sm transition cursor-pointer"
                title="لوحة المطور وفحص الأنظمة (?dev=1)"
              >
                ⚙️ لوحة الفحص (?dev=1)
              </button>
            </div>
          )}
        </>
      ) : (
        <DashboardShell
          activeSection={dashboardSection}
          onSelectSection={setDashboardSection}
          onClose={() => setViewMode('kids')}
          onLock={handleLockDashboard}
          onOpenDemoPlayer={handleOpenDemoPlayer}
          hasIncompleteSetup={!mainSettings?.hasCompletedFirstSetup}
          showTools={showTools}
          onToggleTools={handleToggleTools}
          headerSlot={<PWAInstallButton />}
        >
          {/* First-Run Welcome / Guidance Banner */}
            {!mainSettings?.hasCompletedFirstSetup && (
              <div
                id="first-run-setup-banner"
                className="p-5 sm:p-6 rounded-3xl bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold">
                      قبل ما تبدأ، راجع القنوات والاهتمامات دي
                    </h2>
                    <p className="text-xs text-white/90 mt-0.5 max-w-xl leading-relaxed">
                      ألقِ نظرة سريعة على ملف الطفل، واهتماماته المفضلة، والقنوات وتصنيفاتها لضمان تجربة آمنة وممتعة 100%. عند الانتهاء اضغط زر البدء بالأسفل.
                    </p>
                  </div>
                </div>

                <button
                  id="first-run-top-start-btn"
                  type="button"
                  onClick={handleFinishFirstSetup}
                  className="px-5 py-2.5 rounded-2xl bg-white hover:bg-amber-50 text-amber-900 text-xs sm:text-sm font-bold shadow-sm transition shrink-0 flex items-center gap-2 cursor-pointer"
                >
                  <span>ابدأ استخدام الطفل</span>
                  <span>→</span>
                </button>
              </div>
            )}

          {/* SECTION: ملف الطفل */}
          {dashboardSection === 'child' && (
            <div id="section-child" className="space-y-6">
              <Suspense fallback={<SectionLoadingSkeleton />}>
                <ChildProfileSection onSaved={checkMainSettings} />
              </Suspense>
            </div>
          )}

          {/* SECTION: مواعيد التشغيل */}
          {dashboardSection === 'timer' && (
            <div id="section-timer" className="space-y-6">
              <Suspense fallback={<SectionLoadingSkeleton />}>
                <TimerSection
                  mainSettings={mainSettings}
                  sessionTimer={sessionTimer}
                  onSettingsSaved={checkMainSettings}
                  onOpenAdBlockModal={() => setShowAdBlockModal(true)}
                />
              </Suspense>
            </div>
          )}

          {/* SECTION: تعديل الذوق (Taste Shift) */}
          {dashboardSection === 'taste' && (
            <div id="section-taste" className="space-y-6">
              <Suspense fallback={<SectionLoadingSkeleton />}>
                <TasteShiftCard onSaved={checkMainSettings} />
              </Suspense>
            </div>
          )}

          {/* SECTION: تنظيم وتصنيف القنوات */}
          {dashboardSection === 'channels' && (
            <div id="section-channels" className="space-y-6">
              {/* Live Channels Archive Summary Card */}
              <Suspense fallback={<SectionLoadingSkeleton />}>
                <ChannelsCountCard
                  refreshTrigger={channelsRefreshTrigger}
                  onChannelsLoaded={handleChannelsLoaded}
                />
              </Suspense>

              <Suspense fallback={<SectionLoadingSkeleton />}>
                <ChannelCurationByCategory
                  onChannelChanged={() => setChannelsRefreshTrigger((prev) => prev + 1)}
                />
              </Suspense>
            </div>
          )}

          {/* SECTION: الفلترة والحجب */}
          {dashboardSection === 'filtering' && (
            <div id="section-filtering" className="space-y-6">
              {/* Filtering Engine Result & Protection Summary Card */}
              <Suspense fallback={<SectionLoadingSkeleton />}>
                <FilteringResultCard
                  channels={channelsData}
                  refreshTrigger={channelsRefreshTrigger}
                />
              </Suspense>

              <Suspense fallback={<SectionLoadingSkeleton />}>
                <FilteringTab
                  onFilterChanged={() => {
                    checkMainSettings();
                    setChannelsRefreshTrigger((prev) => prev + 1);
                  }}
                />
              </Suspense>
            </div>
          )}

          {/* SECTION: الفيديوهات المحفوظة */}
          {dashboardSection === 'saved' && (
            <div id="section-saved" className="space-y-6">
              <Suspense fallback={<SectionLoadingSkeleton />}>
                <SavedVideosTab onSelectVideo={handleSelectVideo} />
              </Suspense>
            </div>
          )}

          {/* Prominent Bottom Button for First-Run Setup */}
          {!mainSettings?.hasCompletedFirstSetup && (
            <div id="first-run-bottom-action" className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-300 text-center space-y-3 shadow-sm">
              <div className="space-y-1">
                <h4 className="text-base font-bold text-amber-950">
                  هل انتهيت من ضبط الإعدادات والقنوات؟
                </h4>
                <p className="text-xs text-amber-800">
                  يمكنك العودة إلى هنا في أي وقت لاحقاً بإدخال رمز الـ PIN عبر أيقونة القفل.
                </p>
              </div>
              <button
                id="first-run-bottom-start-btn"
                type="button"
                onClick={handleFinishFirstSetup}
                className="px-8 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-sm sm:text-base font-bold shadow-md hover:shadow-lg transition cursor-pointer inline-flex items-center gap-2"
              >
                <span>ابدأ استخدام الطفل →</span>
              </button>
            </div>
          )}

          {/* 7. SECTION: أدوات النظام والتشخيص */}
          {dashboardSection === 'tools' && (
            <div id="section-tools" className="space-y-6">
              {/* Helper Bar */}
              <div className="rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-700">سجل الإعدادات الثابت:</span>
                  <code className="font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-800">settings.get('main')</code>
                </div>
                <button
                  id="reset-onboarding-test-btn"
                  onClick={handleResetForOnboardingTest}
                  className="text-stone-600 hover:text-rose-600 underline font-semibold cursor-pointer"
                >
                  إعادة تجربة شاشة التهيئة (Reset Onboarding)
                </button>
              </div>

              {/* Status Dashboard Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Card 1: Database Test Card */}
              <div
                id="db-test-card"
                className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-stone-900">قاعدة البيانات</h2>
                        <span className="text-xs text-stone-400 font-mono">Dexie • v1</span>
                      </div>
                    </div>
                    <button
                      id="retest-db-btn"
                      onClick={runDatabaseTest}
                      disabled={dbResult.loading}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition disabled:opacity-50 cursor-pointer"
                      title="إعادة الفحص"
                    >
                      <RefreshCw className={`w-4 h-4 ${dbResult.loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Status Display */}
                  {dbResult.loading ? (
                    <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-500 animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-stone-400 shrink-0" />
                      جاري اختبار عمليات IndexedDB...
                    </div>
                  ) : dbResult.success ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-800 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>الكتابة والقراءة والحذف ناجحة</span>
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">{dbResult.message}</p>
                      <div className="text-[10px] text-emerald-700 font-mono pt-0.5">
                        آخر فحص: {dbResult.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>فشل في الفحص</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">{dbResult.error}</p>
                      <div className="text-[10px] text-amber-700 font-mono pt-0.5">
                        آخر فحص: {dbResult.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tables Checklist */}
                <div className="mt-4 pt-3 border-t border-stone-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600 mb-1.5">
                    <TableProperties className="w-3.5 h-3.5" />
                    <span>6 جداول سكيما معتمدة</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">settings</span>
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">channels</span>
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">usage</span>
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">feedCache</span>
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">interactions</span>
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">downloads</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Cloudflare Worker Card (with Cache vs Online distinction) */}
              <div
                id="worker-test-card"
                className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          workerResult.isFromCache
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-stone-900">الـ Worker</h2>
                        <span className="text-xs text-stone-400 font-mono">youngtube-worker</span>
                      </div>
                    </div>
                    <button
                      id="retest-worker-btn"
                      onClick={runWorkerTest}
                      disabled={workerResult.loading}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition disabled:opacity-50 cursor-pointer"
                      title="إعادة فحص الـ Worker"
                    >
                      <RefreshCw className={`w-4 h-4 ${workerResult.loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Worker Status Display with Cache Distinction */}
                  {workerResult.loading ? (
                    <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-500 animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-stone-400 shrink-0" />
                      جاري فحص استجابة الـ Worker...
                    </div>
                  ) : workerResult.success ? (
                    <div
                      className={`p-3.5 rounded-xl border space-y-1.5 ${
                        workerResult.isFromCache
                          ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex items-center gap-1.5 font-semibold text-xs ${
                            workerResult.isFromCache ? 'text-amber-800' : 'text-emerald-800'
                          }`}
                        >
                          {workerResult.isFromCache ? (
                            <>
                              <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>من الكاش (بدون اتصال حالي)</span>
                            </>
                          ) : (
                            <>
                              <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>متصل ويرد بنجاح</span>
                            </>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            workerResult.isFromCache
                              ? 'bg-amber-200/80 text-amber-900'
                              : 'bg-emerald-200/80 text-emerald-900'
                          }`}
                        >
                          {workerResult.isFromCache ? 'Cache Hit' : 'Network Live'}
                        </span>
                      </div>

                      <pre
                        className={`text-[10px] font-mono p-2 rounded overflow-x-auto border ${
                          workerResult.isFromCache
                            ? 'bg-white/80 text-amber-950 border-amber-100'
                            : 'bg-white/80 text-emerald-950 border-emerald-100'
                        }`}
                      >
                        {JSON.stringify(workerResult.data, null, 2)}
                      </pre>
                      <div
                        className={`text-[10px] font-mono pt-0.5 ${
                          workerResult.isFromCache ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        آخر استجابة: {workerResult.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>تعذر الاتصال بالـ Worker</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">{workerResult.error}</p>
                      <div className="text-[10px] text-amber-700 font-mono pt-0.5">
                        آخر محاولة: {workerResult.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100">
                  <div className="text-[11px] text-stone-500 truncate">
                    <span className="font-semibold text-stone-600">الرابط: </span>
                    <span className="font-mono text-[10px]">{WORKER_URL}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Storage Persistence Card */}
              <div
                id="storage-persistence-card"
                className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 shrink-0">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-stone-900">التخزين الدائم</h2>
                        <span className="text-xs text-stone-400 font-mono">storage.persist()</span>
                      </div>
                    </div>
                    <button
                      id="retest-storage-btn"
                      onClick={runStoragePersistenceTest}
                      disabled={storageResult.loading}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition disabled:opacity-50 cursor-pointer"
                      title="إعادة طلب التخزين الدائم"
                    >
                      <RefreshCw className={`w-4 h-4 ${storageResult.loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Storage Status Display */}
                  {storageResult.loading ? (
                    <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-500 animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-stone-400 shrink-0" />
                      جاري فحص صلاحية التخزين الدائم...
                    </div>
                  ) : storageResult.result?.status === 'granted' ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-800 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>الحالة: ممنوحة (Granted)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 text-emerald-900">
                          محمي
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-relaxed">
                        {storageResult.result.message}
                      </p>
                      {storageResult.result.quota && (
                        <div className="text-[10px] text-emerald-800 bg-white/60 p-2 rounded border border-emerald-100">
                          المساحة: {storageResult.result.quota.quotaMb} MB (المستخدم: {storageResult.result.quota.usageMb} MB)
                        </div>
                      )}
                      <div className="text-[10px] text-emerald-700 font-mono pt-0.5">
                        آخر فحص: {storageResult.result.timestamp}
                      </div>
                    </div>
                  ) : storageResult.result?.status === 'denied' ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>الحالة: مرفوضة (Best-Effort)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900">
                          افتراضي
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        {storageResult.result.message}
                      </p>
                      {storageResult.result.quota && (
                        <div className="text-[10px] text-amber-800 bg-white/60 p-2 rounded border border-amber-100">
                          المساحة: {storageResult.result.quota.quotaMb} MB (المستخدم: {storageResult.result.quota.usageMb} MB)
                        </div>
                      )}
                      <div className="text-[10px] text-amber-700 font-mono pt-0.5">
                        آخر فحص: {storageResult.result.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-stone-700 text-xs">
                          <AlertCircle className="w-4 h-4 text-stone-500 shrink-0" />
                          <span>الحالة: غير مدعومة (Unsupported)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-700">
                          غير متاح
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 leading-relaxed">
                        {storageResult.result?.message}
                      </p>
                      <div className="text-[10px] text-stone-500 font-mono pt-0.5">
                        آخر فحص: {storageResult.result?.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100">
                  <div className="text-[11px] text-stone-500">
                    <span className="font-semibold text-stone-600">سياسة البيانات: </span>
                    <span>حماية قاعدة بيانات Dexie والملفات من الحذف التلقائي</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Timer Test Card (Phase 8: Timers) */}
              <div className="md:col-span-2 lg:col-span-3">
                <Suspense fallback={null}>
                  <TimerTestCard
                    secondsUsedToday={sessionTimer.secondsUsedToday}
                    sessionLimitMinutes={sessionTimer.sessionLimitMinutes}
                    isLimitReached={sessionTimer.isLimitReached}
                    isWithinScheduleWindow={sessionTimer.isWithinScheduleWindow}
                    scheduleWindow={sessionTimer.scheduleWindow}
                    onResetToday={sessionTimer.resetTodayUsage}
                    onSimulateLimit={sessionTimer.simulateLimitReached}
                  />
                </Suspense>
              </div>
            </div>

            {/* Stage 5: Temporary Admin Tool for Backfilling Channels */}
            <Suspense fallback={null}>
              <TempAdminTool
                onBackfillSuccess={handleBackfillSuccess}
              />
            </Suspense>
          </div>
        )}
      </DashboardShell>
    )}

      <OfflineIndicator />
    </div>
  );
}
