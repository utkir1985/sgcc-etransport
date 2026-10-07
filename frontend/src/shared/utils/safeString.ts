/**
 * Universal safe string helpers that prevent `TypeError: x.trim / x.toLowerCase is not a function`
 * when backend or 1C returns numeric or non-string values.
 */

export function safeTrim(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

export function safeLower(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase();
}

export function safeUpper(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim().toUpperCase();
}

export function hasValue(raw: unknown): boolean {
  if (raw == null) return false;
  return String(raw).trim().length > 0;
}

export function safeSplit(raw: unknown, separator: string | RegExp): string[] {
  if (raw == null) return [];
  return String(raw).split(separator);
}
