import { LOGISTICS_TYPES, type LogisticsType } from './logisticsTypes';

/** Temir yo'l mahsulot turlari */
export const RAILWAY_PRODUCT_TYPES = [
  'Etilenning polimerlari (polietilen)',
  'Suyultirilgan gaz',
  'Barcha turdagi oltingugurt',
  'Tabiiy gaz kondensati',
  'Buten-1',
] as const;

export const RAILWAY_PRODUCT_TYPE_WIDTH_LABEL = RAILWAY_PRODUCT_TYPES.reduce(
  (longest, current) => (current.length > longest.length ? current : longest),
  RAILWAY_PRODUCT_TYPES[0],
);

/** Avtotransport mahsulot turlari */
export const ROAD_PRODUCT_TYPES = [
  'Etilenning polimerlari (polietilen)',
  'Barcha turdagi oltingugurt',
  'Tabiiy gaz kondensati',
  'Polietilen otxod',
] as const;

export const ROAD_PRODUCT_TYPE_OPTIONS = ROAD_PRODUCT_TYPES.map(type => ({
  group: type,
  options: [{ value: type, label: type }],
}));

export const RAILWAY_PRODUCT_TYPE_OPTIONS = RAILWAY_PRODUCT_TYPES.map(type => ({
  group: type,
  options: [{ value: type, label: type }],
}));

export function getProductOptions(logisticsType: LogisticsType) {
  return logisticsType === LOGISTICS_TYPES.Road
    ? ROAD_PRODUCT_TYPE_OPTIONS
    : RAILWAY_PRODUCT_TYPE_OPTIONS;
}

export interface ProductCatalogEntry {
  productType: string;
  title: string;
  shortTitle: string;
}

export function getFlatProductEntries(logisticsType: LogisticsType): ProductCatalogEntry[] {
  return getProductOptions(logisticsType).flatMap(group =>
    group.options.map(option => ({
      productType: option.value,
      title: group.options.length === 1 ? group.group : `${group.group} — ${option.label}`,
      shortTitle: group.options.length === 1 ? group.group : option.label,
    })),
  );
}

/** Admin katalogidan kelgan nomlar bo'yicha hub yozuvlari */
export function entriesFromProductNames(names: string[]): ProductCatalogEntry[] {
  return names.map(name => ({
    productType: name,
    title: name,
    shortTitle: name,
  }));
}

export function getDefaultProductType(logisticsType: LogisticsType): string {
  return logisticsType === LOGISTICS_TYPES.Road
    ? ROAD_PRODUCT_TYPES[0]
    : RAILWAY_PRODUCT_TYPES[1];
}

export function getProductLabel(productType: string, logisticsType: LogisticsType): string {
  for (const group of getProductOptions(logisticsType)) {
    const option = group.options.find(o => o.value === productType);
    if (option) return option.label;
  }
  return productType;
}

export function getProductButtonLabel(productType: string, logisticsType: LogisticsType): string {
  for (const group of getProductOptions(logisticsType)) {
    const option = group.options.find(o => o.value === productType);
    if (!option) continue;
    if (group.options.length === 1) return group.group;
    return option.label;
  }
  return 'Mahsulot turi';
}

export function getTableConfig(logisticsType: LogisticsType) {
  if (logisticsType === LOGISTICS_TYPES.Road) {
    return {
      unitLabel: 'Avtomobil soni',
      tonLabel: 'Og‘irligi (t)',
      unitNumberLabel: 'Avtomobil / tsisterna raqami №',
      destinationLabel: 'Yetkazib berish manzili',
      totalLabel: 'Jami avtomobillar',
    };
  }
  return {
    unitLabel: 'Vagon soni',
    tonLabel: 'Og‘irligi (t)',
    unitNumberLabel: 'Vagon/sisterna raqami №',
    destinationLabel: 'Yetkazib berish joyi (stansiya)',
    totalLabel: 'Jami vagon',
  };
}

export function getTableHeaders(logisticsType: LogisticsType): string[] {
  const cfg = getTableConfig(logisticsType);
  return [
    '№',
    'Korxona (kontragent) nomi',
    cfg.unitLabel,
    cfg.tonLabel,
    'Shartnoma raqami',
    cfg.destinationLabel,
  ];
}
