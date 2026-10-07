export const LOGISTICS_TYPES = {
  Railway: 'Railway',
  Road: 'Road',
} as const;

export type LogisticsType = typeof LOGISTICS_TYPES[keyof typeof LOGISTICS_TYPES];

export const LOGISTICS_ROUTE: Record<'railway' | 'road', LogisticsType> = {
  railway: LOGISTICS_TYPES.Railway,
  road: LOGISTICS_TYPES.Road,
};

export const LOGISTICS_LABELS: Record<LogisticsType, string> = {
  Railway: 'Temir yo\'l',
  Road: 'Avtotransport',
};

export const LOGISTICS_DESCRIPTIONS: Record<LogisticsType, string> = {
  Railway: 'Vagon va sisterna orqali yuk tashish',
  Road: 'Avtomobil va avto tsistern orqali yuk tashish',
};

export function logisticsFromRoute(route?: string): LogisticsType {
  if (route === 'road') return LOGISTICS_TYPES.Road;
  return LOGISTICS_TYPES.Railway;
}

export function logisticsRouteSegment(type: LogisticsType): 'railway' | 'road' {
  return type === LOGISTICS_TYPES.Road ? 'road' : 'railway';
}
