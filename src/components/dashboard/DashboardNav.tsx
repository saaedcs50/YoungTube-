import React, { useRef, useEffect } from 'react';
import {
  User,
  Tv,
  ShieldCheck,
  Clock,
  Sparkles,
  Bookmark,
  Wrench,
  Heart,
  MessageCircle,
} from 'lucide-react';

export type DashboardSectionId =
  | 'child'
  | 'channels'
  | 'filtering'
  | 'timer'
  | 'taste'
  | 'saved'
  | 'support'
  | 'parent-inbox'
  | 'tools';

export interface DashboardNavProps {
  activeSection: DashboardSectionId;
  onSelectSection: (section: DashboardSectionId) => void;
  hasIncompleteSetup?: boolean;
  showTools?: boolean;
  showParentInbox?: boolean;
}

interface NavItem {
  id: DashboardSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'child', label: 'الطفل', icon: User },
  { id: 'channels', label: 'القنوات', icon: Tv },
  { id: 'filtering', label: 'الفلترة والحماية', icon: ShieldCheck },
  { id: 'timer', label: 'الوقت والجلسة', icon: Clock },
  { id: 'taste', label: 'التوجيه الذكي', icon: Sparkles },
  { id: 'saved', label: 'المحفوظات', icon: Bookmark },
  { id: 'support', label: 'دعم YoungTube', icon: Heart },
  { id: 'parent-inbox', label: 'راسلنا', icon: MessageCircle },
  { id: 'tools', label: 'أدوات النظام', icon: Wrench },
];

export const DashboardNav: React.FC<DashboardNavProps> = ({
  activeSection,
  onSelectSection,
  hasIncompleteSetup,
  showTools = false,
  showParentInbox = false,
}) => {
  const visibleItems = NAV_ITEMS.filter((item) => (item.id !== 'tools' || showTools) && (item.id !== 'parent-inbox' || showParentInbox));
  const itemsRef = useRef<Map<DashboardSectionId, HTMLButtonElement>>(new Map());

  // Active tab must scrollIntoView inline nearest
  useEffect(() => {
    const activeEl = itemsRef.current.get(activeSection);
    if (activeEl) {
      activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }
  }, [activeSection]);

  return (
    <nav
      id="dashboard-navigation"
      aria-label="أقسام لوحة الأهل"
      className="w-full max-w-full bg-yt-surface rounded-2xl border border-yt-border p-1.5 shadow-sm overflow-hidden min-w-0"
    >
      <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-none py-0.5 px-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const showSetupAlert = item.id === 'child' && hasIncompleteSetup;

          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) {
                  itemsRef.current.set(item.id, el);
                } else {
                  itemsRef.current.delete(item.id);
                }
              }}
              id={`dashboard-nav-${item.id}`}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`group shrink-0 min-h-[40px] flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                isActive
                  ? 'bg-yt-brand text-yt-brand-text shadow-sm'
                  : 'text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 transition-colors duration-150 ${
                  isActive ? 'text-yt-brand-text' : 'text-yt-text-muted group-hover:text-yt-text'
                }`}
              />
              <span className="whitespace-nowrap">{item.label}</span>

              {showSetupAlert && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive ? 'bg-yt-brand-text ring-2 ring-yt-brand' : 'bg-yt-brand'
                  }`}
                  title="بحاجة للمراجعة"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
