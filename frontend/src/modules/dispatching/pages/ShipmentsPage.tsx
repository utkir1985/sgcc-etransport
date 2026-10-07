import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../../shared/services/api';
import { Shipment, STATUS_COLORS } from '../../../shared/types';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.Created}`}>
      {status}
    </span>
  );
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.getShipments()
      .then(res => { if (res.data) setShipments(res.data); })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const unsub = subscribeOrdersChanged(() => load(true));
    return unsub;
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Yuk jo'natmalari</h1>
        <p className="page-desc">22 bosqichli workflow holati</p>
      </div>

      <div className="grid gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))
        ) : shipments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Jo'natmalar topilmadi</div>
        ) : shipments.map(s => (
          <div
            key={s.id}
            className="ui-card p-4 sm:p-5 flex items-start sm:items-center justify-between gap-3 hover:border-primary-300 dark:hover:border-blue-500/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                <span className="font-semibold text-primary-600 dark:text-blue-400">{s.shipmentNumber}</span>
                <StatusBadge status={s.status} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                {s.productType} → {s.destinationStation}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {s.wagonCount} vagon · {new Date(s.createdAt).toLocaleString('uz-UZ')}
              </p>
            </div>
            <Link
              to={`/shipments/${s.id}`}
              className="btn-icon shrink-0 min-w-[44px]"
              aria-label="Batafsil"
            >
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
