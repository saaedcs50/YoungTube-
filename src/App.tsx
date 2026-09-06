import React, { useEffect, useState, useCallback } from 'react';
import db from './db';
import { WORKER_URL } from './config';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  TableProperties,
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

export default function App() {
  const [dbResult, setDbResult] = useState<TestResult>({ loading: true });
  const [workerResult, setWorkerResult] = useState<WorkerResult>({ loading: true });

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

  useEffect(() => {
    runDatabaseTest();
    runWorkerTest();
  }, [runDatabaseTest, runWorkerTest]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between p-4 sm:p-8 font-sans">
      {/* Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm shadow-sky-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">يوتيوب الأطفال</h1>
            <p className="text-xs text-slate-500">المرحلة 2 — طبقة البيانات (Dexie & IndexedDB)</p>
          </div>
        </div>
        <PWAInstallButton />
      </header>

      {/* Main Content */}
      <main className="max-w-4xl w-full mx-auto my-8 space-y-6">
        {/* Status Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Database Test Card */}
          <div
            id="db-test-card"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">قاعدة البيانات (Dexie / IndexedDB)</h2>
                    <span className="text-xs text-slate-500 font-mono">KidsYouTubeDB • Version 1</span>
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
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-500 animate-pulse flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                  جاري كتابة وقراءة وحذف السجل التجريبي (__test__)...
                </div>
              ) : dbResult.success ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-emerald-800 text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>تم الفحص بنجاح (الكتابة والقراءة والحذف)</span>
                  </div>
                  <p className="text-xs text-emerald-700 leading-relaxed">{dbResult.message}</p>
                  <div className="text-[11px] text-emerald-600 font-mono pt-1">
                    آخر فحص: {dbResult.timestamp}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>فشل في اختبار قاعدة البيانات</span>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">{dbResult.error}</p>
                  <div className="text-[11px] text-amber-600 font-mono pt-1">
                    آخر فحص: {dbResult.timestamp}
                  </div>
                </div>
              )}
            </div>

            {/* Tables Checklist */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2.5">
                <TableProperties className="w-3.5 h-3.5" />
                <span>الجداول المعمارية المعتمدة في السكيما (6 جداول):</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">settings</span>
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">channels</span>
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">usage</span>
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">feedCache</span>
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">interactions</span>
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">downloads</span>
              </div>
            </div>
          </div>

          {/* Cloudflare Worker Card */}
          <div
            id="worker-test-card"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">اتصال الـ Cloudflare Worker</h2>
                    <span className="text-xs text-slate-500 font-mono">youngtube-worker.saaedbelal</span>
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
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-500 animate-pulse flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                  جاري فحص استجابة الـ Cloudflare Worker...
                </div>
              ) : workerResult.success ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-emerald-800 text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>متصل ويعمل بنجاح</span>
                  </div>
                  <pre className="text-xs font-mono bg-white/70 p-2.5 rounded-lg text-emerald-950 overflow-x-auto border border-emerald-100">
                    {JSON.stringify(workerResult.data, null, 2)}
                  </pre>
                  <div className="text-[11px] text-emerald-600 font-mono pt-1">
                    آخر استجابة: {workerResult.timestamp}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>تعذر الاتصال بالـ Worker</span>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">{workerResult.error}</p>
                  <div className="text-[11px] text-amber-600 font-mono pt-1">
                    آخر محاولة: {workerResult.timestamp}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-xs text-slate-500 truncate">
                <span className="font-semibold text-slate-600">الرابط المباشر: </span>
                <span className="font-mono text-[11px]">{WORKER_URL}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto text-center py-4 border-t border-slate-200 text-xs text-slate-400">
        يوتيوب الأطفال PWA — المرحلة 2: طبقة البيانات جاهزة
      </footer>

      <OfflineIndicator />
    </div>
  );
}
