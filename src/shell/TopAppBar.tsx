import React from 'react';
import { Cast, Lock, Search } from 'lucide-react';
import { YoungTubeWordmark } from '../components/YoungTubeWordmark';
import { useFeedHeaderCollapse } from '../features/feed/useFeedHeaderCollapse';

export interface TopAppBarProps {
  root?: string;
  onHome: () => void;
  onSearch: () => void;
  onCast: () => void;
  onParentLock: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({ root = 'home', onHome, onSearch, onCast, onParentLock }) => {
  const collapsed = useFeedHeaderCollapse({ disabled: root !== 'home' });

  React.useEffect(() => {
    const offset = collapsed
      ? 'env(safe-area-inset-top)'
      : 'calc(56px + env(safe-area-inset-top))';
    document.documentElement.style.setProperty('--yt-top-app-bar-offset', offset);

    return () => {
      document.documentElement.style.removeProperty('--yt-top-app-bar-offset');
    };
  }, [collapsed]);

  return (
    <header
      id="youngtube-top-app-bar"
      dir="rtl"
      className={`sticky top-0 z-40 bg-yt-bg/95 backdrop-blur-md border-b border-yt-border overflow-hidden transition-[height,opacity] duration-200 ${collapsed ? 'border-transparent' : ''}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        height: collapsed ? 'env(safe-area-inset-top)' : 'calc(56px + env(safe-area-inset-top))',
        opacity: collapsed ? 0 : 1,
      }}
    >
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onHome}
          className="min-w-0 rounded-xl p-1.5 active:scale-95 transition cursor-pointer"
          aria-label={root === 'home' ? 'الصفحة الرئيسية' : 'العودة إلى الرئيسية'}
          title="الرئيسية"
        >
          <YoungTubeWordmark />
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onSearch}
            className="w-12 h-12 rounded-full flex items-center justify-center text-yt-text hover:bg-yt-surface-muted active:scale-95 transition cursor-pointer"
            aria-label="البحث"
            title="البحث"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onCast}
            className="w-12 h-12 rounded-full flex items-center justify-center text-yt-text hover:bg-yt-surface-muted active:scale-95 transition cursor-pointer"
            aria-label="البث"
            title="البث"
          >
            <Cast className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onParentLock}
            className="w-12 h-12 rounded-full flex items-center justify-center text-yt-text hover:bg-yt-surface-muted active:scale-95 transition cursor-pointer"
            aria-label="قفل الأهل"
            title="قفل الأهل"
          >
            <Lock className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopAppBar;
