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
import SessionEndScreen from './components/SessionEndScreen';
import TimerTestCard from './components/TimerTestCard';
import AdBlockNotice from './components/AdBlockNotice';
import KidHomeScreen from './screens/KidHomeScreen';
import PlayerView from './screens/PlayerView';
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

  // Stable callback when a video is marked hidden in player test
  const handleVideoHidden = useCallback(() => {
    // Optionally trigger filtering card refresh
    setChannelsRefreshTrigger((prev) => prev + 1);
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
    setPlayingVideoId(null);
    try {
      // If current history entry is our player marker, go back one step
      if (window.history.state?.ytPlayer) {
        window.history.back();
      }
    } catch {
      // ignore
    }
  }, []);

  // Hardware / browser Back while player is open → feed, not app exit
  useEffect(() => {
    const onPopState = () => {
      setPlayingVideoId((current) => {
        if (current) return null;
        return current;
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Blacklist words in Dashboard
  const [newWord, setNewWord] = useState('');

  // Phase 8: Session Timer Hook & Timer Settings States
  const sessionTimer = useSessionTimer();
  const [timerLimitInput, setTimerLimitInput] = useState<number>(60);
  const [scheduleStartInput, setScheduleStartInput] = useState<string>('00:00');
  const [scheduleEndInput, setScheduleEndInput] = useState<string>('23:59');
  const [timerSettingsSaved, setTimerSettingsSaved] = useState(false);

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
    runDatabaseTest();
    runWorkerTest();
    runStoragePersistenceTest();

    // Listen to online / offline events to immediately re-check worker cache status
    const handleConnectivityChange = () => {
      runWorkerTest();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [checkMainSettings, runDatabaseTest, runWorkerTest, runStoragePersistenceTest]);

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

  // Blacklist words handlers
  const handleAddBlacklistWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !mainSettings) return;
    const word = newWord.trim();
    if (mainSettings.blacklistWords.includes(word)) return;

    const updatedWords = [...mainSettings.blacklistWords, word];
    await db.settings.update('main', { blacklistWords: updatedWords });
    setMainSettings({ ...mainSettings, blacklistWords: updatedWords });
    setNewWord('');
  };

  const handleRemoveBlacklistWord = async (wordToRemove: string) => {
    if (!mainSettings) return;
    const updatedWords = mainSettings.blacklistWords.filter((w) => w !== wordToRemove);
    await db.settings.update('main', { blacklistWords: updatedWords });
    setMainSettings({ ...mainSettings, blacklistWords: updatedWords });
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

  return (
    <div className={`min-h-screen font-sans ${viewMode === 'kids' ? 'bg-[#FAF8F5]' : 'bg-slate-50 text-slate-800 flex flex-col justify-between p-4 sm:p-8'}`}>
      {/* Onboarding Modal */}
      {showOnboarding && (
        <Onboarding
          onComplete={() => {
            setShowOnboarding(false);
            checkMainSettings();
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

      {/* Phase 9.5: Full-Screen Player View Takeover */}
      {playingVideoId && (
        <PlayerView
          videoId={playingVideoId}
          onBack={closePlayer}
          onVideoHidden={handleVideoHidden}
        />
      )}

      {/* Background Channels & Filtering Sync (Preserves stable callbacks & Dexie updates when not in dev mode) */}
      {viewMode !== 'dev' && (
        <div className="hidden" aria-hidden="true">
          <ChannelsCountCard
            refreshTrigger={channelsRefreshTrigger}
            onChannelsLoaded={handleChannelsLoaded}
          />
          <FilteringResultCard
            channels={channelsData}
            refreshTrigger={channelsRefreshTrigger}
          />
        </div>
      )}

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
                    فلترة فورية لعناوين الفيديوهات
                  </span>
                </div>
              </div>

              {/* Blacklist Management Section */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>إدارة الكلمات المحظورة (Blacklist Words)</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  أي فيديو يحتوي عنوانه على هذه الكلمات سيتم حجبه تلقائياً عن طفلك.
                </p>

                <form onSubmit={handleAddBlacklistWord} className="flex gap-2 max-w-md mb-4">
                  <input
                    id="new-blacklist-word-input"
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    placeholder="أضف كلمة لحظره..."
                    className="grow p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    id="add-blacklist-word-btn"
                    type="submit"
                    disabled={!newWord.trim()}
                    className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة</span>
                  </button>
                </form>

                <div className="flex flex-wrap gap-2">
                  {mainSettings?.blacklistWords && mainSettings.blacklistWords.length > 0 ? (
                    mainSettings.blacklistWords.map((word, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
                      >
                        <span>{word}</span>
                        <button
                          onClick={() => handleRemoveBlacklistWord(word)}
                          className="text-slate-400 hover:text-red-500 transition"
                          title="حذف الكلمة"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 italic">
                      لا توجد كلمات محظورة حالياً. يمكنك إضافة كلمات مثل: رعب، تحدي، مقالب...
                    </div>
                  )}
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
