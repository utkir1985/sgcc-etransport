import { BadgeCheck } from 'lucide-react';
import type { MonthlyOrder } from '../types';
import { ApprovalQrCode } from './ApprovalQrCode';
import { getProductLabel, getTableHeaders } from '../constants/productTypes';
import { LOGISTICS_TYPES, type LogisticsType } from '../constants/logisticsTypes';
import { ORDER_STATUS_LABELS } from '../constants/orderStatuses';
import { buildOrderTableRows } from '../../modules/marketing/utils/orderTable';
import { lineTonCount, lineWagonCount, summarizeOrderQuantities } from '../utils/orderQuantity';

const HEADER_QR_SIZE = 72;

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

function SignerBlock({ title, name, at, status }: {
  title: string; name?: string | null; at?: string | null; status: string;
}) {
  const approved = Boolean(at && name);
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
            value={[
              `Bo‘lim/sex: ${title}`,
              `Holat: ${status}`,
              `F.I.Sh.: ${name || 'Tizimda qayd etilmagan'}`,
              `Sana/vaqt: ${fmtCard(at)}`,
            ].join('\n')}
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

export function isProductOrderPrintReady(order: MonthlyOrder): boolean {
  return Boolean(order.approvedAt && order.deputyApprovedAt);
}

export function ProductOrderDocument({
  order,
  logisticsType = LOGISTICS_TYPES.Railway,
  preview = false,
}: {
  order: MonthlyOrder;
  logisticsType?: LogisticsType;
  preview?: boolean;
}) {
  const headers = getTableHeaders(logisticsType);
  const rows = buildOrderTableRows(order.lines);
  const totals = summarizeOrderQuantities(order.lines);
  const productLabel = getProductLabel(order.productType, logisticsType);
  const isFullyApproved = Boolean(order.deputyApprovedAt) || ['Active', 'Completed'].includes(order.status);
  const statusText = isFullyApproved
    ? 'Tasdiqlangan'
    : (ORDER_STATUS_LABELS[order.status] || (order.approvedAt ? 'Tasdiqlash kutilmoqda' : 'Kelishuvda'));
  const approvedAt = isFullyApproved
    ? (order.deputyApprovedAt || order.dispatchApprovedAt || order.approvedAt)
    : (order.approvedAt || order.marketingApprovedAt || null);
  const deputyApproved = Boolean(order.deputyApprovedAt);

  return (
    <div
      className="yuk-xati yuk-xati--sample yuk-xati--landscape product-order-document"
      data-order-doc={order.id}
      aria-hidden={preview ? undefined : true}
    >
      <section className="yxn-page">
        <div className="yxn-topline">
          <strong>E-TRANSPORT Axborot tizimi</strong>
          <span>Mahsulotlarni yuklash hujjati</span>
        </div>

        <header className="yxn-header">
          <div className="yxn-header__title">
            <h1>MAHSULOTLARNI YUKLASH UCHUN<br />BUYURTMA</h1>
            <p>№ {order.orderNumber}</p>
          </div>
        </header>

        <div className="yxn-head">
          <div className="yxn-head__side yxn-head__side--left">
            <div className="yxn-head-qr">
              <ApprovalQrCode
                value={order.qrVerificationUrl || `https://qrlink.sgcc.uz/verify/${encodeURIComponent(order.qrGlobalId || order.orderNumber || order.id)}`}
                qrCodeBase64={order.qrCodeBase64}
                globalId={order.qrGlobalId}
                size={HEADER_QR_SIZE}
                level="M"
                link
              />
            </div>
            <div className="yxn-head__text yxn-head__text--meta">
              <div><b>Hujjat holati:</b> {statusText}</div>
              <div><b>Tasdiqlangan sana/vaqt:</b> {approvedAt ? fmtXizmat(approvedAt) : '—'}</div>
              <div><b>Mahsulot turi:</b> {productLabel}</div>
            </div>
          </div>

          <div className={`yxn-head__side yxn-head__side--right${deputyApproved ? ' is-approved' : ''}`}>
            <div className="yxn-head__text yxn-head__text--right yxn-head__text--meta yxn-head__text--signer">
              <div className="font-bold">Bosh direktor o‘rinbosari</div>
              <div className="yxn-head__name font-bold">U. Isayev</div>
              <div className="yxn-head__stamp-status font-bold">
                {deputyApproved ? 'TASDIQLANDI' : 'KUTILMOQDA'}
              </div>
            </div>
            <div className="yxn-head__stamp">
              <div className="yxn-head-qr">
                {deputyApproved ? (
                  <ApprovalQrCode
                    value={[
                      'Holat: Tasdiqlandi',
                      'Bo\'lim/sex: Bosh direktor o\'rinbosari',
                      'F.I.Sh.: U. Isayev',
                      'Ishonchnoma raqami: 01-5/25-33 12.08.2026',
                      `Sana/vaqt: ${fmtCard(order.deputyApprovedAt)}`,
                    ].join('\n')}
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

        <table className="yxn-wagons product-order-table">
          <thead>
            <tr>
              {headers.map(header => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, groupNumber, isFirstInGroup, isFirstInTable, groupRowSpan, totalRows }) => (
              <tr key={line.id}>
                {isFirstInGroup ? (
                  <td className="product-order-num" rowSpan={groupRowSpan}>{groupNumber}</td>
                ) : null}
                {isFirstInGroup ? (
                  <td className="product-order-contractor" rowSpan={groupRowSpan}>{line.contractor}</td>
                ) : null}
                <td className="product-order-qty">{lineWagonCount(line)}</td>
                <td className="product-order-qty">{lineTonCount(line)}</td>
                {isFirstInTable ? (
                  <td className="product-order-contract" rowSpan={totalRows}>{order.contractNumber || '—'}</td>
                ) : null}
                <td className="product-order-dest">{line.destinationStation}</td>
              </tr>
            ))}
            <tr className="product-order-total">
              <td colSpan={2} className="product-order-contractor text-center !text-center font-bold">JAMI</td>
              <td className="product-order-qty">{totals.wagonTotal}</td>
              <td className="product-order-qty">{totals.tonTotal}</td>
              <td className="product-order-contract" />
              <td className="product-order-dest" />
            </tr>
          </tbody>
        </table>

        <div className="yxn-signatures">
          <SignerBlock
            title="MS va MX boshlig‘i"
            name={order.marketingApproverName || order.createdBy}
            at={order.createdAt}
            status="Yaratildi"
          />
          <SignerBlock
            title="Buxgalteriya"
            name={order.accountingApproverName}
            at={order.approvedAt}
            status="Kelishildi"
          />
        </div>

        <footer className="yxn-footer">
          <span>E-TRANSPORT Axborot tizimi | Mahsulotlarni yuklash hujjati</span>
          <span>{order.orderNumber}</span>
        </footer>
      </section>
    </div>
  );
}
