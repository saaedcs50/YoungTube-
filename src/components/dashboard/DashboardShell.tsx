import React, { useRef, useEffect } from 'react';
import { ShieldCheck, Lock, ArrowRight } from 'lucide-react';
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
  activeSection,
  onSelectSection,
  onClose,
  onLock,
  hasIncompleteSetup = false,
  showTools = false,
  onToggleTools,
  headerSlot,
  children,
}) => {
  // Discrete 5-tap unlocking mechanism on dashboard title for system tools
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);

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

  // Reset section to 'child' if tools section active and tools gets hidden
  useEffect(() => {
    if (!showTools && activeSection === 'tools') {
      onSelectSection('child');
    }
  }, [showTools, activeSection, onSelectSection]);

  return (
    <div
      id="dashboard-shell"
      className="min-h-screen bg-yt-bg text-yt-text flex flex-col font-sans"
    >
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-40 bg-yt-bg/90 backdrop-blur-md border-b border-yt-border px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
          {/* Logo & Title */}
          <div
            className="flex items-center gap-3 select-none cursor-pointer"
            onClick={handleTitleTap}
            title="لوحة الأهل (اضغط 5 مرات لتغيير وضع أدوات النظام)"
          >
            <div className="w-9 h-9 rounded-xl bg-yt-brand text-yt-brand-text flex items-center justify-center shadow-sm shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex items-center">
              <h1 className="text-base sm:text-lg font-extrabold text-yt-text tracking-tight">
                {title}
              </h1>
            </div>
          </div>

          {/* Top Actions: قفل · شاشة الأطفال */}
          <div className="flex items-center gap-2">
            {headerSlot}

            <button
              id="dashboard-header-lock-btn"
              type="button"
              onClick={onLock}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-yt-surface hover:bg-yt-surface-muted text-yt-text border border-yt-border text-xs font-bold transition duration-150 shadow-sm cursor-pointer active:scale-[0.98]"
              title="قفل لوحة الأهل"
            >
              <Lock className="w-3 h-3 text-yt-text-muted" />
              <span>قفل</span>
            </button>

            <button
              id="dashboard-header-back-btn"
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-xs font-bold transition duration-150 shadow-sm cursor-pointer active:scale-[0.98]"
              title="العودة لشاشة الأطفال"
            >
              <span>شاشة الأطفال</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Nav + Content Workspace */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-5 space-y-5 flex-1 flex flex-col min-w-0">
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
          className="transition-opacity duration-150 ease-out"
        >
          {children}
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="py-4 border-t border-yt-border text-center text-xs text-yt-text-muted font-medium">
        لوحة تحكم الوالدين — بيئة آمنة لحماية وتوجيه محتوى الأطفال
      </footer>
    </div>
  );
};
