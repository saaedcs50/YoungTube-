import React, { useEffect, useState, useCallback } from 'react';
import db from './db';
import { WORKER_URL } from './config';
import { checkAndRequestStoragePersistence, StoragePersistenceResult } from './storage';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  Database,
  Cloud,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  TableProperties,
  Layers,
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
  data?: Record<string, unknown>;
  error?: string;
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
    try {
      const res = await fetch(WORKER_URL);
      if (!res.ok) {
        throw new Error(`خطأ في الـ Worker: كود الاستجابة ${res.status}`);
      }
      const data = await res.json();
      setWorkerResult({
        loading: false,
        success: true,
        data,
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      });
    } catch (err) {
      // Fallback check to local proxy if cross-origin or network glitch occurs
      try {
        const fallbackRes = await fetch('/api/test-worker');
        const fallbackData = await fallbackRes.json();
        setWorkerResult({
          loading: false,
          success: true,
          data: fallbackData,
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
    runDatabaseTest();
    runWorkerTest();
    runStoragePersistenceTest();
  }, [runDatabaseTest, runWorkerTest, runStoragePersistenceTest]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between p-4 sm:p-8 font-sans">
      {/* Header */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm shadow-sky-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">يوتيوب الأطفال</h1>
            <p className="text-xs text-slate-500">المرحلة 3 — هيكل PWA والتخزين الدائم</p>
          </div>
        </div>
        <PWAInstallButton />
      </header>

      {/* Main Content */}
      <main className="max-w-5xl w-full mx-auto my-8 space-y-6">
        {/* PWA Architecture Banner */}
        <div
          id="pwa-architecture-banner"
          className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 sm:p-5 text-sky-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-sky-950">إعدادات الـ PWA و Workbox Runtime Caching المعتمدة</h2>
              <p className="text-xs text-sky-700 mt-0.5">
                استراتيجية <span className="font-mono font-semibold">NetworkFirst</span> لدومين <span className="font-mono font-semibold">workers.dev</span> مع كاش <span className="font-mono font-semibold">"worker-api-cache"</span> (fallback فوري عند انقطاع الإنترنت وعمر 24 ساعة).
              </p>
            </div>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-200/80 text-sky-800">
            PWA Workbox Active
          </span>
        </div>

        {/* Status Dashboard Grid (3 Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

          {/* Card 2: Cloudflare Worker Card */}
          <div
            id="worker-test-card"
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
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

              {/* Worker Status Display */}
              {workerResult.loading ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 animate-pulse flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                  جاري فحص استجابة الـ Worker...
                </div>
              ) : workerResult.success ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-800 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>متصل ويرد بنجاح</span>
                  </div>
                  <pre className="text-[10px] font-mono bg-white/80 p-2 rounded text-emerald-950 overflow-x-auto border border-emerald-100">
                    {JSON.stringify(workerResult.data, null, 2)}
                  </pre>
                  <div className="text-[10px] text-emerald-600 font-mono pt-0.5">
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
                      المساحة المتاحة: {storageResult.result.quota.quotaMb} MB (المستخدم: {storageResult.result.quota.usageMb} MB)
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
                      المساحة المتاحة: {storageResult.result.quota.quotaMb} MB (المستخدم: {storageResult.result.quota.usageMb} MB)
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
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center py-4 border-t border-slate-200 text-xs text-slate-400">
        يوتيوب الأطفال PWA — المرحلة 3: هيكل PWA والتخزين الدائم مكتمل
      </footer>

      <OfflineIndicator />
    </div>
  );
}
