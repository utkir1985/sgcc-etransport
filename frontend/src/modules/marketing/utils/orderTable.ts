import type { MonthlyOrderLine } from '../../../shared/types';
import {
  formatOrderPeriod,
  formatOrderPeriodButton,
  MONTH_NAMES_UZ,
  MONTH_SHORT_UZ,
} from '../../../shared/utils/dates';

export { formatOrderPeriod, formatOrderPeriodButton, MONTH_NAMES_UZ, MONTH_SHORT_UZ };

export interface OrderTableRow {
  line: MonthlyOrderLine;
  groupNumber: number;
  isFirstInGroup: boolean;
  isFirstInTable: boolean;
  groupRowSpan: number;
  totalRows: number;
}

/** Korxona bo'yicha qatorlarni jadval rowspan uchun guruhlaydi */
export function buildOrderTableRows(lines: MonthlyOrderLine[]): OrderTableRow[] {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalRows = sorted.length;
  if (totalRows === 0) return [];

  const groups: { contractor: string; lines: MonthlyOrderLine[] }[] = [];
  for (const line of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.contractor === line.contractor) {
      last.lines.push(line);
    } else {
      groups.push({ contractor: line.contractor, lines: [line] });
    }
  }

  const rows: OrderTableRow[] = [];
  groups.forEach((group, gi) => {
    group.lines.forEach((line, li) => {
      rows.push({
        line,
        groupNumber: gi + 1,
        isFirstInGroup: li === 0,
        isFirstInTable: rows.length === 0,
        groupRowSpan: group.lines.length,
        totalRows,
      });
    });
  });

  return rows;
}
