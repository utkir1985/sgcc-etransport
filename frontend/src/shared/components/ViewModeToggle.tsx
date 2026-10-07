import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'list' | 'card';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

/** Yuklash taqsimotidagi kabi Ro‘yxat / Kartochka ko‘rinish o‘tkazgichi. */
export function ViewModeToggle({ value, onChange, className = '' }: ViewModeToggleProps) {
  return (
    <div className={`marketing-view-toggle ${className}`.trim()} role="group" aria-label="Ko'rinish rejimi">
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
