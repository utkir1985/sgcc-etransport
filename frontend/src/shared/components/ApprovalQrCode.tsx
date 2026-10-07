import QRCode from 'react-qr-code';

interface ApprovalQrCodeProps {
  value?: string;
  qrCodeBase64?: string;
  globalId?: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  /** true bo‘lsa (yoki value http URL bo‘lsa) bosilganda ochiladi */
  link?: boolean;
}

export function ApprovalQrCode({
  value = '',
  qrCodeBase64,
  globalId,
  size = 72,
  level = 'M',
  link,
}: ApprovalQrCodeProps) {
  if (!value && !qrCodeBase64) return null;

  const isUrl = /^https?:\/\//i.test(value);
  const asLink = (link ?? isUrl) && isUrl;

  const qr = value ? (
    <QRCode
      value={value}
      size={size}
      level={level}
      bgColor="#FFFFFF"
      fgColor="#000000"
      title={asLink ? (globalId ? `Global ID: ${globalId}` : 'Hujjatni tekshirish') : `Tasdiq: ${value}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  ) : qrCodeBase64 ? (
    <img
      src={qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
      alt={globalId || 'QR kod'}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  ) : null;

  if (asLink) {
    return (
      <a
        className="approval-qr approval-qr--link"
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        style={{ width: size, height: size, maxWidth: size, maxHeight: size, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label={globalId ? `Markaziy QR verifikatsiya (${globalId})` : 'Hujjat QR — tekshirish'}
        title={globalId ? `Markaziy QR: ${globalId}` : 'Hujjatni tekshirish'}
      >
        {qr}
      </a>
    );
  }

  return (
    <div
      className="approval-qr"
      style={{ width: size, height: size, maxWidth: size, maxHeight: size, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      aria-label={globalId ? `Markaziy QR: ${globalId}` : `Tasdiq QR: ${value}`}
      title={globalId ? `Markaziy QR: ${globalId}` : undefined}
    >
      {qr}
    </div>
  );
}
