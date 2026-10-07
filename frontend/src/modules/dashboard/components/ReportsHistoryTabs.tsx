import { useState } from 'react';
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
import { TelegramAlertsModal } from './TelegramAlertsModal';

export type ReportsHistoryTabKey =
  | 'stats'
  | 'demurrage'
  | 'weight'
  | 'contractors'
  | 'defects'
  | 'history'
  | 'plans'
  | 'tariffs';

type ReportsHistorySection = {
  key: ReportsHistoryTabKey;
  label: string;
  path: string;
  icon: LucideIcon;
  title?: string;
  adminOnly?: boolean;
};

/**
 * Dasturchilar va UI/UX standarti bo‘yicha mantiqiy tartiblangan yagona qatorli tablar:
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
  },
  {
    key: 'plans',
    label: 'Reja',
    path: '/plans',
    icon: Target,
    title: 'Oylik va kunlik yuklash/jo‘natish rejalari',
  },
  {
    key: 'stats',
    label: 'Statistika',
    path: '/reports',
    icon: BarChart3,
    title: 'Umumiy hisobotlar va tahliliy ko‘rsatkichlar',
  },
  {
    key: 'demurrage',
    label: 'Prostoy va jarima',
    path: '/reports/demurrage',
    icon: Timer,
    title: 'Vagonlarning to‘xtab turish vaqti va jarima nazorati',
  },
  {
    key: 'weight',
    label: 'Og‘irlik nazorati',
    path: '/reports/weight-control',
    icon: Scale,
    title: 'Ortiqcha yoki kam yuklash nazorati',
  },
  {
    key: 'contractors',
    label: 'Mijozlar limiti',
    path: '/reports/contractor-limits',
    icon: Briefcase,
    title: 'Mijozlarning buyurtma limiti va qoldig‘i',
  },
  {
    key: 'defects',
    label: 'Nosozliklar (GU-23)',
    path: '/reports/defects-gu23',
    icon: Wrench,
    title: 'Vagonlardagi nosozliklar va GU-23 dalolatnomalari',
  },
  {
    key: 'tariffs',
    label: 'Tariflar',
    path: '/reports/tariffs',
    icon: Settings,
    title: 'Temir yo‘l stavkalari, shartnoma tariflari va jarima miqdori',
    adminOnly: true,
  },
];

/** Yagona qatorli to‘g‘ridan-to‘g‘ri navigatsiya paneli */
export function ReportsHistoryTabs({ active }: { active: ReportsHistoryTabKey }) {
  const location = useLocation();
  const { menu, user } = useAuth();
  const hasReportsAccess = menu.some(entry => entry.key === 'reports');
  const isAdmin = user?.role === 'Admin';
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const [tgModalOpen, setTgModalOpen] = useState(false);

  const visibleSections = SECTIONS.filter(section => {
    if (section.key === 'stats' && !hasReportsAccess) return false;
    if (section.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <>
      <div className="rhub-navigation mb-4">
        <nav
          className="thub-pills rhub-section-tabs flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none"
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
                className={`whitespace-nowrap ${isActive ? 'is-on' : ''}`}
                title={section.title}
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
                <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{section.label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setTgModalOpen(true)}
              title="Dispetcherlik va rahbariyatga avtomatik Telegram xabarlari"
              aria-haspopup="dialog"
              className="whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>Telegram bildirishnomalar</span>
            </button>
          )}
        </nav>
      </div>

      <TelegramAlertsModal
        isOpen={tgModalOpen}
        onClose={() => setTgModalOpen(false)}
      />
    </>
  );
}
