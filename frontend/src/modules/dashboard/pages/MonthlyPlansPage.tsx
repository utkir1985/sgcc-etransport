import React, { Component, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  Scale,
  Train,
  CheckCircle2,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  Search,
  MapPin,
  ChevronRight,
  ChevronDown,
  Layers,
  X,
  ExternalLink,
  Building2,
  Hash,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import type { MonthlyOrder } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { ProductTypeIcon } from '../../../shared/components/ProductTypeIcon';
import { OrderStatusBadge } from '../../../shared/components/OrderStatusBadge';
import { DocumentChipButton } from '../../../shared/components/DocumentPackChip';
import { ProductOrderDocument, isProductOrderPrintReady } from '../../../shared/components/ProductOrderDocument';
import { DocumentPrintButton } from '../../../shared/components/DocumentPrintButton';
import { downloadOrderPdf } from '../../../shared/utils/orderSheetPrint';
import { getProductLabel } from '../../../shared/constants/productTypes';
import {
  LOGISTICS_TYPES,
  logisticsFromRoute,
} from '../../../shared/constants/logisticsTypes';
import { formatDateDisplay, formatDateTimeDisplay } from '../../../shared/utils/dates';
import { computeOrderFulfillment } from '../../../shared/components/OrderFulfillmentStatus';

const MONTH_NAMES = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

function MonthlyPlansPage() {
  const navigate = useNavigate();

  // Filter holatlari: Barchasi ochiq turadi, foydalanuvchi xohlagan davrni tanlaydi
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedLogistics, setSelectedLogistics] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ma'lumotlar
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kengaytirilgan qatorlar (Accordion)
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Hujjat modali
  const [documentOrder, setDocumentOrder] = useState<MonthlyOrder | null>(null);

  // Barcha buyurtmalarni yuklash (paramutrlarsiz — to'liq yuklanadi, filtr frontendda ishlaydi)
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrders();
      if (res && res.data) {
        setOrders(res.data.map(o => ({ ...o, attachments: o.attachments ?? [] })));
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      setError(err?.message || "Buyurtma va reja ma'lumotlarini yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Oylar va yillar bo'yicha buyurtmalar soni (filtrlarni ko'rsatish uchun)
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const o of orders) {
      const y = Number(o.year) || (o.createdAt ? new Date(o.createdAt).getFullYear() : null);
      if (y) set.add(y);
    }
    const arr = Array.from(set).sort((a, b) => b - a);
    return arr.length > 0 ? arr : [2026, 2025];
  }, [orders]);

  const monthCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const o of orders) {
      const y = Number(o.year) || (o.createdAt ? new Date(o.createdAt).getFullYear() : null);
      if (selectedYear !== 'all' && y !== Number(selectedYear)) continue;
      const m = Number(o.month) || (o.createdAt ? new Date(o.createdAt).getMonth() + 1 : null);
      if (m && m >= 1 && m <= 12) {
        counts[m] = (counts[m] || 0) + 1;
      }
    }
    return counts;
  }, [orders, selectedYear]);

  // Mahsulotlar ro'yxati filtri uchun
  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.productType) set.add(o.productType);
    }
    return Array.from(set);
  }, [orders]);

  // Yil, oy, transport, mahsulot va qidiruv bo'yicha to'g'ri va xavfsiz filtrlash
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Yil filtri
      const orderYear = Number(order.year) || (order.createdAt ? new Date(order.createdAt).getFullYear() : null);
      if (selectedYear !== 'all' && orderYear !== Number(selectedYear)) return false;

      // 2. Oy filtri
      const orderMonth = Number(order.month) || (order.createdAt ? new Date(order.createdAt).getMonth() + 1 : null);
      if (selectedMonth !== 'all' && orderMonth !== Number(selectedMonth)) return false;

      // 3. Transport turi (Railway, Road, Pipe — case-insensitive)
      if (selectedLogistics !== 'all') {
        const orderLt = (order.logisticsType || '').toLowerCase();
        const selLt = selectedLogistics.toLowerCase();
        if (selLt === 'railway' && !orderLt.includes('rail')) return false;
        if (selLt === 'road' && !orderLt.includes('road') && !orderLt.includes('auto')) return false;
        if (selLt === 'pipe' && !orderLt.includes('pipe')) return false;
      }

      // 4. Mahsulot filtri
      if (selectedProduct !== 'all') {
        if (order.productType !== selectedProduct && !order.productType?.toLowerCase().includes(selectedProduct.toLowerCase())) {
          return false;
        }
      }

      // 5. Holat filtri
      if (selectedStatus !== 'all') {
        const f = computeOrderFulfillment(order);
        const isDone = order.status === 'Completed' || (f.orderedWagons > 0 && f.remainingWagons === 0);
        if (selectedStatus === 'Active' && (order.status !== 'Active' || isDone)) return false;
        if (selectedStatus === 'Completed' && !isDone) return false;
        if (selectedStatus === 'Pending' && (order.status === 'Active' || order.status === 'Completed')) return false;
      }

      // 6. Qidiruv
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (order.orderNumber || '').toLowerCase();
        const contract = (order.contractNumber || '').toLowerCase();
        const prod = (order.productType || '').toLowerCase();
        const stations = (order.lines || []).map(l => (l.destinationStation || '').toLowerCase()).join(' ');
        const contractors = (order.lines || []).map(l => (l.contractor || '').toLowerCase()).join(' ');
        const wagons = (order.lines || []).map(l => (l.wagonNumbers || '').toLowerCase()).join(' ');
        if (!num.includes(q) && !contract.includes(q) && !prod.includes(q) && !stations.includes(q) && !contractors.includes(q) && !wagons.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, selectedYear, selectedMonth, selectedLogistics, selectedProduct, selectedStatus, searchQuery]);

  // Umumiy KPI hisoblash
  const kpi = useMemo(() => {
    let totalPlanWagons = 0;
    let totalPlanTons = 0;
    let totalFulfilledWagons = 0;
    let totalFulfilledTons = 0;
    let completedCount = 0;
    let activeCount = 0;

    for (const order of filteredOrders) {
      const f = computeOrderFulfillment(order);
      totalPlanWagons += f.orderedWagons;
      totalPlanTons += f.orderedTons;
      totalFulfilledWagons += f.fulfilledWagons;
      totalFulfilledTons += f.fulfilledTons;

      const isDone = order.status === 'Completed' || (f.orderedWagons > 0 && f.remainingWagons === 0);
      if (isDone) {
        completedCount++;
      } else if (order.status === 'Active') {
        activeCount++;
      }
    }

    const totalRemainingWagons = Math.max(0, totalPlanWagons - totalFulfilledWagons);
    const totalRemainingTons = Math.max(0, Math.round((totalPlanTons - totalFulfilledTons) * 1000) / 1000);
    const wagonPct = totalPlanWagons > 0 ? Math.min(100, Math.round((totalFulfilledWagons / totalPlanWagons) * 100)) : 0;
    const tonPct = totalPlanTons > 0 ? Math.min(100, Math.round((totalFulfilledTons / totalPlanTons) * 100)) : 0;

    return {
      totalPlanWagons,
      totalPlanTons: Math.round(totalPlanTons * 100) / 100,
      totalFulfilledWagons,
      totalFulfilledTons: Math.round(totalFulfilledTons * 100) / 100,
      totalRemainingWagons,
      totalRemainingTons,
      wagonPct,
      tonPct,
      totalOrders: filteredOrders.length,
      completedCount,
      activeCount,
    };
  }, [filteredOrders]);

  const toggleExpand = (id: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportExcel = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      '№', 'Buyurtma raqami', 'Mahsulot turi', 'Reja (Vagon)', 'Reja (Tonna)',
      'Bajarildi (Vagon)', 'Bajarildi (Tonna)', 'Qoldiq (Vagon)', 'Qoldiq (Tonna)',
      'Bajarilish (%)', 'Yetkazib berish stansiyasi', 'Shartnoma', 'Holat', 'Yaratilgan sana'
    ];

    const dataRows = filteredOrders.map((order, idx) => {
      const f = computeOrderFulfillment(order);
      const stations = Array.from(new Set((order.lines || []).map(l => l.destinationStation).filter(Boolean))).join(', ');
      const pct = f.orderedWagons > 0 ? Math.round((f.fulfilledWagons / f.orderedWagons) * 100) : 0;

      return [
        idx + 1,
        order.orderNumber,
        getProductLabel(order.productType, logisticsFromRoute(order.logisticsType)),
        f.orderedWagons,
        f.orderedTons,
        f.fulfilledWagons,
        f.fulfilledTons,
        f.remainingWagons,
        f.remainingTons,
        `${pct}%`,
        stations || '—',
        order.contractNumber || '—',
        order.status,
        formatDateDisplay(order.createdAt?.slice(0, 10) || ''),
      ];
    });

    const monthLabel = selectedMonth === 'all' ? 'Barcha_oylar' : `${selectedMonth}_oy`;
    exportSheet(
      `Reja_monitoringi_${selectedYear}_${monthLabel}_${todayStamp()}`,
      `Reja_${selectedYear}_${monthLabel}`.slice(0, 31),
      [headers, ...dataRows]
    );
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <ReportsHistoryTabs active="plans" />

      {/* 1. Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-500/20">
              <Target className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Reja va ijro monitoringi
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Buyurtmalar kesimida vagonlar va yuklash rejasining real vaqt rejimidagi ijrosi hamda qoldiqlari
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Yil tanlash */}
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Barcha yillar</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}-yil</option>
            ))}
          </select>

          {/* Oy tanlash */}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Barcha oylar ({orders.length})</option>
            {MONTH_NAMES.map((name, idx) => {
              const m = idx + 1;
              const count = monthCounts[m] || 0;
              return (
                <option key={m} value={m}>
                  {name} {count > 0 ? `(${count})` : ''}
                </option>
              );
            })}
          </select>

          {/* Transport turi */}
          <select
            value={selectedLogistics}
            onChange={e => setSelectedLogistics(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Barcha transport</option>
            <option value="railway">Temir yo‘l (Vagon)</option>
            <option value="road">Avtotransport</option>
            <option value="pipe">Quvur</option>
          </select>

          {/* Yangilash */}
          <button
            type="button"
            onClick={loadData}
            title="Yangilash"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Excel eksport */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredOrders.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Top Summary KPI Cards (Oylik umumiy ko‘rsatkichlar) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Vagonlar kartasi */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Vagonlar rejasi
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <Train className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {kpi.totalFulfilledWagons.toLocaleString('uz-UZ')}{' '}
              <span className="text-sm font-normal text-slate-500">
                / {kpi.totalPlanWagons.toLocaleString('uz-UZ')} ta
              </span>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
              kpi.wagonPct >= 90
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                : kpi.wagonPct >= 60
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
            }`}>
              {kpi.wagonPct}%
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                kpi.wagonPct >= 100
                  ? 'bg-emerald-500'
                  : kpi.wagonPct >= 60
                  ? 'bg-blue-600'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(kpi.wagonPct, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Qoldiq: <span className="font-semibold text-rose-600 dark:text-rose-400">{kpi.totalRemainingWagons.toLocaleString('uz-UZ')} ta vagon</span>
          </p>
        </div>

        {/* Og'irlik (Tonna) kartasi */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Og‘irlik rejasi (Tonna)
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {kpi.totalFulfilledTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}{' '}
              <span className="text-sm font-normal text-slate-500">
                / {kpi.totalPlanTons.toLocaleString('uz-UZ', { maximumFractionDigits: 0 })} tn
              </span>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
              kpi.tonPct >= 90
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                : kpi.tonPct >= 60
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
            }`}>
              {kpi.tonPct}%
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                kpi.tonPct >= 100
                  ? 'bg-emerald-500'
                  : kpi.tonPct >= 60
                  ? 'bg-blue-600'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(kpi.tonPct, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Qoldiq: <span className="font-semibold text-rose-600 dark:text-rose-400">{kpi.totalRemainingTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} tonna</span>
          </p>
        </div>

        {/* Buyurtmalar kartasi */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Buyurtmalar ijrosi
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {kpi.completedCount}{' '}
              <span className="text-sm font-normal text-slate-500">
                / {kpi.totalOrders} yopildi
              </span>
            </div>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              {kpi.totalOrders > 0 ? Math.round((kpi.completedCount / kpi.totalOrders) * 100) : 0}%
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Ijroda: <strong className="text-blue-600 font-semibold">{kpi.activeCount} ta</strong></span>
            <span>Boshqa: <strong className="text-slate-600 font-semibold">{kpi.totalOrders - kpi.completedCount - kpi.activeCount} ta</strong></span>
          </div>
        </div>

        {/* Oylik samaradorlik */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reja holati
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {kpi.wagonPct >= 90 ? (
                <span className="text-emerald-600 dark:text-emerald-400">✓ Reja to‘liq bajarilmoqda</span>
              ) : kpi.wagonPct >= 50 ? (
                <span className="text-blue-600 dark:text-blue-400">⏳ Reja maromida ketmoqda</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">⚡ Yuklash jadallashtirilishi zarur</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Yuk xati (GU-27) rasmiylashtirilishi bilan qoldiqlar real vaqtda kamayib boradi
            </p>
          </div>
        </div>
      </div>

      {/* 3. Filtrlash paneli: Tezkor Holat chiplari + Mahsulot + Qidiruv */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Tezkor holat tugmalari */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className={`rounded-lg px-2.5 py-1 transition ${
                selectedStatus === 'all'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Barchasi ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('Active')}
              className={`rounded-lg px-2.5 py-1 transition ${
                selectedStatus === 'Active'
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Ijroda ({orders.filter(o => o.status === 'Active').length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('Completed')}
              className={`rounded-lg px-2.5 py-1 transition ${
                selectedStatus === 'Completed'
                  ? 'bg-white text-emerald-600 shadow-xs dark:bg-slate-700 dark:text-emerald-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Yakunlangan
            </button>
          </div>

          {/* Mahsulot filtri */}
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">Barcha mahsulotlar</option>
            {availableProducts.map(p => (
              <option key={p} value={p}>{getProductLabel(p, LOGISTICS_TYPES.Railway)}</option>
            ))}
          </select>

          {/* Qidiruv */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Qidirish (buyurtma, shartnoma, stansiya, vagon)..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Ko‘rsatilmoqda: <span className="font-bold text-slate-900 dark:text-white">{filteredOrders.length} ta buyurtma</span>
        </div>
      </div>

      {/* 4. Asosiy Jadval (Buyurtmalar kesimidagi reja va ijro) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/90 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                <th className="py-3 px-3 w-10 text-center">№</th>
                <th className="py-3 px-3 min-w-[140px]">Buyurtma</th>
                <th className="py-3 px-4 min-w-[180px]">Mahsulot</th>
                <th className="py-3 px-3 text-center">Reja vagon</th>
                <th className="py-3 px-3 text-center">Og‘irligi (t)</th>
                <th className="py-3 px-4 min-w-[160px]">Yetkazib berish stansiyasi</th>
                <th className="py-3 px-4 min-w-[200px]">Bajarilish / Qoldiq</th>
                <th className="py-3 px-3">Shartnoma</th>
                <th className="py-3 px-3">Yaratilgan vaqt</th>
                <th className="py-3 px-3">Tasdiqlangan vaqt</th>
                <th className="py-3 px-3 text-center">Holat</th>
                <th className="py-3 px-3 text-center">Hujjat</th>
                <th className="py-3 px-3 text-center">Batafsil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm dark:divide-slate-800/80">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
                        <span>Reja ma'lumotlari yuklanmoqda...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Target className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          Tanlangan davr yoki filtrlar bo‘yicha buyurtmalar topilmadi
                        </span>
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedYear('all');
                              setSelectedMonth('all');
                              setSelectedStatus('all');
                              setSelectedProduct('all');
                              setSelectedLogistics('all');
                              setSearchQuery('');
                            }}
                            className="text-xs text-indigo-600 hover:underline font-semibold"
                          >
                            Filtrlarni tozalash (Barchasini ko‘rish)
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, index) => {
                  const productLabel = getProductLabel(order.productType, logisticsFromRoute(order.logisticsType));
                  const fulfillment = computeOrderFulfillment(order);
                  const stations = Array.from(new Set((order.lines || []).map(l => l.destinationStation).filter(Boolean))) as string[];
                  const isCompleted = order.status === 'Completed' || (fulfillment.orderedWagons > 0 && fulfillment.remainingWagons === 0);
                  const isExpanded = expandedOrderIds.has(order.id);
                  const approvedAt = order.dispatchApprovedAt || order.approvedAt || null;

                  return (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer ${
                          isExpanded ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                        }`}
                        onClick={() => toggleExpand(order.id)}
                      >
                        {/* 1. № */}
                        <td className="py-3 px-3 text-center text-xs font-mono text-slate-500">
                          {index + 1}
                        </td>

                        {/* 2. Buyurtma raqami va ochish tugmasi */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(order.id);
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
                              title="Tarkibni ochish/yopish"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-indigo-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-400">
                              {order.orderNumber}
                            </span>
                          </div>
                        </td>

                        {/* 3. Mahsulot */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <ProductTypeIcon productType={order.productType} size="sm" />
                            <span className="font-semibold text-xs text-slate-900 dark:text-slate-100" title={productLabel}>
                              {productLabel}
                            </span>
                          </div>
                        </td>

                        {/* 4. Reja vagon */}
                        <td className="py-3 px-3 text-center font-bold tabular-nums text-sm text-slate-900 dark:text-white">
                          {fulfillment.orderedWagons}
                        </td>

                        {/* 5. Og'irligi (t) */}
                        <td className="py-3 px-3 text-center font-semibold tabular-nums text-xs text-slate-700 dark:text-slate-300">
                          {fulfillment.orderedTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}
                        </td>

                        {/* 6. Yetkazib berish stansiyasi */}
                        <td className="py-3 px-4 whitespace-nowrap text-xs">
                          {stations.length > 0 ? (
                            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                              <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="font-semibold" title={stations.join(', ')}>
                                {stations[0]}
                                {stations.length > 1 && (
                                  <span className="ml-1 text-[10px] font-normal text-slate-400">
                                    (+{stations.length - 1})
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 7. Bajarilish / Qoldiq */}
                        <td className="py-3 px-4 whitespace-nowrap text-xs">
                          {isCompleted ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>100% yopilgan</span>
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                (0 qoldi)
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                                  {fulfillment.remainingWagons} ta qoldi
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  ({fulfillment.fulfilledWagons}/{fulfillment.orderedWagons} yuklandi)
                                </span>
                              </div>
                              <div className="w-28 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, Math.round((fulfillment.fulfilledWagons / (fulfillment.orderedWagons || 1)) * 100))}%`
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 8. Shartnoma */}
                        <td className="py-3 px-3 whitespace-nowrap text-xs font-mono text-slate-600 dark:text-slate-300">
                          {order.contractNumber || '—'}
                        </td>

                        {/* 9. Yaratilgan vaqt */}
                        <td className="py-3 px-3 whitespace-nowrap tabular-nums text-xs text-slate-500">
                          {formatDateTimeDisplay(order.createdAt)}
                        </td>

                        {/* 10. Tasdiqlangan vaqt */}
                        <td className="py-3 px-3 whitespace-nowrap tabular-nums text-xs text-slate-500">
                          {formatDateTimeDisplay(approvedAt)}
                        </td>

                        {/* 11. Holat */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <OrderStatusBadge status={order.status} />
                        </td>

                        {/* 12. Hujjat */}
                        <td
                          className="py-3 px-3 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DocumentChipButton
                            onClick={() => setDocumentOrder(order)}
                            title={`${order.orderNumber} buyurtma hujjatini ko‘rish`}
                          />
                        </td>

                        {/* 13. Batafsil */}
                        <td
                          className="py-3 px-3 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => navigate(`/orders/railway?open=${order.id}`)}
                            title="Buyurtmalar bo‘limida ochish"
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                          >
                            <span>Ochish</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>

                      {/* Kengaytirilgan vagonlar va liniyalar paneli (Accordion) */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-900/60">
                          <td colSpan={13} className="p-4 pl-12 border-b border-indigo-100 dark:border-indigo-950">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                              <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-indigo-600" />
                                  <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                    Buyurtma pozitsiyalari va biriktirilgan vagonlar
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    ({order.lines?.length || 0} ta yo‘nalish)
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500">
                                  Jami reja: <strong className="text-slate-800 dark:text-slate-200">{fulfillment.orderedWagons} vagon</strong> ({fulfillment.orderedTons} t)
                                </div>
                              </div>

                              <div className="space-y-3">
                                {(order.lines || []).map((line, lIdx) => {
                                  const lineRemW = line.wagonCount > 0
                                    ? Math.max(0, line.wagonCount - (line.fulfilledWagonCount ?? 0))
                                    : 0;
                                  const lineRemT = line.tonCount > 0
                                    ? Math.max(0, Math.round((line.tonCount - (line.fulfilledNetWeight ?? 0)) * 100) / 100)
                                    : 0;
                                  const wagonNums = (line.wagonNumbers || '')
                                    .split(/[\s,;]+/)
                                    .map(s => s.trim())
                                    .filter(Boolean);

                                  return (
                                    <div
                                      key={line.id || lIdx}
                                      className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs dark:border-slate-800/80 dark:bg-slate-900/40"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                          <span className="font-bold text-slate-900 dark:text-white">
                                            {line.contractor || 'Kontragent ko‘rsatilmagan'}
                                          </span>
                                          <span className="text-slate-400">→</span>
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            📍 {line.destinationStation || 'Stansiya ko‘rsatilmagan'}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                          <span>
                                            Reja: <strong>{line.wagonCount} vagon</strong> ({line.tonCount} t)
                                          </span>
                                          <span>
                                            Bajarildi: <strong className="text-emerald-600">{line.fulfilledWagonCount ?? 0} vagon</strong> ({line.fulfilledNetWeight ?? 0} t)
                                          </span>
                                          <span>
                                            Qoldiq: <strong className="text-rose-600">{lineRemW} vagon</strong> ({lineRemT} t)
                                          </span>
                                        </div>
                                      </div>

                                      {/* Biriktirilgan vagonlar ro'yxati */}
                                      <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 mb-1.5 text-slate-500 text-[11px]">
                                          <Hash className="h-3 w-3" />
                                          <span>Biriktirilgan vagonlar ({wagonNums.length} ta):</span>
                                        </div>

                                        {wagonNums.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5">
                                            {wagonNums.map((wn, wIdx) => (
                                              <span
                                                key={wIdx}
                                                className="inline-flex items-center rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-800 border border-slate-200 shadow-2xs dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                                              >
                                                {wn}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 italic text-[11px]">
                                            Vagon raqamlari hali biriktirilmagan
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Buyurtma hujjati ko‘rish modali (Preview Modal) */}
      {documentOrder && (
        <div
          className="yx-preview-backdrop"
          onClick={() => setDocumentOrder(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="yx-preview-modal-bar"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-white">
                {documentOrder.orderNumber}
              </span>
              <span className="text-xs text-slate-400">
                ({getProductLabel(documentOrder.productType, logisticsFromRoute(documentOrder.logisticsType))})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DocumentPrintButton
                onPrint={() => downloadOrderPdf(documentOrder.id)}
                ready={isProductOrderPrintReady(documentOrder)}
              />
              <button
                type="button"
                className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600"
                onClick={() => setDocumentOrder(null)}
                aria-label="Yopish"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div
            className="yx-preview-scroll"
            onClick={event => {
              if ((event.target as HTMLElement).closest('.product-order-document')) return;
              setDocumentOrder(null);
            }}
          >
            <ProductOrderDocument
              order={documentOrder}
              logisticsType={logisticsFromRoute(documentOrder.logisticsType)}
              preview
            />
          </div>
        </div>
      )}
    </div>
  );
}

class PlansErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Plans page error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 shadow-sm max-w-2xl mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Reja bo'limini yuklashda xatolik</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-mono text-left bg-slate-50 dark:bg-slate-800 p-4 rounded-xl overflow-auto max-h-40">
            {this.state.error?.message || "Noma'lum xatolik"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm transition"
          >
            Sahifani qayta yuklash
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MonthlyPlansPageWrapper() {
  return (
    <PlansErrorBoundary>
      <MonthlyPlansPage />
    </PlansErrorBoundary>
  );
}
