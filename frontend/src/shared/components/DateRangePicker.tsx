import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, MoveRight, X } from 'lucide-react';
import { buildCalendarDays, MONTH_NAMES_UZ, MONTH_SHORT_UZ, parseIsoDate, todayIso, toIsoDate } from '../utils/dates';

/** Ikki harfli hafta kunlari — ikki oylik ixcham kalendar uchun. */
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const MENU_WIDTH = 480;
const MENU_HEIGHT = 290;

interface DateRangePickerProps {
  from: string;
  to: string;
  onFromChange: (iso: string) => void;
  onToChange: (iso: string) => void;
  disabled?: boolean;
  /** Kelajakdagi kunlarni tanlab bo‘lmaydi (arxiv va tarix filtrlari uchun). */
  disableFuture?: boolean;
  startPlaceholder?: string;
  endPlaceholder?: string;
  className?: string;
}

function formatShort(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}.${p.year}`;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const YEAR_SPAN = 12;

interface MonthPaneProps {
  title: string;
  year: number;
  month: number;
  onViewChange: (view: { year: number; month: number }) => void;
  selected: string;
  from: string;
  to: string;
  isDisabled: (iso: string) => boolean;
  onPick: (iso: string) => void;
}

type PaneMode = 'days' | 'months' | 'years';

function MonthPane({ title, year, month, onViewChange, selected, from, to, isDisabled, onPick }: MonthPaneProps) {
  const today = todayIso();
  const todayParsed = parseIsoDate(today)!;
  const [mode, setMode] = useState<PaneMode>('days');
  const [yearPage, setYearPage] = useState(() => Math.floor(year / YEAR_SPAN) * YEAR_SPAN);
  const days = buildCalendarDays(year, month);

  const navigate = (delta: number) => {
    if (mode === 'years') setYearPage(p => p + delta * YEAR_SPAN);
    else if (mode === 'months') onViewChange({ year: year + delta, month });
    else onViewChange(shiftMonth(year, month, delta));
  };

  const onTitleClick = () => {
    if (mode === 'days') setMode('months');
    else if (mode === 'months') {
      setYearPage(Math.floor(year / YEAR_SPAN) * YEAR_SPAN);
      setMode('years');
    }
  };

  const titleText = mode === 'years'
    ? `${yearPage} – ${yearPage + YEAR_SPAN - 1}`
    : mode === 'months'
      ? String(year)
      : `${MONTH_NAMES_UZ[month - 1]} ${year}`;

  const prevLabel = mode === 'years' ? 'Oldingi yillar' : mode === 'months' ? 'Oldingi yil' : 'Oldingi oy';
  const nextLabel = mode === 'years' ? 'Keyingi yillar' : mode === 'months' ? 'Keyingi yil' : 'Keyingi oy';

  return (
    <div className="date-range__pane">
      <div className="date-range__pane-title">{title}</div>
      <div className="date-range__nav">
        <button type="button" className="date-range__nav-btn" onClick={() => navigate(-1)} aria-label={prevLabel}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="date-range__title-btn"
          onClick={onTitleClick}
          disabled={mode === 'years'}
          aria-label={mode === 'days' ? 'Oyni tanlash' : mode === 'months' ? 'Yilni tanlash' : undefined}
        >
          {titleText}
        </button>
        <button type="button" className="date-range__nav-btn" onClick={() => navigate(1)} aria-label={nextLabel}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {mode === 'days' ? (
        <div className="date-range__grid" role="grid">
          {WEEKDAYS.map(day => <span key={day} className="date-range__weekday">{day}</span>)}
          {days.map(cell => {
            if (!cell.currentMonth) return <span key={`${cell.year}-${cell.month}-${cell.day}`} />;
            const iso = toIsoDate(cell.year, cell.month, cell.day);
            const disabled = isDisabled(iso);
            const inRange = Boolean(from && to && iso > from && iso < to);
            const isEdge = iso === from || iso === to;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                className={[
                  'date-range__day',
                  inRange ? 'is-in-range' : '',
                  isEdge ? 'is-edge' : '',
                  iso === selected ? 'is-selected' : '',
                  iso === today ? 'is-today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onPick(iso)}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      ) : null}
      {mode === 'months' ? (
        <div className="date-range__picker-grid" role="listbox" aria-label="Oy tanlash">
          {MONTH_SHORT_UZ.map((label, index) => {
            const m = index + 1;
            return (
              <button
                key={label}
                type="button"
                className={[
                  'date-range__picker-btn',
                  m === month ? 'is-active' : '',
                  todayParsed.year === year && todayParsed.month === m && m !== month ? 'is-today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  onViewChange({ year, month: m });
                  setMode('days');
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {mode === 'years' ? (
        <div className="date-range__picker-grid" role="listbox" aria-label="Yil tanlash">
          {Array.from({ length: YEAR_SPAN }, (_, i) => yearPage + i).map(y => (
            <button
              key={y}
              type="button"
              className={[
                'date-range__picker-btn',
                y === year ? 'is-active' : '',
                todayParsed.year === y && y !== year ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                onViewChange({ year: y, month });
                setMode('months');
              }}
            >
              {y}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Davr oralig‘i — bitta maydon «Boshlanish → Tugash», ikki oylik kalendar
 * (chapda boshlanish, o‘ngda tugash). Ikkalasi bo‘sh bo‘lsa — barcha davrlar.
 */
export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  disabled = false,
  disableFuture = false,
  startPlaceholder = 'Boshlanish',
  endPlaceholder = 'Tugash',
  className = '',
}: DateRangePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<{ top: number; left: number; width: number } | null>(null);

  const today = parseIsoDate(todayIso())!;
  const fromParsed = parseIsoDate(from);
  const toParsed = parseIsoDate(to);
  const initialRight = toParsed ?? today;
  const initialLeft = fromParsed ?? shiftMonth(initialRight.year, initialRight.month, -1);
  const [leftView, setLeftView] = useState({ year: initialLeft.year, month: initialLeft.month });
  const [rightView, setRightView] = useState({ year: initialRight.year, month: initialRight.month });

  // Ochilganda ko‘rinish tanlangan sanalarga moslanadi
  useEffect(() => {
    if (!open) return;
    const right = parseIsoDate(to) ?? today;
    const left = parseIsoDate(from) ?? shiftMonth(right.year, right.month, -1);
    setLeftView({ year: left.year, month: left.month });
    setRightView({ year: right.year, month: right.month });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLayout = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    let top = rect.bottom + 6;
    const height = width < 440 ? MENU_HEIGHT * 2 : MENU_HEIGHT;
    if (top + height > window.innerHeight - 8 && rect.top - height - 6 > 8) top = rect.top - height - 6;
    setLayout({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) {
      setLayout(null);
      return;
    }
    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);
    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const todayIsoValue = todayIso();
  const isFuture = (iso: string) => disableFuture && iso > todayIsoValue;

  const hasValue = Boolean(from || to);
  const menu = open && layout ? (
    <div
      ref={menuRef}
      className={`date-range__menu${layout.width < 440 ? ' date-range__menu--stacked' : ''}`}
      style={{ top: layout.top, left: layout.left, width: layout.width }}
      role="dialog"
      aria-label="Davrni tanlash"
    >
      <div className="date-range__panes">
        <MonthPane
          title="Boshlanish"
          year={leftView.year}
          month={leftView.month}
          onViewChange={setLeftView}
          selected={from}
          from={from}
          to={to}
          isDisabled={iso => isFuture(iso) || Boolean(to && iso > to)}
          onPick={onFromChange}
        />
        <MonthPane
          title="Tugash"
          year={rightView.year}
          month={rightView.month}
          onViewChange={setRightView}
          selected={to}
          from={from}
          to={to}
          isDisabled={iso => isFuture(iso) || Boolean(from && iso < from)}
          onPick={iso => {
            onToChange(iso);
            if (from) setOpen(false);
          }}
        />
      </div>
      <div className="date-range__foot">
        <button
          type="button"
          className="date-range__link"
          onClick={() => {
            onFromChange('');
            onToChange('');
          }}
        >
          Tozalash
        </button>
        <button type="button" className="date-range__link date-range__link--primary" onClick={() => setOpen(false)}>
          Tayyor
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={`date-range${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`date-range__trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={from ? 'date-range__value' : 'date-range__placeholder'}>
          {from ? formatShort(from) : startPlaceholder}
        </span>
        <MoveRight className="date-range__arrow" aria-hidden />
        <span className={to ? 'date-range__value' : 'date-range__placeholder'}>
          {to ? formatShort(to) : endPlaceholder}
        </span>
        <CalendarDays className="date-range__icon" aria-hidden />
      </button>
      {hasValue && !disabled ? (
        <button
          type="button"
          className="date-range__clear"
          aria-label="Davrni tozalash"
          onClick={() => {
            onFromChange('');
            onToChange('');
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
