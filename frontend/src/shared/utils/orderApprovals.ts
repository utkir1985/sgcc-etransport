import type { MonthlyOrder } from '../types';
import {
  LINE_ACCOUNTING_STATUSES,
  type LineAccountingStatus,
  normalizeLineAccountingStatus,
} from '../constants/lineAccountingStatuses';

const AGREED_STATUSES = new Set<LineAccountingStatus>([
  LINE_ACCOUNTING_STATUSES.Approved,
  LINE_ACCOUNTING_STATUSES.PendingDeputy,
  LINE_ACCOUNTING_STATUSES.PendingDispatch,
  LINE_ACCOUNTING_STATUSES.DispatchApproved,
]);

export function filterAgreedOrderLines(order: MonthlyOrder): MonthlyOrder {
  return {
    ...order,
    lines: order.lines.filter(line =>
      AGREED_STATUSES.has(normalizeLineAccountingStatus(line.accountingStatus))),
  };
}

export function hasAccountingApproval(order: MonthlyOrder): boolean {
  return !!order.accountingApproverName;
}
