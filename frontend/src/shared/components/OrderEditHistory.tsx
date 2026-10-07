import { useEffect, useState } from 'react';
import { Clock3, History, MessageSquareText, PencilLine } from 'lucide-react';
import { api } from '../services/api';
import { formatDateTimeDisplay } from '../utils/dates';

type HistoryItem = {
  id: string; editorName: string; comment: string; changes: string[]; createdAt: string;
};

export function OrderEditHistory({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    api.getOrderEditHistory(orderId).then(res => setItems((res.data ?? []).map(item => {
      try {
        const parsed = JSON.parse(item.details) as { comment?: string; changes?: string[] };
        return { ...item, comment: parsed.comment || item.details, changes: parsed.changes || [] };
      } catch {
        return { ...item, comment: item.details, changes: [] };
      }
    }))).catch(() => setItems([]));
  }, [orderId]);

  if (items.length === 0) return null;
  return (
    <section className="order-edit-history" aria-label="Tahrirlash tarixi">
      <header className="order-edit-history__head">
        <span className="order-edit-history__head-icon"><History strokeWidth={1.8} /></span>
        <div><h3>Tahrirlash tarixi</h3><p>Buyurtmaga kiritilgan o‘zgarishlar va izohlar</p></div>
        <span className="order-edit-history__count">{items.length} ta o‘zgarish</span>
      </header>
      <div className="order-edit-history__timeline">
        {items.map((item, index) => (
          <article key={item.id} className="order-edit-history__entry">
            <div className="order-edit-history__rail" aria-hidden>
              <span>{item.editorName.trim().charAt(0).toUpperCase() || 'U'}</span>
              {index < items.length - 1 ? <i /> : null}
            </div>
            <div className="order-edit-history__card">
              <div className="order-edit-history__meta">
                <div className="order-edit-history__author"><strong>{item.editorName}</strong><span><PencilLine /> Buyurtmani tahrirladi</span></div>
                <time><Clock3 />{formatDateTimeDisplay(item.createdAt)}</time>
              </div>
              <div className="order-edit-history__comment"><MessageSquareText /><div><span>Tahrirlash izohi</span><p>{item.comment}</p></div></div>
              {item.changes.length ? <div className="order-edit-history__changes">{item.changes.map((c, i) => <span key={i}>{c}</span>)}</div> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
