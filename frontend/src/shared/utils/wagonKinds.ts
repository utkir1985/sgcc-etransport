export type WagonKind = 'sisterna' | 'closed' | 'platform';

export const WAGON_KIND_LABEL: Record<WagonKind, string> = {
  sisterna: 'Vagon-sisterna',
  closed: 'Yopiq turdagi vagon',
  platform: 'Fiting platforma',
};

export const WAGON_KIND_SUBTITLE: Record<WagonKind, string> = {
  sisterna: 'Sisterna vagon',
  closed: 'Yopiq vagon',
  platform: 'Platforma + konteynerlar',
};

/** Mahsulot tavsiyalari — vagon turiga mos */
export const WAGON_KIND_PRODUCT_HINTS: Record<WagonKind, string[]> = {
  sisterna: ['Suyultirilgan gaz', 'Tabiiy gaz kondensati', 'Buten-1'],
  closed: ['Etilenning polimerlari (polietilen)', 'Barcha turdagi oltingugurt'],
  platform: ['Suyultirilgan gaz', 'Tabiiy gaz kondensati', 'Buten-1'],
};

export function isWagonKind(value?: string | null): value is WagonKind {
  return value === 'sisterna' || value === 'closed' || value === 'platform';
}

export function recommendProductsForKinds(
  kinds: WagonKind[],
  catalog: string[],
): string[] {
  const counts = new Map<WagonKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);

  const ranked = ([...counts.entries()] as [WagonKind, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const preferred: string[] = [];
  for (const kind of ranked) {
    for (const name of WAGON_KIND_PRODUCT_HINTS[kind]) {
      if (catalog.includes(name) && !preferred.includes(name)) preferred.push(name);
    }
  }
  for (const name of catalog) {
    if (!preferred.includes(name)) preferred.push(name);
  }
  return preferred;
}
