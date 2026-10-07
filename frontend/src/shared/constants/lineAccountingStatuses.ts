export const LINE_ACCOUNTING_STATUSES = {
  Pending: 'Pending',
  Approved: 'Approved',
  Rejected: 'Rejected',
  PendingDeputy: 'PendingDeputy',
  PendingDispatch: 'PendingDispatch',
  DispatchApproved: 'DispatchApproved',
} as const;

export type LineAccountingStatus = typeof LINE_ACCOUNTING_STATUSES[keyof typeof LINE_ACCOUNTING_STATUSES];

export const LINE_ACCOUNTING_STATUS_LABELS: Record<string, string> = {
  Pending: 'Kutilmoqda',
  Approved: 'Kelishilgan',
  Rejected: 'Qaytarilgan',
  PendingDeputy: 'Bosh direktor o\'rinbosari tasdig\'ida',
  PendingDispatch: 'ICHDX ijroga qabulida',
  DispatchApproved: 'Ijroga qabul qilingan',
};

export function normalizeLineAccountingStatus(status?: string | null): LineAccountingStatus {
  if (status && status in LINE_ACCOUNTING_STATUS_LABELS) {
    return status as LineAccountingStatus;
  }
  return LINE_ACCOUNTING_STATUSES.Pending;
}

export function isLineEditable(status?: string | null): boolean {
  const normalized = normalizeLineAccountingStatus(status);
  return normalized === LINE_ACCOUNTING_STATUSES.Pending
    || normalized === LINE_ACCOUNTING_STATUSES.Rejected;
}
