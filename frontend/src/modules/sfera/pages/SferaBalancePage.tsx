import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, RefreshCw, WifiOff } from 'lucide-react';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import { api } from '../../../shared/services/api';
import { useTheme } from '../../../shared/contexts/ThemeContext';

/**
 * Sfera Balance — alohida tizim (o‘z serveri, bazasi va kodi bilan).
 * E-Transport uni faqat ichki oynada embed rejimida (?embed=1) ko‘rsatadi:
 * Sfera o‘z menyusini yashiradi, navigatsiya E-Transport menyusidan boshqariladi.
 * Hech qanday ma'lumot almashilmaydi. Manzil: VITE_SFERA_URL yoki joriy saytning /sfera-app/ yo'li.
 */
const SFERA_URL = (import.meta.env.VITE_SFERA_URL as string | undefined)
  // Sfera E-Transport bilan bir manzildan (/sfera-app/) — domen, HTTPS va IP bilan bir xil ishlaydi
  || `${window.location.origin}/sfera-app/`;
const SFERA_ORIGIN = new URL(SFERA_URL).origin;
/** Sfera ichki yo'lini ("/balance/daily") /sfera-app/ ostida to'liq manzilga aylantiradi */
const sferaHref = (route: string) => new URL(route.replace(/^\//, ''), SFERA_URL);

const LPG = 'Suyultirilgan gaz';
const COND = 'Gaz kondensati';
/**
 * admin: true — texnik bo‘limlar, sfera.admin huquqi bilan.
 * update: true — sozlamalar, sfera.update (yoki sfera.admin) huquqi bilan.
 */
const PAGES: Record<string, { group: string; title: string; route: string; admin?: boolean; update?: boolean }> = {
  lpg: { group: LPG, title: 'Real vaqtdagi ko‘rsatkichlar', route: '/' },
  'lpg-daily': { group: LPG, title: 'Sutkalik ko‘rsatkichlar', route: '/balance/daily' },
  'lpg-monthly': { group: LPG, title: 'Oylik ko‘rsatkichlar', route: '/balance/monthly' },
  'lpg-yearly': { group: LPG, title: 'Yillik ko‘rsatkichlar', route: '/balance/yearly' },
  'lpg-flow': { group: LPG, title: 'Kiruvchi gaz', route: '/flow-history', admin: true },
  'lpg-minute': { group: LPG, title: 'Sfera telemetriyasi', route: '/minute-history', admin: true },
  'lpg-sources': { group: LPG, title: 'Ma’lumot manbalari', route: '/data-sources', admin: true },
  'lpg-calc': { group: LPG, title: 'Hisoblashlar', route: '/calculations', admin: true },
  'lpg-history': { group: LPG, title: 'V1/V2 tahlili', route: '/history', admin: true },
  'lpg-settings': { group: LPG, title: 'Sozlamalar', route: '/settings?product=lpg', update: true },
  cond: { group: COND, title: 'Real vaqtdagi ko‘rsatkichlar', route: '/condensate/monitoring' },
  'cond-hourly': { group: COND, title: 'Soatlik ko‘rsatkichlar', route: '/condensate/hourly' },
  'cond-daily': { group: COND, title: 'Sutkalik ko‘rsatkichlar', route: '/condensate/daily' },
  'cond-monthly': { group: COND, title: 'Oylik ko‘rsatkichlar', route: '/condensate/monthly' },
  'cond-yearly': { group: COND, title: 'Yillik ko‘rsatkichlar', route: '/condensate/yearly' },
  'cond-flow': { group: COND, title: 'Kiruvchi gaz kondensati', route: '/condensate/flow-history', admin: true },
  'cond-telemetry': { group: COND, title: 'Silindr telemetriyasi', route: '/condensate/cylinder-telemetry', admin: true },
  'cond-settings': { group: COND, title: 'Sozlamalar', route: '/settings?product=condensate', update: true },
};

type Status = 'checking' | 'online' | 'offline';

export default function SferaBalancePage() {
  const { canSferaView, canSferaUpdate, canSferaAdmin } = useRbacPermission();
  const { theme } = useTheme();
  const [params] = useSearchParams();
  const requested = PAGES[params.get('p') ?? ''];
  const allowed = requested
    && (!requested.admin || canSferaAdmin)
    && (!requested.update || canSferaUpdate);
  const pageKey = allowed ? params.get('p')! : 'lpg';
  const page = PAGES[pageKey];
  const [status, setStatus] = useState<Status>('checking');
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const check = useCallback(async () => {
    setStatus('checking');
    // Sfera shlyuzi faqat E-Transport kirish cookie'si bilan ochiladi
    const ok = await api.openSferaSession();
    setStatus(ok ? 'online' : 'offline');
  }, []);

  useEffect(() => { void check(); }, [check]);

  // Tema o‘zgarsa, sahifani qayta yuklamasdan Sferaga xabar beriladi
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'sfera-theme', theme }, SFERA_ORIGIN);
  }, [theme]);

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

  // Tema faqat birinchi yuklashda URL orqali, keyin postMessage bilan
  const srcUrl = sferaHref(page.route);
  srcUrl.searchParams.set('embed', '1');
  srcUrl.searchParams.set('theme', themeRef.current === 'dark' ? 'dark' : 'light');
  // admin=1 — Sfera sarlavhasi (Admin rejimi tugmasi) ko‘rinadi; Sfera PIN-kodi baribir so‘raladi
  srcUrl.searchParams.set('admin', canSferaAdmin ? '1' : '0');
  const src = srcUrl.toString();
  const reload = () => { setFrameKey(k => k + 1); void check(); };

  return (
    <div className="sfera-page">
      <div className="sfera-page__bar">
        <nav className="sfera-page__crumbs" aria-label="Sfera bo‘limi">
          <span>{page.group}</span><i>›</i><b>{page.title}</b>
        </nav>
        <span className={`sfera-page__status is-${status}`} title={status === 'online' ? 'Sfera Balance serveri ulangan' : undefined}>
          <i />{status === 'online' ? 'Ulangan' : status === 'offline' ? 'Mavjud emas' : 'Tekshirilmoqda…'}
        </span>
        <div className="sfera-page__actions">
          <button type="button" className="sfera-page__btn" onClick={reload} title="Yangilash" aria-label="Yangilash">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      {status === 'checking' && frameKey === 0 ? null : status === 'offline' ? (
        <div className="docs-panel sfera-page__offline">
          <div className="thub-empty">
            <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="thub-empty__title">Sfera Balance hozir mavjud emas</p>
            <p className="thub-empty__text">Sfera Balance'ga kirish ochilmadi. E-Transport ishlashiga bu ta'sir qilmaydi. Birozdan keyin «Yangilash»ni bosing.</p>
          </div>
        </div>
      ) : (
        <iframe key={`${pageKey}-${frameKey}`} ref={frameRef} className="sfera-page__frame" src={src} title={`Sfera Balance — ${page.title}`} />
      )}
    </div>
  );
}
