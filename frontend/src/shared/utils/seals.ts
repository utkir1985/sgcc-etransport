/**
 * Plomba raqamlarini ajratadi. 1C ba'zan bitta plombani ichida bo'sh joy bilan yuboradi
 * ("4947 942-25  4947 943-25") — bunday qisqa raqamli bo'lak keyingi "942-25" bilan
 * bitta plomba sifatida qo'shiladi ("4947942-25"). Ajratuvchilar: / , ; | va bo'sh joy.
 */
export function splitSealNumbers(raw?: string | number | null): string[] {
  if (raw == null) return [];
  const result: string[] = [];
  for (const segment of String(raw).replace(/[№#]/g, '').split(/[/,;|]+/)) {
    const tokens = segment.trim().split(/\s+/).filter(t => /[0-9A-Za-z]/.test(t));
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const next = tokens[i + 1];
      if (/^\d{1,4}$/.test(token) && next && /^\d+-\d+$/.test(next)) {
        result.push(token + next);
        i += 1;
      } else {
        result.push(token);
      }
    }
  }
  return Array.from(new Set(result));
}
