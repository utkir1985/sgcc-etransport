export const ORDER_QUANTITY_UNITS = {
  Wagon: 'wagon',
  Ton: 'ton',
} as const;

export type OrderQuantityUnit = typeof ORDER_QUANTITY_UNITS[keyof typeof ORDER_QUANTITY_UNITS];

export const ORDER_QUANTITY_UNIT_OPTIONS: { value: OrderQuantityUnit; label: string }[] = [
  { value: ORDER_QUANTITY_UNITS.Wagon, label: 'Vagon' },
  { value: ORDER_QUANTITY_UNITS.Ton, label: 'Tonna' },
];

export function normalizeOrderQuantityUnit(unit?: string | null): OrderQuantityUnit {
  return unit === ORDER_QUANTITY_UNITS.Ton ? ORDER_QUANTITY_UNITS.Ton : ORDER_QUANTITY_UNITS.Wagon;
}
