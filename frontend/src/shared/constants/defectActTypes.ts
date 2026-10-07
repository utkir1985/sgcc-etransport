/** Rasmiy dalolatnoma turlari — docs/*.pdf andozalari. */
export type DefectActType =
  | 'platform_no_product'
  | 'platform_repair'
  | 'sisterna_no_product'
  | 'sisterna_repair';

export const DEFECT_ACT_TYPE_LABEL: Record<DefectActType, string> = {
  platform_no_product: 'Fiting platforma — mahsulot yo‘q',
  platform_repair: 'Fiting platforma — ta’mirtalab',
  sisterna_no_product: 'Gaz sisterna — mahsulot yo‘q',
  sisterna_repair: 'Gaz sisterna — ta’mirtalab',
};

export const DEFECT_ACT_TYPES: DefectActType[] = [
  'sisterna_no_product',
  'sisterna_repair',
  'platform_no_product',
  'platform_repair',
];

const REPAIR_RE = /ta['’]?mirtalab|ta['’]?mir|remont|nosoz|buzil|shikast|nosozlik/i;
const NO_PRODUCT_RE = /mahsulot\s*yo['’]?q|mahsuloy|bo['’]sh|yuk\s*qol|qoldiq|kamchilik/i;

export function defectActCategoryFromReason(reason?: string | null): 'no_product' | 'repair' {
  const text = (reason || '').trim();
  if (!text) return 'no_product';
  const repair = REPAIR_RE.test(text);
  const noProduct = NO_PRODUCT_RE.test(text);
  if (repair && !noProduct) return 'repair';
  if (noProduct && !repair) return 'no_product';
  return repair ? 'repair' : 'no_product';
}

export function defectActWagonKind(wagonType?: string | null): 'sisterna' | 'platform' {
  return wagonType === 'platform' ? 'platform' : 'sisterna';
}

export function resolveDefectActType(
  wagonType: string | undefined | null,
  reason?: string | null,
  override?: DefectActType | null,
): DefectActType {
  const kind = defectActWagonKind(wagonType);
  const category = override && DEFECT_ACT_TYPES.includes(override)
    ? (override.endsWith('_repair') ? 'repair' : 'no_product')
    : defectActCategoryFromReason(reason);
  if (kind === 'platform') {
    return category === 'repair' ? 'platform_repair' : 'platform_no_product';
  }
  return category === 'repair' ? 'sisterna_repair' : 'sisterna_no_product';
}

export function hasDefectAct(unit: {
  defectActFileName?: string | null;
  defectActNumber?: string | null;
}): boolean {
  return Boolean(String(unit.defectActNumber ?? '').trim() || String(unit.defectActFileName ?? '').trim());
}

export function defectActDisplayName(unit: {
  defectActNumber?: string | null;
  defectActFileName?: string | null;
}): string {
  return String(unit.defectActNumber ?? '').trim() || String(unit.defectActFileName ?? '').trim();
}
