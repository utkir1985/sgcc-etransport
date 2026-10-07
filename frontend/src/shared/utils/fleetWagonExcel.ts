import * as XLSX from 'xlsx';
import type { CatalogFleetWagon } from '../types';
import { normalizeStationName } from './cyrillicToLatin';

/** Excel ustun sarlavhalari (o‘zbekcha) — import/export shablon. */
export const FLEET_WAGON_EXCEL_HEADERS = [
  'Tartib raqami',
  'Vagon nomer',
  'Ishlab chiqarilgan yili',
  "Oxirgi kapital ta'mirlangan sanasi",
  "Oxirgi depo hajmda ta'mirlangan sanasi",
  "Keyingi depo hajmda ta'mirlanish qancha muddat qolgani",
  'Yuborilgan manzil',
  'Yuborilgan sanasi',
  'Harakatlanish muddati',
  'Izoh',
] as const;

export type FleetWagonExcelImportRow = {
  wagonNumber: string;
  builtAt?: string;
  lastCapitalRepairAt?: string;
  lastDepotRepairAt?: string;
  daysUntilNextDepotRepair?: number;
  destinationStation?: string;
  sentAt?: string;
  daysInTransit?: number;
  notes?: string;
};

type ColMap = {
  wagon: number;
  built: number;
  capital: number;
  depot: number;
  remain: number;
  dest: number;
  sent: number;
  transit: number;
  notes: number;
};

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
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const n = Number(String(value).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[''`ʻʼ']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function digitsOnly(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value)).replace(/\D/g, '');
  }
  return String(value ?? '')
    .trim()
    .replace(/\D/g, '');
}

function looksLikeWagonNumber(value: unknown): boolean {
  return digitsOnly(value).length === 8;
}

function findCol(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const a = normalizeHeader(alias);
    if (a.length < 3) continue;
    let idx = normalized.findIndex(h => h && h === a);
    if (idx >= 0) return idx;
    idx = normalized.findIndex(
      h => h.length >= 3 && (h.includes(a) || (a.length >= 5 && a.includes(h) && h.length >= 4)),
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function detectWagonColumn(matrix: unknown[][], startRow: number): number {
  const sample = matrix.slice(startRow, startRow + 40);
  if (!sample.length) return 1;
  const width = Math.max(...sample.map(r => (Array.isArray(r) ? r.length : 0)), 0);
  let bestIdx = 1;
  let bestScore = -1;
  for (let c = 0; c < width; c++) {
    let score = 0;
    for (const row of sample) {
      if (looksLikeWagonNumber((row as unknown[])?.[c])) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = c;
    }
  }
  return bestScore > 0 ? bestIdx : 1;
}

function isHeaderRow(row: unknown[]): boolean {
  const cells = (row ?? []).map(c => normalizeHeader(cellStr(c)));
  if (!cells.some(Boolean)) return false;
  if ((row ?? []).some(c => looksLikeWagonNumber(c))) return false;
  const joined = cells.join(' ');
  return /vagon|вагон|wagon|tartib|т\/р|построй|kapital|капит|depo|деп|остаток|manzil|станц|отправ|izoh|примечан|ishlab|yuborilgan|harakat|пути/.test(
    joined,
  );
}

function isRussianLayout(headers: string[]): boolean {
  const joined = headers.map(normalizeHeader).join(' ');
  return /остаток|станц|назнач|дней в пути|примечан|след\.?\s*деп|капит/.test(joined);
}

function isUzbekLayout(headers: string[]): boolean {
  const joined = headers.map(normalizeHeader).join(' ');
  return /yuborilgan manzil|harakatlanish|ishlab chiqarilgan|oxirgi depo|qolgan muddat|qancha muddat/.test(
    joined,
  );
}

function parseStationName(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return undefined;
  if (typeof value === 'number') return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^-?\d+([.,]\d+)?$/.test(s)) return undefined;
  if (parseFlexibleDate(s) && !/[a-zA-Zа-яА-ЯёЁўқғҳʼ']/.test(s)) return undefined;
  const normalized = normalizeStationName(s) || s;
  return normalized.trim() || undefined;
}

function looksLikeDateCell(value: unknown): boolean {
  return parseFlexibleDate(value) != null;
}

function looksLikeTransitDays(value: unknown): boolean {
  const n = parseIntCell(value);
  return n != null && n >= 0 && n <= 400;
}

function looksLikeRemainDays(value: unknown): boolean {
  if (value == null || value === '') return false;
  // Excel sana serialini qolgan kun deb olmaslik
  if (typeof value === 'number' && value > 20000) return false;
  if (value instanceof Date) return false;
  if (looksLikeDateCell(value) && !/^-?\d+([.,]\d+)?$/.test(String(value).trim())) return false;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > -5000 && value < 5000;
  }
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) && n > -5000 && n < 5000;
}

function scoreColumn(
  sample: unknown[][],
  col: number,
  pred: (v: unknown) => boolean,
): number {
  let n = 0;
  for (const row of sample) {
    if (pred((row ?? [])[col])) n++;
  }
  return n;
}

/**
 * Rus jadval (T/R, vagon, built, kapital, izoh, след.деп, остаток, станция, отправка, дней):
 * yoki o‘zbek shablon — kontent bo‘yicha aniqlash.
 */
function detectLayoutByContent(matrix: unknown[][], startRow: number, wagonIdx: number): 'russian' | 'uzbek' {
  const sample = matrix
    .slice(startRow, startRow + 30)
    .filter(r => looksLikeWagonNumber((r ?? [])[wagonIdx]));
  if (!sample.length) return 'uzbek';

  // Rus: wagon+4 sana (след.деп), wagon+5 qolgan kun, wagon+6 stansiya
  const ruDepotDates = scoreColumn(sample, wagonIdx + 4, looksLikeDateCell);
  const ruRemain = scoreColumn(sample, wagonIdx + 5, looksLikeRemainDays);
  const ruDest = scoreColumn(sample, wagonIdx + 6, v => Boolean(parseStationName(v)));

  // UZ: wagon+3 depo sana, wagon+4 qolgan, wagon+5 stansiya
  const uzDepotDates = scoreColumn(sample, wagonIdx + 3, looksLikeDateCell);
  const uzRemain = scoreColumn(sample, wagonIdx + 4, looksLikeRemainDays);
  const uzDest = scoreColumn(sample, wagonIdx + 5, v => Boolean(parseStationName(v)));

  const ruScore = ruDepotDates + ruRemain + ruDest;
  const uzScore = uzDepotDates + uzRemain + uzDest;
  return ruScore > uzScore ? 'russian' : 'uzbek';
}

function colsForRussian(wagonIdx: number): ColMap {
  return {
    wagon: wagonIdx,
    built: wagonIdx + 1,
    capital: wagonIdx + 2,
    notes: wagonIdx + 3,
    // Rus faylda «след. деп. ремонт» sanasi — depo ta'mir sanasi sifatida
    depot: wagonIdx + 4,
    remain: wagonIdx + 5,
    dest: wagonIdx + 6,
    sent: wagonIdx + 7,
    transit: wagonIdx + 8,
  };
}

function colsForUzbek(wagonIdx: number): ColMap {
  return {
    wagon: wagonIdx,
    built: wagonIdx + 1,
    capital: wagonIdx + 2,
    depot: wagonIdx + 3,
    remain: wagonIdx + 4,
    dest: wagonIdx + 5,
    sent: wagonIdx + 6,
    transit: wagonIdx + 7,
    notes: wagonIdx + 8,
  };
}

function daysSince(isoDate: string | undefined): number | undefined {
  if (!isoDate) return undefined;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return undefined;
  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcSent = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(0, Math.round((utcToday - utcSent) / 86400000));
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Bo‘sh shablon (o‘zbekcha sarlavhalar). */
export function downloadFleetWagonTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...FLEET_WAGON_EXCEL_HEADERS],
    [1, '58212440', '14.03.2001', '02.03.2022', '02.03.2022', 1825, 'Oltiariq', '01.07.2026', 5, ''],
  ]);
  ws['!cols'] = FLEET_WAGON_EXCEL_HEADERS.map((_, i) => ({
    wch: i === 0 ? 12 : i === 1 ? 14 : i === 6 ? 18 : 22,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Majmua parki');
  downloadWorkbook(wb, 'majmua-parki-shablon.xlsx');
}

/** Joriy parkni Excelga eksport. */
export function exportFleetWagonsToExcel(items: CatalogFleetWagon[], filename = 'majmua-parki.xlsx') {
  const rows: (string | number)[][] = [[...FLEET_WAGON_EXCEL_HEADERS]];
  items.forEach((item, index) => {
    rows.push([
      index + 1,
      item.wagonNumber,
      formatApiDate(item.builtAt),
      formatApiDate(item.lastCapitalRepairAt),
      formatApiDate(item.lastDepotRepairAt),
      item.daysUntilNextDepotRepair ?? '',
      normalizeStationName(item.destinationStation) || item.destinationStation || '',
      formatApiDate(item.sentAt),
      item.daysInTransit ?? '',
      item.notes ?? '',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = FLEET_WAGON_EXCEL_HEADERS.map((_, i) => ({
    wch: i === 0 ? 12 : i === 1 ? 14 : i === 6 ? 18 : 22,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Majmua parki');
  downloadWorkbook(wb, filename);
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

/** Excel fayldan qatorlarni o‘qish. */
export async function parseFleetWagonExcel(file: File): Promise<FleetWagonExcelImportRow[]> {
  const buffer = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (err) {
    throw new Error(explainExcelReadError(err));
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });
  if (!matrix.length) return [];

  const hasHeader = isHeaderRow(matrix[0] ?? []);
  const dataStart = hasHeader ? 1 : 0;
  const headerRow = hasHeader ? (matrix[0] ?? []).map(c => cellStr(c)) : [];

  let wagonIdx = hasHeader
    ? findCol(headerRow, [
        'vagon nomer',
        'vagon nomeri',
        'vagon raqami',
        '№ вагона',
        'номер вагона',
        'вагона',
        'wagon number',
        'wagon',
      ])
    : -1;

  if (wagonIdx >= 0) {
    const h = normalizeHeader(headerRow[wagonIdx] ?? '');
    if (/^(t\/r|т\/р|tartib|№|no|#)$/.test(h) || (/tartib/.test(h) && !/vagon/.test(h))) {
      wagonIdx = -1;
    }
  }

  if (wagonIdx < 0) {
    wagonIdx = detectWagonColumn(matrix, dataStart);
  } else {
    const sampleOk = matrix
      .slice(dataStart, dataStart + 15)
      .some(r => looksLikeWagonNumber((r ?? [])[wagonIdx]));
    if (!sampleOk) wagonIdx = detectWagonColumn(matrix, dataStart);
  }

  const headerRussian = hasHeader && isRussianLayout(headerRow);
  const headerUzbek = hasHeader && isUzbekLayout(headerRow);
  const contentLayout = detectLayoutByContent(matrix, dataStart, wagonIdx);
  const useRussian = headerRussian || (!headerUzbek && contentLayout === 'russian');

  // Asosiy layout — qat'iy indeks (ustunlar aralashmasin)
  let cols: ColMap = useRussian ? colsForRussian(wagonIdx) : colsForUzbek(wagonIdx);

  // Sarlavha bo‘lsa — aniqroq ustunlarni ustiga yozish (layout ichida)
  if (hasHeader) {
    const hBuilt = findCol(headerRow, ['ishlab chiqarilgan', 'год постройки', 'built']);
    const hCapital = findCol(headerRow, ['kapital', 'капит']);
    const hDepot = findCol(headerRow, [
      'oxirgi depo',
      "oxirgi depo hajmda",
      'след. деп',
      'след деп',
      'деп. ремонт',
      'деп ремонт',
    ]);
    const hRemain = findCol(headerRow, [
      'qancha muddat',
      'qolgan muddat',
      'остаток до',
      'остаток',
      "keyingi depo hajmda ta'mirlanish qancha",
    ]);
    const hDest = findCol(headerRow, [
      'yuborilgan manzil',
      'станция назначения',
      'станция',
      'назначения',
      'manzil',
    ]);
    const hSent = findCol(headerRow, ['yuborilgan sanasi', 'дата отправки', 'отправки']);
    const hTransit = findCol(headerRow, [
      'harakatlanish muddati',
      'harakatlanish',
      'дней в пути',
      'в пути',
    ]);
    const hNotes = findCol(headerRow, ['izoh', 'примечание', 'notes']);

    if (hBuilt >= 0) cols = { ...cols, built: hBuilt };
    if (hCapital >= 0) cols = { ...cols, capital: hCapital };
    if (hDepot >= 0) cols = { ...cols, depot: hDepot };
    if (hRemain >= 0) cols = { ...cols, remain: hRemain };
    if (hDest >= 0) cols = { ...cols, dest: hDest };
    if (hSent >= 0) cols = { ...cols, sent: hSent };
    if (hTransit >= 0) cols = { ...cols, transit: hTransit };
    if (hNotes >= 0) cols = { ...cols, notes: hNotes };
  }

  // Kontent tekshiruvi: remain sana bo‘lib qolgan bo‘lsa — rus layoutga majburan
  const sample = matrix
    .slice(dataStart, dataStart + 25)
    .filter(r => looksLikeWagonNumber((r ?? [])[wagonIdx]));
  const remainOk = scoreColumn(sample, cols.remain, looksLikeRemainDays) >= Math.max(1, sample.length * 0.3);
  const depotOk = scoreColumn(sample, cols.depot, looksLikeDateCell) >= Math.max(1, sample.length * 0.3);
  if ((!remainOk || !depotOk) && contentLayout === 'russian') {
    cols = colsForRussian(wagonIdx);
  }

  const result: FleetWagonExcelImportRow[] = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const wagonNumber = digitsOnly(row[cols.wagon]);
    if (wagonNumber.length !== 8) continue;

    const notesRaw = String(row[cols.notes] ?? '').trim();
    const notes =
      notesRaw &&
      !parseFlexibleDate(notesRaw) &&
      !/^-?\d+([.,]\d+)?$/.test(notesRaw) &&
      !looksLikeWagonNumber(notesRaw)
        ? notesRaw
        : undefined;

    const sentAt = toIsoDate(row[cols.sent]);
    let daysInTransit: number | undefined;
    if (looksLikeTransitDays(row[cols.transit])) {
      daysInTransit = parseIntCell(row[cols.transit]);
    } else {
      daysInTransit = daysSince(sentAt);
    }

    // Depo sanasi: avvalo depot ustuni; bo‘sh bo‘lsa rus «след.деп» indeksi
    let lastDepotRepairAt = toIsoDate(row[cols.depot]);
    if (!lastDepotRepairAt && useRussian) {
      lastDepotRepairAt = toIsoDate(row[wagonIdx + 4]);
    }

    let daysUntilNextDepotRepair = looksLikeRemainDays(row[cols.remain])
      ? parseIntCell(row[cols.remain])
      : undefined;
    if (daysUntilNextDepotRepair == null && useRussian && looksLikeRemainDays(row[wagonIdx + 5])) {
      daysUntilNextDepotRepair = parseIntCell(row[wagonIdx + 5]);
    }

    result.push({
      wagonNumber,
      builtAt: toIsoDate(row[cols.built]),
      lastCapitalRepairAt: toIsoDate(row[cols.capital]),
      lastDepotRepairAt,
      daysUntilNextDepotRepair,
      destinationStation: parseStationName(row[cols.dest]),
      sentAt,
      daysInTransit,
      notes,
    });
  }
  return result;
}
