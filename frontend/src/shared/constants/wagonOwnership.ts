export const WAGON_OWNERSHIP = {
  Majmua: 'majmua',
  Tashqi: 'tashqi',
} as const;

export type WagonOwnership = typeof WAGON_OWNERSHIP[keyof typeof WAGON_OWNERSHIP];

export function normalizeWagonOwnership(value?: string | null): WagonOwnership {
  return value?.trim().toLowerCase() === WAGON_OWNERSHIP.Majmua
    ? WAGON_OWNERSHIP.Majmua
    : WAGON_OWNERSHIP.Tashqi;
}

export function wagonOwnershipLabel(value?: string | null): string {
  return normalizeWagonOwnership(value) === WAGON_OWNERSHIP.Majmua
    ? 'Majmua'
    : 'Tashqi';
}
