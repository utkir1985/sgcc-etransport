import type { ReactNode } from 'react';
import type { MonthlyOrder } from '../types';
import {
  getVisibleSignatureKeys,
  type SignatureVisibility,
} from '../constants/signatureVisibility';
import { ApprovalQrCode } from './ApprovalQrCode';
import { BadgeCheck } from 'lucide-react';

interface OrderSignatureStripProps {
  order: MonthlyOrder;
  visibility: SignatureVisibility;
}

export function OrderSignatureStrip({ order, visibility }: OrderSignatureStripProps) {
  const allowedKeys = new Set(getVisibleSignatureKeys(visibility));

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || '';
    return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
  };

  const signatures = [
    {
      key: 'marketing',
      label: 'Yaratildi',
      role: 'MS va MX boshlig‘i',
      // Xodim yaratgan buyurtma: imzo faqat bo'lim boshlig'i tasdiqlaganda (xodimning QR imzosi yo'q)
      name: order.headApprovedAt
        ? (order.headApprovedByName || order.marketingApproverName)
        : order.marketingApproverName,
      timestamp: order.headApprovedAt || order.createdAt,
    },
    {
      key: 'accounting',
      label: 'Kelishildi',
      role: 'Buxgalteriya',
      name: order.accountingApproverName,
      timestamp: order.approvedAt,
    },
    {
      key: 'deputy',
      label: 'Tasdiqlandi',
      role: 'Bosh direktor o‘rinbosari',
      name: order.deputyApprovedAt ? (order.deputyApproverName || 'U. Isayev') : '',
      timestamp: order.deputyApprovedAt,
    },
  ].filter(item => Boolean(item.name && item.timestamp) && allowedKeys.has(item.key));

  if (signatures.length === 0) return null;

  return (
    <div className="order-signature-strip">
      <div className="order-signature-list">
        {signatures.map(item => (
          <div key={item.key} className="order-signature-group">
            <div className="order-signature-text">
              <span className="order-signature-role"><BadgeCheck strokeWidth={2} />{item.label}</span>
              <span className="order-signature-dept">{item.role}</span>
              <span className="order-signature-name">{item.name}</span>
              <time className="order-signature-time" dateTime={item.timestamp || undefined}>
                {formatTimestamp(item.timestamp)}
              </time>
            </div>
            <ApprovalQrCode
              value={[
                `Holat: ${item.label}`,
                `Bo'lim/sex: ${item.role}`,
                `F.I.Sh.: ${item.name}`,
                ...(item.key === 'deputy' ? ['Ishonchnoma raqami: 01-5/25-33 12.08.2026'] : []),
                `Sana/vaqt: ${formatTimestamp(item.timestamp)}`,
              ].join('\n')}
              size={70}
              level="L"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface OrderSheetTableFooterProps {
  children: ReactNode;
}

export function OrderSheetTableFooter({ children }: OrderSheetTableFooterProps) {
  return (
    <div className="order-sheet-table-footer">
      {children}
    </div>
  );
}
