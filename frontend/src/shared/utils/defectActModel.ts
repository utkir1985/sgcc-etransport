import type { EmptyWagonArrival, EmptyWagonUnit } from '../types';
import type { DefectActType } from '../constants/defectActTypes';
import { resolveDefectActType, hasDefectAct } from '../constants/defectActTypes';

export interface DefectActSigner {
  key: string;
  role: string;
  name: string;
  at: string | null;
  status: string;
}

export interface DefectActModel {
  unitId: string;
  documentId: string;
  documentNumber: string;
  actType: DefectActType;
  wagonNumbersLine: string;
  arrivalNumber: string;
  productType: string;
  defectReason: string;
  documentStatus: string;
  approvedAt: string | null;
  qrValue: string;
  qrGlobalId?: string;
  qrVerificationUrl?: string;
  qrCodeBase64?: string;
  introParticipants: string[];
  bodyText: string;
  signers: DefectActSigner[];
  issued: boolean;
}

function fmtXizmat(value?: string | null) {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

function parseContainers(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*[|;·]\s*|\s*,\s*/)
    .map(v => v.trim())
    .filter(Boolean);
}

function wagonNumbersLine(unit: EmptyWagonUnit): string {
  const containers = parseContainers(unit.cisternNumber);
  if (unit.wagonType === 'platform' && containers.length > 0) {
    return `${unit.wagonNumber} (${containers.join(', ')})`;
  }
  return unit.wagonNumber;
}

function bodyTextForType(type: DefectActType, wagonLine: string, wagonType?: string | null): string {
  const isPlatform = wagonType === 'platform' || type.startsWith('platform_');
  const noun = isPlatform ? 'fiting platforma(lari)' : 'gaz sisterna(lari)';
  const reason = type.endsWith('_repair')
    ? "ta'mirtalab bo'lganligi sababli"
    : "mahsulot yo'q bo'lganligi sababli";
  return `quyidagi № ${wagonLine} raqamli ${noun} ${reason} bo'sh holatda zavod hududidan Kengsoy stansiyasiga chiqarish uchun tuzildi.`;
}

function introParticipants(type: DefectActType, signers: DefectActSigner[]): string[] {
  const byKey = Object.fromEntries(signers.map(s => [s.key, s.name || '_________________']));
  if (type === 'platform_repair') {
    return [
      `SHGKM TYTT xizmati dispetcheri ${byKey.dispatcher}`,
      `SHGKM TYTT xizmati vagonlarni qabul qiluvchi va topshiruvchisi ${byKey.handover}`,
      `SHGKM TYTT xizmati h/k yurituvchisi ${byKey.scale}`,
    ];
  }
  return [
    `SHGKM TYTT xizmati dispetcheri ${byKey.dispatcher}`,
    `SHGKM TYTT xizmati vagonlarni qabul qiluvchi va topshiruvchisi ${byKey.handover}`,
    `SHGKM TYTT xizmati taroziboni ${byKey.scale}`,
  ];
}

export function buildDefectActModel(
  arrival: EmptyWagonArrival,
  unit: EmptyWagonUnit,
  options?: {
    actType?: DefectActType;
    issuerName?: string;
    issuedAt?: string | null;
    scaleOperatorName?: string;
  },
): DefectActModel {
  const actType = resolveDefectActType(
    unit.wagonType,
    unit.loadingComment,
    (options?.actType || unit.defectActType as DefectActType | undefined),
  );
  const wagonLine = wagonNumbersLine(unit);
  const issuedAt = options?.issuedAt || unit.defectActUploadedAt || null;
  const documentNumber = String(unit.defectActNumber || '').trim()
    || `IR-${unit.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const scaleRole = actType === 'platform_repair'
    ? 'TYTT xizmati h/k yurituvchisi'
    : 'TYTT xizmati taroziboni';

  const issued = hasDefectAct(unit);
  const actualCreator = (unit.defectActUploadedByName || '').trim();
  const arrivalCreator = (arrival.createdByName || '').trim();
  const currentIssuer = (options?.issuerName || '').trim();

  // Asl tuzgan dispetcher: agar dalolatnoma allaqachon tasdiqlangan (tuzilgan) bo\'lsa,
  // uni haqiqatda tuzgan xodim (defectActUploadedByName) qat\'iy ko\'rsatiladi va joriy foydalanuvchi bilan almashmaydi.
  const dispatcherName = issued
    ? (actualCreator || arrivalCreator || currentIssuer || '—')
    : (currentIssuer || actualCreator || arrivalCreator || '—');

  const selectedScale = (options?.scaleOperatorName || '').trim();

  // Tarozibon (yoki platformalar uchun h/k yurituvchisi): tanlangan tarozibon birinchi navbatda olinadi
  const scaleName = selectedScale
    || (unit.sealConfirmedByScaleName || '').trim()
    || (unit.wagonType === 'platform' ? (actualCreator || arrivalCreator) : '')
    || arrivalCreator
    || actualCreator
    || '—';

  // Vagonlarni qabul qiluvchi va topshiruvchi:
  const handoverName = arrivalCreator
    || actualCreator
    || currentIssuer
    || '—';

  const signers: DefectActSigner[] = [
    {
      key: 'dispatcher',
      role: 'TYTT xizmati dispetcheri',
      name: dispatcherName,
      at: issuedAt || arrival.createdAt,
      status: 'Imzolandi',
    },
    {
      key: 'scale',
      role: scaleRole,
      name: scaleName,
      at: unit.tareWeighedAt || unit.grossWeighedAt || issuedAt || arrival.createdAt,
      status: 'Imzolandi',
    },
    {
      key: 'handover',
      role: 'TYTT xizmati vagonlarni qabul qiluvchi va topshiruvchisi',
      name: handoverName,
      at: issuedAt || arrival.createdAt,
      status: 'Imzolandi',
    },
  ];

  return {
    unitId: unit.id,
    documentId: `defect-act-${unit.id}`,
    documentNumber,
    actType,
    wagonNumbersLine: wagonLine,
    arrivalNumber: arrival.arrivalNumber,
    productType: unit.productType || arrival.productType || '—',
    defectReason: unit.loadingComment || 'Nomuvofiqlik aniqlangan',
    documentStatus: issued ? 'Tasdiqlangan' : 'Tuzilmoqda',
    approvedAt: issuedAt,
    qrValue: unit.defectActQrVerificationUrl || (unit.defectActQrGlobalId ? `https://qrlink.sgcc.uz/verify/${encodeURIComponent(unit.defectActQrGlobalId)}` : (unit.defectActNumber || unit.id)),
    qrGlobalId: unit.defectActQrGlobalId,
    qrVerificationUrl: unit.defectActQrVerificationUrl,
    qrCodeBase64: unit.defectActQrCodeBase64,
    introParticipants: introParticipants(actType, signers),
    bodyText: bodyTextForType(actType, wagonLine, unit.wagonType),
    signers,
    issued,
  };
}

export { fmtXizmat as formatDefectActDateTime };
