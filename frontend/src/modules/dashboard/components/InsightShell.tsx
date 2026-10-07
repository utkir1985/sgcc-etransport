import type { ReactNode } from 'react';

type InsightTab = {
  id: string;
  label: string;
  count?: number;
};

interface InsightShellProps {
  title: string;
  subtitle?: string;
  tabs?: InsightTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  toolbar?: ReactNode;
  metrics?: ReactNode;
  meta?: string;
  children: ReactNode;
}

export function InsightShell({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  toolbar,
  metrics,
  meta,
  children,
}: InsightShellProps) {
  return (
    <div className="insight">
      <header className="insight__head">
        <div className="insight__titles">
          <h1 className="insight__title">{title}</h1>
          {subtitle ? <p className="insight__subtitle">{subtitle}</p> : null}
        </div>
        {toolbar ? <div className="insight__toolbar">{toolbar}</div> : null}
      </header>

      {tabs && tabs.length > 0 && onTabChange ? (
        <nav className="insight__tabs" aria-label={title}>
          {tabs.map(tab => {
            const on = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                className={`insight__tab${on ? ' insight__tab--on' : ''}`}
                aria-current={on ? 'page' : undefined}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
                {typeof tab.count === 'number' ? (
                  <span className="insight__tab-count">{tab.count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      ) : null}

      {metrics ? <div className="insight__metrics">{metrics}</div> : null}

      {meta ? <div className="insight__meta">{meta}</div> : null}

      <div className="insight__body">{children}</div>
    </div>
  );
}

export function InsightMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'in' | 'load' | 'out';
}) {
  return (
    <div className={`insight-metric${tone && tone !== 'default' ? ` insight-metric--${tone}` : ''}`}>
      <span className="insight-metric__label">{label}</span>
      <strong className="insight-metric__value">{value}</strong>
      {hint ? <em className="insight-metric__hint">{hint}</em> : null}
    </div>
  );
}

export function InsightEmpty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="insight-empty">
      <p className="insight-empty__title">{title}</p>
      {text ? <p className="insight-empty__text">{text}</p> : null}
    </div>
  );
}
