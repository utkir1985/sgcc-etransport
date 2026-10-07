export const WAGON_INTAKE_LOAD_STATE = {
  Bosh: 'bosh',
  Yukli: 'yukli',
} as const;

export type WagonIntakeLoadState =
  typeof WAGON_INTAKE_LOAD_STATE[keyof typeof WAGON_INTAKE_LOAD_STATE];

export const WAGON_INTAKE_LOAD_STATE_OPTIONS: Array<{
  key: WagonIntakeLoadState;
  title: string;
  subtitle: string;
}> = [
  { key: WAGON_INTAKE_LOAD_STATE.Bosh, title: "Bo'sh", subtitle: 'Yuksiz vagon' },
  { key: WAGON_INTAKE_LOAD_STATE.Yukli, title: 'Yuklangan', subtitle: 'Yukli vagon' },
];

export function normalizeIntakeLoadState(value?: string | null): WagonIntakeLoadState {
  const v = value?.trim().toLowerCase();
  if (v === WAGON_INTAKE_LOAD_STATE.Yukli || v === 'tola') return WAGON_INTAKE_LOAD_STATE.Yukli;
  return WAGON_INTAKE_LOAD_STATE.Bosh;
}

export function intakeLoadStateLabel(value?: string | null): string {
  const norm = normalizeIntakeLoadState(value);
  if (norm === WAGON_INTAKE_LOAD_STATE.Yukli) return 'Yuklangan';
  return "Bo'sh";
}
