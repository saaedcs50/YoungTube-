import React from 'react';
import { ShieldCheck, Lock, ArrowRight, Play } from 'lucide-react';
import { DashboardNav, DashboardSectionId } from './DashboardNav';

export interface DashboardShellProps {
  title?: string;
  subtitle?: string;
  activeSection: DashboardSectionId;
  onSelectSection: (section: DashboardSectionId) => void;
  onClose: () => void;
  onLock: () => void;
  onOpenDemoPlayer?: () => void;
  hasIncompleteSetup?: boolean;
  showTools?: boolean;
  onToggleTools?: () => void;
  headerSlot?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  title = 'لوحة الأهل',
  subtitle = 'إدارة الأمان، القنوات، المحتوى والوقت',
  activeSection,
  onSelectSection,
  onClose,
  onLock,
  onOpenDemoPlayer,
  hasIncompleteSetup = false,
  showTools = false,
  onToggleTools,
  headerSlot,
  children,
}) => {
  // Discrete 5-tap unlocking mechanism on dashboard title for system tools
  const tapCountRef = React.useRef(0);
  const tapTimerRef = React.useRef<number | null>(null);

  const handleTitleTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      onToggleTools?.();
    } else {
      tapTimerRef.current = window.setTimeout(() => {
        tapCountRef.current = 0;
      }, 2000);
    }
  };

  return (
    <div
      id="dashboard-shell"
      className="min-h-screen bg-[#FAF8F5] text-stone-800 flex flex-col font-sans"
    >
      {/* 1. Header Chrome Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200/70 px-4 sm:px-8 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
          {/* Logo & Title */}
          <div
            className="flex items-center gap-3 select-none cursor-default"
            onClick={handleTitleTap}
            title="لوحة الأهل"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm shadow-amber-200/50 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                  {title}
                </h1>
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 hidden sm:inline-block">
                  مفتوحة للوالدين
                </span>
                {showTools && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                    وضع الأدوات
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-medium hidden sm:block">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2">
            {headerSlot}

            {onOpenDemoPlayer && (
              <button
                id="dashboard-header-demo-player-btn"
                type="button"
                onClick={onOpenDemoPlayer}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
                title="تجربة المشغل"
              >
                <Play className="w-3.5 h-3.5 fill-current text-indigo-600" />
                <span>المشغل التجريبي</span>
              </button>
            )}

            <button
              id="dashboard-header-lock-btn"
              type="button"
              onClick={onLock}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-rose-50 hover:text-rose-700 text-stone-700 border border-stone-200/60 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
              title="قفل لوحة الأهل فوراً"
            >
              <Lock className="w-3.5 h-3.5 text-stone-500" />
              <span>قفل</span>
            </button>

            <button
              id="dashboard-header-back-btn"
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
              title="العودة لشاشة الأطفال"
            >
              <span>شاشة الأطفال</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Nav + Content Workspace */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6 flex-1 flex flex-col">
        {/* Navigation Bar */}
        <DashboardNav
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          hasIncompleteSetup={hasIncompleteSetup}
          showTools={showTools}
        />

        {/* Section Content Panel */}
        <div
          id={`dashboard-panel-${activeSection}`}
          key={activeSection}
          className="transition-opacity duration-200 ease-out"
        >
          {children}
        </div>
      </main>

      {/* 3. Subtle Footer */}
      <footer className="py-4 border-t border-stone-200/60 text-center text-xs text-stone-400 font-medium">
        لوحة تحكم الوالدين — بيئة آمنة لحماية وتوجيه محتوى الأطفال
      </footer>
    </div>
  );
};
