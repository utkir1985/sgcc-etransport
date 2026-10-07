export const DEFAULT_WAGON_TYPES = [
  'Suyultirilgan gaz mahsuloti uchun Vagon sisterna',
  'Gaz kondensati uchun Vagon sisterna',
  'Granula uchun Yopiq turdagi vagon',
  'Sera uchun Yopiq turdagi vagon',
  'Suyultirilgan gaz mahsuloti uchun Konteyner sisterna',
  'Konteyner sisterna yuklash uchun Fiting platforma',
] as const;

export type DefaultWagonType = typeof DEFAULT_WAGON_TYPES[number];
