import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  History,
  Target,
  Timer,
  Scale,
  Briefcase,
  Wrench,
  Smartphone,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../../shared/contexts/AuthContext';

export type ReportsHistoryTabKey =
  | 'stats'
  | 'demurrage'
  | 'weight'
  | 'contractors'
  | 'defects'
  | 'history'
  | 'plans'
  | 'tariffs'
  | 'telegram';

type ReportsHistorySection = {
  key: ReportsHistoryTabKey;
  label: string;
  path: string;
  icon: LucideIcon;
  title?: string;
  adminOnly?: boolean;
  colorClass: string;
  activeColorClass: string;
};

/**
 * Modern tactile segmented tabs with distinct semantic colors and active elevation:
 * 1. Jarayonlar tarixi (Xronologiya)
 * 2. Reja (Oylik/kunlik rejalar)
 * 3. Statistika (Asosiy tahlil)
 * 4. Nazorat bo‘limlari: Prostoy, Og‘irlik, Mijozlar, Nosozliklar
 * 5. Sozlamalar: Tariflar, Telegram
 */
const SECTIONS: ReportsHistorySection[] = [
  {
    key: 'history',
    label: 'Jarayonlar tarixi',
    path: '/history',
    icon: History,
    title: 'Barcha vagon va poyezd jarayonlari xronologiyasi',
    colorClass: 'text-slate-500 dark:text-slate-400',
    activeColorClass: 'text-slate-700 dark:text-slate-200',
  },
  {
    key: 'plans',
    label: 'Reja',
    path: '/plans',
    icon: Target,
    title: 'Oylik va kunlik yuklash/jo‘natish rejalari',
    colorClass: 'text-indigo-500 dark:text-indigo-400',
    activeColorClass: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    key: 'stats',
    label: 'Statistika',
    path: '/reports',
    icon: BarChart3,
    title: 'Umumiy hisobotlar va tahliliy ko‘rsatkichlar',
    colorClass: 'text-sky-500 dark:text-sky-400',
    activeColorClass: 'text-sky-600 dark:text-sky-400',
  },
  {
    key: 'demurrage',
    label: 'Prostoy va jarima',
    path: '/reports/demurrage',
    icon: Timer,
    title: 'Vagonlarning to‘xtab turish vaqti va jarima nazorati',
    colorClass: 'text-rose-500 dark:text-rose-400',
    activeColorClass: 'text-rose-600 dark:text-rose-400',
  },
  {
    key: 'weight',
    label: 'Og‘irlik nazorati',
    path: '/reports/weight-control',
    icon: Scale,
    title: 'Ortiqcha yoki kam yuklash nazorati',
    colorClass: 'text-emerald-500 dark:text-emerald-400',
    activeColorClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'contractors',
    label: 'Mijozlar limiti',
    path: '/reports/contractor-limits',
    icon: Briefcase,
    title: 'Mijozlarning buyurtma limiti va qoldig‘i',
    colorClass: 'text-amber-500 dark:text-amber-400',
    activeColorClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    key: 'defects',
    label: 'Nosozliklar (GU-23)',
    path: '/reports/defects-gu23',
    icon: Wrench,
    title: 'Vagonlardagi nosozliklar va GU-23 dalolatnomalari',
    colorClass: 'text-orange-500 dark:text-orange-400',
    activeColorClass: 'text-orange-600 dark:text-orange-400',
  },
  {
    key: 'tariffs',
    label: 'Tariflar',
    path: '/reports/tariffs',
    icon: Settings,
    title: 'Temir yo‘l stavkalari, shartnoma tariflari va jarima miqdori',
    adminOnly: true,
    colorClass: 'text-purple-500 dark:text-purple-400',
    activeColorClass: 'text-purple-600 dark:text-purple-400',
  },
  {
    key: 'telegram',
    label: 'Telegram bildirishnomalar',
    path: '/reports/telegram',
    icon: Smartphone,
    title: 'Dispetcherlik va rahbariyatga avtomatik Telegram xabarlari hamda bot sozlamalari',
    adminOnly: true,
    colorClass: 'text-[#2AABEE]',
    activeColorClass: 'text-[#2AABEE]',
  },
];

/** Yagona qatorli, rangli va kattalashtirilgan segmented tablar paneli */
export function ReportsHistoryTabs({ active }: { active: ReportsHistoryTabKey }) {
  const location = useLocation();
  const { menu, user } = useAuth();
  const hasReportsAccess = menu.some(entry => entry.key === 'reports');
  const isAdmin = user?.role === 'Admin';
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

  const visibleSections = SECTIONS.filter(section => {
    if (section.key === 'stats' && !hasReportsAccess) return false;
    if (section.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <div className="rhub-navigation mb-6">
      <nav
        className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-x-auto max-w-full scrollbar-none"
        aria-label="Hisobotlar va reja bo‘limlari"
        role="tablist"
      >
        {visibleSections.map(section => {
          const Icon = section.icon;
          const isActive = section.key === active;
          return (
            <Link
              key={section.key}
              to={isActive ? currentPath : section.path}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              title={section.title}
              className={`group relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer select-none ${
                isActive
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10 -translate-y-[0.5px]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/50'
              }`}
              onClick={event => {
                if (
                  isActive &&
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                }
              }}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? section.activeColorClass : section.colorClass
                }`}
                strokeWidth={isActive ? 2.2 : 1.9}
                aria-hidden="true"
              />
              <span>{section.label}</span>
              {isActive && (
                <span className="absolute bottom-1 left-4 right-4 h-0.5 rounded-full bg-sky-500 dark:bg-sky-400 animate-in fade-in zoom-in-95 duration-200" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
