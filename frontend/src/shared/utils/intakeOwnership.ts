import { api } from '../services/api';
import {
  WAGON_OWNERSHIP,
  normalizeWagonOwnership,
  type WagonOwnership,
} from '../constants/wagonOwnership';

export function normalizeWagonNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

export function isValidWagonNumber(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function parseContainers(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*[|;·]\s*|\s*,\s*/)
    .map(v => v.trim())
    .filter(Boolean);
}

export function joinContainers(list: string[]): string {
  return list.map(v => v.trim()).filter(Boolean).join(' | ');
}

export function parseWagonAndCisterns(raw: string): {
  wagonNumber: string;
  cisternNumbers: string[];
  isPlatform: boolean;
} {
  if (!raw?.trim()) return { wagonNumber: '', cisternNumbers: [], isPlatform: false };

  // 1. Find 8-digit wagon number
  const wagonMatch = raw.match(/\b\d{8}\b/);
  const wagonNumber = wagonMatch ? wagonMatch[0] : normalizeWagonNumber(raw);

  // 2. Find cistern numbers containing '/'
  const tokens = raw.split(/[\s,]+/);
  const cisterns: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i].trim();
    if (t.includes('/')) {
      if (i > 0 && /^\d{2,4}$/.test(tokens[i - 1])) {
        t = tokens[i - 1] + t;
      }
      t = t.replace(/\s+/g, '');
      if (!cisterns.includes(t) && t !== wagonNumber) {
        cisterns.push(t);
      }
    }
  }

  return {
    wagonNumber,
    cisternNumbers: cisterns,
    isPlatform: cisterns.length > 0 || wagonNumber.startsWith('5463') || wagonNumber.startsWith('546'),
  };
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function containerLookupCandidates(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const trimmed = raw.trim();
    if (trimmed.length < 2) continue;
    const key = normalizeCode(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Park reestridan tegishlilik:
 * — vagon Majmua parkida bo‘lsa → majmua
 * — konteyner majmua reestrida bo‘lsa → majmua
 * — aks holda → tashqi
 */
export async function resolveIntakeOwnership(
  wagonNumber: string,
  containerNumbers: string[],
): Promise<{ ownership: WagonOwnership; source: 'lookup' | 'default' }> {
  let fleetOwnership: WagonOwnership | null = null;
  try {
    const wagonRes = await api.lookupFleetWagon(wagonNumber.trim());
    if (wagonRes.data?.found && wagonRes.data.ownership) {
      fleetOwnership = normalizeWagonOwnership(wagonRes.data.ownership);
      if (fleetOwnership === WAGON_OWNERSHIP.Majmua) {
        return { ownership: WAGON_OWNERSHIP.Majmua, source: 'lookup' };
      }
    }
  } catch {
    /* ignore */
  }

  for (const code of containerLookupCandidates(containerNumbers)) {
    try {
      const res = await api.lookupContainer(code);
      if (res.data?.found) {
        return { ownership: WAGON_OWNERSHIP.Majmua, source: 'lookup' };
      }
    } catch {
      /* ignore */
    }
  }

  if (fleetOwnership) {
    return { ownership: fleetOwnership, source: 'lookup' };
  }

  return { ownership: WAGON_OWNERSHIP.Tashqi, source: 'default' };
}
