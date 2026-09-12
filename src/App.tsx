import React, { useEffect, useState, useCallback } from 'react';
import db, { Settings } from './db';
import { WORKER_URL } from './config';
import { checkAndRequestStoragePersistence, StoragePersistenceResult } from './storage';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import Onboarding from './components/Onboarding';
import PinLockModal from './components/PinLockModal';
import ChannelsCountCard from './components/ChannelsCountCard';
import FilteringResultCard from './components/FilteringResultCard';
import TempAdminTool from './components/TempAdminTool';
import PlayerTestCard from './components/PlayerTestCard';
import { useSessionTimer } from './hooks/useSessionTimer';
import { ensureChannelsArchiveSynced } from './filtering';
import SessionEndScreen from './components/SessionEndScreen';
import TimerTestCard from './components/TimerTestCard';
import AdBlockNotice from './components/AdBlockNotice';
import KidHomeScreen from './screens/KidHomeScreen';
import PlayerView from './screens/PlayerView';
import { ChildProfileSection } from './components/ChildProfileSection';
import { ChannelCurationByCategory } from './components/ChannelCurationByCategory';
import { FilteringTab } from './components/FilteringTab';
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
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [showAdBlockModal, setShowAdBlockModal] = useState(false);
  const [suppressedVideoIds, setSuppressedVideoIds] = useState<string[]>([]);

  // Player navigation: push history so Android/browser Back returns to feed (not exit app)
  const openPlayer = useCallback((videoId: string) => {
    setPlayingVideoId(videoId);
    try {
      const state = window.history.state;
      // Avoid stacking duplicate player entries for the same open session
      if (!state || state.ytPlayer !== true) {
        window.history.pushState(
          { ...(state || {}), ytPlayer: true, videoId },
          '',
          window.location.href
        );
      } else {
        window.history.replaceState(
          { ...(state || {}), ytPlayer: true, videoId },
          '',
          window.location.href
        );
      }
    } catch {
      // ignore history errors in locked-down webviews
    }
  }, []);

  const closePlayer = useCallback(() => {
    try {
      // If current history entry is our player marker, go back one step
      // The popstate handler is the single place that clears playingVideoId
      if (window.history.state?.ytPlayer) {
        window.history.back();
        return;
      }
    } catch {
      // ignore
    }
    setPlayingVideoId(null);
  }, []);

  // Hardware / browser Back while player is open → feed, not app exit
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const state = e.state ?? window.history.state;
      if (!state?.ytPlayer) {
        setPlayingVideoId(null);
      } else if (state.videoId) {
        setPlayingVideoId(state.videoId);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Phase 8: Session Timer — count watch time only, not feed browsing
  const sessionTimer = useSessionTimer(!!playingVideoId && viewMode === 'kids');
  const [timerLimitInput, setTimerLimitInput] = useState<number>(60);
  const [scheduleStartInput, setScheduleStartInput] = useState<string>('00:00');
  const [scheduleEndInput, setScheduleEndInput] = useState<string>('23:59');
  const [timerSettingsSaved, setTimerSettingsSaved] = useState(false);

  // Setup Screen Part A & B: Collapsible Dashboard Sections
  const [isChildProfileOpen, setIsChildProfileOpen] = useState(true);
  const [isChannelCurationOpen, setIsChannelCurationOpen] = useState(true);
  const [isFilteringOpen, setIsFilteringOpen] = useState(true);

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
          setTimerLimitInput(updatedRecord.sessionLimitMinutes ?? 60);
          setScheduleStartInput(updatedRecord.scheduleWindow?.start || '00:00');
          setScheduleEndInput(updatedRecord.scheduleWindow?.end || '23:59');
        } else {
          setMainSettings(record);
          setTimerLimitInput(record.sessionLimitMinutes ?? 60);
          setScheduleStartInput(record.scheduleWindow?.start || '00:00');
          setScheduleEndInput(record.scheduleWindow?.end || '23:59');
        }
        setShowOnboarding(false);
      }
    } catch {
      // Fallback
    }
  }, []);

  const handleSaveTimerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainSettings) return;
    const updated = {
      ...mainSettings,
      sessionLimitMinutes: Number(timerLimitInput) || 60,
      scheduleWindow: {
        start: scheduleStartInput || '00:00',
        end: scheduleEndInput || '23:59',
      },
    };
    await db.settings.put(updated);
    setMainSettings(updated);
    await sessionTimer.refreshSettings();
    setTimerSettingsSaved(true);
    setTimeout(() => setTimerSettingsSaved(false), 2000);
  };

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
    if (viewMode !== 'dev' && !isDevModeParam) return;
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

  // Force-close open player if session ends while child is watching.
  // replaceState (not history.back) so the next Android Back does not exit the PWA.
  useEffect(() => {
    if (isSessionEnded && viewMode !== 'dashboard' && playingVideoId) {
      setPlayingVideoId(null);
      try {
        const state = window.history.state;
        if (state?.ytPlayer) {
          window.history.replaceState(
            { ...(state || {}), ytPlayer: false },
            '',
            window.location.href
          );
        }
      } catch {
        // ignore
      }
    }
  }, [isSessionEnded, viewMode, playingVideoId]);

  return (
    <div className={`min-h-screen font-sans ${viewMode === 'kids' ? 'bg-[#FAF8F5]' : 'bg-slate-50 text-slate-800 flex flex-col justify-between p-4 sm:p-8'}`}>
      {/* Onboarding Modal */}
      {showOnboarding && (
        <Onboarding
          onComplete={async () => {
            setShowOnboarding(false);
            await checkMainSettings();
            // First-run flow: land directly on Dashboard with first-run guidance banner
            setIsDashboardUnlocked(true);
            setViewMode('dashboard');
          }}
        />
      )}

      {/* PIN Lock Modal */}
      <PinLockModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onUnlockSuccess={handleUnlockSuccess}
      />

      {/* Phase 9: AdBlock Notice Modal */}
      {showAdBlockModal && (
        <AdBlockNotice
          mode="modal"
          onClose={() => setShowAdBlockModal(false)}
        />
      )}

      {/* Phase 9.5: Full-Screen Player View Takeover (closed if session ends) */}
      {!isSessionEnded && playingVideoId && (
        <PlayerView
          videoId={playingVideoId}
          onBack={closePlayer}
          onVideoHidden={handleVideoHidden}
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
            onPlayVideo={openPlayer}
            onOpenParentDashboard={handleOpenDashboard}
            refreshTrigger={channelsRefreshTrigger}
            suppressedVideoIds={suppressedVideoIds}
          />

          {/* If ?dev=1 was present in URL, provide quick dev switch floating badge */}
          {isDevModeParam && (
            <div className="fixed bottom-3 left-3 z-30">
              <button
                type="button"
                onClick={() => setViewMode('dev')}
                className="px-3 py-1.5 rounded-full bg-stone-900/80 hover:bg-stone-900 text-amber-300 text-xs font-mono shadow-md backdrop-blur-xs transition cursor-pointer"
                title="لوحة المطور وفحص الأنظمة (?dev=1)"
              >
                ⚙️ لوحة الفحص (?dev=1)
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* App Header for Parent Dashboard / Dev Mode */}
          <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-sm shadow-amber-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">يوتيوب الأطفال</h1>
                <p className="text-xs text-slate-500">
                  {viewMode === 'dashboard'
                    ? 'لوحة تحكم الوالدين (الداشبورد)'
                    : 'لوحة فحص النظام والمطور (?dev=1)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="back-to-kids-header-btn"
                type="button"
                onClick={() => setViewMode('kids')}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>شاشة الأطفال</span>
              </button>

              {viewMode === 'dashboard' ? (
                <button
                  id="lock-dashboard-btn"
                  onClick={handleLockDashboard}
                  className="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>قفل الداشبورد</span>
                </button>
              ) : null}

              <PWAInstallButton />
            </div>
          </header>

          {/* Main Content Area */}
          <main className="max-w-5xl w-full mx-auto my-8 space-y-6">
            {/* VIEW 1: PARENT DASHBOARD */}
            {viewMode === 'dashboard' ? (
          <div id="parent-dashboard-view" className="space-y-6">
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

            <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      لوحة تحكم الوالدين (الداشبورد مفتوح)
                    </h2>
                    <p className="text-xs text-slate-500">
                      إدارة أمان التطبيق والكلمات المحظورة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('kids')}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                  >
                    العودة لشاشة الأطفال
                  </button>
                  {isDevModeParam && (
                    <button
                      onClick={() => setViewMode('dev')}
                      className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-semibold transition cursor-pointer"
                    >
                      أدوات المطور (?dev=1)
                    </button>
                  )}
                  <button
                    onClick={handleLockDashboard}
                    className="px-3.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Lock className="w-3 h-3" />
                    <span>قفل الآن</span>
                  </button>
                </div>
              </div>

              {/* Status Grid in Dashboard */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-400 block">حالة قفل الـ PIN</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                    <KeyRound className="w-4 h-4 text-sky-600" />
                    <span>مُفعّل (مشفر بـ SHA-256)</span>
                  </div>
                  <span className="text-[11px] text-emerald-600 block">
                    المحاولات الفاشلة: {mainSettings?.pinAttempts || 0} من 5
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-400 block">سؤال الأمان السري</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span className="truncate">{mainSettings?.securityQuestion || 'مُعد'}</span>
                  </div>
                  <span className="text-[11px] text-indigo-600 block">
                    الإجابة مشفرة (Hash)
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-400 block">الكلمات المحظورة (Blacklist)</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>{mainSettings?.blacklistWords?.length || 0} كلمات مسجلة</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    مُدارة عبر قسم الفلترة والحجب بالأسفل
                  </span>
                </div>
              </div>

              {/* Phase 8: Screen Time & Schedule Management Section */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>مواعيد التشغيل والحد اليومي (Screen Time & Schedule)</span>
                  </h3>
                  {timerSettingsSaved && (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      تم حفظ الإعدادات بنجاح ✅
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  تحديد المدة اليومية القصوى المسموحة وساعات المشاهدة المصرح بها للطفل.
                </p>

                <form onSubmit={handleSaveTimerSettings} className="space-y-4 max-w-xl">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Session Limit Minutes */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        الحد اليومي (بالدقائق)
                      </label>
                      <input
                        id="session-limit-input"
                        type="number"
                        min="1"
                        max="720"
                        value={timerLimitInput}
                        onChange={(e) => setTimerLimitInput(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400">الافتراضي: 60 دقيقة</span>
                    </div>

                    {/* Window Start */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        بداية الوقت المسموح
                      </label>
                      <input
                        id="schedule-start-input"
                        type="time"
                        value={scheduleStartInput}
                        onChange={(e) => setScheduleStartInput(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400">مثل: 08:00</span>
                    </div>

                    {/* Window End */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        نهاية الوقت المسموح
                      </label>
                      <input
                        id="schedule-end-input"
                        type="time"
                        value={scheduleEndInput}
                        onChange={(e) => setScheduleEndInput(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400">مثل: 20:00</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      id="save-timer-settings-btn"
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>حفظ إعدادات الوقت</span>
                    </button>

                    <button
                      type="button"
                      onClick={sessionTimer.resetTodayUsage}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                      title="تصفير عداد اليوم للاختبار"
                    >
                      تصفير استهلاك اليوم (الحالي: {sessionTimer.secondsUsedToday} ثانية)
                    </button>
                  </div>
                </form>
              </div>

              {/* Phase 9: Ad-blocking DNS Notice Permanent Row */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-sky-50/70 border border-sky-200">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-sky-600" />
                      <span>حجب إعلانات يوتيوب (Private DNS)</span>
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      حجب غالبية الإعلانات مجاناً على مستوى الجهاز بالكامل (أندرويد و iOS) بدون تطبيقات إضافية.
                    </p>
                  </div>
                  <button
                    id="open-adblock-notice-btn"
                    type="button"
                    onClick={() => setShowAdBlockModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span>عرض إرشادات ورمز QR</span>
                  </button>
                </div>
              </div>

              {/* Developer / Testing Helper */}
              <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                <span>سجل الإعدادات الثابت: <code className="font-mono">settings.get('main')</code></span>
                <button
                  id="reset-onboarding-test-btn"
                  onClick={handleResetForOnboardingTest}
                  className="text-slate-500 hover:text-red-600 underline text-[11px]"
                >
                  إعادة تجربة شاشة التهيئة (Reset Onboarding)
                </button>
              </div>
            </div>

            {/* Setup Screen Part A: Child Profile & Interests */}
            <div id="child-profile-card" className="rounded-3xl border border-amber-200 bg-white p-6 shadow-xs">
              <button
                type="button"
                onClick={() => setIsChildProfileOpen(!isChildProfileOpen)}
                className="w-full flex items-center justify-between text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      ملف الطفل والاهتمامات (Child Profile & Interests)
                    </h3>
                    <p className="text-xs text-slate-500">
                      تخصيص الاسم، العمر، والاهتمامات الإيجابية والسلبية للطفل
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-xs font-medium hidden sm:inline">
                    {isChildProfileOpen ? 'طي القسم' : 'توسيع القسم'}
                  </span>
                  {isChildProfileOpen ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>
              </button>

              {isChildProfileOpen && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <ChildProfileSection onSaved={checkMainSettings} />
                </div>
              )}
            </div>

            {/* Setup Screen Part A: Channel Curation & YouTube Search */}
            <div id="channel-curation-card" className="rounded-3xl border border-sky-200 bg-white p-6 shadow-xs">
              <button
                type="button"
                onClick={() => setIsChannelCurationOpen(!isChannelCurationOpen)}
                className="w-full flex items-center justify-between text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      تنظيم وتصنيف القنوات والبحث (Channel Curation & Search)
                    </h3>
                    <p className="text-xs text-slate-500">
                      البحث بمفتاح YouTube الخاص بالعائلة، تنظيم القنوات حسب الأقسام، وتفعيل أو تعطيل أي قناة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-xs font-medium hidden sm:inline">
                    {isChannelCurationOpen ? 'طي القسم' : 'توسيع القسم'}
                  </span>
                  {isChannelCurationOpen ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>
              </button>

              {isChannelCurationOpen && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <ChannelCurationByCategory
                    onChannelChanged={() => setChannelsRefreshTrigger((prev) => prev + 1)}
                  />
                </div>
              )}
            </div>

            {/* Setup Screen Part B: Filtering Tab (Blocked Channels, Hidden Videos, Blacklist Words) */}
            <div id="filtering-tab-card" className="rounded-3xl border border-rose-200 bg-white p-6 shadow-xs">
              <button
                type="button"
                onClick={() => setIsFilteringOpen(!isFilteringOpen)}
                className="w-full flex items-center justify-between text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      إدارة الفلترة والحجب (Filtering & Blocklist)
                    </h3>
                    <p className="text-xs text-slate-500">
                      الكلمات المحظورة، القنوات الموقوفة، والفيديوهات المخفية يدوياً
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-xs font-medium hidden sm:inline">
                    {isFilteringOpen ? 'طي القسم' : 'توسيع القسم'}
                  </span>
                  {isFilteringOpen ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>
              </button>

              {isFilteringOpen && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <FilteringTab
                    onFilterChanged={() => {
                      checkMainSettings();
                      setChannelsRefreshTrigger((prev) => prev + 1);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Prominent Bottom Button for First-Run Setup */}
            {!mainSettings?.hasCompletedFirstSetup && (
              <div id="first-run-bottom-action" className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-300 text-center space-y-3 shadow-xs">
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
          </div>
        ) : (
          /* VIEW 2: STATUS & CHECKS DASHBOARD (Dev mode ?dev=1) */
          <>
            {/* Dev Mode Banner */}
            <div
              id="dev-mode-banner"
              className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-amber-950">
                    وضع المطور والتشخيص (?dev=1)
                  </h2>
                  <p className="text-xs text-amber-800 mt-0.5">
                    هذه الواجهة مخصصة لفحص واختبار الأنظمة وقواعد البيانات والمشغل.
                  </p>
                </div>
              </div>

              <button
                id="back-to-kids-btn"
                type="button"
                onClick={() => setViewMode('kids')}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
              >
                العودة لواجهة الأطفال الرئيسية ✨
              </button>
            </div>

            {/* Parent Onboarding & Settings Banner */}
            <div
              id="settings-main-banner"
              className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 sm:p-5 text-indigo-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-indigo-950">
                      قفل الوالدين وسجل الإعدادات (settings: 'main')
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200 text-indigo-900">
                      مرحلة 4 مكتملة
                    </span>
                  </div>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    الـ PIN وسؤال الأمان مشفران بـ SHA-256، والعداد يغلق بعد 5 محاولات متتالية.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="header-open-dashboard-btn"
                  onClick={handleOpenDashboard}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>فتح الداشبورد</span>
                </button>
              </div>
            </div>

            {/* PWA Architecture Banner */}
            <div
              id="pwa-architecture-banner"
              className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-sky-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                <span>
                  <strong>Workbox Runtime Caching:</strong> استراتيجية NetworkFirst لدومين workers.dev مع كاش "worker-api-cache" (بدون اتصال fallback فوري).
                </span>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-md font-semibold bg-sky-200/80 text-sky-800 text-[11px]">
                Workbox Active
              </span>
            </div>

            {/* Status Dashboard Grid (4 Cards: Database, Worker, Storage, Channels Count) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Database Test Card */}
              <div
                id="db-test-card"
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">قاعدة البيانات</h2>
                        <span className="text-xs text-slate-500 font-mono">Dexie • v1</span>
                      </div>
                    </div>
                    <button
                      id="retest-db-btn"
                      onClick={runDatabaseTest}
                      disabled={dbResult.loading}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                      title="إعادة الفحص"
                    >
                      <RefreshCw className={`w-4 h-4 ${dbResult.loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Status Display */}
                  {dbResult.loading ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                      جاري اختبار عمليات IndexedDB...
                    </div>
                  ) : dbResult.success ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-800 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>الكتابة والقراءة والحذف ناجحة</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">{dbResult.message}</p>
                      <div className="text-[10px] text-emerald-600 font-mono pt-0.5">
                        آخر فحص: {dbResult.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>فشل في الفحص</span>
                      </div>
                      <p className="text-[11px] text-amber-700 leading-relaxed">{dbResult.error}</p>
                      <div className="text-[10px] text-amber-600 font-mono pt-0.5">
                        آخر فحص: {dbResult.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tables Checklist */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mb-1.5">
                    <TableProperties className="w-3.5 h-3.5" />
                    <span>6 جداول سكيما معتمدة</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">settings</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">channels</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">usage</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">feedCache</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">interactions</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">downloads</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Cloudflare Worker Card (with Cache vs Online distinction) */}
              <div
                id="worker-test-card"
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          workerResult.isFromCache
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-sky-50 text-sky-600'
                        }`}
                      >
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">الـ Worker</h2>
                        <span className="text-xs text-slate-500 font-mono">youngtube-worker</span>
                      </div>
                    </div>
                    <button
                      id="retest-worker-btn"
                      onClick={runWorkerTest}
                      disabled={workerResult.loading}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                      title="إعادة فحص الـ Worker"
                    >
                      <RefreshCw className={`w-4 h-4 ${workerResult.loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Worker Status Display with Cache Distinction */}
                  {workerResult.loading ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                      جاري فحص استجابة الـ Worker...
                    </div>
                  ) : workerResult.success ? (
                    <div
                      className={`p-3.5 rounded-xl border space-y-1.5 ${
                        workerResult.isFromCache
                          ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
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
                          workerResult.isFromCache ? 'text-amber-700' : 'text-emerald-600'
                        }`}
                      >
                        آخر استجابة: {workerResult.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>تعذر الاتصال بالـ Worker</span>
                      </div>
                      <p className="text-[11px] text-amber-700 leading-relaxed">{workerResult.error}</p>
                      <div className="text-[10px] text-amber-600 font-mono pt-0.5">
                        آخر محاولة: {workerResult.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500 truncate">
                    <span className="font-semibold text-slate-600">الرابط: </span>
                    <span className="font-mono text-[10px]">{WORKER_URL}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Storage Persistence Card */}
              <div
                id="storage-persistence-card"
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">التخزين الدائم</h2>
                        <span className="text-xs text-slate-500 font-mono">storage.persist()</span>
                      </div>
                    </div>
                    <button
                      id="retest-storage-btn"
                      onClick={runStoragePersistenceTest}
                      disabled={storageResult.loading}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                      title="إعادة طلب التخزين الدائم"
                    >
                      <RefreshCw className={`w-4 h-4 ${storageResult.loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Storage Status Display */}
                  {storageResult.loading ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                      جاري فحص صلاحية التخزين الدائم...
                    </div>
                  ) : storageResult.result?.status === 'granted' ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-800 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>الحالة: ممنوحة (Granted)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 text-emerald-900">
                          محمي
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        {storageResult.result.message}
                      </p>
                      {storageResult.result.quota && (
                        <div className="text-[10px] text-emerald-800 bg-white/60 p-2 rounded border border-emerald-100">
                          المساحة: {storageResult.result.quota.quotaMb} MB (المستخدم: {storageResult.result.quota.usageMb} MB)
                        </div>
                      )}
                      <div className="text-[10px] text-emerald-600 font-mono pt-0.5">
                        آخر فحص: {storageResult.result.timestamp}
                      </div>
                    </div>
                  ) : storageResult.result?.status === 'denied' ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>الحالة: مرفوضة (Best-Effort)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900">
                          افتراضي
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        {storageResult.result.message}
                      </p>
                      {storageResult.result.quota && (
                        <div className="text-[10px] text-amber-800 bg-white/60 p-2 rounded border border-amber-100">
                          المساحة: {storageResult.result.quota.quotaMb} MB (المستخدم: {storageResult.result.quota.usageMb} MB)
                        </div>
                      )}
                      <div className="text-[10px] text-amber-600 font-mono pt-0.5">
                        آخر فحص: {storageResult.result.timestamp}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700 text-xs">
                          <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                          <span>الحالة: غير مدعومة (Unsupported)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                          غير متاح
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {storageResult.result?.message}
                      </p>
                      <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                        آخر فحص: {storageResult.result?.timestamp}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">سياسة البيانات: </span>
                    <span>حماية قاعدة بيانات Dexie والملفات من الحذف التلقائي</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Channels Count Card (Stage 5) */}
              <ChannelsCountCard
                refreshTrigger={channelsRefreshTrigger}
                onChannelsLoaded={handleChannelsLoaded}
              />

              {/* Card 5: Filtering Result Card (Part 2) */}
              <FilteringResultCard
                channels={channelsData}
                refreshTrigger={channelsRefreshTrigger}
              />

              {/* Card 6: Player Test Card (Phase 7: Player) */}
              <div className="md:col-span-2 lg:col-span-3">
                <PlayerTestCard
                  onVideoHidden={handleVideoHidden}
                />
              </div>

              {/* Card 7: Timer Test Card (Phase 8: Timers) */}
              <div className="md:col-span-2 lg:col-span-3">
                <TimerTestCard
                  secondsUsedToday={sessionTimer.secondsUsedToday}
                  sessionLimitMinutes={sessionTimer.sessionLimitMinutes}
                  isLimitReached={sessionTimer.isLimitReached}
                  isWithinScheduleWindow={sessionTimer.isWithinScheduleWindow}
                  scheduleWindow={sessionTimer.scheduleWindow}
                  onResetToday={sessionTimer.resetTodayUsage}
                  onSimulateLimit={sessionTimer.simulateLimitReached}
                />
              </div>
            </div>

            {/* Stage 5: Temporary Admin Tool for Backfilling Channels */}
            <TempAdminTool
              onBackfillSuccess={handleBackfillSuccess}
            />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center py-4 border-t border-slate-200 text-xs text-slate-400">
        يوتيوب الأطفال PWA — المرحلة 9: إرشادات حجب الإعلانات (Ad-blocking DNS Notice)
      </footer>
        </>
      )}

      <OfflineIndicator />
    </div>
  );
}
