import React from 'react';
import { AlertTriangle, Info, X, Check } from 'lucide-react';
import type { Announcement } from '../services/announcements';

interface AnnouncementBannerProps {
  items: Announcement[];
  onDismiss: (id: string) => void;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ items, onDismiss }) => {
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

  const isWarning = current.severity === 'warning';

  return (
    <aside
      aria-label="إشعار إداري"
      dir="rtl"
      className="fixed top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-40 animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div
        className={`p-3.5 sm:p-4 rounded-2xl shadow-lg border backdrop-blur-md flex items-start gap-3 transition-all ${
          isWarning
            ? 'bg-yt-brand-soft/95 border-yt-brand/40 text-yt-text shadow-yt-brand/10'
            : 'bg-sky-50/95 border-sky-300 text-sky-950 shadow-sky-900/10'
        }`}
      >
        {/* Icon */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isWarning ? 'bg-yt-brand/20 text-yt-brand' : 'bg-sky-200/70 text-sky-700'
          }`}
        >
          {isWarning ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <Info className="w-5 h-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm sm:text-base font-bold leading-snug">
              {current.title}
            </h3>
            {/* Close (X) icon button */}
            <button
              type="button"
              onClick={() => onDismiss(current.id)}
              className={`p-1 -mt-1 -mr-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                isWarning
                  ? 'text-yt-brand hover:bg-yt-brand/20'
                  : 'text-sky-700 hover:bg-sky-200/60'
              }`}
              title="إغلاق الإشعار"
              aria-label="إغلاق الإشعار"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {current.body && (
            <p
              className={`text-xs sm:text-sm mt-1 leading-relaxed ${
                isWarning ? 'text-yt-text' : 'text-sky-900/90'
              }`}
            >
              {current.body}
            </p>
          )}

          {/* Action button */}
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onDismiss(current.id)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                isWarning
                  ? 'bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>حسناً</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
