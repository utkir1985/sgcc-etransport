import type { Contractor, ContractorDestination } from '../types';
import { LOGISTICS_TYPES } from './logisticsTypes';

/** Namuna buyurtma jadvalidagi korxonalar */
export const DEFAULT_RAILWAY_CONTRACTOR_NAMES = [
  '«Hududgaz Andijon» gaz ta\'minoti filiali',
  '«Hududgaz Farg\'ona» gaz ta\'minoti filiali',
  '«Hududgaz Namangan» gaz ta\'minoti filiali',
  '«Hududgaz Samarqand» gaz ta\'minoti filiali',
  '«Hududgaz Sirdaryo» gaz ta\'minoti filiali',
  '«Hududgaz Toshkent» gaz ta\'minoti filiali',
  '«Hududgaz Jizzax» gaz ta\'minoti filiali',
  '«Hududgaz Surxandaryo» gaz ta\'minoti filiali',
] as const;

export function buildDefaultContractors(
  names: readonly string[],
  logisticsType: string,
): Contractor[] {
  return names.map((name, index) => ({
    id: `default-${logisticsType}-${index}`,
    name,
    logisticsType,
    isSystem: true,
    createdAt: '',
  }));
}

export const DEFAULT_RAILWAY_CONTRACTORS = buildDefaultContractors(
  DEFAULT_RAILWAY_CONTRACTOR_NAMES,
  LOGISTICS_TYPES.Railway,
);

/** Namuna jadval: korxona → stansiyalar */
export const DEFAULT_RAILWAY_CONTRACTOR_STATIONS: Record<string, readonly string[]> = {
  '«Hududgaz Andijon» gaz ta\'minoti filiali': ['Axtachi'],
  '«Hududgaz Farg\'ona» gaz ta\'minoti filiali': ['Oltiariq'],
  '«Hududgaz Namangan» gaz ta\'minoti filiali': ['Uychi', 'To\'raqo\'rg\'on'],
  '«Hududgaz Samarqand» gaz ta\'minoti filiali': ['Maroqand', 'Jomboy'],
  '«Hududgaz Sirdaryo» gaz ta\'minoti filiali': ['Jomboy'],
  '«Hududgaz Toshkent» gaz ta\'minoti filiali': ['Jomboy'],
  '«Hududgaz Jizzax» gaz ta\'minoti filiali': ['Jomboy'],
  '«Hududgaz Surxandaryo» gaz ta\'minoti filiali': ['Oqjar', 'Xayrabod'],
};

const STORAGE_KEY_CONTRACTOR_STATIONS = 'etransport_contractor_stations_map';
const STORAGE_KEY_CUSTOM_CONTRACTORS = 'etransport_custom_contractors_list';
const STORAGE_KEY_DELETED_CONTRACTORS = 'etransport_deleted_contractors_list';

export function getDeletedContractorIds(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_DELETED_CONTRACTORS);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

export function addDeletedContractorId(id: string, name?: string): void {
  try {
    const list = getDeletedContractorIds();
    if (!list.includes(id)) list.push(id);
    if (name && !list.includes(name)) list.push(name);
    localStorage.setItem(STORAGE_KEY_DELETED_CONTRACTORS, JSON.stringify(list));
  } catch {}
}

export function unmarkDeletedContractorId(id: string, name?: string): void {
  try {
    const list = getDeletedContractorIds().filter(x => x !== id && x !== name);
    localStorage.setItem(STORAGE_KEY_DELETED_CONTRACTORS, JSON.stringify(list));
  } catch {}
}

export function getContractorStationsMap(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(DEFAULT_RAILWAY_CONTRACTOR_STATIONS)) {
    result[k] = [...v];
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONTRACTOR_STATIONS);
    if (saved) {
      Object.assign(result, JSON.parse(saved));
    }
  } catch {}
  return result;
}

export function saveContractorStationsMap(map: Record<string, string[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONTRACTOR_STATIONS, JSON.stringify(map));
  } catch {}
}

export const ROGUE_CONTRACTOR_NAMES = [
  '1c (plombali tortish)',
  'hududgaz andijon',
  'hududgaz jizzax',
  'hududgaz farg\'ona',
  'hududgaz namangan',
  'hududgaz samarqand',
  'hududgaz toshkent',
  'hududgaz sirdaryo',
  'hududgaz surxandaryo',
  'hududgaz qashqadaryo',
];

export function isRogueContractor(name: string): boolean {
  const norm = (name || '').trim().toLowerCase();
  return ROGUE_CONTRACTOR_NAMES.includes(norm);
}

export function getStoredContractors(): Contractor[] {
  const deleted = getDeletedContractorIds();
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_CONTRACTORS);
    if (saved) {
      const list: Contractor[] = JSON.parse(saved);
      return list.filter(
        c => !deleted.includes(c.id) && !deleted.includes(c.name) && !isRogueContractor(c.name),
      );
    }
  } catch {}
  return DEFAULT_RAILWAY_CONTRACTORS.filter(
    c => !deleted.includes(c.id) && !deleted.includes(c.name) && !isRogueContractor(c.name),
  );
}

export function saveStoredContractors(list: Contractor[]): void {
  try {
    const cleanList = list.filter(c => !isRogueContractor(c.name));
    localStorage.setItem(STORAGE_KEY_CUSTOM_CONTRACTORS, JSON.stringify(cleanList));
  } catch {}
}

export function getDefaultStationsForContractor(contractorName: string): string[] {
  const map = getContractorStationsMap();
  return [...(map[contractorName] ?? [])];
}

export function buildDefaultDestinations(
  contractorName: string,
  stationNames: readonly string[],
  logisticsType: string,
): ContractorDestination[] {
  return stationNames.map((stationName, index) => ({
    id: `default-${logisticsType}-${contractorName}-${index}`,
    contractorName,
    logisticsType,
    stationName,
    isSystem: false,
    createdAt: '',
  }));
}
