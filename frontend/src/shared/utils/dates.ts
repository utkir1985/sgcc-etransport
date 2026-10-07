export const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];

export const MONTH_SHORT_UZ = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun',
  'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek',
];

export const WEEKDAY_SHORT_UZ = ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak'];

export function formatOrderPeriod(year: number, month: number): string {
  return `${MONTH_NAMES_UZ[month - 1] ?? month} ${year}`;
}

/** Davr tugmasi: kun + oy + yil (joriy oyda bugun, boshqasida oy oxiri). */
export function formatOrderPeriodButton(year: number, month: number): string {
  const { day } = periodDisplayDay(year, month);
  return `${day} ${MONTH_NAMES_UZ[month - 1] ?? month} ${year}`;
}

/** Buyurtma davri uchun ISO sana (joriy oyda bugun, boshqasida oy oxiri). */
export function periodToIsoDate(year: number, month: number): string {
  const { day } = periodDisplayDay(year, month);
  return toIsoDate(year, month, day);
}

function periodDisplayDay(year: number, month: number): { day: number } {
  const now = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const day =
    now.getFullYear() === year && now.getMonth() + 1 === month
      ? Math.min(now.getDate(), daysInMonth)
      : daysInMonth;
  return { day };
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `2026-08` — buyurtma oy-yil kaliti. */
export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isoToPeriodKey(iso: string): string | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  return periodKey(parsed.year, parsed.month);
}

/**
 * Buyurtma oy-yili Dan/Gacha oralig‘ida.
 * Ikkala chegara ham bo‘sh bo‘lsa — barcha davrlar (true).
 */
export function matchesPeriodRange(
  year: number,
  month: number,
  fromIso: string,
  toIso: string,
): boolean {
  const key = periodKey(year, month);
  const fromKey = fromIso.trim() ? isoToPeriodKey(fromIso.trim()) : null;
  const toKey = toIso.trim() ? isoToPeriodKey(toIso.trim()) : null;
  if (fromKey && key < fromKey) return false;
  if (toKey && key > toKey) return false;
  return true;
}

/** Kunlik ISO sana Dan/Gacha oralig‘ida (bo‘sh chegara = cheksiz). */
export function matchesDateRange(isoDate: string, fromIso: string, toIso: string): boolean {
  const key = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const from = fromIso.trim().slice(0, 10);
  const to = toIso.trim().slice(0, 10);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/**
 * Oyning statistik oralig'i: 1-sanasidan oy oxirigacha.
 * Joriy oy bo'lsa — oy oxiri o'rniga bugungi sanagacha (kelajak ma'lumot yo'q).
 */
export function monthRangeIso(year: number, month: number): { from: string; to: string } {
  return { from: toIsoDate(year, month, 1), to: periodToIsoDate(year, month) };
}

/** Yangi buyurtma uchun default oy: Gacha → Dan → joriy oy. */
export function defaultYearMonthFromRange(fromIso: string, toIso: string): { year: number; month: number } {
  const parsed = parseIsoDate(toIso.trim()) || parseIsoDate(fromIso.trim());
  if (parsed) return { year: parsed.year, month: parsed.month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function formatPeriodRangeLabel(fromIso: string, toIso: string): string {
  if (!fromIso.trim() && !toIso.trim()) return 'Barcha davrlar';
  const fromLabel = fromIso.trim() ? formatDateUz(fromIso) : '…';
  const toLabel = toIso.trim() ? formatDateUz(toIso) : '…';
  return `${fromLabel} — ${toLabel}`;
}

export function formatDateDisplay(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  return `${String(parsed.day).padStart(2, '0')}.${String(parsed.month).padStart(2, '0')}.${parsed.year}`;
}

export function formatDateTimeDisplay(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const raw = iso.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-');
      return `${d}.${m}.${y}`;
    }
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return '—';
  }
}

/** Kun + o‘zbekcha oy + yil: `6 Avgust 2026`. */
export function formatDateUz(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  return `${parsed.day} ${MONTH_NAMES_UZ[parsed.month - 1] ?? parsed.month} ${parsed.year}`;
}

export function todayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export interface CalendarDay {
  day: number;
  month: number;
  year: number;
  currentMonth: boolean;
}

export function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: CalendarDay[] = [];

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthDays = new Date(prevYear, prevMonth, 0).getDate();

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    days.push({
      day: prevMonthDays - i,
      month: prevMonth,
      year: prevYear,
      currentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({ day, month, year, currentMonth: true });
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let nextDay = 1;
  while (days.length % 7 !== 0) {
    days.push({
      day: nextDay,
      month: nextMonth,
      year: nextYear,
      currentMonth: false,
    });
    nextDay += 1;
  }

  return days;
}
