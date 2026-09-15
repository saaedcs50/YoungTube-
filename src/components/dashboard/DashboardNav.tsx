import React from 'react';
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
}) => {
  return (
    <nav
      id="dashboard-navigation"
      aria-label="أقسام لوحة الأهل"
      className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-200/80 p-1.5 shadow-2xs"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 px-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const showSetupAlert = item.id === 'child' && hasIncompleteSetup;

          return (
            <button
              key={item.id}
              id={`dashboard-nav-${item.id}`}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`group shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                isActive
                  ? 'bg-amber-500 text-white shadow-xs shadow-amber-200/60'
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
