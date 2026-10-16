/**
 * Buyurtma qatorida bir nechta yetkazib berish stansiyasi bo'lishi mumkin — ular
 * bitta maydonda vergul bilan saqlanadi ("Oqjar, Xayrabod"). Yuk xatida vagon uchun ulardan bittasi tanlanadi.
 */
export function splitStations(value?: string | null): string[] {
  return Array.from(new Set((value ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)));
}

export function joinStations(list: string[]): string {
  return Array.from(new Set(list.map(s => s.trim()).filter(Boolean))).join(', ');
}

/** Qatorda aniq bitta stansiya bo'lsa — o'sha (yuk xatida tanlash shart emas). */
export function singleStation(value?: string | null): string | null {
  const list = splitStations(value);
  return list.length === 1 ? list[0] : null;
}
