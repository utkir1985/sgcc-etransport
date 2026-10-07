import * as XLSX from 'xlsx';

/**
 * Excelga yuklashning umumiy yordamchisi.
 * Har bir sahifa o'z jadvalini tayyor qatorlar ko'rinishida beradi — bu yerda
 * faqat varaq yasash, ustun enini o'lchash va faylni saqlash bajariladi.
 */

export type SheetCell = string | number | null | undefined;

export interface ExcelSheet {
  /** Varaq nomi — Excel 31 belgidan uzunini qabul qilmaydi. */
  name: string;
  /** Birinchi qator — sarlavha, qolganlari ma'lumot. */
  rows: SheetCell[][];
}

/** Ustun enini eng uzun katak bo'yicha tanlaydi (6–48 oralig'ida). */
function autoWidths(rows: SheetCell[][]): Array<{ wch: number }> {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      widths[i] = Math.max(widths[i] ?? 0, len);
    });
  }
  return widths.map(w => ({ wch: Math.min(48, Math.max(6, w + 2)) }));
}

function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim();
  return (cleaned || `Varaq ${index + 1}`).slice(0, 31);
}

/** Bir nechta varaqli Excel faylini yasab, brauzerga yuklatadi. */
export function exportSheets(filename: string, sheets: ExcelSheet[]): void {
  const usable = sheets.filter(s => s.rows.length > 0);
  if (usable.length === 0) return;

  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  usable.forEach((sheet, index) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws['!cols'] = autoWidths(sheet.rows);

    let name = safeSheetName(sheet.name, index);
    let suffix = 2;
    while (used.has(name)) {
      name = `${safeSheetName(sheet.name, index).slice(0, 28)} ${suffix++}`;
    }
    used.add(name);

    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Bitta varaqli oddiy holat. */
export function exportSheet(filename: string, sheetName: string, rows: SheetCell[][]): void {
  exportSheets(filename, [{ name: sheetName, rows }]);
}

/** Fayl nomiga qo'shish uchun bugungi sana: 2026-09-22 */
export function todayStamp(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}
