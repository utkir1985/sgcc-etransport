import { useEffect, useState } from 'react';
import { Clock3, History, MessageSquareText, PencilLine } from 'lucide-react';
import { api } from '../../../shared/services/api';
import { formatDateTimeDisplay } from '../../../shared/utils/dates';

export type LoadingWagonHistoryItem = {
  id: string;
  editorName: string;
  comment: string;
  changes: string[];
  createdAt: string;
};

function parseHistoryItem(item: {
  id: string;
  editorName: string;
  details: string;
  createdAt: string;
}): LoadingWagonHistoryItem {
  try {
    const parsed = JSON.parse(item.details) as { comment?: string; changes?: string[] };
    return {
      id: item.id,
      editorName: item.editorName,
      comment: parsed.comment || item.details,
      changes: parsed.changes || [],
      createdAt: item.createdAt,
    };
  } catch {
    return {
      id: item.id,
      editorName: item.editorName,
      comment: item.details,
      changes: [],
      createdAt: item.createdAt,
    };
  }
}

export function LoadingWagonEditHistory({ unitId, refreshKey = 0 }: { unitId: string; refreshKey?: number }) {
  const [items, setItems] = useState<LoadingWagonHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getWarehouseWagonEditHistory(unitId)
      .then(res => setItems((res.data ?? []).map(parseHistoryItem)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [unitId, refreshKey]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Tarix yuklanmoqda…</p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Hali tahrirlash tarixi yo‘q.</p>
    );
  }

  return (
    <section className="order-edit-history" aria-label="Tahrirlash tarixi">
      <header className="order-edit-history__head">
        <span className="order-edit-history__head-icon"><History strokeWidth={1.8} /></span>
        <div>
          <h3>Tahrirlash tarixi</h3>
          <p>Vagonga kiritilgan o‘zgarishlar va izohlar</p>
        </div>
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
                <div className="order-edit-history__author">
                  <strong>{item.editorName}</strong>
                  <span><PencilLine strokeWidth={1.8} /> Vagon ma’lumotini tahrirladi</span>
                </div>
                <time dateTime={item.createdAt}>
                  <Clock3 strokeWidth={1.8} />
                  {formatDateTimeDisplay(item.createdAt)}
                </time>
              </div>
              <div className="order-edit-history__comment">
                <MessageSquareText strokeWidth={1.8} />
                <div><span>Tahrirlash izohi</span><p>{item.comment}</p></div>
              </div>
              {item.changes.length > 0 ? (
                <div className="order-edit-history__changes">
                  {item.changes.map((change, changeIndex) => (
                    <span key={changeIndex}>{change}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
