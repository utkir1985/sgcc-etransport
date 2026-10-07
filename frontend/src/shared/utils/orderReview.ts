import type { MonthlyOrder } from '../types';
import {
  LINE_ACCOUNTING_STATUSES,
  normalizeLineAccountingStatus,
} from '../constants/lineAccountingStatuses';

export interface ContractorReviewGroup {
  contractor: string;
  lines: MonthlyOrder['lines'];
  checked: boolean;
  status: string;
}

export function getContractorReviewGroups(order: MonthlyOrder): ContractorReviewGroup[] {
  const contractors = [...new Set(order.lines.map(line => line.contractor))];

  return contractors.map(contractor => {
    const lines = order.lines.filter(line => line.contractor === contractor);
    const firstLineStatus = normalizeLineAccountingStatus(lines[0]?.accountingStatus);
    const isApproved = firstLineStatus === LINE_ACCOUNTING_STATUSES.Approved;
    const initialChecked = lines[0]?.accountingReviewChecked ?? isApproved;

    return {
      contractor,
      lines,
      checked: initialChecked,
      status: firstLineStatus,
    };
  });
}

export const getPendingContractorGroups = getContractorReviewGroups;

export function buildReviewSelections(
  groups: ContractorReviewGroup[],
  checkedMap: Record<string, boolean>,
): { contractor: string; checked: boolean }[] {
  return groups.map(group => ({
    contractor: group.contractor,
    checked: checkedMap[group.contractor] ?? group.checked,
  }));
}

export function initCheckedMap(groups: ContractorReviewGroup[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const group of groups) {
    map[group.contractor] = group.checked;
  }
  return map;
}

export function canSubmitAccountingReview(groups: ContractorReviewGroup[]): boolean {
  return groups.length > 0;
}
