import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Plus, Search,
  FileText, AlertCircle, RefreshCw, X, Send, User, Clock,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { DispatchJournalEntry, Shipment } from '../../../shared/types';
import { startAutoRefresh, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';

export default function DispatchJournalPage() {
  const [entries, setEntries] = useState<DispatchJournalEntry[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedShipmentFilter, setSelectedShipmentFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week'>('all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [targetShipmentId, setTargetShipmentId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [journalRes, shipmentsRes] = await Promise.all([
        api.getDispatchJournal(),
        api.getShipments(),
      ]);
      if (journalRes.data) {
        setEntries(journalRes.data);
      }
      if (shipmentsRes.data) {
        setShipments(shipmentsRes.data);
        if (!targetShipmentId && shipmentsRes.data.length > 0) {
          setTargetShipmentId(shipmentsRes.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load dispatch journal:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeOrdersChanged(() => loadData(true));
    const stopPoll = startAutoRefresh(() => loadData(true), 15000);
    return () => {
      unsub();
      stopPoll();
    };
  }, []);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || !targetShipmentId) {
      setSubmitError('Iltimos, jo‘natmani tanlang va qayd matnini kiriting.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.createDispatchJournalEntry(targetShipmentId, noteContent.trim());
      if (res.data) {
        setEntries(prev => [res.data, ...prev]);
        setNoteContent('');
        setModalOpen(false);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Qaydni saqlashda xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const shipmentMap = useMemo(() => {
    const map = new Map<string, Shipment>();
    shipments.forEach(s => map.set(s.id, s));
    return map;
  }, [shipments]);

  const filteredEntries = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    return entries.filter(item => {
      // Date filter
      const itemTime = new Date(item.recordedAt).getTime();
      if (dateRange === 'today' && itemTime < startOfToday) return false;
      if (dateRange === 'week' && itemTime < oneWeekAgo) return false;

      // Shipment filter
      if (selectedShipmentFilter !== 'ALL' && item.shipmentId !== selectedShipmentFilter) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const ship = shipmentMap.get(item.shipmentId);
        const matchEntry = item.entry.toLowerCase().includes(q);
        const matchUser = item.recordedBy.toLowerCase().includes(q);
        const matchShipNumber = ship?.shipmentNumber.toLowerCase().includes(q);
        const matchProduct = ship?.productType.toLowerCase().includes(q);
        if (!matchEntry && !matchUser && !matchShipNumber && !matchProduct) return false;
      }

      return true;
    });
  }, [entries, search, selectedShipmentFilter, dateRange, shipmentMap]);

  const todayCount = useMemo(() => {
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    return entries.filter(e => new Date(e.recordedAt).getTime() >= startOfToday).length;
  }, [entries]);

  const uniqueShipmentCount = useMemo(() => {
    return new Set(entries.map(e => e.shipmentId)).size;
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Dispetcher jurnali
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                ICHDX navbatchilik va jo‘natmalar harakati bo‘yicha tezkor qaydlar daftari
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => loadData()}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yangilash</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubmitError('');
              setModalOpen(true);
            }}
            className="btn-primary flex items-center gap-2 text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi qayd</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="ui-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
            {entries.length}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Jami qaydlar</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{entries.length} ta</p>
          </div>
        </div>

        <div className="ui-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
            {todayCount}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bugungi qaydlar</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{todayCount} ta</p>
          </div>
        </div>

        <div className="ui-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
            {uniqueShipmentCount}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Qamrab olingan jo‘natmalar</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{uniqueShipmentCount} ta</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="ui-card p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Qayd matni, dispetcher yoki jo‘natma raqami bo‘yicha qidiruv..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedShipmentFilter}
            onChange={e => setSelectedShipmentFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Barcha jo‘natmalar</option>
            {shipments.map(s => (
              <option key={s.id} value={s.id}>
                {s.shipmentNumber} ({s.productType})
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setDateRange('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Barchasi
            </button>
            <button
              type="button"
              onClick={() => setDateRange('today')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'today'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Bugun
            </button>
            <button
              type="button"
              onClick={() => setDateRange('week')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'week'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Hafta
            </button>
          </div>
        </div>
      </div>

      {/* Journal Entries List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="ui-card p-5 animate-pulse flex flex-col gap-3">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
              <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Qaydlar topilmadi
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
            Qidiruv shartlariga mos yozuv mavjud emas yoki dispetcher jurnali hali bo‘sh.
          </p>
          <button
            type="button"
            onClick={() => {
              setModalOpen(true);
            }}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Birinchi qaydni yozish</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map(item => {
            const ship = shipmentMap.get(item.shipmentId);
            const entryDate = new Date(item.recordedAt);
            return (
              <div
                key={item.id}
                className="ui-card p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {ship ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold text-xs border border-blue-200/50 dark:border-blue-800/50">
                        <FileText className="w-3.5 h-3.5" />
                        {ship.shipmentNumber} · {ship.productType}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs">
                        <FileText className="w-3.5 h-3.5" />
                        Jo‘natma ID: {item.shipmentId.slice(0, 8)}…
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {item.recordedBy || 'Dispetcher'}
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {entryDate.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                      {entryDate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {item.entry}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* New Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Dispetcher jurnaliga qayd kiritish
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEntry} className="space-y-4">
              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tegishli jo‘natma *
                </label>
                {shipments.length > 0 ? (
                  <select
                    value={targetShipmentId}
                    onChange={e => setTargetShipmentId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {shipments.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.shipmentNumber} — {s.productType} ({s.wagonCount} vagon, {s.destinationStation})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Aktiv jo‘natmalar topilmadi. Avval Rejadan jo‘natma yarating.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Dispetcher qaydi / Navbatchilik ko‘rsatmasi *
                </label>
                <textarea
                  rows={4}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Masalan: Vagonlar TM va XA ga uzatildi, 3 ta sisterna yuklashga tayyorlandi. Navbatchi dispetcher qabul qildi..."
                  required
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary text-sm"
                  disabled={submitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={submitting || shipments.length === 0}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'Saqlanmoqda...' : 'Qaydni saqlash'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
