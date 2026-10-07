export const QRLINK_PUBLIC_VERIFY_BASE = 'https://qrlink.sgcc.uz/verify';

export function documentPublicVerificationUrl(globalIdOrDocNo: string): string {
  const clean = (globalIdOrDocNo || '').trim();
  return `${QRLINK_PUBLIC_VERIFY_BASE}/${encodeURIComponent(clean)}`;
}

export function yukXatiDocumentPath(registryId: string): string {
  return `/registry?yx=${encodeURIComponent(registryId)}`;
}

export function entryPermitDocumentPath(arrivalId: string): string {
  return `/empty-wagons?entryPermit=${encodeURIComponent(arrivalId)}`;
}

export function yukXatiDocumentUrl(registryId: string): string {
  return documentPublicVerificationUrl(registryId);
}

export function entryPermitDocumentUrl(arrivalId: string): string {
  return documentPublicVerificationUrl(arrivalId);
}

export function productOrderDocumentPath(orderId: string): string {
  return `/orders/railway?open=${encodeURIComponent(orderId)}`;
}

export function productOrderDocumentUrl(orderId: string): string {
  return documentPublicVerificationUrl(orderId);
}

export function defectActDocumentPath(unitId: string): string {
  return `/empty-wagons?defectAct=${encodeURIComponent(unitId)}`;
}

export function defectActDocumentUrl(unitId: string): string {
  return documentPublicVerificationUrl(unitId);
}
