import { useState } from 'react';
import { ChevronRight, LayoutGrid, List, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ProductDetailBackButton } from './ProductDetailBackButton';

export type AdminHubTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'cyan' | 'rose' | 'indigo' | 'sky';

export interface AdminHubItem {
  key: string;
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  tone?: AdminHubTone;
}

type HubViewMode = 'list' | 'card';

function ViewModeToggle({
  value,
  onChange,
}: {
  value: HubViewMode;
  onChange: (mode: HubViewMode) => void;
}) {
  return (
    <div className="marketing-view-toggle" role="group" aria-label="Ko'rinish rejimi">
      <button
        type="button"
        aria-pressed={value === 'list'}
        aria-label="Ro'yxat"
        onClick={() => onChange('list')}
        className={`marketing-view-toggle__btn${value === 'list' ? ' marketing-view-toggle__btn--active' : ''}`}
      >
        <List className="w-4 h-4" strokeWidth={1.75} />
        <span className="marketing-view-toggle__text">Ro&apos;yxat</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'card'}
        aria-label="Kartochka"
        onClick={() => onChange('card')}
        className={`marketing-view-toggle__btn${value === 'card' ? ' marketing-view-toggle__btn--active' : ''}`}
      >
        <LayoutGrid className="w-4 h-4" strokeWidth={1.75} />
        <span className="marketing-view-toggle__text">Kartochka</span>
      </button>
    </div>
  );
}

const TONE_CLASSES: Record<AdminHubTone, { iconBg: string; text: string; border: string; glow: string; badgeBg: string }> = {
  blue: {
    iconBg: 'bg-blue-50 dark:bg-blue-950/60',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200/80 dark:border-blue-800',
    glow: 'group-hover:shadow-blue-500/10',
    badgeBg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200/60 dark:border-blue-800',
  },
  emerald: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200/80 dark:border-emerald-800',
    glow: 'group-hover:shadow-emerald-500/10',
    badgeBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800',
  },
  violet: {
    iconBg: 'bg-violet-50 dark:bg-violet-950/60',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200/80 dark:border-violet-800',
    glow: 'group-hover:shadow-violet-500/10',
    badgeBg: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border-violet-200/60 dark:border-violet-800',
  },
  amber: {
    iconBg: 'bg-amber-50 dark:bg-amber-950/60',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200/80 dark:border-amber-800',
    glow: 'group-hover:shadow-amber-500/10',
    badgeBg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/60 dark:border-amber-800',
  },
  cyan: {
    iconBg: 'bg-cyan-50 dark:bg-cyan-950/60',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200/80 dark:border-cyan-800',
    glow: 'group-hover:shadow-cyan-500/10',
    badgeBg: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200/60 dark:border-cyan-800',
  },
  rose: {
    iconBg: 'bg-rose-50 dark:bg-rose-950/60',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200/80 dark:border-rose-800',
    glow: 'group-hover:shadow-rose-500/10',
    badgeBg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200/60 dark:border-rose-800',
  },
  indigo: {
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200/80 dark:border-indigo-800',
    glow: 'group-hover:shadow-indigo-500/10',
    badgeBg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800',
  },
  sky: {
    iconBg: 'bg-sky-50 dark:bg-sky-950/60',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200/80 dark:border-sky-800',
    glow: 'group-hover:shadow-sky-500/10',
    badgeBg: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200/60 dark:border-sky-800',
  },
};

export interface AdminSectionHubProps {
  title: string;
  description: string;
  items: AdminHubItem[];
  defaultView?: HubViewMode;
}

export function AdminSectionHub({
  title,
  description,
  items,
  defaultView = 'card',
}: AdminSectionHubProps) {
  const [viewMode, setViewMode] = useState<HubViewMode>(defaultView);

  return (
    <div className="space-y-6">
      {/* Sarlavha va Ko'rinish almashtirgich */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Variant A: Kartochkalar Grid ko'rinishi */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(item => {
            const tone = item.tone || 'blue';
            const style = TONE_CLASSES[tone] || TONE_CLASSES.blue;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`group relative flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 shadow-xs hover:shadow-lg ${style.glow} transition-all duration-200 overflow-hidden`}
              >
                {/* Tepasi: Ikonka va Sarlavha */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xs transition-transform duration-200 group-hover:scale-110 ${style.iconBg} ${style.border} ${style.text}`}>
                      <Icon className="w-7 h-7" strokeWidth={2} />
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${style.badgeBg}`}>
                      Ma&apos;lumotnoma
                    </span>
                  </div>

                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed font-sans">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Pastki qism: Ochish tugmasi */}
                <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Boshqarish
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:border-blue-300 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/40 transition-all shadow-2xs">
                    <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.5} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* Ro'yxat ko'rinishi */
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {items.map(item => {
            const tone = item.tone || 'blue';
            const style = TONE_CLASSES[tone] || TONE_CLASSES.blue;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.path}
                className="flex items-center justify-between p-4.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-2xs transition-transform group-hover:scale-105 ${style.iconBg} ${style.border} ${style.text}`}>
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-sans">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 pl-4">
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-blue-600 transition-colors hidden sm:inline">
                    Ochish
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" strokeWidth={2} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AdminSectionDetailProps {
  title: string;
  description: string;
  backTo: string;
  children?: React.ReactNode;
}

export function AdminSectionDetail({
  title,
  description,
  backTo,
  children,
}: AdminSectionDetailProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div className="ui-card marketing-product-detail-bar">
        <div className="marketing-product-detail-bar__main">
          <ProductDetailBackButton onClick={() => navigate(backTo)} />
          <h2 className="marketing-product-detail-title">{title}</h2>
        </div>
      </div>

      {children ? (
        <div className="space-y-4">
          {description ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{description}</p>
          ) : null}
          {children}
        </div>
      ) : (
        <div className="ui-card p-5 sm:p-6">
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4 leading-relaxed">{description}</p>
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Bo&apos;lim tayyorlanmoqda</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Keyingi bosqichda to&apos;liq funksional qo&apos;shiladi.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface AdminTabsProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}

export function AdminTabs({ tabs, active, onChange }: AdminTabsProps) {
  return (
    <div className="admin-tabs" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`admin-tabs__btn${active === tab.key ? ' admin-tabs__btn--active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
