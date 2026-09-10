import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, ExternalLink, QrCode as QrIcon, Smartphone, ArrowRight, Check, X } from 'lucide-react';

export const ADGUARD_DNS_URL = 'https://adguard-dns.io/en/public-dns.html';

interface AdBlockNoticeProps {
  mode?: 'onboarding' | 'modal';
  onSkip?: () => void;
  onFinish?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export default function AdBlockNotice({
  mode = 'onboarding',
  onSkip,
  onFinish,
  onBack,
  onClose,
}: AdBlockNoticeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(ADGUARD_DNS_URL, {
      width: 190,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
          setQrLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to generate QR code for AdGuard DNS:', err);
        if (isMounted) {
          setQrLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const content = (
    <div className="space-y-4 text-right">
      {/* Title & Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm sm:text-base">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span>خطوة أخيرة: حجب الإعلانات</span>
        </div>
        {mode === 'modal' && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Warm Explanation (2-3 sentences) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-sky-50/80 border border-sky-100 text-slate-700 text-xs sm:text-sm leading-relaxed space-y-1.5">
        <p>
          نود تذكيركم أن التطبيق نفسه لا يمكنه منع إعلانات يوتيوب المدمجة بالفيديو برمجياً، ولكن يمكنك كولي أمر حجب معظم الإعلانات على مستوى الجهاز بالكامل مجاناً باستخدام خاصية <strong className="text-sky-900 font-semibold">Private DNS</strong>.
        </p>
        <p className="text-slate-600 text-xs">
          هذا الإجراء عبارة عن إعداد بسيط يُضبط مرة واحدة فقط في إعدادات جهازك (أندرويد أو آيفون)، وليس شيئاً داخل هذا التطبيق.
        </p>
      </div>

      {/* QR Code Section */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center text-center space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <Smartphone className="w-4 h-4 text-sky-600" />
          <span>امسح الرمز بكاميرا الهاتف لفتح دليل الإعداد المباشر:</span>
        </div>

        {/* QR Code Container */}
        <div className="relative p-2.5 bg-white rounded-xl shadow-xs border border-slate-200 inline-flex items-center justify-center min-w-[190px] min-h-[190px]">
          {qrLoading ? (
            <div className="w-44 h-44 flex flex-col items-center justify-center text-slate-400 gap-2">
              <QrIcon className="w-8 h-8 animate-pulse text-sky-500" />
              <span className="text-[11px]">جاري إنشاء رمز QR...</span>
            </div>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code to AdGuard Public DNS Setup"
              className="w-44 h-44 rounded-lg block"
            />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
              تعذر إنشاء الرمز، يرجى استخدام الرابط أدناه
            </div>
          )}
        </div>

        {/* Plain clickable text fallback */}
        <div className="space-y-1 pt-1">
          <span className="text-[11px] text-slate-500 block">أو افتح الرابط مباشرة:</span>
          <a
            id="adguard-dns-direct-link"
            href={ADGUARD_DNS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-600 hover:text-sky-800 underline font-mono break-all inline-flex items-center gap-1 dir-ltr text-center px-2 py-1 rounded hover:bg-sky-50 transition"
          >
            <span>{ADGUARD_DNS_URL}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
          <p className="text-[10px] text-slate-400">
            (دليل الإعداد الرسمي من AdGuard يغطي خطوات أندرويد و iOS خطوة بخطوة)
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      {mode === 'onboarding' ? (
        <div className="pt-2 flex justify-between items-center">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>رجوع</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              id="onboarding-dns-skip-btn"
              type="button"
              onClick={onSkip}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800 text-xs font-semibold transition"
            >
              تخطي هذه الخطوة
            </button>

            <button
              id="onboarding-dns-finish-btn"
              type="button"
              onClick={onFinish}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>تم ✅</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-2 flex justify-end">
          <button
            id="adblock-modal-close-btn"
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition"
          >
            إغلاق
          </button>
        </div>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
        <div
          id="adblock-notice-modal"
          className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 my-auto"
        >
          {content}
        </div>
      </div>
    );
  }

  return content;
}
