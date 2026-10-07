import { BadgeCheck, X } from 'lucide-react';
import type { DefectActModel } from '../utils/defectActModel';
import { formatDefectActDateTime } from '../utils/defectActModel';
import { ApprovalQrCode } from './ApprovalQrCode';
import { printDefectAct } from '../utils/defectActPrint';
import {
  DEFECT_ACT_TYPE_LABEL,
  DEFECT_ACT_TYPES,
  type DefectActType,
} from '../constants/defectActTypes';
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

function signerQrValue(signer: DefectActModel['signers'][number]) {
  const role = (signer.role || '').replace(/[‘’`]/g, "'");
  const name = (signer.name || 'Tizimda qayd etilmagan').replace(/[‘’`]/g, "'");
  return [
    `Bo'lim/sex: ${role}`,
    `Holat: ${signer.at ? signer.status : 'Tasdiqlash kutilmoqda'}`,
    `F.I.Sh.: ${name}`,
    `Sana/vaqt: ${signer.at ? fmtCard(signer.at) : 'Tasdiqlanmagan'}`,
  ].join('\n');
}

function SignerBlock({ signer }: { signer: DefectActModel['signers'][number] }) {
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

type Props = {
  model: DefectActModel;
  actType: DefectActType;
  onActTypeChange?: (type: DefectActType) => void;
  scaleOperator?: string;
  onScaleOperatorChange?: (operator: string) => void;
  scaleOperators?: string[];
  onClose: () => void;
  onIssue?: () => void;
  issuing?: boolean;
  editableType?: boolean;
};

export function DefectActView({
  model,
  actType,
  onActTypeChange,
  scaleOperator,
  onScaleOperatorChange,
  scaleOperators,
  onClose,
  onIssue,
  issuing = false,
  editableType = false,
}: Props) {
  const done = model.issued;

  return (
    <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Dalolatnoma">
      <div className="yx-preview-bar">
        <div>
          <div className="yx-preview-bar__title">Dalolatnoma — {model.documentNumber}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {model.arrivalNumber} · {model.wagonNumbersLine}
            {model.productType ? ` · ${model.productType}` : ''}
          </div>
        </div>
        <div className="yx-preview-bar__actions flex-wrap">
          {editableType && onActTypeChange ? (
            <select
              className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
              value={actType}
              onChange={e => onActTypeChange(e.target.value as DefectActType)}
            >
              {DEFECT_ACT_TYPES.filter(type =>
                actType.startsWith('platform') ? type.startsWith('platform_') : type.startsWith('sisterna_'),
              ).map(type => (
                <option key={type} value={type}>{DEFECT_ACT_TYPE_LABEL[type]}</option>
              ))}
            </select>
          ) : null}
          {editableType && onScaleOperatorChange ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">Tarozibon:</span>
              <input
                list="defect-scale-operators"
                className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-400 w-52 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Tarozibonni tanlang yoki yozing"
                value={scaleOperator || ''}
                onChange={e => onScaleOperatorChange(e.target.value)}
              />
              <datalist id="defect-scale-operators">
                {(scaleOperators || []).map(op => (
                  <option key={op} value={op} />
                ))}
              </datalist>
            </div>
          ) : null}
          {!done && onIssue ? (
            <button
              type="button"
              className="btn-primary !px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5"
              disabled={issuing}
              onClick={() => onIssue()}
            >
              {issuing ? 'Saqlanmoqda...' : 'Tasdiqlash'}
            </button>
          ) : null}
          <DocumentPrintButton
            ready={done && model.signers.every(s => Boolean(s.at))}
            onPrint={() => printDefectAct(model.documentId)}
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
        <DefectActDocument model={model} />
      </div>
    </div>
  );
}

export function DefectActDocument({
  model,
}: {
  model: DefectActModel;
}) {
  const done = model.issued;
  const bodyText = model.bodyText;

  return (
    <div
      className="yuk-xati yuk-xati--sample yuk-xati--landscape defect-act-document"
      data-defect-act-id={model.documentId}
      aria-hidden="true"
    >
      <section className="yxn-page">
        <div className="yxn-topline">
          <strong>E-TRANSPORT Axborot tizimi</strong>
          <span>025-Ф6</span>
        </div>

        <div className="yxn-head">
          <div className="yxn-head__side yxn-head__side--left">
            <div className="yxn-head-qr">
              <ApprovalQrCode
                value={model.qrVerificationUrl || `https://qrlink.sgcc.uz/verify/${encodeURIComponent(model.qrGlobalId || model.documentNumber || model.documentId)}`}
                qrCodeBase64={model.qrCodeBase64}
                globalId={model.qrGlobalId}
                size={HEADER_QR_SIZE}
                level="M"
                link
              />
            </div>
            <div className="yxn-head__text yxn-head__text--meta">
              <div><b>Hujjat holati:</b> {done ? 'Tasdiqlangan' : model.documentStatus}</div>
              <div><b>Hujjat raqami:</b> {model.documentNumber}</div>
              <div>
                <b>Tasdiqlangan sana/vaqt:</b>{' '}
                {done && model.approvedAt ? formatDefectActDateTime(model.approvedAt) : '—'}
              </div>
            </div>
          </div>
        </div>

        <header className="yxn-header defect-act-title">
          <div className="yxn-header__title">
            <h1>DALOLATNOMA</h1>
          </div>
        </header>

        <div className="defect-act-body">
          <p>
            Bizlar kim, ushbu dalolatnomani tuzib quyida imzo chekuvchilar{' '}
            {model.introParticipants.join(', ')} lar ishtirokida tuzamiz, ushbu dalolatnomani shu haqdakim,{' '}
            {bodyText}
          </p>
        </div>

        <p className="defect-act-sign-heading">Ushbu dalolatnomani to‘g‘ri deb imzo chekuvchilar:</p>

        <div className="yxn-signatures defect-act-signatures">
          {model.signers.map(signer => (
            <SignerBlock key={signer.key} signer={signer} />
          ))}
        </div>

        <footer className="yxn-footer">
          <span>E-TRANSPORT Axborot tizimi | Dalolatnoma | {model.arrivalNumber}</span>
          <span>{model.documentNumber}</span>
        </footer>
      </section>
    </div>
  );
}
