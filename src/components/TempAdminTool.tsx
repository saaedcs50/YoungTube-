import React, { useState } from 'react';
import { WORKER_URL } from '../config';
import { PlaySquare, KeyRound, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

interface TempAdminToolProps {
  onBackfillSuccess?: () => void;
}

interface BackfillResponse {
  success?: boolean;
  count?: number;
  message?: string;
  error?: string;
  sourceId?: string;
  playlistId?: string;
}

export default function TempAdminTool({ onBackfillSuccess }: TempAdminToolProps) {
  const [sourceId, setSourceId] = useState('');
  const [sourceType, setSourceType] = useState<'channel' | 'playlist'>('channel');
  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId.trim()) return;
    if (!adminKey.trim()) {
      setResult({
        success: false,
        error: 'يرجى إدخال مفتاح X-Admin-Key يدويًا للمتابعة.',
      });
      return;
    }

    setLoading(true);
    setResult(null);

    const payload = {
      sourceId: sourceId.trim(),
      sourceType,
    };

    try {
      // Primary attempt: Cloudflare Worker URL
      let response: Response;
      try {
        response = await fetch(`${WORKER_URL}/api/admin/backfill-channel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey.trim(),
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // Fallback to local endpoint if Worker is not reachable
        response = await fetch('/api/admin/backfill-channel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey.trim(),
          },
          body: JSON.stringify(payload),
        });
      }

      const data: BackfillResponse = await response.json();

      if (!response.ok) {
        setResult({
          success: false,
          error:
            data.error ||
            (response.status === 401
              ? 'مفتاح X-Admin-Key غير صحيح أو غير مصرح به (401 Unauthorized).'
              : `فشل الطلب بكود ${response.status}`),
        });
      } else {
        setResult({
          success: true,
          count: data.count,
          sourceId: data.sourceId,
          playlistId: data.playlistId,
          message: data.message || `تم بنجاح حفظ ${data.count ?? 0} فيديو في الأرشيف.`,
        });
        if (onBackfillSuccess) {
          onBackfillSuccess();
        }
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'تعذر الاتصال بالخادم لأرشفة القناة.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="temp-admin-tool-section"
      className="rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-5 sm:p-7 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-amber-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
            ⚠️
          </div>
          <div>
            <h2 className="text-base font-bold text-amber-950 flex items-center gap-2">
              <span>أداة إدارية مؤقتة</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-200 text-amber-900">
                Stage 5 Backfill
              </span>
            </h2>
            <p className="text-xs text-amber-800 mt-0.5">
              أرشفة فيديوهات القنوات وقوائم التشغيل (حتى 200 فيديو) وحفظها في Cloudflare KV.
            </p>
          </div>
        </div>
        <div className="text-[11px] text-amber-700 bg-amber-100/80 px-3 py-1.5 rounded-xl border border-amber-200">
          🔒 المفتاح لا يُحفظ في المتصفح أبدًا
        </div>
      </div>

      <form id="temp-admin-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Field 1: sourceId */}
          <div className="space-y-1.5 md:col-span-1">
            <label
              htmlFor="admin-source-id"
              className="text-xs font-bold text-slate-700 block"
            >
              معرف القناة أو القائمة (sourceId) <span className="text-red-500">*</span>
            </label>
            <input
              id="admin-source-id"
              type="text"
              required
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder="UC57XAjJ04TY8gNxOWf-Sy0Q"
              className="w-full p-2.5 text-xs rounded-xl bg-white border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-slate-800"
            />
            <span className="text-[10px] text-slate-500 block">
              القنوات (UC...) تُحوّل تلقائيًا إلى قائمة الرفع (UU...)
            </span>
          </div>

          {/* Field 2: sourceType */}
          <div className="space-y-1.5 md:col-span-1">
            <label
              htmlFor="admin-source-type"
              className="text-xs font-bold text-slate-700 block"
            >
              نوع المصدر (sourceType)
            </label>
            <select
              id="admin-source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as 'channel' | 'playlist')}
              className="w-full p-2.5 text-xs rounded-xl bg-white border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-slate-800 font-medium"
            >
              <option value="channel">channel (قناة يوتيوب)</option>
              <option value="playlist">playlist (قائمة تشغيل)</option>
            </select>
            <span className="text-[10px] text-slate-500 block">
              اختر نوع الرابط المعني بالأرشفة
            </span>
          </div>

          {/* Field 3: X-Admin-Key */}
          <div className="space-y-1.5 md:col-span-1">
            <label
              htmlFor="admin-key-input"
              className="text-xs font-bold text-slate-700 block"
            >
              مفتاح الإدارة (X-Admin-Key) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="admin-key-input"
                type="password"
                required
                autoComplete="off"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="اكتب X-Admin-Key يدويًا هنا..."
                className="w-full p-2.5 pe-9 text-xs rounded-xl bg-white border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-slate-800"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute start-auto end-2.5 top-3" />
            </div>
            <span className="text-[10px] text-slate-500 block">
              مكتوب يدويًا لكل جلسة — لا يتم تخزينه
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            id="start-backfill-btn"
            type="submit"
            disabled={loading || !sourceId.trim() || !adminKey.trim()}
            className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold flex items-center gap-2 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تحميل الأرشيف من YouTube...</span>
              </>
            ) : (
              <>
                <PlaySquare className="w-4 h-4" />
                <span>ابدأ التحميل</span>
              </>
            )}
          </button>
        </div>

        {/* Result Feedback Display (right below the button) */}
        {result && (
          <div
            id="admin-backfill-result"
            className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-1 mt-3 transition-all ${
              result.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-red-50 border-red-300 text-red-950'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {result.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>اكتملت الأرشفة بنجاح!</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>خطأ في عملية الأرشفة</span>
                </>
              )}
            </div>

            {result.success ? (
              <div className="space-y-1 ps-7">
                <p className="font-semibold text-emerald-900">
                  عدد الفيديوهات المحفوظة في الأرشيف: {result.count ?? 0} فيديو
                </p>
                <p className="text-[11px] text-emerald-800">
                  المعرف: <code className="font-mono">{result.sourceId}</code>
                  {result.playlistId && (
                    <> • معرف قائمة الرفع: <code className="font-mono">{result.playlistId}</code></>
                  )}
                </p>
                <p className="text-[11px] text-emerald-700">
                  {result.message}
                </p>
              </div>
            ) : (
              <div className="ps-7 text-[11px] text-red-800">
                <p>{result.error}</p>
                <p className="text-[10px] text-red-600 mt-1">
                  تأكد من صحة X-Admin-Key وصلاحية YouTube Data API key، وأن معرف القناة صحيح.
                </p>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
