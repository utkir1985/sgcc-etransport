import { PackageCheck, Scale, TrainFront } from 'lucide-react';
import type { MonthlyOrder } from '../types';

export type OrderFulfillmentTotals = {
  orderedWagons: number;
  orderedTons: number;
  fulfilledWagons: number;
  fulfilledTons: number;
  remainingWagons: number;
  remainingTons: number;
};

export function computeOrderFulfillment(order: MonthlyOrder): OrderFulfillmentTotals {
  let orderedWagons = 0;
  let orderedTons = 0;
  let fulfilledWagons = 0;
  let fulfilledTons = 0;

  for (const line of order.lines ?? []) {
    const orderedW = line.wagonCount || 0;
    const orderedT = line.tonCount || 0;
    const doneW = line.fulfilledWagonCount ?? 0;
    const doneT = Number(line.fulfilledNetWeight ?? 0);
    orderedWagons += orderedW;
    orderedTons += orderedT;
    fulfilledWagons += doneW;
    fulfilledTons += doneT;
  }

  if (orderedWagons === 0 && order.totalWagons > 0) orderedWagons = order.totalWagons;
  if (orderedTons === 0 && order.totalTons > 0) orderedTons = order.totalTons;

  const remainingWagons = Math.max(0, orderedWagons - fulfilledWagons);
  const remainingTons = Math.max(0, Math.round((orderedTons - fulfilledTons) * 1000) / 1000);

  return {
    orderedWagons,
    orderedTons,
    fulfilledWagons,
    fulfilledTons: Math.round(fulfilledTons * 1000) / 1000,
    remainingWagons,
    remainingTons,
  };
}

/** Ijro tonna bo‘yicha: qatorda tonna bo‘lsa — tonna, faqat vagon bo‘lsa (eski buyurtma) — vagon. */
export function isOrderFulfilled(order: MonthlyOrder): boolean {
  const lines = order.lines ?? [];
  return lines.some(l => l.wagonCount > 0 || l.tonCount > 0)
    && lines.every(l => l.tonCount > 0
      ? Number(l.fulfilledNetWeight ?? 0) >= l.tonCount
      : l.wagonCount <= 0 || (l.fulfilledWagonCount ?? 0) >= l.wagonCount);
}

function fmtTon(n: number): string {
  if (n <= 0) return '0';
  return n.toLocaleString('uz-UZ', { maximumFractionDigits: 1 });
}

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

type Props = {
  order: MonthlyOrder;
  className?: string;
};

/** Buyurtma ijro holati — asl miqdor saqlanadi, yuk xati bilan qoldiq kamayadi. */
export function OrderFulfillmentStatus({ order, className = '' }: Props) {
  const t = computeOrderFulfillment(order);
  const wagonPct = pct(t.fulfilledWagons, t.orderedWagons);
  const tonPct = pct(t.fulfilledTons, t.orderedTons);
  // Yangi buyurtmalarda vagon rejasi yo‘q — faqat yuklangan vagonlar soni ko‘rsatiladi.
  const hasWagonPlan = t.orderedWagons > 0;
  const done = isOrderFulfilled(order);

  return (
    <section
      id="order-fulfillment"
      className={`order-fulfillment ${className}`.trim()}
      aria-label="Buyurtma ijro holati"
    >
      <header className="order-fulfillment__head">
        <span className="order-fulfillment__head-icon">
          <PackageCheck strokeWidth={1.8} />
        </span>
        <div>
          <h3>Ijro holati</h3>
          <p>Yuk xati tayyorlanganda qoldiq kamayadi</p>
        </div>
        <span className={`order-fulfillment__badge${done ? ' is-done' : ''}`}>
          {done ? 'Tugallangan' : 'Jarayonda'}
        </span>
      </header>

      <div className="order-fulfillment__metrics">
        <div className="order-fulfillment__metric">
          <em>Buyurtma</em>
          <strong className="tabular-nums">{fmtTon(t.orderedTons)}</strong>
          <span className="order-fulfillment__unit">t{hasWagonPlan ? ` · ${t.orderedWagons} vagon` : ''}</span>
        </div>
        <div className="order-fulfillment__metric order-fulfillment__metric--sent">
          <em>Jo‘natildi</em>
          <strong className="tabular-nums">{fmtTon(t.fulfilledTons)}</strong>
          <span className="order-fulfillment__unit">t · {t.fulfilledWagons} vagon</span>
        </div>
        <div className="order-fulfillment__metric order-fulfillment__metric--remain">
          <em>Qoldiq</em>
          <strong className="tabular-nums">{fmtTon(t.remainingTons)}</strong>
          <span className="order-fulfillment__unit">t{hasWagonPlan ? ` · ${t.remainingWagons} vagon` : ''}</span>
        </div>
      </div>

      <div className="order-fulfillment__bars">
        {hasWagonPlan ? (
        <div className="order-fulfillment__bar-row">
          <div className="order-fulfillment__bar-label">
            <TrainFront strokeWidth={1.75} aria-hidden />
            <span>Vagon</span>
            <strong className="tabular-nums">{wagonPct}%</strong>
          </div>
          <div
            className="order-fulfillment__track"
            role="progressbar"
            aria-valuenow={wagonPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${wagonPct}%` }} />
          </div>
        </div>
        ) : null}
        <div className="order-fulfillment__bar-row">
          <div className="order-fulfillment__bar-label">
            <Scale strokeWidth={1.75} aria-hidden />
            <span>Og‘irlik</span>
            <strong className="tabular-nums">{tonPct}%</strong>
          </div>
          <div
            className="order-fulfillment__track"
            role="progressbar"
            aria-valuenow={tonPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${tonPct}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
