import * as XLSX from 'xlsx';
import type { CatalogContainer } from '../types';
import { normalizeStationName } from './cyrillicToLatin';

/** Excel ustunlari — ruscha (2345.xlsx) + o‘zbekcha aliaslar. */
export const CONTAINER_EXCEL_HEADERS = [
  '№ Konteyner',
  'Ishlab chiqarilgan',
  'Keyingi tekshiruv',
  'Qolgan muddat',
  'Yuborilgan manzil',
  'Yuborilgan sana',
  'Yo‘lda kunlar',
  'Izoh',
] as const;

export type ContainerExcelImportRow = {
  containerNumber: string;
  builtAt?: string;
  nextInspectionAt?: string;
  daysUntilNextInspection?: number;
  destinationStation?: string;
  sentAt?: string;
  daysInTransit?: number;
  notes?: string;
};

type ColMap = {
  number: number;
  built: number;
  nextInsp: number;
  remain: number;
  dest: number;
  sent: number;
  transit: number;
  notes: number;
};

const HEADER_SKIP = new Set([
  '№',
  'no',
  'n',
  'контейнер',
  'konteyner',
  'container',
  'год постройки',
  'дата',
  'примечание',
  'izoh',
]);

function cellStr(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return formatDateDisplay(value);
  if (typeof value === 'number' && !Number.isNaN(value)) {
    if (value > 20000 && value < 80000) {
      const parsed = excelSerialToDate(value);
      return parsed ? formatDateDisplay(parsed) : String(value);
    }
    return String(value);
  }
  return String(value).trim();
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseFlexibleDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    return excelSerialToDate(value);
  }
  const raw = String(value).trim().replace(/г\.?$/i, '').replace(/\s+/g, '');
  if (!raw) return null;

  let m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{4}$/.test(raw)) {
    return new Date(Date.UTC(Number(raw), 0, 1));
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function toIsoDate(value: unknown): string | undefined {
  const d = parseFlexibleDate(value);
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatApiDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatDateDisplay(d);
}

function parseIntCell(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const n = Number(String(value).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Kirill/lotin aralashmasini lotinga (UNGU uchun). */
function latinizeContainerId(raw: string): string {
  // Eng ko‘p uchraydigan prefiks: kirill «УНГУ» → lotin UNGU
  let s = raw
    .replace(/УНГУ/gi, 'UNGU')
    .replace(/унгу/gi, 'UNGU');
  const map: Record<string, string> = {
    а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x',
    А: 'A', Е: 'E', О: 'O', Р: 'P', С: 'C', У: 'U', Х: 'X',
    Н: 'H', н: 'h', В: 'B', в: 'b', К: 'K', к: 'k', М: 'M', м: 'm',
    Т: 'T', т: 't', Г: 'G', г: 'g',
  };
  return [...s].map(ch => map[ch] ?? ch).join('');
}

function normalizeContainerNumber(raw: string): string {
  return latinizeContainerId(raw)
    .replace(/[\u00a0\u2000-\u200b]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Excel ochish xatolarini o‘zbekcha tushunarli xabarga aylantiradi. */
export function explainExcelReadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (lower.includes('password-protected') || lower.includes('password protected') || lower.includes('encryption')) {
    return 'Excel fayl parol bilan himoyalangan. Excelda: Fayl → Ma’lumot → Parolni olib tashlang, keyin «Saqlash» qilib qayta import qiling.';
  }
  if (lower.includes('unsupported file') || lower.includes('cfb')) {
    return 'Excel formatini o‘qib bo‘lmadi. .xlsx qilib saqlang yoki shablonni yuklab oling.';
  }
  return msg || 'Excel o‘qishda xatolik';
}

function looksLikeContainerNumber(value: unknown): boolean {
  const s = normalizeContainerNumber(cellStr(value));
  if (!s || s.length < 4) return false;
  // sarlavha satrlari
  const low = s.toLowerCase();
  if (low.includes('контейнер') || low.includes('konteyner') || low.includes('container')) return false;
  if (low.includes('построй') || low.includes('остаток') || low.includes('станц')) return false;

  // UNGU 010006/1, UNGU010006/1, ...
  if (/UNGU\s*\d{3,}/i.test(s)) return true;
  if (/^[A-Z]{2,8}[\s-]?\d{3,}(\/\d+)?$/i.test(s)) return true;
  if (/^\d{5,}\/\d+$/.test(s)) return true;
  // raqam + slash (010006/1)
  if (/^\d{4,}\/\d+$/.test(s)) return true;
  return false;
}

function isAcceptableContainerId(value: unknown, strict: boolean): boolean {
  const raw = cellStr(value);
  if (!raw) return false;
  const s = normalizeContainerNumber(raw);
  if (HEADER_SKIP.has(s.toLowerCase())) return false;
  if (looksLikeContainerNumber(raw)) return true;
  if (strict) return false;
  // Ustun aniq topilganda — bo‘sh bo‘lmagan, sana/son emas ID
  if (s.length < 4) return false;
  if (/^\d{1,3}$/.test(s)) return false; // tartib raqami
  if (parseFlexibleDate(value) && !/[A-Z]/i.test(s)) return false;
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 1000) return false; // excel serial / kun
  return /[A-Z]/i.test(s) || /\d{4,}/.test(s);
}

function headerKey(value: unknown): string {
  return latinizeContainerId(cellStr(value))
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[''`ʼ№#]/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCol(headers: unknown[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headerKey(headers[i]);
    if (!h) continue;
    for (const a of aliases) {
      const alias = a.toLowerCase();
      if (h === alias || h.includes(alias) || alias.includes(h)) return i;
    }
  }
  return -1;
}

function detectColumns(headers: unknown[]): ColMap | null {
  const number = findCol(headers, [
    'контейнер',
    'konteyner',
    'container',
    'номер контейнера',
    'nomer konteyner',
  ]);
  const built = findCol(headers, [
    'год постройки',
    'god postroiki',
    'ishlab chiqarilgan',
    'постройк',
    'built',
  ]);
  const nextInsp = findCol(headers, [
    'дата след',
    'след исп',
    'data sled',
    'keyingi tekshiruv',
    'next inspection',
    'следующ',
  ]);
  const remain = findCol(headers, [
    'остаток',
    'ostatok',
    'qolgan muddat',
    'days until',
  ]);
  const dest = findCol(headers, [
    'станция назначения',
    'stanciya naznacheniya',
    'yuborilgan manzil',
    'назначен',
    'destination',
    'станция',
    'stanciya',
  ]);
  const sent = findCol(headers, [
    'дата отправки',
    'data otpravki',
    'yuborilgan sana',
    'отправк',
    'sent',
  ]);
  const transit = findCol(headers, [
    'дней в пути',
    'dney v puti',
    "yo'lda kunlar",
    'yo‘lda kunlar',
    'в пути',
    'v puti',
    'transit',
  ]);
  const notes = findCol(headers, [
    'примечание',
    'primechanie',
    'izoh',
    'note',
  ]);

  if (number < 0) return null;
  return { number, built, nextInsp, remain, dest, sent, transit, notes };
}

function detectByContent(rows: unknown[][]): ColMap | null {
  if (rows.length < 1) return null;
  const sample = rows.slice(0, Math.min(80, rows.length));
  const colCount = Math.max(...sample.map(r => (r?.length ?? 0)), 0);
  let bestCol = -1;
  let bestHits = 0;
  for (let c = 0; c < colCount; c++) {
    let hits = 0;
    for (const row of sample) {
      if (looksLikeContainerNumber(row?.[c])) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestCol = c;
    }
  }
  if (bestCol < 0 || bestHits < 1) return null;
  // Yon ustunlar: 2345.xlsx tartibi
  return {
    number: bestCol,
    built: bestCol + 1 < colCount ? bestCol + 1 : -1,
    nextInsp: bestCol + 2 < colCount ? bestCol + 2 : -1,
    remain: bestCol + 3 < colCount ? bestCol + 3 : -1,
    dest: bestCol + 4 < colCount ? bestCol + 4 : -1,
    sent: bestCol + 5 < colCount ? bestCol + 5 : -1,
    transit: bestCol + 6 < colCount ? bestCol + 6 : -1,
    notes: bestCol + 7 < colCount ? bestCol + 7 : -1,
  };
}

function parseRow(row: unknown[], map: ColMap, headerFound: boolean): ContainerExcelImportRow | null {
  const rawNum = cellStr(row[map.number]);
  if (!isAcceptableContainerId(rawNum, !headerFound)) return null;
  const containerNumber = normalizeContainerNumber(rawNum);
  if (!containerNumber) return null;

  const destRaw = map.dest >= 0 ? cellStr(row[map.dest]) : '';
  return {
    containerNumber,
    builtAt: map.built >= 0 ? toIsoDate(row[map.built]) : undefined,
    nextInspectionAt: map.nextInsp >= 0 ? toIsoDate(row[map.nextInsp]) : undefined,
    daysUntilNextInspection: map.remain >= 0 ? parseIntCell(row[map.remain]) : undefined,
    destinationStation: destRaw
      ? normalizeStationName(destRaw) || destRaw.toUpperCase()
      : undefined,
    sentAt: map.sent >= 0 ? toIsoDate(row[map.sent]) : undefined,
    daysInTransit: map.transit >= 0 ? parseIntCell(row[map.transit]) : undefined,
    notes: map.notes >= 0 ? cellStr(row[map.notes]) || undefined : undefined,
  };
}

function parseSheet(sheet: XLSX.WorkSheet): ContainerExcelImportRow[] {
  const rows = XLSX.utils.sheet_to_json<(unknown | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  }) as unknown[][];

  if (!rows.length) return [];

  let start = 0;
  let map: ColMap | null = null;
  let headerFound = false;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const detected = detectColumns(rows[i] ?? []);
    if (detected) {
      map = detected;
      start = i + 1;
      headerFound = true;
      break;
    }
  }
  if (!map) {
    map = detectByContent(rows);
    start = 0;
    headerFound = false;
  }
  if (!map) return [];

  const out: ContainerExcelImportRow[] = [];
  const seen = new Set<string>();
  for (let i = start; i < rows.length; i++) {
    const parsed = parseRow(rows[i] ?? [], map, headerFound);
    if (!parsed) continue;
    if (seen.has(parsed.containerNumber)) continue;
    seen.add(parsed.containerNumber);
    out.push(parsed);
  }
  return out;
}

export async function parseContainerExcel(file: File): Promise<ContainerExcelImportRow[]> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true });
  } catch (err) {
    throw new Error(explainExcelReadError(err));
  }

  const merged: ContainerExcelImportRow[] = [];
  const seen = new Set<string>();
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    for (const row of parseSheet(sheet)) {
      if (seen.has(row.containerNumber)) continue;
      seen.add(row.containerNumber);
      merged.push(row);
    }
  }
  return merged;
}

export function downloadContainerTemplate(filename = 'konteynerlar-shablon.xlsx') {
  const ws = XLSX.utils.aoa_to_sheet([
    [...CONTAINER_EXCEL_HEADERS],
    ['UNGU 010006/1', '10.10.2000', '06.06.2028', 671, 'ShGKM', '17.07.2026', 19, ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Konteynerlar');
  XLSX.writeFile(wb, filename);
}

export function exportContainersToExcel(items: CatalogContainer[], filename = 'konteynerlar.xlsx') {
  const rows = [
    [...CONTAINER_EXCEL_HEADERS],
    ...items.map(item => [
      item.containerNumber,
      formatApiDate(item.builtAt),
      formatApiDate(item.nextInspectionAt),
      item.daysUntilNextInspection ?? '',
      item.destinationStation ?? '',
      formatApiDate(item.sentAt),
      item.daysInTransit ?? '',
      item.notes ?? '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Konteynerlar');
  XLSX.writeFile(wb, filename);
}
