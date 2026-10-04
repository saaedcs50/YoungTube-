import React, { useEffect, useState } from 'react';
import { loadSupportPay, getCachedSupportPay, type SupportPayData } from '../services/supportPay';
import {
  Heart,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  CreditCard,
  Calendar,
  AlertCircle,
  Loader2,
  Quote,
  MessageCircle,
} from 'lucide-react';

export const SupportPayPanel: React.FC = () => {
  const [data, setData] = useState<SupportPayData | null>(() => getCachedSupportPay());
  const [loading, setLoading] = useState<boolean>(!data);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    loadSupportPay().then((res) => {
      if (isMounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const formatIsoDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center space-y-3 bg-yt-surface rounded-3xl border border-yt-border" dir="rtl">
        <Loader2 className="w-7 h-7 text-yt-brand animate-spin mx-auto" />
        <p className="text-xs font-bold text-yt-text-muted">جاري تحميل بيانات الدعم والمساهمة...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center space-y-3 bg-yt-surface rounded-3xl border border-yt-border" dir="rtl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-sm sm:text-base font-extrabold text-yt-text">
          بيانات الدعم غير مهيأة حالياً
        </h3>
        <p className="text-xs text-yt-text-muted max-w-md mx-auto leading-relaxed font-medium">
          شكرًا لاهتمامك ورغبتك في دعم يونج تيوب. سيتم تفعيل وسائل الدعم والمساهمة فور اكتمال إعدادها على الخادم.
        </p>
      </div>
    );
  }

  const hasInstapay = Boolean(
    data.instapay &&
      (data.instapay.ipa ||
        data.instapay.phone ||
        data.instapay.url ||
        data.instapay.name)
  );
  const hasVodafone = Boolean(
    data.vodafoneCash && (data.vodafoneCash.phone || data.vodafoneCash.name)
  );

  return (
    <div
      id="support-pay-panel"
      dir="rtl"
      className="space-y-5 text-right font-sans"
    >
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-l from-rose-500/15 via-amber-500/10 to-yt-brand/10 border border-yt-border rounded-3xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-md">
            <Heart className="w-6 h-6 fill-white" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-black text-yt-text tracking-tight">
              دعم استمرار وتطوير YoungTube
            </h2>
            <p className="text-xs sm:text-sm text-yt-text-muted font-medium leading-relaxed">
              يونج تيوب مشروع مستقل بدون إعلانات أو خوارزميات ربحية؛ دعمكم يساعد في تغطية تكاليف الخوادم وتطوير مزايا حماية الأطفال.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Developer support message — intentionally styled, not plain text */}
      {data.note && (
        <section
          id="support-developer-message"
          className="relative overflow-hidden rounded-3xl border-2 border-yt-brand/25 bg-gradient-to-br from-yt-brand-soft via-yt-surface to-rose-50/70 p-4 sm:p-5 shadow-sm"
        >
          <div className="absolute -top-10 -start-8 w-28 h-28 rounded-full bg-yt-brand/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-yt-brand text-yt-brand-text flex items-center justify-center shrink-0 shadow-sm">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Quote className="w-4 h-4 text-yt-brand" />
                <h3 className="text-sm sm:text-base font-black text-yt-text">رسالة من فريق YoungTube</h3>
              </div>
              <p className="text-xs sm:text-sm text-yt-text leading-7 font-semibold whitespace-pre-line">
                {data.note}
              </p>
              <div className="mt-3 inline-flex items-center rounded-full border border-yt-brand/20 bg-yt-surface/75 px-3 py-1 text-[10px] font-bold text-yt-text-muted">
                دعم المشروع = استمرار الخدمة وتطويرها
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Payment Channels Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: InstaPay */}
        {hasInstapay && data.instapay && (
          <div className="bg-yt-surface rounded-3xl border border-yt-border p-5 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-yt-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black text-sm">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-yt-text">
                      {data.instapay.label || 'انستاباي (InstaPay)'}
                    </h4>
                    {data.instapay.name && (
                      <p className="text-[11px] text-yt-text-muted font-medium">
                        الاسم: {data.instapay.name}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700">
                  تحويل فوري
                </span>
              </div>

              {/* IPA Field */}
              {data.instapay.ipa && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-yt-text-muted block">
                    عنوان الدفع اللحظي (IPA):
                  </label>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-yt-surface-muted border border-yt-border">
                    <span className="font-mono text-xs font-bold text-yt-text select-all" dir="ltr">
                      {data.instapay.ipa}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(data.instapay!.ipa!, 'panel-ipa')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yt-surface hover:bg-yt-brand hover:text-yt-brand-text border border-yt-border text-yt-text text-xs font-bold transition cursor-pointer shadow-2xs"
                    >
                      {copiedKey === 'panel-ipa' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[11px]">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">نسخ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Phone Field */}
              {data.instapay.phone && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-yt-text-muted block">
                    رقم الهاتف المسجل:
                  </label>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-yt-surface-muted border border-yt-border">
                    <span className="font-mono text-xs font-bold text-yt-text select-all" dir="ltr">
                      {data.instapay.phone}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(data.instapay!.phone!, 'panel-instapay-phone')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yt-surface hover:bg-yt-brand hover:text-yt-brand-text border border-yt-border text-yt-text text-xs font-bold transition cursor-pointer shadow-2xs"
                    >
                      {copiedKey === 'panel-instapay-phone' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[11px]">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">نسخ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Open in InstaPay Action */}
            {data.instapay.url && (
              <a
                href={data.instapay.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[42px] rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-[0.98] cursor-pointer mt-2"
              >
                <span>فتح تطبيق / رابط InstaPay</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        )}

        {/* Card 2: Vodafone Cash */}
        {hasVodafone && data.vodafoneCash && (
          <div className="bg-yt-surface rounded-3xl border border-yt-border p-5 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-yt-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-black text-sm">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-yt-text">
                      {data.vodafoneCash.label || 'فودافون كاش (Vodafone Cash)'}
                    </h4>
                    {data.vodafoneCash.name && (
                      <p className="text-[11px] text-yt-text-muted font-medium">
                        الاسم: {data.vodafoneCash.name}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700">
                  محفظة إلكترونية
                </span>
              </div>

              {/* Phone Field */}
              {data.vodafoneCash.phone && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-yt-text-muted block">
                    رقم المحفظة لتحويل فودافون كاش:
                  </label>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-yt-surface-muted border border-yt-border">
                    <span className="font-mono text-xs font-bold text-yt-text select-all" dir="ltr">
                      {data.vodafoneCash.phone}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(data.vodafoneCash!.phone!, 'panel-vodafone-phone')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yt-surface hover:bg-yt-brand hover:text-yt-brand-text border border-yt-border text-yt-text text-xs font-bold transition cursor-pointer shadow-2xs"
                    >
                      {copiedKey === 'panel-vodafone-phone' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[11px]">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">نسخ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="text-[11px] text-yt-text-muted font-medium p-3 rounded-xl bg-yt-surface-muted border border-yt-border leading-relaxed mt-2">
              💡 يمكنك التحويل المباشر من خلال تطبيق Ana Vodafone أو كود المحفظة على هاتفك.
            </div>
          </div>
        )}
      </div>

      {/* 4. Footer & Updated At */}
      {data.updatedAt && (
        <div className="flex items-center justify-between text-[11px] text-yt-text-muted pt-2 border-t border-yt-border">
          <div className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-3.5 h-3.5 text-yt-text-muted" />
            <span>آخر تحديث لبيانات الدعم: {formatIsoDate(data.updatedAt)}</span>
          </div>
          <span className="font-mono text-[10px]">v{data.v || 1}</span>
        </div>
      )}
    </div>
  );
};

export default SupportPayPanel;
