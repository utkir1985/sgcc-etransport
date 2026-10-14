export interface OrderQuantityLine {
  wagonCount: number;
  tonCount?: number | null;
  quantityUnit?: string | null;
}

export function lineWagonCount(line: OrderQuantityLine): number {
  return Math.max(0, line.wagonCount || 0);
}

export function lineTonCount(line: OrderQuantityLine): number {
  return Math.max(0, line.tonCount || 0);
}

export function summarizeOrderQuantities(lines: OrderQuantityLine[]) {
  let wagonTotal = 0;
  let tonTotal = 0;

  for (const line of lines) {
    wagonTotal += lineWagonCount(line);
    tonTotal += lineTonCount(line);
  }

  return { wagonTotal, tonTotal: Math.round(tonTotal * 1000) / 1000 };
}

export function formatOrderQuantityLine(count: number, unit?: string | null): string {
  // Eski format (bitta ustun) — faqat fallback
  if (unit === 'ton') return `${Math.round(count * 1000) / 1000} tonna`;
  return `${count} vagon`;
}

export function formatOrderWagonTons(wagonCount: number, tonCount: number): string {
  const w = Math.max(0, wagonCount || 0);
  const t = Math.round(Math.max(0, tonCount || 0) * 1000) / 1000;
  if (w > 0 && t > 0) return `${w} vagon · ${t} tonna`;
  if (t > 0) return `${t} tonna`;
  return `${w} vagon`;
}

export function formatOrderQuantityTotal(wagonTotal: number, tonTotal: number): string {
  if (wagonTotal > 0 && tonTotal > 0) {
    return `${wagonTotal} vagon · ${tonTotal} tonna`;
  }
  if (tonTotal > 0) {
    return `${tonTotal} tonna`;
  }
  return String(wagonTotal);
}

export function formatOrderQuantityTotalFromLines(lines: OrderQuantityLine[]): string {
  const { wagonTotal, tonTotal } = summarizeOrderQuantities(lines);
  return formatOrderQuantityTotal(wagonTotal, tonTotal);
}

/** Tonna: mingliklar probel bilan, kasr nuqta bilan (masalan, 8 301.26) — brauzer locale'iga bog‘liq emas. */
export function formatTons(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [int, frac] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const decimals = frac.replace(/0+$/, '');
  return `${rounded < 0 ? '-' : ''}${grouped}${decimals ? `.${decimals}` : ''}`;
}
