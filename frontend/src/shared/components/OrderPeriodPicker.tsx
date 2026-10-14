import { DateRangePicker } from './DateRangePicker';

interface OrderPeriodPickerProps {
  from: string;
  to: string;
  onFromChange: (iso: string) => void;
  onToChange: (iso: string) => void;
  disabled?: boolean;
  variant?: 'default' | 'embedded';
  /** @deprecated eski API — e'tiborsiz */
  filterYear?: number;
  filterMonth?: number;
  periodOpen?: boolean;
  periodRef?: unknown;
  pickerYear?: number;
  periodView?: 'month' | 'year';
  pickerYears?: number[];
  disabledLabel?: string;
  formatLabel?: (year: number, month: number) => string;
  onToggle?: () => void;
  onPickerYearChange?: unknown;
  onPeriodViewToggle?: () => void;
  onSelectPeriod?: (year: number, month: number) => void;
  onPickerYearSelect?: (year: number) => void;
}

/**
 * Davr filtri — «Boshlanish → Tugash» oraliq tanlagichi.
 * Ikkala maydon ham bo‘sh → barcha davrlar.
 */
export function OrderPeriodPicker({
  from,
  to,
  onFromChange,
  onToChange,
  disabled = false,
  variant = 'default',
}: OrderPeriodPickerProps) {
  const isEmbedded = variant === 'embedded';

  return (
    <div
      className={`filter-field filter-field--period period-picker period-range${
        isEmbedded ? ' period-picker--embedded' : ''
      }`}
    >
      {!isEmbedded ? <span className="filter-field-label">Davr</span> : null}
      <DateRangePicker
        from={from}
        to={to}
        onFromChange={onFromChange}
        onToChange={onToChange}
        disabled={disabled}
      />
    </div>
  );
}
