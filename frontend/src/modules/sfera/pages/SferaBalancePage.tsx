import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Gauge, Lock, RefreshCw, WifiOff } from 'lucide-react';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';

/**
 * Sfera Balance — alohida tizim (o‘z serveri, bazasi va kodi bilan).
 * E-Transport uni faqat ichki oynada ko‘rsatadi; hech qanday ma'lumot almashilmaydi.
 * Manzil: VITE_SFERA_URL yoki joriy host'ning 8010-porti.
 */
const SFERA_URL = (import.meta.env.VITE_SFERA_URL as string | undefined)
  || `${window.location.protocol}//${window.location.hostname}:8010/`;

type Status = 'checking' | 'online' | 'offline';

export default function SferaBalancePage() {
  const { canSferaView } = useRbacPermission();
  const [status, setStatus] = useState<Status>('checking');
  const [frameKey, setFrameKey] = useState(0);

  const check = useCallback(async () => {
    setStatus('checking');
    try {
      // Boshqa origin: javob o‘qilmaydi (no-cors), faqat server ochilishi tekshiriladi
      await fetch(new URL('api/health', SFERA_URL).toString(), { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) });
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  if (!canSferaView) {
    return (
      <div className="docs-panel">
        <div className="thub-empty">
          <Lock className="mx-auto mb-2 h-8 w-8 text-slate-400" />
          <p className="thub-empty__title">Ruxsat yo‘q</p>
          <p className="thub-empty__text">Sfera Balance panelini ko‘rish huquqi sizning rolingizga berilmagan. Administratorga murojaat qiling.</p>
        </div>
      </div>
    );
  }

  const reload = () => { setFrameKey(k => k + 1); void check(); };

  return (
    <div className="sfera-page">
      <div className="sfera-page__bar">
        <span className="sfera-page__icon"><Gauge className="w-4 h-4" /></span>
        <div className="min-w-0">
          <h2>Sfera Balance</h2>
          <p>FB-8104 sfera va kondensat rezervuarlari · alohida tizim</p>
        </div>
        <span className={`sfera-page__status is-${status}`}>
          <i />{status === 'online' ? 'Ulangan' : status === 'offline' ? 'Mavjud emas' : 'Tekshirilmoqda…'}
        </span>
        <div className="sfera-page__actions">
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={reload}>
            <RefreshCw className="w-4 h-4" /> <span className="sfera-page__label">Yangilash</span>
          </button>
          <a className="btn-secondary inline-flex items-center gap-1.5" href={SFERA_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4" /> <span className="sfera-page__label">Yangi oynada ochish</span>
          </a>
        </div>
      </div>
      {status === 'offline' ? (
        <div className="docs-panel sfera-page__offline">
          <div className="thub-empty">
            <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="thub-empty__title">Sfera Balance hozir mavjud emas</p>
            <p className="thub-empty__text">Tizim serveri javob bermayapti. E-Transport ishlashiga bu ta'sir qilmaydi. Birozdan keyin «Yangilash»ni bosing.</p>
          </div>
        </div>
      ) : (
        <iframe key={frameKey} className="sfera-page__frame" src={SFERA_URL} title="Sfera Balance" />
      )}
    </div>
  );
}
