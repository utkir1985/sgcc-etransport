import { ArrowRight, type LucideIcon } from 'lucide-react';

export type HubZoneTone =
  | 'live'
  | 'wait'
  | 'done'
  | 'sky'
  | 'amber'
  | 'emerald'
  | 'slate'
  | 'rose'
  | 'closed'
  | 'sisterna'
  | 'platform'
  | 'container';

export interface HubZoneMetric {
  label: string;
  value: number | string | React.ReactNode;
  actionLabel?: string;
  onClick?: (e: React.MouseEvent) => void;
  tone?: 'sky' | 'amber' | 'emerald' | 'rose' | 'default';
}

export interface HubZoneItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  hint: React.ReactNode;
  icon: LucideIcon;
  tone: HubZoneTone;
  count: number | string | React.ReactNode;
  /** Qo‘shimcha ko‘rsatkichlar (vagon, tonna va hokazo). */
  metrics?: HubZoneMetric[];
  disabled?: boolean;
  title?: string;
  /** Consumerga xos, boshqa kartalarga ta'sir qilmaydigan vizual modifier. */
  className?: string;
  /** Tashqi karta axborot paneli; faqat ichki metrikalar interaktiv. */
  containerOnly?: boolean;
}

interface HubZoneTabsProps<T extends string> {
  items: Array<HubZoneItem<T>>;
  value: T | null;
  onChange: (id: T) => void;
  columns?: 2 | 3 | 4 | 5;
  label?: string;
  /** Faqat ko‘rinish — bosilmaydi (statistika kartochkalari). */
  readOnly?: boolean;
  /** Balandroq kartochkalar (dashboard). */
  size?: 'default' | 'tall';
}

export function HubZoneTabs<T extends string>({
  items,
  value,
  onChange,
  columns = 3,
  label = 'Bo‘limlar',
  readOnly = false,
  size = 'default',
}: HubZoneTabsProps<T>) {
  return (
    <div
      className={`hub-tabs hub-tabs--${columns}${size === 'tall' ? ' hub-tabs--tall' : ''}`}
      role={readOnly ? 'group' : 'tablist'}
      aria-label={label}
    >
      {items.map(item => {
        const Icon = item.icon;
        const on = !readOnly && value === item.id;
        const disabled = Boolean(item.disabled);
        const hasMetrics = Boolean(item.metrics?.length);
        const containerOnly = Boolean(item.containerOnly);
        const Tag = containerOnly ? 'div' : 'button';
        return (
          <Tag
            key={item.id}
            type={containerOnly ? undefined : 'button'}
            role={containerOnly ? 'group' : readOnly ? undefined : 'tab'}
            aria-selected={containerOnly || readOnly ? undefined : on}
            disabled={readOnly || containerOnly ? undefined : disabled}
            aria-disabled={containerOnly || readOnly ? undefined : disabled}
            title={item.title}
            tabIndex={containerOnly || readOnly ? -1 : undefined}
            className={[
              'hub-tab',
              `hub-tab--${item.tone}`,
              on ? 'is-on' : '',
              disabled && !readOnly ? 'is-disabled' : '',
              readOnly ? 'is-static' : '',
              containerOnly ? 'is-container' : '',
              hasMetrics ? 'has-metrics' : '',
              size === 'tall' ? 'hub-tab--tall' : '',
              item.className ?? '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              if (containerOnly || readOnly || disabled) return;
              onChange(item.id);
            }}
          >
            <span className="hub-tab__ico" aria-hidden>
              <Icon strokeWidth={1.9} />
            </span>
            <span className="hub-tab__body">
              <strong className="hub-tab__label">{item.label}</strong>
              <span className="hub-tab__hint">{item.hint}</span>
            </span>
            <span className="hub-tab__count">{item.count}</span>
            {hasMetrics ? (
              <span className="hub-tab__metrics" aria-label={`${typeof item.label === 'string' ? item.label : 'Bo‘lim'} ko‘rsatkichlari`}>
                {item.metrics!.map(m => {
                  const metricClass = [
                    'hub-tab__metric',
                    m.onClick ? 'hub-tab__metric--action' : '',
                    m.tone ? `hub-tab__metric--${m.tone}` : '',
                  ].filter(Boolean).join(' ');

                  if (m.onClick) {
                    return (
                      <span
                        key={m.label}
                        role="button"
                        tabIndex={0}
                        className={metricClass}
                        onClick={e => {
                          e.stopPropagation();
                          m.onClick!(e);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            m.onClick!(e as unknown as React.MouseEvent);
                          }
                        }}
                        aria-label={m.actionLabel || String(m.value)}
                      >
                        <em>{m.label}</em>
                        <strong>
                          {m.value}
                          <ArrowRight className="hub-tab__metric-arrow" strokeWidth={2.25} aria-hidden />
                        </strong>
                        {m.actionLabel ? (
                          <span className="hub-metric-tooltip" role="tooltip" aria-hidden>
                            {m.actionLabel}
                          </span>
                        ) : null}
                      </span>
                    );
                  }
                  return (
                    <span key={m.label} className={metricClass}>
                      <em>{m.label}</em>
                      <strong>{m.value}</strong>
                    </span>
                  );
                })}
              </span>
            ) : null}
          </Tag>
        );
      })}
    </div>
  );
}
