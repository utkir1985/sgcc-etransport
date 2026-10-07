import { BadgeCheck, X } from 'lucide-react';
import type { EmptyWagonArrival, EmptyWagonUnit } from '../types';
import { ApprovalQrCode } from './ApprovalQrCode';
import { printDefectAct } from '../utils/defectActPrint';
import { DocumentPrintButton } from './DocumentPrintButton';

const HEADER_QR_SIZE = 72;

function fmtCard(value?: string | null) {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

function parseTons(value?: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function calcNetto(unit: EmptyWagonUnit): string {
  if (unit.nettoWeight && unit.nettoWeight !== '0.00') return unit.nettoWeight;
  const tare = parseTons(unit.tareWeight);
  const gross = parseTons(unit.grossWeight);
  if (tare == null || gross == null) return '—';
  return (gross - tare).toFixed(2);
}

interface SignerInfo {
  key: string;
  role: string;
  name: string;
  at: string | null;
  status: string;
}

function signerQrValue(signer: SignerInfo) {
  const role = (signer.role || '').replace(/[‘’`]/g, "'");
  const name = (signer.name || 'Tizimda qayd etilmagan').replace(/[‘’`]/g, "'");
  return [
    `Bo'lim/sex: ${role}`,
    `Holat: ${signer.at ? signer.status : 'Tasdiqlash kutilmoqda'}`,
    `F.I.Sh.: ${name}`,
    `Sana/vaqt: ${signer.at ? fmtCard(signer.at) : 'Tasdiqlanmagan'}`,
  ].join('\n');
}

function SignerBlock({ signer }: { signer: SignerInfo }) {
  const approved = Boolean(signer.at);
  return (
    <div className={`yxn-sign${approved ? ' is-approved' : ''}`}>
      <div className="yxn-sign__text">
        <span className="yxn-sign__status" data-status={approved ? signer.status : 'Kutilmoqda'}>
          {approved ? <BadgeCheck strokeWidth={2} aria-hidden /> : null}
          {approved ? signer.status : 'Kutilmoqda'}
        </span>
        <span className="yxn-sign__role">{signer.role}</span>
        <span className="yxn-sign__name">{signer.name || '—'}</span>
        <time className="yxn-sign__time" dateTime={signer.at || undefined}>
          {approved ? fmtCard(signer.at) : '—'}
        </time>
      </div>
      <div className="yxn-sign__qr">
        {approved ? (
          <ApprovalQrCode value={signerQrValue(signer)} size={56} level="L" />
        ) : (
          <span>QR</span>
        )}
      </div>
    </div>
  );
}

export interface SealDefectActProps {
  arrival: EmptyWagonArrival;
  unit: EmptyWagonUnit;
  onClose: () => void;
}

export function SealDefectActView({ arrival, unit, onClose }: SealDefectActProps) {
  const documentId = `seal-defect-act-${unit.id}`;
  const documentNumber = String(unit.defectActNumber || '').trim()
    || `PL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(unit.wagonNumber || '').slice(-4)}`;

  const approvedAt = unit.defectActUploadedAt
    || unit.sealConfirmedByScaleAt
    || unit.sealedAt
    || arrival.createdAt;

  const formattedDateTime = fmtCard(approvedAt);

  const wagonTypeLabel = unit.wagonType === 'platform' ? 'Fiting platforma' : 'Gaz sisterna';
  const productType = unit.productType || arrival.productType || 'Mahsulot';
  const netto = calcNetto(unit);
  const reason = unit.loadingComment?.trim() || 'Plomba uzilganligi / shikastlanganligi sababli yangilandi';

  const scaleName = unit.sealConfirmedByScaleName || unit.defectActUploadedByName || 'Tarozi operatori';
  const scaleAt = unit.sealConfirmedByScaleAt || unit.defectActUploadedAt || approvedAt;

  const securityName = unit.sealConfirmedBySecurityName || 'Qo‘riqlash xizmati mas’uli';
  const securityAt = unit.sealConfirmedBySecurityAt || unit.sealConfirmedByScaleAt || approvedAt;

  const dispatcherName = arrival.createdByName || 'TYTT navbatchi dispetcheri';
  const dispatcherAt = arrival.createdAt || approvedAt;

  const signers: SignerInfo[] = [
    {
      key: 'scale',
      role: 'TYTT xizmati taroziboni',
      name: scaleName,
      at: scaleAt,
      status: 'Imzolandi',
    },
    {
      key: 'security',
      role: 'Qo‘riqlash xizmati xodimi',
      name: securityName,
      at: securityAt,
      status: 'Imzolandi',
    },
    {
      key: 'dispatcher',
      role: 'TYTT xizmati dispetcheri',
      name: dispatcherName,
      at: dispatcherAt,
      status: 'Imzolandi',
    },
  ];

  const qrVerifyUrl = unit.defectActQrVerificationUrl
    || `https://qrlink.sgcc.uz/verify/${encodeURIComponent(unit.defectActQrGlobalId || documentNumber)}`;

  return (
    <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Plomba dalolatnomasi">
      <div className="yx-preview-bar">
        <div>
          <div className="yx-preview-bar__title">Plomba dalolatnomasi — {documentNumber}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            Vagon: <strong className="text-white font-mono">{unit.wagonNumber}</strong> · Plomba:{' '}
            <strong className="text-sky-300 font-mono">{unit.sealNumber || '—'}</strong>
          </div>
        </div>
        <div className="yx-preview-bar__actions flex items-center gap-2">
          <DocumentPrintButton
            ready={true}
            title="Chop etish / PDF"
            onPrint={() => printDefectAct(documentId)}
          />
          <button
            type="button"
            className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div
        className="yx-preview-scroll"
        onClick={e => {
          if ((e.target as HTMLElement).closest('.yuk-xati')) return;
          onClose();
        }}
      >
        <div
          className="yuk-xati yuk-xati--sample yuk-xati--landscape defect-act-document"
          data-defect-act-id={documentId}
          aria-hidden="true"
        >
          <section className="yxn-page">
            <div className="yxn-topline flex items-center justify-between border-b pb-1 text-[12px] text-slate-500">
              <strong>E-TRANSPORT Axborot tizimi</strong>
              <span>025-Ф6 / PLOMBA DALOLATNOMASI</span>
            </div>

            <div className="yxn-head flex items-start justify-between mt-3 pb-2 border-b">
              <div className="flex items-center gap-4">
                <div className="yxn-head-qr shrink-0">
                  <ApprovalQrCode
                    value={qrVerifyUrl}
                    qrCodeBase64={unit.defectActQrCodeBase64}
                    globalId={unit.defectActQrGlobalId}
                    size={HEADER_QR_SIZE}
                    level="M"
                    link
                  />
                </div>
                <div className="yxn-head__text yxn-head__text--meta text-[13px] leading-relaxed">
                  <div><b>Hujjat holati:</b> <span className="text-emerald-700 font-semibold">Tasdiqlangan</span></div>
                  <div><b>Hujjat raqami:</b> <span className="font-mono font-bold">{documentNumber}</span></div>
                  <div><b>Rasmiylashtirilgan sana/vaqt:</b> {formattedDateTime}</div>
                </div>
              </div>

              <div className="text-right text-[12px] text-slate-600">
                <div><b>Partiya №:</b> {arrival.arrivalNumber || '—'}</div>
                <div><b>Stansiya:</b> Kengsoy</div>
              </div>
            </div>

            <header className="defect-act-title text-center my-4">
              <div className="yxn-header__title">
                <h1 className="text-lg font-bold tracking-wide uppercase">
                  DALOLATNOMA
                </h1>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">
                  (Vagonga o‘rnatilgan nazorat plombasini almashtirish / shikastlanganligi to‘g‘risida)
                </p>
              </div>
            </header>

            <div className="defect-act-body my-3 text-[14px] leading-relaxed text-justify">
              <p className="indent-8 mb-2">
                Bizlar kim, ushbu dalolatnomani tuzib quyida imzo chekuvchilar SHGKM TYTT xizmati taroziboni{' '}
                <strong>{scaleName}</strong>, Qo‘riqlash xizmati xodimi <strong>{securityName}</strong> hamda{' '}
                TYTT xizmati dispetcheri <strong>{dispatcherName}</strong>lar ishtirokida tuzamiz shu haqdakim,{' '}
                <strong>{formattedDateTime}</strong> holatiga ko‘ra, № <strong className="font-mono">{unit.wagonNumber}</strong> raqamli{' '}
                {wagonTypeLabel} vagonida <strong>«{productType}»</strong> mahsuloti ortilib tarozi nazoratidan o‘tkazilgandan so‘ng,{' '}
                <strong>«{reason}»</strong> sababli avvalgi plomba yaroqsiz deb topildi va uning o‘rniga yangi{' '}
                № <strong className="font-mono font-bold text-sky-900">{unit.sealNumber || '—'}</strong> raqamli nazorat plombasi (muhri){' '}
                o‘rnatildi hamda ma’lumotlar Tarozi UNG axborot tizimiga kiritildi.
              </p>
            </div>

            {/* Rekvizitlar qisqa jadvali */}
            <div className="my-4 overflow-hidden rounded border border-slate-300">
              <table className="w-full text-center text-xs">
                <thead className="bg-slate-100 font-semibold text-slate-700">
                  <tr className="divide-x divide-slate-300 border-b border-slate-300">
                    <th className="py-1.5 px-2">Vagon №</th>
                    <th className="py-1.5 px-2">Vagon turi</th>
                    <th className="py-1.5 px-2">Mahsulot</th>
                    <th className="py-1.5 px-2">Tara (tn)</th>
                    <th className="py-1.5 px-2">Brutto (tn)</th>
                    <th className="py-1.5 px-2">Netto (tn)</th>
                    <th className="py-1.5 px-2 bg-sky-50 text-sky-900">Yangi plomba №</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="divide-x divide-slate-200 font-mono text-[13px]">
                    <td className="py-2 px-2 font-bold">{unit.wagonNumber}</td>
                    <td className="py-2 px-2 font-sans">{wagonTypeLabel}</td>
                    <td className="py-2 px-2 font-sans font-medium">{productType}</td>
                    <td className="py-2 px-2">{unit.tareWeight || '—'}</td>
                    <td className="py-2 px-2">{unit.grossWeight || '—'}</td>
                    <td className="py-2 px-2 font-bold text-sky-700">{netto}</td>
                    <td className="py-2 px-2 font-bold bg-sky-50/60 text-sky-800">{unit.sealNumber || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="defect-act-sign-heading font-bold text-sm mt-5 mb-2">
              Ushbu dalolatnomani to‘g‘ri deb elektron imzo chekuvchilar:
            </p>

            <div className="yxn-signatures defect-act-signatures grid grid-cols-3 gap-3">
              {signers.map(signer => (
                <SignerBlock key={signer.key} signer={signer} />
              ))}
            </div>

            <footer className="yxn-footer flex items-center justify-between border-t mt-6 pt-2 text-[11px] text-slate-500">
              <span>E-TRANSPORT Axborot tizimi | Plomba dalolatnomasi | Partiya: {arrival.arrivalNumber}</span>
              <span className="font-mono">{documentNumber}</span>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
