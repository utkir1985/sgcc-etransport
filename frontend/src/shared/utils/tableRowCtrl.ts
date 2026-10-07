/** Jadval qatori: holat chipi va amal tugmalari — bir xil ixcham (14px). */
export const TABLE_ROW_CTRL = 'table-row-ctrl';
export const TABLE_ROW_BTN_PRIMARY = 'table-row-ctrl table-row-ctrl--primary';
export const TABLE_ROW_BTN_SECONDARY = 'table-row-ctrl table-row-ctrl--secondary';
export const TABLE_ROW_BTN_WARN = 'table-row-ctrl table-row-ctrl--warn';
export const TABLE_ROW_ACTIONS = 'table-row-actions';

export type TableRowStatusTone = 'sky' | 'amber' | 'emerald' | 'rose';

const TABLE_ROW_STATUS: Record<TableRowStatusTone, string> = {
  sky: 'table-row-ctrl table-row-ctrl--status-sky',
  amber: 'table-row-ctrl table-row-ctrl--status-amber',
  emerald: 'table-row-ctrl table-row-ctrl--status-emerald',
  rose: 'table-row-ctrl table-row-ctrl--status-rose',
};

export function tableRowStatusClass(tone: string): string {
  return TABLE_ROW_STATUS[tone as TableRowStatusTone] ?? TABLE_ROW_STATUS.sky;
}
