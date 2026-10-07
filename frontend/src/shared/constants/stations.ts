export const DEFAULT_STATIONS = [
  'Kengsoy stansiyasi',
  'Pop stansiyasi',
  'Marg\'ilon stansiyasi',
  'Andijon-1',
  'Toshkent-Tovarniy',
] as const;

export type DefaultStation = typeof DEFAULT_STATIONS[number];
