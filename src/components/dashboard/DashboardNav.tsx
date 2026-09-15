import React, { useRef, useEffect } from 'react';
import {
  User,
  Tv,
  ShieldCheck,
  Clock,
  Sparkles,
  Bookmark,
  Wrench,
} from 'lucide-react';

export type DashboardSectionId =
  | 'child'
  | 'channels'
  | 'filtering'
  | 'timer'
  | 'taste'
  | 'saved'
  | 'tools';

export interface DashboardNavProps {
  activeSection: DashboardSectionId;
  onSelectSection: (section: DashboardSectionId) => void;
  hasIncompleteSetup?: boolean;
  showTools?: boolean;
}

interface NavItem {
  id: DashboardSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'child', label: 'الطفل', icon: User },
  { id: 'channels', label: 'القنوات', icon: Tv },
  { id: 'filtering', label: 'الفلترة والحماية', icon: ShieldCheck },
  { id: 'timer', label: 'الوقت والجلسة', icon: Clock },
  { id: 'taste', label: 'التوجيه الذكي', icon: Sparkles },
  { id: 'saved', label: 'المحفوظات', icon: Bookmark },
  { id: 'tools', label: 'أدوات النظام', icon: Wrench },
];

export const DashboardNav: React.FC<DashboardNavProps> = ({
  activeSection,
  onSelectSection,
  hasIncompleteSetup,
  showTools = false,
}) => {
  const visibleItems = NAV_ITEMS.filter((item) => item.id !== 'tools' || showTools);
  const itemsRef = useRef<Map<DashboardSectionId, HTMLButtonElement>>(new Map());

  // Ensure active tab smoothly scrolls into view on select / change
  useEffect(() => {
    const activeEl = itemsRef.current.get(activeSection);
    if (activeEl) {
      activeEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [activeSection]);

  return (
    <nav
      id="dashboard-navigation"
      aria-label="أقسام لوحة الأهل"
      className="relative bg-white/90 backdrop-blur-md rounded-2xl border border-stone-200/80 p-1.5 shadow-sm overflow-hidden"
    >
      {/* Subtle edge fade hints for horizontal scroll on mobile */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-white/90 to-transparent sm:hidden z-10" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-white/90 to-transparent sm:hidden z-10" />

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 px-0.5">
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
              className={`group shrink-0 min-h-[42px] flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                isActive
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-200/60'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-transform duration-150 ${
                  isActive ? 'text-white' : 'text-stone-400 group-hover:text-stone-600'
                }`}
              />
              <span className="whitespace-nowrap">{item.label}</span>

              {showSetupAlert && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive ? 'bg-white ring-2 ring-amber-400' : 'bg-amber-500'
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
