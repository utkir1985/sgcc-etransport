import { DatePicker } from './DatePicker';

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
 * Davr filtri — Dan / Gacha (Tarix andozasi: tashqi yorliq + dd.mm.yyyy | 📅).
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
      <div className="period-range__fields">
        <label className="thub-date">
          <span>Dan</span>
          <DatePicker
            value={from}
            disabled={disabled}
            placeholder="dd.mm.yyyy"
            variant="compact"
            onChange={onFromChange}
          />
        </label>
        <label className="thub-date">
          <span>Gacha</span>
          <DatePicker
            value={to}
            disabled={disabled}
            placeholder="dd.mm.yyyy"
            variant="compact"
            onChange={onToChange}
          />
        </label>
      </div>
    </div>
  );
}
