const ONES = [
  '',
  'bir',
  'ikki',
  'uch',
  'to‘rt',
  'besh',
  'olti',
  'yetti',
  'sakkiz',
  'to‘qqiz',
];

const TENS = [
  '',
  'o‘n',
  'yigirma',
  'o‘ttiz',
  'qirq',
  'ellik',
  'oltmish',
  'yetmish',
  'sakson',
  'to‘qson',
];

function underThousand(n: number): string {
  if (n <= 0) return '';
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  if (hundreds === 1) parts.push('yuz');
  else if (hundreds > 1) parts.push(`${ONES[hundreds]} yuz`);
  if (rem > 0) {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }
  return parts.join(' ');
}

/** Butun sonni o‘zbekcha so‘z bilan (yuk xati massasi/tarif uchun). */
export function numberToUzWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'nol';

  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (billions > 0) {
    parts.push(underThousand(billions), billions === 1 ? 'milliard' : 'milliard');
  }
  if (millions > 0) {
    parts.push(underThousand(millions), 'million');
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push('ming');
    else parts.push(underThousand(thousands), 'ming');
  }
  if (rest > 0) parts.push(underThousand(rest));

  return parts.filter(Boolean).join(' ');
}
