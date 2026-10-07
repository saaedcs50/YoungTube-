import React from 'react';
import { Home, ListVideo, Radio, UserRound } from 'lucide-react';
import type { RootId } from './navigationStore';

interface BottomNavProps {
  selected: RootId;
  onSelect: (root: RootId) => void;
  activeDownloadCount?: number;
  hidden?: boolean;
}

const items: Array<{ id: RootId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'channels', label: 'القنوات', icon: Radio },
  { id: 'playlists', label: 'القوائم', icon: ListVideo },
  { id: 'you', label: 'أنت', icon: UserRound },
];

export const BottomNav: React.FC<BottomNavProps> = ({ selected, onSelect, activeDownloadCount = 0, hidden = false }) => {
  if (hidden) return null;
  return (
    <nav
      id="youngtube-bottom-nav"
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-yt-border bg-yt-bg/96 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="التنقل الرئيسي"
    >
      <div className="mx-auto max-w-xl grid grid-cols-4 min-h-14">
        {items.map(({ id, label, icon: Icon }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`relative min-h-14 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition cursor-pointer active:scale-95 ${isSelected ? 'text-yt-text' : 'text-yt-text-muted'}`}
              aria-current={isSelected ? 'page' : undefined}
              aria-label={label}
            >
              <span className={`relative w-10 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-yt-surface-muted' : ''}`}>
                <Icon className={`w-5 h-5 ${isSelected ? 'stroke-[2.6]' : 'stroke-[2]'}`} />
                {id === 'you' && activeDownloadCount > 0 && (
                  <span className="absolute top-0 right-0 min-w-2 h-2 rounded-full bg-yt-brand border border-yt-bg" aria-label={`${activeDownloadCount} تنزيلات نشطة`} />
                )}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
