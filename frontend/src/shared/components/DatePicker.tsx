import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildCalendarDays,
  formatDateUz,
  MONTH_NAMES_UZ,
  MONTH_SHORT_UZ,
  parseIsoDate,
  todayIso,
  toIsoDate,
  WEEKDAY_SHORT_UZ,
} from '../utils/dates';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  variant?: 'default' | 'compact';
}

type Panel = 'days' | 'months' | 'years';

interface MenuLayout {
  top: number;
  left: number;
  width: number;
}

const MENU_WIDTH = 280;
const MENU_HEIGHT = 360;
const COMPACT_MENU_MIN_WIDTH = 252;
const YEAR_SPAN = 12;

function getMenuLayout(trigger: HTMLElement, variant: 'default' | 'compact'): MenuLayout {
  const rect = trigger.getBoundingClientRect();
  const cellRect = trigger.closest('td')?.getBoundingClientRect() ?? null;
  const menuWidth = variant === 'compact' && cellRect
    ? Math.max(COMPACT_MENU_MIN_WIDTH, cellRect.width)
    : MENU_WIDTH;

  let top = rect.bottom + 6;
  let left = variant === 'compact' && cellRect
    ? cellRect.left
    : rect.left;

  if (top + MENU_HEIGHT > window.innerHeight - 8) {
    top = Math.max(8, rect.top - MENU_HEIGHT - 6);
  }

  if (variant === 'compact' && cellRect) {
    left = cellRect.left;
    // Menyu katakdan kengroq bo‘lsa, o‘ng chetini katak o‘ng chetiga tekislaymiz (jadvaldan chiqmaydi)
    if (left + menuWidth > cellRect.right) {
      left = Math.max(8, cellRect.right - menuWidth);
    }
  } else {
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 8) left = 8;
  }

  // Jadvalning o‘ng chetidagi katakda menyu ekrandan chiqib ketmasin
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuWidth - 8);
  }

  return { top, left, width: menuWidth };
}

function yearPageStart(year: number): number {
  return Math.floor(year / YEAR_SPAN) * YEAR_SPAN;
}

export function DatePicker({
  value,
  onChange,
  required,
  disabled,
  placeholder = 'Sanani tanlang',
  variant = 'default',
}: DatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const parsed = parseIsoDate(value);
  const today = todayIso();
  const todayParsed = parseIsoDate(today)!;

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('days');
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const [viewYear, setViewYear] = useState(parsed?.year ?? todayParsed.year);
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? todayParsed.month);
  const [yearPage, setYearPage] = useState(() => yearPageStart(parsed?.year ?? todayParsed.year));

  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
      setYearPage(yearPageStart(parsed.year));
    }
  }, [value]);

  useEffect(() => {
    if (!open) setPanel('days');
  }, [open]);

  const updateMenuPosition = () => {
    if (!triggerRef.current) return;
    setMenuLayout(getMenuLayout(triggerRef.current, variant));
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, variant, panel]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const calendarDays = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const yearOptions = useMemo(
    () => Array.from({ length: YEAR_SPAN }, (_, i) => yearPage + i),
    [yearPage],
  );

  const goPrev = () => {
    if (panel === 'years') {
      setYearPage(y => y - YEAR_SPAN);
      return;
    }
    if (panel === 'months') {
      setViewYear(y => y - 1);
      return;
    }
    if (viewMonth === 1) {
      setViewYear(y => y - 1);
      setViewMonth(12);
      return;
    }
    setViewMonth(m => m - 1);
  };

  const goNext = () => {
    if (panel === 'years') {
      setYearPage(y => y + YEAR_SPAN);
      return;
    }
    if (panel === 'months') {
      setViewYear(y => y + 1);
      return;
    }
    if (viewMonth === 12) {
      setViewYear(y => y + 1);
      setViewMonth(1);
      return;
    }
    setViewMonth(m => m + 1);
  };

  const selectDate = (year: number, month: number, day: number) => {
    onChange(toIsoDate(year, month, day));
    setOpen(false);
  };

  const selectMonth = (month: number) => {
    setViewMonth(month);
    setPanel('days');
  };

  const selectYear = (year: number) => {
    setViewYear(year);
    setYearPage(yearPageStart(year));
    setPanel('months');
  };

  const headerTitle =
    panel === 'years'
      ? `${yearOptions[0]} – ${yearOptions[yearOptions.length - 1]}`
      : panel === 'months'
        ? String(viewYear)
        : `${MONTH_NAMES_UZ[viewMonth - 1]} ${viewYear}`;

  const onHeaderTitleClick = () => {
    if (panel === 'days') setPanel('months');
    else if (panel === 'months') {
      setYearPage(yearPageStart(viewYear));
      setPanel('years');
    }
  };

  const navPrevLabel =
    panel === 'years' ? 'Oldingi yillar' : panel === 'months' ? 'Oldingi yil' : 'Oldingi oy';
  const navNextLabel =
    panel === 'years' ? 'Keyingi yillar' : panel === 'months' ? 'Keyingi yil' : 'Keyingi oy';

  const menu = open && menuLayout ? (
    <div
      ref={menuRef}
      className={`date-picker-menu date-picker-menu--fixed${variant === 'compact' ? ' date-picker-menu--compact' : ''}`}
      style={{ top: menuLayout.top, left: menuLayout.left, width: menuLayout.width }}
      role="dialog"
      aria-label="Sana tanlash"
    >
      <div className="date-picker-menu-inner">
        <div className="date-picker-header">
          <button type="button" className="date-picker-nav" aria-label={navPrevLabel} onClick={goPrev}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={`date-picker-title-btn${panel === 'years' ? ' date-picker-title-btn--static' : ''}`}
            onClick={onHeaderTitleClick}
            disabled={panel === 'years'}
            aria-label={
              panel === 'days' ? 'Oyni tanlash' : panel === 'months' ? 'Yilni tanlash' : undefined
            }
          >
            {headerTitle}
          </button>
          <button type="button" className="date-picker-nav" aria-label={navNextLabel} onClick={goNext}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {panel === 'days' ? (
          <>
            <div className="date-picker-weekdays" aria-hidden="true">
              {WEEKDAY_SHORT_UZ.map(day => (
                <span key={day} className="date-picker-weekday">{day}</span>
              ))}
            </div>

            <div className="date-picker-days">
              {calendarDays.map(cell => {
                const iso = toIsoDate(cell.year, cell.month, cell.day);
                const isSelected = value === iso;
                const isToday = today === iso;
                return (
                  <button
                    key={`${cell.year}-${cell.month}-${cell.day}`}
                    type="button"
                    onClick={() => selectDate(cell.year, cell.month, cell.day)}
                    className={[
                      'date-picker-day',
                      !cell.currentMonth ? 'date-picker-day--muted' : '',
                      isSelected ? 'date-picker-day--active' : '',
                      isToday && !isSelected ? 'date-picker-day--today' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {panel === 'months' ? (
          <div className="date-picker-grid" role="listbox" aria-label="Oy tanlash">
            {MONTH_SHORT_UZ.map((label, index) => {
              const month = index + 1;
              const active = viewMonth === month;
              const isCurrent =
                todayParsed.year === viewYear && todayParsed.month === month;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => selectMonth(month)}
                  className={[
                    'date-picker-grid-btn',
                    active ? 'date-picker-grid-btn--active' : '',
                    isCurrent && !active ? 'date-picker-grid-btn--today' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}

        {panel === 'years' ? (
          <div className="date-picker-grid" role="listbox" aria-label="Yil tanlash">
            {yearOptions.map(year => {
              const active = viewYear === year;
              const isCurrent = todayParsed.year === year;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => selectYear(year)}
                  className={[
                    'date-picker-grid-btn',
                    active ? 'date-picker-grid-btn--active' : '',
                    isCurrent && !active ? 'date-picker-grid-btn--today' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {year}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="date-picker-footer">
          <button
            type="button"
            className="date-picker-footer-btn"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            Tozalash
          </button>
          <button
            type="button"
            className="date-picker-footer-btn"
            onClick={() => {
              onChange(today);
              setViewYear(todayParsed.year);
              setViewMonth(todayParsed.month);
              setYearPage(yearPageStart(todayParsed.year));
              setOpen(false);
            }}
          >
            Bugun
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`date-picker${variant === 'compact' ? ' date-picker--compact' : ''}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={`date-picker-trigger${open ? ' date-picker-trigger--open' : ''}${disabled ? ' date-picker-trigger--disabled' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={value ? 'date-picker-value' : 'date-picker-placeholder'}>
          {value ? formatDateUz(value) : placeholder}
        </span>
        <span className="date-picker-affix" aria-hidden="true">
          <Calendar className="date-picker-icon" strokeWidth={1.75} />
        </span>
      </button>

      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="date-picker-hidden-input"
          value={value}
          onChange={() => {}}
          required
        />
      )}

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
