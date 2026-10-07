import { LOGISTICS_TYPES, type LogisticsType } from './logisticsTypes';

/** 1 vagon/avtomobil uchun odatiy tonna (taxminiy yuk). */
export const DEFAULT_TONS_PER_WAGON = 31;
export const DEFAULT_TONS_PER_TRUCK = 20;

/** Mahsulot bo‘yicha 1 transport birligiga tonna (yo‘q bo‘lsa default). */
const PRODUCT_TONS_PER_UNIT: Record<string, number> = {
  'Suyultirilgan gaz': 31,
  'Suyultirilgan uglevodorod gazi': 31,
  'Buten-1': 31,
  'Tabiiy gaz kondensati': 31,
  'Barcha turdagi oltingugurt': 31,
  'Etilenning polimerlari (polietilen)': 31,
  'Polietilen otxod': 31,
};

export function getTonsPerUnit(productType: string, logisticsType: LogisticsType): number {
  if (logisticsType === LOGISTICS_TYPES.Road) {
    return DEFAULT_TONS_PER_TRUCK;
  }
  const mapped = PRODUCT_TONS_PER_UNIT[productType.trim()];
  if (mapped && mapped > 0) return mapped;
  return DEFAULT_TONS_PER_WAGON;
}

export function calcTonsFromUnits(
  unitCount: number,
  productType: string,
  logisticsType: LogisticsType,
): number {
  if (unitCount <= 0) return 0;
  return unitCount * getTonsPerUnit(productType, logisticsType);
}
