/** 1C dan kelgan kirill mahsulot / matnlarni lotin (o‘zbek) ko‘rinishiga o‘tkazish. */

const PRODUCT_MAP: Record<string, string> = {
  'суюлтирилган газ': 'Suyultirilgan gaz',
  'суюлтирилган газ (пропан-бутан)': 'Suyultirilgan gaz',
  'этиленнинг полимерлари (полиэтилен)': 'Etilenning polimerlari (polietilen)',
  'этиленнинг полимерлари': 'Etilenning polimerlari (polietilen)',
  'полиэтилен': 'Etilenning polimerlari (polietilen)',
  'барча турдаги олтингугурт': 'Barcha turdagi oltingugurt',
  'табиий газ конденсати': 'Tabiiy gaz kondensati',
  'бутен-1': 'Buten-1',
  'полиэтилен отход': 'Polietilen otxod',
  'полиэтилен отьод': 'Polietilen otxod',
};

/** Kirill → lotin (o‘zbek/rus aralash matn uchun). */
const CHAR_MAP: Record<string, string> = {
  А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g',
  Д: 'D', д: 'd', Е: 'E', е: 'e', Ё: 'Yo', ё: 'yo', Ж: 'J', ж: 'j',
  З: 'Z', з: 'z', И: 'I', и: 'i', Й: 'Y', й: 'y', К: 'K', к: 'k',
  Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n', О: 'O', о: 'o',
  П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
  У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'X', х: 'x', Ц: 'Ts', ц: 'ts',
  Ч: 'Ch', ч: 'ch', Ш: 'Sh', ш: 'sh', Щ: 'Sh', щ: 'sh', Ъ: '', ъ: '',
  Ы: 'I', ы: 'i', Ь: '', ь: '', Э: 'E', э: 'e', Ю: 'Yu', ю: 'yu',
  Я: 'Ya', я: 'ya',
  Ғ: "G'", ғ: "g'", Қ: 'Q', қ: 'q', Ҳ: 'H', ҳ: 'h', Ў: "O'", ў: "o'",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function transliterateChars(value: string): string {
  let out = '';
  for (const ch of value) {
    out += CHAR_MAP[ch] ?? ch;
  }
  return out;
}

/** Mahsulot nomini lotinga: avval katalog map, so‘ng umumiy translit. */
export function toLatinProductName(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const mapped = PRODUCT_MAP[normalizeKey(value)];
  if (mapped) return mapped;
  return transliterateChars(value);
}

/** Ism/familiya uchun (kerak bo‘lsa) — asosan lotin qoladi. */
export function toLatinText(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (!/[Ѐ-ӿҒғҚқҲҳЎў]/.test(value)) return value;
  return transliterateChars(value);
}

/** Ism/familiya: birinchi harf katta, qolgani kichik (YARMATOV → Yarmatov). */
export function toPersonNameCase(raw?: string | null): string {
  const latin = toLatinText(raw);
  if (!latin) return '';
  return latin
    .split(/\s+/)
    .filter(Boolean)
    .map((word: string) => {
      const lower = word.toLocaleLowerCase('uz');
      return lower.charAt(0).toLocaleUpperCase('uz') + lower.slice(1);
    })
    .join(' ');
}

/** Faqat familiya + ism (otasining ismisiz). Bir nechta odam vergul bilan. */
export function toPersonShortName(raw?: string | null): string {
  const full = toPersonNameCase(raw);
  if (!full) return '';
  return full
    .split(',')
    .map(part => part.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' '))
    .filter(Boolean)
    .join(', ');
}

const STATION_MAP: Record<string, string> = {
  ахтачи: 'Axtachi',
  axtachi: 'Axtachi',
  актачи: 'Axtachi',
  олтиарик: 'Oltiariq',
  oltiarik: 'Oltiariq',
  oltiariq: 'Oltiariq',
  туракурган: "To'raqo'rg'on",
  turakurgan: "To'raqo'rg'on",
  "to'raqo'rg'on": "To'raqo'rg'on",
  "to’raqo’rg’on": "To'raqo'rg'on",
  uychi: 'Uychi',
  уйчи: 'Uychi',
  xayrabod: 'Xayrabod',
  хайрабод: 'Xayrabod',
  shgkm: 'ShGKM',
  шгкм: 'ShGKM',
  poletilen: 'POLETILEN',
  полиэтилен: 'POLETILEN',
};

export function toTitleCaseUz(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      const lower = word.toLocaleLowerCase('uz');
      return lower.charAt(0).toLocaleUpperCase('uz') + lower.slice(1);
    })
    .join(' ');
}

export function normalizeStationName(raw?: string | null): string {
  const latin = toLatinText(raw).trim();
  if (!latin) return '';
  const key = latin.toLocaleLowerCase('uz');
  const mapped = STATION_MAP[key];
  if (mapped) return mapped;
  return toTitleCaseUz(latin);
}
