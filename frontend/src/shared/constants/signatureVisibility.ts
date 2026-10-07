export type SignatureVisibility = 'accounting' | 'marketing' | 'deputy' | 'dispatch';

const ALL_SIGNATURE_KEYS = ['accounting', 'marketing', 'deputy', 'dispatch'] as const;

/** Barcha modullarda kelishgan (ismi bor) imzolar ko'rsatiladi. */
export function getVisibleSignatureKeys(_visibility: SignatureVisibility): readonly string[] {
  return ALL_SIGNATURE_KEYS;
}
