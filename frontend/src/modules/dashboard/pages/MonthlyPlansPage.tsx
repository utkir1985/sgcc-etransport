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
  LayoutList,
  PieChart,
  TrendingUp,
  Sparkles,
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
import { formatDateDisplay } from '../../../shared/utils/dates';
import { computeOrderFulfillment } from '../../../shared/components/OrderFulfillmentStatus';

const MONTH_NAMES = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

type ViewMode = 'table' | 'routes' | 'products';

interface AggregatedRouteItem {
  key: string;
  contractor: string;
  station: string;
  productType: string;
  totalOrderedWagons: number;
  totalOrderedTons: number;
  totalFulfilledWagons: number;
  totalFulfilledTons: number;
  remainingWagons: number;
  remainingTons: number;
  excessWagons: number;
  excessTons: number;
  ordersCount: number;
  orderNumbers: string[];
  wagonNumbers: string[];
}

interface ProductSummaryItem {
  productType: string;
  orderedWagons: number;
  orderedTons: number;
  fulfilledWagons: number;
  fulfilledTons: number;
  remainingWagons: number;
  remainingTons: number;
  ordersCount: number;
}

function MonthlyPlansPage() {
  const navigate = useNavigate();

  // Yondashuv rejimi: 'table' (Batafsil jadval), 'routes' (Yo'nalishlar & Hududlar), 'products' (Mahsulotlar tahlili)
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Filter holatlari
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedLogistics, setSelectedLogistics] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ma'lumotlar
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  // Kengaytirilgan qatorlar (Accordion)
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Hujjat modali
  const [documentOrder, setDocumentOrder] = useState<MonthlyOrder | null>(null);

  // Barcha buyurtmalarni yuklash
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

  // Oylar va yillar bo'yicha filtrlash
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

  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.productType) set.add(o.productType);
    }
    return Array.from(set);
  }, [orders]);

  // Buyurtmalarni filtrlash
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Yil
      const orderYear = Number(order.year) || (order.createdAt ? new Date(order.createdAt).getFullYear() : null);
      if (selectedYear !== 'all' && orderYear !== Number(selectedYear)) return false;

      // 2. Oy
      const orderMonth = Number(order.month) || (order.createdAt ? new Date(order.createdAt).getMonth() + 1 : null);
      if (selectedMonth !== 'all' && orderMonth !== Number(selectedMonth)) return false;

      // 3. Transport turi
      if (selectedLogistics !== 'all') {
        const orderLt = (order.logisticsType || '').toLowerCase();
        const selLt = selectedLogistics.toLowerCase();
        if (selLt === 'railway' && !orderLt.includes('rail')) return false;
        if (selLt === 'road' && !orderLt.includes('road') && !orderLt.includes('auto')) return false;
        if (selLt === 'pipe' && !orderLt.includes('pipe')) return false;
      }

      // 4. Mahsulot
      if (selectedProduct !== 'all') {
        if (order.productType !== selectedProduct && !order.productType?.toLowerCase().includes(selectedProduct.toLowerCase())) {
          return false;
        }
      }

      // 5. Holat
      if (selectedStatus !== 'all') {
        const f = computeOrderFulfillment(order);
        const isDone = order.status === 'Completed' || (f.orderedWagons > 0 && f.remainingWagons === 0);
        const isOver = f.fulfilledWagons > f.orderedWagons && f.orderedWagons > 0;
        if (selectedStatus === 'Active' && (order.status !== 'Active' || isDone)) return false;
        if (selectedStatus === 'Completed' && !isDone) return false;
        if (selectedStatus === 'Over' && !isOver) return false;
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
    let totalExcessWagons = 0;
    let totalExcessTons = 0;
    let completedCount = 0;
    let activeCount = 0;
    let overLimitCount = 0;

    for (const order of filteredOrders) {
      const f = computeOrderFulfillment(order);
      totalPlanWagons += f.orderedWagons;
      totalPlanTons += f.orderedTons;
      totalFulfilledWagons += f.fulfilledWagons;
      totalFulfilledTons += f.fulfilledTons;

      if (f.fulfilledWagons > f.orderedWagons && f.orderedWagons > 0) {
        totalExcessWagons += (f.fulfilledWagons - f.orderedWagons);
        overLimitCount++;
      }
      if (f.fulfilledTons > f.orderedTons && f.orderedTons > 0) {
        totalExcessTons += Math.max(0, f.fulfilledTons - f.orderedTons);
      }

      const isDone = order.status === 'Completed' || (f.orderedWagons > 0 && f.remainingWagons === 0);
      if (isDone) {
        completedCount++;
      } else if (order.status === 'Active') {
        activeCount++;
      }
    }

    const totalRemainingWagons = Math.max(0, totalPlanWagons - totalFulfilledWagons);
    const totalRemainingTons = Math.max(0, Math.round((totalPlanTons - totalFulfilledTons) * 1000) / 1000);
    const wagonPct = totalPlanWagons > 0 ? Math.round((totalFulfilledWagons / totalPlanWagons) * 100) : 0;
    const tonPct = totalPlanTons > 0 ? Math.round((totalFulfilledTons / totalPlanTons) * 100) : 0;
    const avgTonsPerWagon = totalFulfilledWagons > 0 ? (totalFulfilledTons / totalFulfilledWagons) : 0;

    return {
      totalPlanWagons,
      totalPlanTons: Math.round(totalPlanTons * 100) / 100,
      totalFulfilledWagons,
      totalFulfilledTons: Math.round(totalFulfilledTons * 100) / 100,
      totalRemainingWagons,
      totalRemainingTons,
      totalExcessWagons,
      totalExcessTons: Math.round(totalExcessTons * 100) / 100,
      wagonPct,
      tonPct,
      avgTonsPerWagon: Math.round(avgTonsPerWagon * 10) / 10,
      totalOrders: filteredOrders.length,
      completedCount,
      activeCount,
      overLimitCount,
    };
  }, [filteredOrders]);

  // Yo'nalishlar & Hududlar kesimidagi agregatsiya (Routes Matrix)
  const aggregatedRoutes = useMemo<AggregatedRouteItem[]>(() => {
    const map = new Map<string, AggregatedRouteItem>();

    for (const order of filteredOrders) {
      for (const line of order.lines ?? []) {
        const key = `${line.contractor || 'Boshqa'}__${line.destinationStation || 'Nomaʼlum'}__${order.productType || ''}`;
        const existing = map.get(key);

        const ordW = line.wagonCount || 0;
        const ordT = line.tonCount || 0;
        const fulW = line.fulfilledWagonCount ?? 0;
        const fulT = Number(line.fulfilledNetWeight ?? 0);

        const rawWagonList = (line.wagonNumbers || '')
          .split(/[\s,;]+/)
          .map(s => s.trim())
          .filter(Boolean);

        if (!existing) {
          map.set(key, {
            key,
            contractor: line.contractor || 'Kontragent ko‘rsatilmagan',
            station: line.destinationStation || 'Stansiya ko‘rsatilmagan',
            productType: order.productType || '',
            totalOrderedWagons: ordW,
            totalOrderedTons: ordT,
            totalFulfilledWagons: fulW,
            totalFulfilledTons: fulT,
            remainingWagons: Math.max(0, ordW - fulW),
            remainingTons: Math.max(0, Math.round((ordT - fulT) * 100) / 100),
            excessWagons: Math.max(0, fulW - ordW),
            excessTons: Math.max(0, Math.round((fulT - ordT) * 100) / 100),
            ordersCount: 1,
            orderNumbers: [order.orderNumber],
            wagonNumbers: rawWagonList,
          });
        } else {
          existing.totalOrderedWagons += ordW;
          existing.totalOrderedTons += ordT;
          existing.totalFulfilledWagons += fulW;
          existing.totalFulfilledTons += fulT;
          existing.remainingWagons = Math.max(0, existing.totalOrderedWagons - existing.totalFulfilledWagons);
          existing.remainingTons = Math.max(0, Math.round((existing.totalOrderedTons - existing.totalFulfilledTons) * 100) / 100);
          existing.excessWagons = Math.max(0, existing.totalFulfilledWagons - existing.totalOrderedWagons);
          existing.excessTons = Math.max(0, Math.round((existing.totalFulfilledTons - existing.totalOrderedTons) * 100) / 100);
          if (!existing.orderNumbers.includes(order.orderNumber)) {
            existing.orderNumbers.push(order.orderNumber);
            existing.ordersCount++;
          }
          for (const wn of rawWagonList) {
            if (!existing.wagonNumbers.includes(wn)) {
              existing.wagonNumbers.push(wn);
            }
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalOrderedWagons - a.totalOrderedWagons);
  }, [filteredOrders]);

  // Mahsulotlar kesimidagi agregatsiya (Product Summary)
  const productSummaries = useMemo<ProductSummaryItem[]>(() => {
    const map = new Map<string, ProductSummaryItem>();

    for (const order of filteredOrders) {
      const pt = order.productType || 'Boshqa';
      const f = computeOrderFulfillment(order);
      const existing = map.get(pt);

      if (!existing) {
        map.set(pt, {
          productType: pt,
          orderedWagons: f.orderedWagons,
          orderedTons: f.orderedTons,
          fulfilledWagons: f.fulfilledWagons,
          fulfilledTons: f.fulfilledTons,
          remainingWagons: f.remainingWagons,
          remainingTons: f.remainingTons,
          ordersCount: 1,
        });
      } else {
        existing.orderedWagons += f.orderedWagons;
        existing.orderedTons += f.orderedTons;
        existing.fulfilledWagons += f.fulfilledWagons;
        existing.fulfilledTons += f.fulfilledTons;
        existing.remainingWagons = Math.max(0, existing.orderedWagons - existing.fulfilledWagons);
        existing.remainingTons = Math.max(0, Math.round((existing.orderedTons - existing.fulfilledTons) * 100) / 100);
        existing.ordersCount++;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.orderedTons - a.orderedTons);
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
      'Rejadan ortiq (Vagon)', 'Rejadan ortiq (Tonna)', 'Vagon ijrosi (%)', 'Tonna ijrosi (%)',
      'Yetkazib berish stansiyasi', 'Shartnoma', 'Holat', 'Yaratilgan sana'
    ];

    const dataRows = filteredOrders.map((order, idx) => {
      const f = computeOrderFulfillment(order);
      const stations = Array.from(new Set((order.lines || []).map(l => l.destinationStation).filter(Boolean))).join(', ');
      const wagonPct = f.orderedWagons > 0 ? Math.round((f.fulfilledWagons / f.orderedWagons) * 100) : 0;
      const tonPct = f.orderedTons > 0 ? Math.round((f.fulfilledTons / f.orderedTons) * 100) : 0;
      const excessW = Math.max(0, f.fulfilledWagons - f.orderedWagons);
      const excessT = Math.max(0, Math.round((f.fulfilledTons - f.orderedTons) * 100) / 100);

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
        excessW,
        excessT,
        `${wagonPct}%`,
        `${tonPct}%`,
        stations || '—',
        order.contractNumber || '—',
        order.status,
        formatDateDisplay(order.createdAt?.slice(0, 10) || ''),
      ];
    });

    const monthLabel = selectedMonth === 'all' ? 'Barcha_oylar' : `${selectedMonth}_oy`;
    exportSheet(
      `Reja_va_ijro_qoldiqlari_${selectedYear}_${monthLabel}_${todayStamp()}`,
      `Reja_${selectedYear}_${monthLabel}`.slice(0, 31),
      [headers, ...dataRows]
    );
  };

  return (
    <div className="thub min-h-screen pb-12 w-full max-w-full overflow-x-hidden">
      <ReportsHistoryTabs active="plans" />

      {/* 1. Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Reja va ijro monitoringi
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  <Sparkles className="w-3 h-3 text-sky-600" />
                  Dual-Metrika (Vagon + Tonna)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Vagonlar va umumiy tonnaj balansi, hududlar kesimidagi qoldiqlar va limit ijrosining to‘liq nazorati
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Yil tanlash */}
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
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
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
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
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Barcha transport</option>
            <option value={LOGISTICS_TYPES.Railway}>Temir yo‘l</option>
            <option value={LOGISTICS_TYPES.Road}>Avtotransport</option>
            <option value="Pipeline">Quvur tarmog‘i</option>
          </select>

          {/* Excel eksport */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredOrders.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 shadow-xs transition hover:bg-emerald-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-pointer"
            title="Vagon va Tonna qoldiqlari bilan Excel jadvaliga yuklash"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Excel hisoboti</span>
          </button>

          {/* Yangilash */}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-xs transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
            title="Ma’lumotlarni yangilash"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Yangi Yondashuv: Asosiy KPI Kartalari (Dual-Metrika Vagon + Tonna) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Vagonlar kartasi */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/95">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Vagonlar balansi
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-100 dark:border-sky-900/40">
              <Train className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {kpi.totalFulfilledWagons.toLocaleString('uz-UZ')}{' '}
              <span className="text-xs font-semibold text-slate-400">
                / {kpi.totalPlanWagons.toLocaleString('uz-UZ')} ta
              </span>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold font-mono ${
              kpi.wagonPct >= 100
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                : kpi.wagonPct >= 75
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}>
              {kpi.wagonPct}%
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                kpi.wagonPct >= 100
                  ? 'bg-purple-600'
                  : kpi.wagonPct >= 75
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(kpi.wagonPct, 100)}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-500">Qoldiq reja:</span>
            <strong className="text-rose-600 dark:text-rose-400 font-mono font-bold">
              {kpi.totalRemainingWagons.toLocaleString('uz-UZ')} ta vagon
            </strong>
          </div>
          {kpi.totalExcessWagons > 0 && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-300 font-medium">
              <span>Rejadan ortiq:</span>
              <strong className="font-mono font-bold">+{kpi.totalExcessWagons} ta vagon</strong>
            </div>
          )}
        </div>

        {/* Og'irlik (Tonna) kartasi */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/95">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tonnaj ijrosi & Qoldiq
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
              <Scale className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {kpi.totalFulfilledTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })}{' '}
              <span className="text-xs font-semibold text-slate-400">
                / {kpi.totalPlanTons.toLocaleString('uz-UZ', { maximumFractionDigits: 0 })} tn
              </span>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold font-mono ${
              kpi.tonPct >= 100
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                : kpi.tonPct >= 75
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
            }`}>
              {kpi.tonPct}%
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                kpi.tonPct >= 100
                  ? 'bg-purple-600'
                  : kpi.tonPct >= 75
                  ? 'bg-emerald-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(kpi.tonPct, 100)}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-500">Qoldiq tonnaj:</span>
            <strong className="text-rose-600 dark:text-rose-400 font-mono font-bold">
              {kpi.totalRemainingTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} tn
            </strong>
          </div>
          {kpi.totalExcessTons > 0 && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-300 font-medium">
              <span>Rejadan ortiq:</span>
              <strong className="font-mono font-bold">+{kpi.totalExcessTons.toLocaleString('uz-UZ')} tn</strong>
            </div>
          )}
        </div>

        {/* O'rtacha yuklama & Dinamika */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/95">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              O‘rtacha yuklama (Pace)
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {kpi.avgTonsPerWagon > 0 ? kpi.avgTonsPerWagon : '—'}{' '}
              <span className="text-xs font-semibold text-slate-500">tn / vagon</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Haqiqiy tarozi aniqligi va vagon to‘ldirilishi
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Qoldiqni yopish:</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              ~{kpi.avgTonsPerWagon > 0 ? Math.ceil(kpi.totalRemainingTons / kpi.avgTonsPerWagon) : kpi.totalRemainingWagons} vagon
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Limitdan oshgan yo‘nalishlar:</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400 font-mono">
              {kpi.overLimitCount} ta buyurtma
            </span>
          </div>
        </div>

        {/* Buyurtmalar & Limit holati */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/95">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Buyurtmalar ijrosi
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {kpi.completedCount}{' '}
              <span className="text-xs font-semibold text-slate-400">
                / {kpi.totalOrders} yopildi
              </span>
            </div>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {kpi.totalOrders > 0 ? Math.round((kpi.completedCount / kpi.totalOrders) * 100) : 0}%
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80 text-slate-500">
            <span>Ijroda: <strong className="text-blue-600 dark:text-blue-400 font-mono">{kpi.activeCount} ta</strong></span>
            <span>Qoldiq: <strong className="text-rose-600 dark:text-rose-400 font-mono">{kpi.totalOrders - kpi.completedCount} ta</strong></span>
          </div>

          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {kpi.wagonPct >= 90
              ? '✓ Reja ko‘rsatkichlari to‘liq maromida bajarilmoqda'
              : '⚡ Qoldiq vagonlar bo‘yicha yuklash faol davom etmoqda'}
          </p>
        </div>
      </div>

      {/* 3. Yondashuv tanlash paneli (View Mode Toggle) + Filtrlar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs mb-5">
        {/* Yondashuv rejimlari (Tabs) */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewMode === 'table'
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>Batafsil jadval (Dual-Metrika)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('routes')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewMode === 'routes'
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Yo‘nalishlar & Hududlar kesimida ({aggregatedRoutes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('products')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewMode === 'products'
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>Mahsulotlar balansi ({productSummaries.length})</span>
          </button>
        </div>

        {/* Tezkor holat chiplari & Qidiruv */}
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
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
            <button
              type="button"
              onClick={() => setSelectedStatus('Over')}
              className={`rounded-lg px-2.5 py-1 transition ${
                selectedStatus === 'Over'
                  ? 'bg-white text-purple-600 shadow-xs dark:bg-slate-700 dark:text-purple-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Limitdan oshgan (+)
            </button>
          </div>

          {/* Mahsulot filtri */}
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Barcha mahsulotlar</option>
            {availableProducts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Qidiruv */}
          <div className="relative min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Qidiruv (stansiya, raqam, kontragent)..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 shadow-xs transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
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
      </div>

      {/* 4. ASOSIY MAZMUN (Tanlangan ko'rinishga mos) */}

      {/* YONDASHUV 1: BATAFSIL JADVAL (DUAL METRIKA) */}
      {viewMode === 'table' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 font-semibold select-none">
                  <th className="py-3 px-3 text-center" style={{ width: '40px' }}>№</th>
                  <th className="py-3 px-3">Buyurtma raqami</th>
                  <th className="py-3 px-4">Mahsulot</th>
                  <th className="py-3 px-3 text-center">Reja (Vagon · Tonna)</th>
                  <th className="py-3 px-3 text-center">Bajarildi (Vagon · Tonna)</th>
                  <th className="py-3 px-4 min-w-[210px]">Qoldiq (Vagon & Tonna)</th>
                  <th className="py-3 px-4 min-w-[190px]">Bajarilish sur‘ati (%)</th>
                  <th className="py-3 px-4">Yetkazib berish stansiyasi</th>
                  <th className="py-3 px-3">Shartnoma</th>
                  <th className="py-3 px-3">Yaratilgan sana</th>
                  <th className="py-3 px-3 text-center">Holat</th>
                  <th className="py-3 px-3 text-center">Hujjat</th>
                  <th className="py-3 px-3 text-center">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400">
                      {loading ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-5 w-5 animate-spin text-sky-600" />
                          <span>Reja ma'lumotlari yuklanmoqda...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Target className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Tanlangan davr yoki filtrlar bo‘yicha buyurtmalar topilmadi
                          </span>
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
                            className="text-xs text-sky-600 hover:underline font-semibold mt-1"
                          >
                            Filtrlarni tozalash (Barchasini ko‘rish)
                          </button>
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
                    const isOver = fulfillment.fulfilledWagons > fulfillment.orderedWagons && fulfillment.orderedWagons > 0;
                    const isExpanded = expandedOrderIds.has(order.id);

                    const wagonPct = fulfillment.orderedWagons > 0
                      ? Math.round((fulfillment.fulfilledWagons / fulfillment.orderedWagons) * 100)
                      : 0;
                    const tonPct = fulfillment.orderedTons > 0
                      ? Math.round((fulfillment.fulfilledTons / fulfillment.orderedTons) * 100)
                      : 0;

                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          className={`transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer ${
                            isExpanded ? 'bg-sky-50/30 dark:bg-sky-950/20' : ''
                          }`}
                          onClick={() => toggleExpand(order.id)}
                        >
                          {/* 1. № */}
                          <td className="py-3 px-3 text-center text-xs font-mono text-slate-400">
                            {index + 1}
                          </td>

                          {/* 2. Buyurtma raqami */}
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
                                  <ChevronDown className="h-4 w-4 text-sky-600" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <span className="font-mono font-bold text-xs text-sky-700 dark:text-sky-400">
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

                          {/* 4. Reja (Vagon · Tonna) */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {fulfillment.orderedWagons} ta
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {fulfillment.orderedTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} tn
                            </div>
                          </td>

                          {/* 5. Bajarildi (Vagon · Tonna) */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              {fulfillment.fulfilledWagons} ta
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {fulfillment.fulfilledTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} tn
                            </div>
                          </td>

                          {/* 6. Qoldiq (Vagon & Tonna) - Yangi Yondashuv */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {isOver ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                  <Sparkles className="w-3 h-3" />
                                  <span>+{fulfillment.fulfilledWagons - fulfillment.orderedWagons} vagon ortiq</span>
                                </span>
                                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-medium pl-0.5">
                                  +{Math.max(0, Math.round((fulfillment.fulfilledTons - fulfillment.orderedTons) * 10) / 10)} tn rejadagidan ortiq
                                </span>
                              </div>
                            ) : isCompleted ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>To‘liq bajarilgan</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono pl-0.5">
                                  0 vagon · 0 tn qoldi
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 font-mono">
                                  <span className="font-bold text-rose-600 dark:text-rose-400">
                                    {fulfillment.remainingWagons} ta vagon
                                  </span>
                                  <span className="text-slate-300 dark:text-slate-600">•</span>
                                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                                    {fulfillment.remainingTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} tn
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  qolgan reja hajmi
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 7. Bajarilish sur'ati (Dual Progress Bar) */}
                          <td className="py-3 px-4 min-w-[190px]">
                            <div className="space-y-1.5">
                              {/* Vagon bari */}
                              <div>
                                <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 mb-0.5">
                                  <span>Vagon ijrosi:</span>
                                  <strong className={`font-mono ${wagonPct >= 100 ? 'text-purple-600' : wagonPct >= 75 ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {wagonPct}%
                                  </strong>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      wagonPct >= 100 ? 'bg-purple-600' : wagonPct >= 75 ? 'bg-emerald-500' : 'bg-sky-500'
                                    }`}
                                    style={{ width: `${Math.min(wagonPct, 100)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Tonna bari */}
                              <div>
                                <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 mb-0.5">
                                  <span>Tonnaj ijrosi:</span>
                                  <strong className={`font-mono ${tonPct >= 100 ? 'text-purple-600' : tonPct >= 75 ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {tonPct}%
                                  </strong>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      tonPct >= 100 ? 'bg-purple-600' : tonPct >= 75 ? 'bg-emerald-500' : 'bg-blue-600'
                                    }`}
                                    style={{ width: `${Math.min(tonPct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 8. Yetkazib berish stansiyasi */}
                          <td className="py-3 px-4 whitespace-nowrap text-xs">
                            {stations.length > 0 ? (
                              <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                                <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
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

                          {/* 9. Shartnoma */}
                          <td className="py-3 px-3 whitespace-nowrap text-xs font-mono text-slate-600 dark:text-slate-300">
                            {order.contractNumber || '—'}
                          </td>

                          {/* 10. Yaratilgan sana */}
                          <td className="py-3 px-3 whitespace-nowrap tabular-nums text-xs text-slate-500">
                            {formatDateDisplay(order.createdAt?.slice(0, 10) || '')}
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

                          {/* 13. Amallar */}
                          <td
                            className="py-3 px-3 text-center whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => navigate(`/orders/railway?open=${order.id}`)}
                              title="Buyurtmalar bo‘limida ochish"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40 cursor-pointer"
                            >
                              <span>Ochish</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>

                        {/* Accordion: buyurtma pozitsiyalari va biriktirilgan vagonlar */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 dark:bg-slate-900/60">
                            <td colSpan={13} className="p-4 pl-12 border-b border-sky-100 dark:border-sky-950">
                              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-950">
                                <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-sky-600" />
                                    <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                      Buyurtma pozitsiyalari (Yo‘nalishlar va vagonlar kesimida)
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      ({order.lines?.length || 0} ta yo‘nalish)
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Jami: <strong className="text-slate-800 dark:text-slate-200">{fulfillment.orderedWagons} vagon</strong> ({fulfillment.orderedTons} t)
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
                                    const lineExcessW = Math.max(0, (line.fulfilledWagonCount ?? 0) - line.wagonCount);
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
                                            <span className="font-semibold text-sky-600 dark:text-sky-400">
                                              📍 {line.destinationStation || 'Stansiya ko‘rsatilmagan'}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-3">
                                            <span>
                                              Reja: <strong>{line.wagonCount} vagon</strong> ({line.tonCount} t)
                                            </span>
                                            <span>
                                              Bajarildi: <strong className="text-emerald-600 font-mono">{line.fulfilledWagonCount ?? 0} vagon</strong> ({line.fulfilledNetWeight ?? 0} t)
                                            </span>
                                            {lineExcessW > 0 ? (
                                              <span className="text-purple-600 font-bold">
                                                Rejadan ortiq: +{lineExcessW} vagon
                                              </span>
                                            ) : (
                                              <span>
                                                Qoldiq: <strong className="text-rose-600 font-mono">{lineRemW} vagon</strong> ({lineRemT} t)
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Vagonlar ro'yxati */}
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
                                              Vagon raqamlari hali kiritilmagan
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
      )}

      {/* YONDASHUV 2: YO‘NALISHLAR VA HUDUDLAR KESIMIDA (ROUTE MATRIX) */}
      {viewMode === 'routes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>Jami {aggregatedRoutes.length} ta jo‘natish yo‘nalishi va stansiyalari tahlili</span>
            <span>Vagon va Tonnaj qoldiqlari real vaqt rejimida hisoblangan</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {aggregatedRoutes.map(item => {
              const wagonPct = item.totalOrderedWagons > 0
                ? Math.round((item.totalFulfilledWagons / item.totalOrderedWagons) * 100)
                : 0;
              const tonPct = item.totalOrderedTons > 0
                ? Math.round((item.totalFulfilledTons / item.totalOrderedTons) * 100)
                : 0;
              const isOver = item.excessWagons > 0;

              return (
                <div
                  key={item.key}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 font-bold mb-0.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.station}</span>
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate" title={item.contractor}>
                          {item.contractor}
                        </h3>
                      </div>

                      {isOver ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 shrink-0">
                          <Sparkles className="w-3 h-3" />
                          Limitdan oshgan
                        </span>
                      ) : item.remainingWagons === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          To‘liq yopilgan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 shrink-0">
                          Ijroda
                        </span>
                      )}
                    </div>

                    {/* Mahsulot belgisi */}
                    {item.productType && (
                      <div className="mb-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                        <ProductTypeIcon productType={item.productType} size="sm" />
                        <span>{item.productType}</span>
                      </div>
                    )}

                    {/* Progress barlar */}
                    <div className="space-y-3 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 mb-4">
                      {/* Vagon */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500 font-medium">Vagon rejasi:</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {item.totalFulfilledWagons} / {item.totalOrderedWagons} ta ({wagonPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isOver ? 'bg-purple-600' : wagonPct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                            style={{ width: `${Math.min(wagonPct, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] mt-1">
                          <span className="text-slate-400">Qoldiq:</span>
                          {isOver ? (
                            <span className="text-purple-600 font-bold font-mono">+{item.excessWagons} ta vagon ortiq</span>
                          ) : (
                            <span className="text-rose-600 font-bold font-mono">{item.remainingWagons} ta vagon qoldi</span>
                          )}
                        </div>
                      </div>

                      {/* Tonna */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500 font-medium">Tonna rejasi:</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {item.totalFulfilledTons.toFixed(1)} / {item.totalOrderedTons.toFixed(1)} tn ({tonPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isOver ? 'bg-purple-600' : tonPct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                            style={{ width: `${Math.min(tonPct, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] mt-1">
                          <span className="text-slate-400">Qoldiq tonnaj:</span>
                          {item.excessTons > 0 ? (
                            <span className="text-purple-600 font-bold font-mono">+{item.excessTons.toFixed(1)} tn ortiq</span>
                          ) : (
                            <span className="text-rose-600 font-bold font-mono">{item.remainingTons.toFixed(1)} tn qoldi</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Buyurtmalar: <strong className="text-slate-700 dark:text-slate-300">{item.ordersCount} ta</strong></span>
                    <span>Biriktirilgan vagonlar: <strong className="text-slate-700 dark:text-slate-300">{item.wagonNumbers.length} ta</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* YONDASHUV 3: MAHSULOTLAR BALANSI (PRODUCT SUMMARY) */}
      {viewMode === 'products' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 px-1">
            Sho‘rtan GKM mahsulotlari (Suyultirilgan gaz, Polietilen, Kondensat) bo‘yicha umumiy reja, yuklangan hajm va qoldiqlar balansi
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {productSummaries.map(prod => {
              const wagonPct = prod.orderedWagons > 0
                ? Math.round((prod.fulfilledWagons / prod.orderedWagons) * 100)
                : 0;
              const tonPct = prod.orderedTons > 0
                ? Math.round((prod.fulfilledTons / prod.orderedTons) * 100)
                : 0;

              return (
                <div
                  key={prod.productType}
                  className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <ProductTypeIcon productType={prod.productType} size="md" />
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">
                          {prod.productType}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {prod.ordersCount} ta buyurtma asosida
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Vagon ko'rsatkichi */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-600 dark:text-slate-300">Vagonlar ijrosi:</span>
                        <span className="font-mono text-slate-900 dark:text-white font-bold">
                          {prod.fulfilledWagons} / {prod.orderedWagons} ta ({wagonPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-sky-500 rounded-full transition-all"
                          style={{ width: `${Math.min(wagonPct, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Qoldiq vagonlar:</span>
                        <strong className="text-rose-600 dark:text-rose-400 font-mono">
                          {prod.remainingWagons} ta
                        </strong>
                      </div>
                    </div>

                    {/* Tonna ko'rsatkichi */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-600 dark:text-slate-300">Tonnaj ijrosi:</span>
                        <span className="font-mono text-slate-900 dark:text-white font-bold">
                          {prod.fulfilledTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} / {prod.orderedTons.toLocaleString('uz-UZ', { maximumFractionDigits: 0 })} tn ({tonPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${Math.min(tonPct, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Qoldiq tonnaj:</span>
                        <strong className="text-rose-600 dark:text-rose-400 font-mono">
                          {prod.remainingTons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} tn
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600 cursor-pointer"
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Reja bo‘limini yuklashda xatolik</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-mono text-left bg-slate-50 dark:bg-slate-800 p-4 rounded-xl overflow-auto max-h-40">
            {this.state.error?.message || "Noma'lum xatolik"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl text-sm transition"
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
