/** Partiya notes ichidagi kamchilik / nuqson izohlari. */

export type ArrivalIssueKind = 'security' | 'loading' | 'tare' | 'gross-return';

export interface ArrivalIssueNote {
  kind: ArrivalIssueKind;
  reason: string;
  wagonNumber: string | null;
  /** ISO yoki dd.MM.yyyy HH:mm — UI da formatlanadi */
  stampRaw: string | null;
  line: string;
}

const SECURITY_RE = /Qo['‘]riqlash kamchilik/i;
const LOADING_RE = /Yuklash kamchilik/i;
const TARE_RE = /Tara (?:kamchilik|nomuvofiqlik)/i;
const GROSS_RETURN_RE = /Bruttodan yuklashga qaytarildi/i;

/** `[07.08.2026 13:23 · Yuklash kamchilik · 32432543] sabab` */
function parsePrefixedLine(line: string): ArrivalIssueNote | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const kind: ArrivalIssueKind | null = SECURITY_RE.test(trimmed)
    ? 'security'
    : TARE_RE.test(trimmed)
      ? 'tare'
      : LOADING_RE.test(trimmed)
        ? 'loading'
        : GROSS_RETURN_RE.test(trimmed)
          ? 'gross-return'
          : null;
  if (!kind) return null;

  const bracket = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  const meta = bracket?.[1] ?? '';
  const reason = (bracket?.[2] ?? trimmed.replace(/^\[[^\]]+\]\s*/, '')).trim() || trimmed;

  let wagonNumber: string | null = null;
  if (kind === 'loading' || kind === 'tare' || kind === 'gross-return') {
    const label = kind === 'tare'
      ? 'Tara (?:kamchilik|nomuvofiqlik)'
      : kind === 'gross-return'
        ? 'Bruttodan yuklashga qaytarildi'
        : 'Yuklash kamchilik';
    const wagonMatch = meta.match(new RegExp(`${label}\\s*·\\s*([^\\]]+?)\\s*$`, 'i'))
      ?? meta.match(new RegExp(`${label}\\s*·\\s*(\\S+)`, 'i'));
    wagonNumber = wagonMatch?.[1]?.trim() || null;
  }

  const stampMatch = meta.match(/^(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/);
  return {
    kind,
    reason,
    wagonNumber,
    stampRaw: stampMatch?.[1] ?? null,
    line: trimmed,
  };
}

export function parseArrivalIssueNotes(notes?: string | null): ArrivalIssueNote[] {
  if (!notes?.trim()) return [];
  const out: ArrivalIssueNote[] = [];
  for (const line of notes.split(/\n+/)) {
    const parsed = parsePrefixedLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function latestSecurityIssueNote(notes?: string | null): string | null {
  const items = parseArrivalIssueNotes(notes).filter(i => i.kind === 'security');
  return items.length ? items[items.length - 1].reason : null;
}

export function latestLoadingIssueNote(notes?: string | null): string | null {
  const items = parseArrivalIssueNotes(notes).filter(i => i.kind === 'loading');
  return items.length ? items[items.length - 1].reason : null;
}

export function latestTareIssueNote(notes?: string | null): string | null {
  const items = parseArrivalIssueNotes(notes).filter(i => i.kind === 'tare');
  return items.length ? items[items.length - 1].reason : null;
}

/** Qo‘riqlash yoki taradan Temir yo‘lga qaytarilgan partiya. */
export function latestIntakeReturnNote(notes?: string | null): string | null {
  return latestSecurityIssueNote(notes) || latestTareIssueNote(notes);
}

/** dd.MM.yyyy HH:mm → ISO-ish local sort key (best-effort). */
export function issueStampToSortable(stampRaw: string | null, fallbackIso?: string | null): string {
  if (stampRaw) {
    const m = stampRaw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
    if (m) {
      const [, dd, mm, yyyy, hh, mi] = m;
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00`;
    }
  }
  return fallbackIso || '';
}
