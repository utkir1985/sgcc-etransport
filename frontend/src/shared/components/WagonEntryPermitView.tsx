import { BadgeCheck, X } from 'lucide-react';
import type { EmptyWagonArrival } from '../types';
import { ApprovalQrCode } from './ApprovalQrCode';
import { isWagonKind, WAGON_KIND_LABEL } from '../utils/wagonKinds';
import { printYukXati } from '../utils/yukXatiPrint';
import { ENTRY_PERMIT_PRINT_LOCKED_TITLE } from '../utils/documentPrintGuard';
import { DocumentPrintButton } from './DocumentPrintButton';

type Props = { arrival: EmptyWagonArrival | null; onClose: () => void };

const HEADER_QR_SIZE = 72;

/** 2-rasm andozasi: 11.08.2026 15:28:02 */
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


type SignerInfo = {
  title: string;
  name?: string;
  at?: string | null;
  status: string;
};

const SHIFT_SUPERVISOR_TITLE = 'ICHDX smena boshlig‘i';

function shiftStampQrValue({ title, name, at, status }: SignerInfo) {
  const cleanTitle = (title || SHIFT_SUPERVISOR_TITLE).replace(/[‘’`]/g, "'");
  const cleanName = (name || 'Xayitov Anvarjon Karimovich').replace(/[‘’`]/g, "'");
  return [
    `Holat: ${at ? status : 'Tasdiqlash kutilmoqda'}`,
    `Bo'lim/sex: ${cleanTitle}`,
    `F.I.Sh.: ${cleanName}`,
    'Ishonchnoma raqami: 01-5/25-33 12.08.2026',
    `Sana/vaqt: ${at ? fmtCard(at) : 'Tasdiqlanmagan'}`,
  ].join('\n');
}

function signerQrValue({ title, name, at, status }: SignerInfo) {
  const cleanTitle = (title || '').replace(/[‘’`]/g, "'");
  const cleanName = (name || 'Tizimda qayd etilmagan').replace(/[‘’`]/g, "'");
  return [
    `Bo'lim/sex: ${cleanTitle}`,
    `Holat: ${at ? status : 'Tasdiqlash kutilmoqda'}`,
    `F.I.Sh.: ${cleanName}`,
    `Sana/vaqt: ${at ? fmtCard(at) : 'Tasdiqlanmagan'}`,
  ].join('\n');
}

function SignerBlock({ title, name, at, status }: SignerInfo) {
  const approved = Boolean(at);
  const signer = { title, name, at, status };
  return (
    <div className={`yxn-sign${approved ? ' is-approved' : ''}`}>
      <div className="yxn-sign__text">
        <span className="yxn-sign__status" data-status={approved ? status : 'Kutilmoqda'}>
          {approved ? <BadgeCheck strokeWidth={2} aria-hidden /> : null}
          {approved ? status : 'Kutilmoqda'}
        </span>
        <span className="yxn-sign__role">{title}</span>
        <span className="yxn-sign__name">{name || '—'}</span>
        <time className="yxn-sign__time" dateTime={at || undefined}>
          {approved ? fmtCard(at) : '—'}
        </time>
      </div>
      <div className="yxn-sign__qr">
        {approved ? (
          <ApprovalQrCode
            value={signerQrValue(signer)}
            size={56}
            level="L"
          />
        ) : (
          <span>QR</span>
        )}
      </div>
    </div>
  );
}

export function WagonEntryPermitView({ arrival, onClose }: Props) {
  if (!arrival) return null;

  const rows = [...(arrival.wagons ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const shiftSigner: SignerInfo = {
    title: SHIFT_SUPERVISOR_TITLE,
    name: arrival.entryPermitShiftApprovedByName,
    at: arrival.entryPermitShiftApprovedAt,
    status: 'Tasdiqlandi',
  };
  const shiftApproved = Boolean(shiftSigner.at);
  const done = Boolean(
    arrival.entryPermitShiftApprovedAt
    && arrival.entryPermitPermitApprovedAt
    && arrival.entryPermitSecurityApprovedAt,
  );
  // Qo'riqlash xizmatiga borganda (smena boshlig'i va ruxsatnoma byurosi kelishgach) chop etish mumkin
  const canPrint = Boolean(
    (arrival.entryPermitShiftApprovedAt && arrival.entryPermitPermitApprovedAt)
    || done,
  );
  const permitNo = arrival.entryPermitNumber || arrival.arrivalNumber;
  const documentId = `entry-permit-${arrival.id}`;
  const approvedAt = arrival.entryPermitSecurityApprovedAt
    || arrival.entryPermitPermitApprovedAt
    || arrival.entryPermitShiftApprovedAt
    || null;

  return (
    <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Xizmat xati">
      <div className="yx-preview-bar">
        <div>
          <div className="yx-preview-bar__title">Xizmat xati — {permitNo}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {arrival.arrivalNumber} · {rows.length} vagon{arrival.productType ? ` · ${arrival.productType}` : ''}
          </div>
        </div>
        <div className="yx-preview-bar__actions">
          <DocumentPrintButton
            ready={canPrint}
            lockedTitle={ENTRY_PERMIT_PRINT_LOCKED_TITLE}
            onPrint={() => printYukXati(documentId, { orientation: 'portrait' })}
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
        <div className="yuk-xati yuk-xati--sample entry-permit-document" data-registry-id={documentId}>
          <section className="yxn-page">
            <div className="yxn-topline">
              <strong>E-TRANSPORT Axborot tizimi</strong>
              <span>025-Ф6</span>
            </div>

            <div className="entry-permit-head">
              <div className="entry-permit-head__side entry-permit-head__side--left">
                <div className="entry-permit-head-qr">
                  <ApprovalQrCode
                    value={arrival.entryPermitQrVerificationUrl || (arrival.entryPermitQrGlobalId ? `https://qrlink.sgcc.uz/verify/${encodeURIComponent(arrival.entryPermitQrGlobalId)}` : (permitNo || arrival.arrivalNumber || arrival.id))}
                    qrCodeBase64={arrival.entryPermitQrCodeBase64}
                    globalId={arrival.entryPermitQrGlobalId}
                    size={HEADER_QR_SIZE}
                    level="M"
                    link
                  />
                </div>
                <div className="entry-permit-head__text entry-permit-head__text--meta">
                  <div><b>Hujjat holati:</b> {done ? 'Tasdiqlangan' : 'Kelishuvda'}</div>
                  <div><b>Hujjat raqami:</b> {permitNo}</div>
                  <div>
                    <b>Tasdiqlangan vaqt:</b>{' '}
                    {done || approvedAt ? fmtCard(approvedAt) : '—'}
                  </div>
                </div>
              </div>

              <div className={`entry-permit-head__side entry-permit-head__side--right${shiftApproved ? ' is-approved' : ''}`}>
                <div className="entry-permit-head__text entry-permit-head__text--right entry-permit-head__text--meta entry-permit-head__text--signer">
                  <div className="font-bold">Bosh direktor</div>
                  <div className="entry-permit-head__name font-bold">Sh. Aslanov</div>
                  <div className="entry-permit-head__stamp-status font-bold">
                    {shiftApproved ? shiftSigner.status.toUpperCase() : 'KUTILMOQDA'}
                  </div>
                </div>
                <div className="entry-permit-head__stamp">
                  <div className="entry-permit-head-qr">
                    {shiftApproved ? (
                      <ApprovalQrCode
                        value={shiftStampQrValue(shiftSigner)}
                        size={HEADER_QR_SIZE}
                        level="L"
                      />
                    ) : (
                      <span>QR</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <header className="yxn-header entry-permit-yxn-header">
              <div className="yxn-header__title entry-permit-title">
                <h1>XIZMAT XATI</h1>
              </div>
            </header>

            <p className="entry-permit-lead">
              Quyidagi raqamlari ko‘rsatilgan bo‘sh vagonlarni yuk yuklash uchun zavod hududiga kiritishga ruxsat berishingizni so‘rayman.
            </p>

            <table className="yxn-wagons entry-permit-yxn-table">
              <thead>
                <tr><th>№</th><th>Vagon raqami</th><th>Vagon turi</th><th>Yuk nomi</th></tr>
              </thead>
              <tbody>
                {rows.map((wagon, index) => (
                  <tr key={wagon.id}>
                    <td>{index + 1}</td>
                    <td className="yxn-mono">{wagon.wagonNumber}</td>
                    <td>{isWagonKind(wagon.wagonType) ? WAGON_KIND_LABEL[wagon.wagonType] : wagon.wagonType}</td>
                    <td>{wagon.productType || arrival.productType}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="yxn-signatures">
              <SignerBlock title="Temir yo‘l operatori" name={arrival.createdByName} at={arrival.createdAt} status="Yaratildi" />
              <SignerBlock title="Ruxsatnoma byurosi xodimi" name={arrival.entryPermitPermitApprovedByName} at={arrival.entryPermitPermitApprovedAt} status="Ruxsat etildi" />
              <SignerBlock title="Qo‘riqlash xizmati (NO‘J) xodimi" name={arrival.entryPermitSecurityApprovedByName} at={arrival.entryPermitSecurityApprovedAt} status="Ruxsat etildi" />
            </div>

            <footer className="yxn-footer">
              <span>E-Transport tizimida shakllantirilgan elektron hujjat</span>
              <span>{permitNo}</span>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
