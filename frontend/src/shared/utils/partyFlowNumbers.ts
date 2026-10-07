export type WagonFlowKind = 'kirish' | 'chiqish';

/** Kirish: IB-mmyy-xxx · Chiqish (Yuk xati): WB-mmyy-xxx */
export function flowPartyNumber(
  kind: WagonFlowKind,
  isoDates: Array<string | null | undefined>,
): string {
  const prefix = kind === 'kirish' ? 'IB' : 'WB';
  const stamps = isoDates.map(value => (value || '').trim()).filter(Boolean).sort();
  const firstStamp = stamps[0];
  const dateObj = firstStamp ? new Date(firstStamp) : new Date();
  const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const mmyy = `${String(validDate.getMonth() + 1).padStart(2, '0')}${String(validDate.getFullYear()).slice(-2)}`;
  return `${prefix}-${mmyy}-001`;
}
