import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Inbox, Loader2, MessageCircle, RefreshCw, Send, WifiOff } from 'lucide-react';
import {
  createParentInboxMessage, fetchParentInbox, getParentDeviceId,
  parentInboxStatusLabel, parentInboxTypeLabel,
  type ParentInboxMessage, type ParentInboxType,
} from '../../services/parentInbox';

const TYPES: Array<{ value: ParentInboxType; label: string }> = [
  { value: 'bug', label: 'مشكلة' }, { value: 'suggestion', label: 'اقتراح' },
  { value: 'thanks', label: 'شكر' }, { value: 'question', label: 'سؤال' },
];
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'تاريخ غير متاح' : date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}
function statusStyle(status: ParentInboxMessage['status']): string {
  switch (status) {
    case 'replied': return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'closed': return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
    case 'read': return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
    default: return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  }
}

export const ParentInboxSection: React.FC = () => {
  const [type, setType] = useState<ParentInboxType>('question');
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [messages, setMessages] = useState<ParentInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const mounted = useRef(false);
  const deviceId = useRef<string | null>(null);

  const withController = useCallback(() => {
    const controller = new AbortController(); controllers.current.add(controller); return controller;
  }, []);
  const releaseController = useCallback((controller: AbortController) => controllers.current.delete(controller), []);

  const load = useCallback(async (manual = false) => {
    const controller = withController();
    if (manual) setRefreshing(true); else setLoading(true);
    setLoadError(null);
    try {
      if (!deviceId.current) deviceId.current = getParentDeviceId();
      const result = await fetchParentInbox(deviceId.current, controller.signal);
      if (mounted.current && !controller.signal.aborted) setMessages(result);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'تعذر تحميل الرسائل حاليًا.');
    } finally {
      releaseController(controller);
      if (mounted.current && !controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [withController, releaseController]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; controllers.current.forEach((controller) => controller.abort()); controllers.current.clear(); setMessages([]); };
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim(); const contactText = contact.trim();
    if (sending) return;
    if (text.length < 5 || text.length > 1000) { setSendError('اكتب رسالة من 5 إلى 1000 حرف.'); return; }
    if (contactText.length > 120) { setSendError('وسيلة التواصل لازم تكون 120 حرف أو أقل.'); return; }
    setSending(true); setSendError(null); setSuccess(null);
    const controller = withController();
    try {
      if (!deviceId.current) deviceId.current = getParentDeviceId();
      const created = await createParentInboxMessage({ deviceId: deviceId.current, type, body: text, contact: contactText }, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setMessages((old) => [created, ...old.filter((item) => item.id !== created.id)].slice(0, 500));
      setBody(''); setContact(''); setSuccess('رسالتك وصلت. لو فيه رد هتلاقيه تحت الرسالة دي.');
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setSendError(error instanceof Error ? error.message : 'الرسالة ما اتبعتتش. احتفظ بنصك وحاول تاني.');
    } finally {
      releaseController(controller);
      if (mounted.current && !controller.signal.aborted) setSending(false);
    }
  };

  return <section id="parent-inbox-section" className="space-y-5" aria-labelledby="parent-inbox-heading">
    <div className="rounded-2xl border border-yt-border bg-yt-surface p-4 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-yt-brand-soft text-yt-text flex items-center justify-center shrink-0"><MessageCircle className="w-5 h-5" /></div>
        <div className="min-w-0"><h2 id="parent-inbox-heading" className="text-base sm:text-lg font-extrabold">راسلنا</h2><p className="mt-1 text-xs sm:text-sm text-yt-text-muted leading-relaxed">ابعت مشكلة أو اقتراح أو سؤال. الرسائل والردود دي داخل لوحة الأهل فقط.</p></div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5"><span className="text-xs font-bold text-yt-text">نوع الرسالة</span><select id="parent-inbox-type" value={type} onChange={(e) => setType(e.target.value as ParentInboxType)} disabled={sending} className="w-full rounded-xl border border-yt-border bg-yt-bg text-yt-text px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-yt-brand/50">{TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-yt-text">وسيلة تواصل (اختياري)</span><input id="parent-inbox-contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} disabled={sending} autoComplete="off" placeholder="واتساب أو إيميل لو حابب" className="w-full rounded-xl border border-yt-border bg-yt-bg text-yt-text px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-yt-brand/50" /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-bold text-yt-text">رسالتك</span><textarea id="parent-inbox-body" value={body} onChange={(e) => setBody(e.target.value)} minLength={5} maxLength={1000} rows={5} required disabled={sending} placeholder="اكتب التفاصيل اللي تحب توصلنا..." className="w-full resize-y min-h-[120px] rounded-xl border border-yt-border bg-yt-bg text-yt-text px-3 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-yt-brand/50" /><div className="flex justify-between gap-3 text-[11px] text-yt-text-muted"><span>من 5 إلى 1000 حرف</span><span dir="ltr">{body.length}/1000</span></div></label>
        {sendError && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-3.5 py-3 text-sm text-rose-800 dark:text-rose-300">{sendError}</p>}
        {success && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3.5 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />{success}</p>}
        <button id="parent-inbox-send-button" type="submit" disabled={sending || body.trim().length < 5 || body.trim().length > 1000 || contact.trim().length > 120} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-yt-brand hover:bg-yt-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-yt-brand-text px-5 py-3 font-bold text-sm shadow-sm transition">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{sending ? 'جاري الإرسال...' : 'إرسال الرسالة'}</button>
      </form>
    </div>
    <div className="rounded-2xl border border-yt-border bg-yt-surface p-4 sm:p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5 min-w-0"><Inbox className="w-5 h-5 text-yt-text-muted shrink-0" /><div><h3 className="text-sm sm:text-base font-extrabold">رسائلي على الجهاز ده</h3><p className="text-[11px] text-yt-text-muted mt-0.5">حدّث الرسائل يدويًا لمتابعة الردود.</p></div></div><button id="parent-inbox-refresh-button" type="button" onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-1.5 rounded-lg border border-yt-border bg-yt-bg px-3 py-2 text-xs font-bold text-yt-text hover:bg-yt-surface-muted disabled:opacity-50 shrink-0"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> تحديث</button></div>
      {loading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-yt-text-muted"><Loader2 className="w-4 h-4 animate-spin" />جاري تحميل الرسائل...</div> : loadError ? <div className="rounded-xl border border-yt-border bg-yt-bg p-4 text-sm text-yt-text-muted flex items-start gap-2"><WifiOff className="w-4 h-4 mt-0.5 shrink-0" /><div><p>{loadError}</p><button type="button" className="mt-2 underline font-bold text-yt-text" onClick={() => void load(true)}>حاول مرة تانية</button></div></div> : messages.length === 0 ? <div className="rounded-xl border border-dashed border-yt-border bg-yt-bg px-4 py-8 text-center"><Inbox className="w-8 h-8 mx-auto mb-2 text-yt-text-muted/70" /><p className="text-sm font-bold text-yt-text">مفيش رسائل لسه</p><p className="mt-1 text-xs text-yt-text-muted">أي رسالة تبعتها هتظهر هنا.</p></div> : <div className="space-y-3">{messages.map((message) => <article key={message.id} className="rounded-xl border border-yt-border bg-yt-bg p-3.5 sm:p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-extrabold text-yt-text">{parentInboxTypeLabel(message.type)}</span><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle(message.status)}`}>{parentInboxStatusLabel(message.status)}</span></div><span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-yt-text-muted"><Clock3 className="w-3 h-3" />{formatDate(message.createdAt)}</span></div><p className="text-sm text-yt-text leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>{message.reply && <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/25 p-3.5 space-y-1.5"><p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">رد YoungTube</p><p className="text-sm text-emerald-950 dark:text-emerald-100 leading-relaxed whitespace-pre-wrap break-words">{message.reply}</p>{message.repliedAt && <p className="text-[10px] text-emerald-800/75 dark:text-emerald-300/75">{formatDate(message.repliedAt)}</p>}</div>}</article>)}</div>}
    </div>
  </section>;
};
