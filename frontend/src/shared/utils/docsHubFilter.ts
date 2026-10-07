export type DocsPeriodPreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export const DOCS_PERIOD_PRESETS: Array<{ id: Exclude<DocsPeriodPreset, 'custom'>; label: string }> = [
  { id: 'all', label: 'Barchasi' },
  { id: 'today', label: 'Kunlik' },
  { id: 'week', label: 'Haftalik' },
  { id: 'month', label: 'Oylik' },
];

export function tashkentTodayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

function addTashkentDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00+05:00`);
  date.setTime(date.getTime() + days * 86400000);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

/** Dushanba — Toshkent, locale-ga bog‘lanmaydi. */
export function tashkentWeekStartKey(today = tashkentTodayKey()): string {
  const utcDay = new Date(`${today}T12:00:00+05:00`).getUTCDay();
  const daysFromMonday = utcDay === 0 ? 6 : utcDay - 1;
  return addTashkentDays(today, -daysFromMonday);
}

export function tashkentMonthStartKey(today = tashkentTodayKey()): string {
  return `${today.slice(0, 7)}-01`;
}

export function docsPeriodRange(preset: Exclude<DocsPeriodPreset, 'custom'>): { from: string; to: string } {
  const today = tashkentTodayKey();
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') return { from: tashkentWeekStartKey(today), to: today };
  return { from: tashkentMonthStartKey(today), to: today };
}

export function docsDateKey(iso?: string | null): string {
  if (!iso) return '';
  const sliced = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(sliced)) return sliced;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

export function docsDateInRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  const key = docsDateKey(iso);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function docsMatchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function buildPageItems(currentPage: number, totalPages: number): Array<number | 'dots-left' | 'dots-right'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'dots-right', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, 'dots-left', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'dots-left', currentPage - 1, currentPage, currentPage + 1, 'dots-right', totalPages];
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): {
  page: number;
  totalPages: number;
  startIndex: number;
  slice: T[];
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const startIndex = (current - 1) * pageSize;
  return {
    page: current,
    totalPages,
    startIndex,
    slice: items.slice(startIndex, startIndex + pageSize),
  };
}
