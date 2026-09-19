import React from 'react';
import { AlertTriangle, Info, ArrowLeft, Check } from 'lucide-react';
import type { Announcement } from '../services/announcements';

interface AnnouncementModalProps {
  items: Announcement[];
  onDismiss: (id: string) => void;
  contextLabel?: string; // small optional label shown in the header badge area, e.g. "رسالة من فريق يوتيوب الأطفال"
}

export default function AnnouncementModal({
  items,
  onDismiss,
  contextLabel,
}: AnnouncementModalProps) {
  if (!items || items.length === 0) return null;

  // Show at most one at a time (highest priority: warning first, then newest)
  const sorted = [...items].sort((a, b) => {
    if (a.severity === 'warning' && b.severity !== 'warning') return -1;
    if (b.severity === 'warning' && a.severity !== 'warning') return 1;
    const timeA = a.updatedAt || a.createdAt || 0;
    const timeB = b.updatedAt || b.createdAt || 0;
    return timeB - timeA;
  });

  const current = sorted[0];
  if (!current) return null;

  const totalRemaining = sorted.length;
  const isMultiple = totalRemaining > 1;
  const isWarning = current.severity === 'warning';

  return (
    <div
      id="announcement-modal-backdrop"
      className="fixed inset-0 z-50 bg-[#FAF8F5] overflow-y-auto flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-modal-title"
    >
      <div
        id="announcement-modal"
        className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-stone-200/80 overflow-hidden flex flex-col my-auto"
      >
        {/* Modal Header */}
        <div
          className={`p-6 text-right border-b ${
            isWarning
              ? 'bg-amber-500/10 border-amber-200/60'
              : 'bg-sky-500/10 border-sky-200/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            {isMultiple ? (
              <span
                className={`text-xs font-mono font-bold px-3 py-1 rounded-full text-white shadow-2xs ${
                  isWarning ? 'bg-amber-500' : 'bg-sky-500'
                }`}
              >
                1 من {totalRemaining}
              </span>
            ) : (
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isWarning
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-sky-100 text-sky-700 border-sky-200'
                }`}
              >
                {isWarning ? (
                  <AlertTriangle className="w-4.5 h-4.5" />
                ) : (
                  <Info className="w-4.5 h-4.5" />
                )}
              </div>
            )}

            <span
              className={`text-xs font-bold ${
                isWarning ? 'text-amber-900' : 'text-sky-900'
              }`}
            >
              {contextLabel || (isWarning ? 'تنبيه إداري هام' : 'رسالة من يوتيوب الأطفال')}
            </span>
          </div>

          <h2
            id="announcement-modal-title"
            className="text-xl sm:text-2xl font-extrabold text-stone-900 mt-3 leading-snug"
          >
            {current.title}
          </h2>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 text-right">
          {current.body && (
            <div className="text-sm sm:text-base text-stone-700 leading-relaxed font-medium whitespace-pre-line bg-stone-50/50 p-4 rounded-2xl border border-stone-100">
              {current.body}
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <button
              id="announcement-action-btn"
              type="button"
              onClick={() => onDismiss(current.id)}
              className={`w-full min-h-[48px] rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition shadow-sm cursor-pointer active:scale-[0.99] ${
                isWarning
                  ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                  : 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/20'
              }`}
            >
              {isMultiple ? (
                <>
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>حسناً</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
