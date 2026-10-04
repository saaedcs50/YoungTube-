import React, { useEffect, useState } from 'react';
import { loadSupportPay, getCachedSupportPay, type SupportPayData } from '../services/supportPay';
import { Heart, Copy, Check, ExternalLink, Smartphone } from 'lucide-react';

export const SupportPayStrip: React.FC = () => {
  const [data, setData] = useState<SupportPayData | null>(() => getCachedSupportPay());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    loadSupportPay().then((res) => {
      if (isMounted) setData(res);
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
      // Fallback
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

  if (!data) return null;

  const hasInstapay = Boolean(
    data.instapay && (data.instapay.ipa || data.instapay.phone || data.instapay.url)
  );
  const hasVodafone = Boolean(data.vodafoneCash && data.vodafoneCash.phone);

  if (!hasInstapay && !hasVodafone) return null;

  return (
    <aside
      id="support-pay-strip"
      aria-label="دعم YoungTube"
      dir="rtl"
      className="w-full rounded-2xl border-2 border-yt-border bg-yt-surface p-3 sm:p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 items-stretch">
        {/* Title Badge */}
        <div className="flex items-center gap-2 min-w-0 rounded-xl border border-yt-border bg-yt-surface-muted/60 p-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Heart className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-extrabold text-yt-text flex items-center gap-1.5">
              <span>دعم استمرار YoungTube</span>
            </div>
            <p className="text-[11px] text-yt-text-muted font-medium">
              تطبيق تطوعي غير ربحي — مساهمتكم تضمن بقاءه مجانياً بدون إعلانات
            </p>
          </div>
        </div>

        {/* Payment Channels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0 text-xs">
          {/* InstaPay */}
          {hasInstapay && data.instapay && (
            <div className="min-w-0 flex flex-wrap items-center gap-1.5 bg-yt-surface border border-yt-border px-2.5 py-2 rounded-xl">
              <span className="font-extrabold text-yt-text">
                {data.instapay.label || 'InstaPay'}:
              </span>
              {data.instapay.ipa && (
                <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-yt-text px-1.5 py-0.5 rounded-md bg-yt-surface-muted">
                  <span dir="ltr">{data.instapay.ipa}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(data.instapay!.ipa!, 'strip-ipa')}
                    className="p-1 hover:text-yt-brand text-yt-text-muted transition cursor-pointer"
                    title="نسخ عنوان الدفع"
                    aria-label="نسخ عنوان الدفع"
                  >
                    {copiedKey === 'strip-ipa' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
              {data.instapay.phone && (
                <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-yt-text px-1.5 py-0.5 rounded-md bg-yt-surface-muted">
                  <span dir="ltr">{data.instapay.phone}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(data.instapay!.phone!, 'strip-instapay-phone')}
                    className="p-1 hover:text-yt-brand text-yt-text-muted transition cursor-pointer"
                    title="نسخ رقم الهاتف"
                    aria-label="نسخ رقم الهاتف"
                  >
                    {copiedKey === 'strip-instapay-phone' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
              {data.instapay.url && (
                <a
                  href={data.instapay.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yt-brand text-yt-brand-text font-bold text-[11px] hover:bg-yt-brand-hover transition cursor-pointer"
                  title="فتح في InstaPay"
                >
                  <span>فتح الرابط</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Vodafone Cash */}
          {hasVodafone && data.vodafoneCash && (
            <div className="min-w-0 flex flex-wrap items-center gap-1.5 bg-yt-surface border border-yt-border px-2.5 py-2 rounded-xl">
              <Smartphone className="w-3.5 h-3.5 text-rose-600" />
              <span className="font-extrabold text-yt-text">
                {data.vodafoneCash.label || 'فودافون كاش'}:
              </span>
              {data.vodafoneCash.phone && (
                <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-yt-text px-1.5 py-0.5 rounded-md bg-yt-surface-muted">
                  <span dir="ltr">{data.vodafoneCash.phone}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(data.vodafoneCash!.phone!, 'strip-vodafone-phone')}
                    className="p-1 hover:text-yt-brand text-yt-text-muted transition cursor-pointer"
                    title="نسخ رقم فودافون كاش"
                    aria-label="نسخ رقم فودافون كاش"
                  >
                    {copiedKey === 'strip-vodafone-phone' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default SupportPayStrip;
