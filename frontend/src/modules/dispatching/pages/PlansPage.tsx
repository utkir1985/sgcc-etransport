import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, Package, Pencil, Trash2, X } from 'lucide-react';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { MarketingOrdersHome } from '../../../shared/components/MarketingOrdersHome';
import { PlanList } from '../../../shared/components/PlanListRow';
import { OrderPeriodPicker } from '../../../shared/components/OrderPeriodPicker';
import { DatePicker } from '../../../shared/components/DatePicker';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import { api } from '../../../shared/services/api';
import { LOGISTICS_LABELS, LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';
import { entriesFromProductNames, getProductLabel } from '../../../shared/constants/productTypes';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import type { DailyPlan, OrderPlanBalance, PlanWagonAvailability } from '../../../shared/types';
import { isOneCPlan } from '../../../shared/utils/oneCSources';
import {
  formatPeriodRangeLabel,
  matchesDateRange,
  matchesPeriodRange,
} from '../../../shared/utils/dates';

const RAILWAY = LOGISTICS_TYPES.Railway;

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Focus/typing clears leading 0; native spinner clicks keep 0. */
function PlanLineQtyInput({
  remaining,
  value,
  onChange,
}: {
  remaining: number;
  value: number;
  onChange: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const skipClearRef = useRef(false);
  const max = Math.max(0, remaining);

  return (
    <input
      type="number"
      min={0}
      max={max}
      disabled={max === 0}
      value={draft !== null ? draft : value}
      onMouseDown={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        // Native number spinners sit on the right edge
        skipClearRef.current = e.clientX >= rect.right - 28;
      }}
      onFocus={() => {
        if (!skipClearRef.current && value === 0) setDraft('');
        skipClearRef.current = false;
      }}
      onBlur={() => setDraft(null)}
      onChange={e => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      className="!py-1.5 !pr-7 text-center tabular-nums"
    />
  );
}

export default function PlansPage() {
  const { can, role } = useRbacPermission();
  const [filterProductType, setFilterProductType] = useState('');
  const [viewPlanId, setViewPlanId] = useState<string | null>(null);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const canCreate = can('orders.create') || role === 'Dispatching' || role === 'Admin';
  const canApproveMsMx = can('orders.approve-dispatch') || role === 'Marketing' || role === 'Management' || role === 'Dispatching' || role === 'Admin';
  const canApproveRailway = can('empty-wagons.read') || role === 'Railway' || role === 'Admin';
  const canApproveWarehouse = can('flow.loading') || role === 'Warehouse' || role === 'Admin';
  const canApproveSecurity = can('flow.seal-security') || role === 'Security' || role === 'Admin';
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);

  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [balances, setBalances] = useState<OrderPlanBalance[]>([]);
  const [wagonAvailability, setWagonAvailability] = useState<PlanWagonAvailability[]>([]);
  const [productNames, setProductNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DailyPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [orderId, setOrderId] = useState('');
  const [planDate, setPlanDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    Promise.allSettled([
      api.getPlans(),
      api.getAllocatableOrders(RAILWAY),
      api.getProducts(RAILWAY),
      api.getPlanWagonAvailability(),
    ])
      .then(([plansRes, balanceRes, productsRes, availRes]) => {
        if (balanceRes.status === 'fulfilled' && balanceRes.value.data) {
          setBalances(balanceRes.value.data.filter(b => !String(b.orderNumber || '').includes('-1C-')));
        }
        if (productsRes.status === 'fulfilled' && productsRes.value.data) {
          setProductNames((productsRes.value.data ?? []).map(p => p.name));
        }
        if (availRes.status === 'fulfilled' && availRes.value.data) {
          setWagonAvailability(availRes.value.data);
        }
        if (plansRes.status === 'fulfilled' && plansRes.value.data) {
          setPlans(
            plansRes.value.data
              .filter(p => !isOneCPlan(p))
              .map(p => ({
                ...p,
                lines: p.lines ?? [],
                productType: p.productType ?? null,
              })),
          );
        }
      })
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeOrdersChanged(() => load({ silent: true }));
    return unsub;
  }, [load]);

  const periodBalances = useMemo(() => {
    return balances.filter(b => matchesPeriodRange(b.year, b.month, periodFrom, periodTo));
  }, [balances, periodFrom, periodTo]);

  const productEntries = useMemo(
    () =>
      entriesFromProductNames(
        productNames.length > 0
          ? productNames
          : [
              ...new Set(
                periodBalances
                  .map(b => b.productType)
                  .concat(plans.map(p => p.productType || '').filter(Boolean)),
              ),
            ],
      ),
    [productNames, periodBalances, plans],
  );

  const matchingPlans = useMemo(() => {
    return plans
      .filter(p => {
        if (!p.productType) return false;
        if (isOneCPlan(p)) return false;
        if (filterProductType && p.productType !== filterProductType) return false;
        return matchesDateRange(p.planDate.slice(0, 10), periodFrom, periodTo);
      })
      .sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime());
  }, [plans, filterProductType, periodFrom, periodTo]);

  const viewPlan = useMemo(
    () =>
      viewPlanId
        ? matchingPlans.find(p => p.id === viewPlanId) ?? plans.find(p => p.id === viewPlanId) ?? null
        : null,
    [viewPlanId, matchingPlans, plans],
  );

  useEffect(() => {
    if (viewPlanId && !matchingPlans.some(p => p.id === viewPlanId)) {
      setViewPlanId(null);
    }
  }, [matchingPlans, viewPlanId]);

  const createBalances = useMemo(() => {
    if (!filterProductType) return periodBalances;
    return periodBalances.filter(b => b.productType === filterProductType);
  }, [periodBalances, filterProductType]);

  const dialogBalances = useMemo(() => {
    if (editingPlanId) {
      const editing = plans.find(p => p.id === editingPlanId);
      if (editing?.productType) {
        return periodBalances.filter(b => b.productType === editing.productType);
      }
    }
    return createBalances;
  }, [editingPlanId, plans, periodBalances, createBalances]);

  const selectedOrder = useMemo(
    () =>
      dialogBalances.find(b => b.orderId === orderId) ??
      periodBalances.find(b => b.orderId === orderId) ??
      balances.find(b => b.orderId === orderId) ??
      null,
    [dialogBalances, periodBalances, balances, orderId],
  );

  const activeProduct = selectedOrder?.productType || filterProductType || '';

  const productAvailability = useMemo((): PlanWagonAvailability => {
    const base =
      wagonAvailability.find(a => a.productType.toLowerCase() === (activeProduct || '').toLowerCase()) ??
      ({
        productType: activeProduct,
        tareReadyWagons: 0,
        reservedUnfilled: 0,
        availableToAllocate: 0,
      } satisfies PlanWagonAvailability);

    if (!editingPlanId) return base;
    const editing = plans.find(p => p.id === editingPlanId);
    if (!editing) return base;
    return {
      ...base,
      reservedUnfilled: Math.max(0, base.reservedUnfilled - editing.plannedWagons),
      availableToAllocate: base.availableToAllocate + editing.plannedWagons,
    };
  }, [wagonAvailability, activeProduct, editingPlanId, plans]);

  const wagonBudget = productAvailability?.availableToAllocate ?? 0;
  const reservedUnfilled = productAvailability?.reservedUnfilled ?? 0;

  const plannedTotal = useMemo(
    () => Object.values(allocations).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0),
    [allocations],
  );

  const selectedRegions = useMemo(
    () => Object.entries(allocations).filter(([, n]) => n > 0).length,
    [allocations],
  );

  const renderPeriodPicker = () => (
    <OrderPeriodPicker
      variant="embedded"
      from={periodFrom}
      to={periodTo}
      onFromChange={setPeriodFrom}
      onToChange={setPeriodTo}
    />
  );

  const openCreate = () => {
    setError('');
    setListError('');
    if (createBalances.length === 0) {
      setListError(
        filterProductType
          ? 'Tanlangan mahsulot va davr uchun faol buyurtma yo‘q.'
          : 'Tanlangan davr uchun faol buyurtma yo‘q.',
      );
      return;
    }
    setEditingPlanId(null);
    setPlanDate(todayIso());
    setNotes('');
    const first = createBalances[0];
    setOrderId(first?.orderId ?? '');
    const next: Record<string, number> = {};
    first?.lines.forEach(l => {
      next[l.lineId] = 0;
    });
    setAllocations(next);
    setDialogOpen(true);
  };

  const openEdit = (plan: DailyPlan) => {
    setError('');
    setListError('');
    setEditingPlanId(plan.id);
    setPlanDate(new Date(plan.planDate).toISOString().slice(0, 10));
    setNotes(plan.notes ?? '');
    setOrderId(plan.monthlyOrderId ?? '');
    const next: Record<string, number> = {};
    (plan.lines ?? []).forEach(l => {
      next[l.monthlyOrderLineId] = l.plannedWagons;
    });
    setAllocations(next);
    setDialogOpen(true);
  };

  const onSelectOrder = (id: string) => {
    setOrderId(id);
    const order = dialogBalances.find(b => b.orderId === id) ?? periodBalances.find(b => b.orderId === id);
    const next: Record<string, number> = {};
    order?.lines.forEach(l => {
      next[l.lineId] = 0;
    });
    setAllocations(next);
  };

  const overWagonBudget = plannedTotal > wagonBudget;
  const overBy = Math.max(0, plannedTotal - wagonBudget);

  const setLineQty = (lineId: string, remaining: number, raw: string) => {
    const requested = Number.parseInt(raw || '0', 10) || 0;
    // Faqat buyurtma qoldig‘iga qisqartiramiz — tara limniti kiritishni yopmaydi, ogohlantiradi.
    const n = Math.max(0, Math.min(remaining, requested));
    setAllocations(prev => ({ ...prev, [lineId]: n }));
    if (error) setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) {
      setError('Buyurtmani tanlang.');
      return;
    }
    const lines = Object.entries(allocations)
      .filter(([, n]) => n > 0)
      .map(([monthlyOrderLineId, plannedWagons]) => ({ monthlyOrderLineId, plannedWagons }));

    if (lines.length === 0) {
      setError('Kamida bitta hududga vagon kiriting.');
      return;
    }

    const total = lines.reduce((s, l) => s + l.plannedWagons, 0);
    if (total > wagonBudget) {
      setError(
        `Estakadagi vagon yetarli emas: hozir faqat ${wagonBudget} ta ajratish mumkin, siz ${total} ta yozdingiz.`,
      );
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        monthlyOrderId: orderId,
        planDate: new Date(`${planDate}T00:00:00Z`).toISOString(),
        notes,
        lines,
      };
      if (editingPlanId) {
        await api.updatePlan(editingPlanId, payload);
      } else {
        await api.createPlan(payload);
      }
      setDialogOpen(false);
      setEditingPlanId(null);
      notifyOrdersChanged();
      load({ silent: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reja yaratilmadi.');
    } finally {
      setSubmitting(false);
    }
  };

  const approvePlan = async (planId: string, status: string) => {
    setApprovingId(planId);
    try {
      if (status === 'PendingMsMx' || status === 'Draft') {
        await api.approvePlanMsMx(planId);
      } else if (status === 'PendingRailway') {
        await api.approvePlanRailway(planId);
      } else if (status === 'PendingWarehouse') {
        await api.approvePlanWarehouse(planId);
      } else if (status === 'PendingSecurity') {
        await api.approvePlanSecurity(planId);
      }
      setApproveConfirmId(null);
      notifyOrdersChanged();
      load({ silent: true });
    } catch {
      /* ignore — user sees list refresh */
    } finally {
      setApprovingId(null);
    }
  };

  const planApproveLabel = (status: string) => {
    if (status === 'PendingMsMx' || status === 'Draft') return 'MS/MX tasdiq';
    if (status === 'PendingRailway') return 'Temir yo‘l tasdiq';
    if (status === 'PendingWarehouse') return 'TM/XA tasdiq';
    if (status === 'PendingSecurity') return 'Qo‘riqlash tasdiq';
    return 'Tasdiqlash';
  };

  const planApproveAction = (t: { id: string; status: string; planNumber?: string }) => {
    const busy = approvingId === t.id;
    if ((t.status === 'PendingMsMx' || t.status === 'Draft') && canApproveMsMx) {
      return (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={busy}
          onClick={() => setApproveConfirmId(t.id)}
        >
          <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {busy ? '...' : 'MS/MX tasdiq'}
        </button>
      );
    }
    if (t.status === 'PendingRailway' && canApproveRailway) {
      return (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={busy}
          onClick={() => setApproveConfirmId(t.id)}
        >
          <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {busy ? '...' : 'Temir yo‘l tasdiq'}
        </button>
      );
    }
    if (t.status === 'PendingWarehouse' && canApproveWarehouse) {
      return (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={busy}
          onClick={() => setApproveConfirmId(t.id)}
        >
          <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {busy ? '...' : 'TM/XA tasdiq'}
        </button>
      );
    }
    if (t.status === 'PendingSecurity' && canApproveSecurity) {
      return (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={busy}
          onClick={() => setApproveConfirmId(t.id)}
        >
          <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {busy ? '...' : 'Qo‘riqlash tasdiq'}
        </button>
      );
    }
    return null;
  };

  const askDeletePlan = (plan: DailyPlan) => {
    setDeleteError('');
    setDeleteTarget(plan);
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError('');
  };

  const confirmDeletePlan = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deletePlan(deletedId);
      setDeleteTarget(null);
      if (viewPlanId === deletedId) setViewPlanId(null);
      notifyOrdersChanged();
      load({ silent: true });
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Taqsimot o‘chirilmadi.');
    } finally {
      setDeleting(false);
    }
  };

  const deleteConfirmDialog = (
    <ConfirmDialog
      open={deleteTarget !== null}
      title="Taqsimotni o‘chirish"
      message={
        deleteTarget
          ? `${deleteTarget.planNumber} taqsimotini o‘chirishni tasdiqlaysizmi? Bu amalni qaytarib bo‘lmaydi.`
          : ''
      }
      confirmLabel="O‘chirish"
      cancelLabel="Bekor qilish"
      variant="danger"
      loading={deleting}
      error={deleteError}
      onConfirm={() => {
        void confirmDeletePlan();
      }}
      onCancel={closeDeleteDialog}
    />
  );

  const approveConfirmPlan = approveConfirmId
    ? matchingPlans.find(p => p.id === approveConfirmId) ?? plans.find(p => p.id === approveConfirmId) ?? null
    : null;

  const approveConfirmDialog = (
    <ConfirmDialog
      open={approveConfirmPlan !== null}
      title="Kunlik rejani tasdiqlash"
      message={
        approveConfirmPlan
          ? `${approveConfirmPlan.planNumber} taqsimotini ${planApproveLabel(approveConfirmPlan.status).toLowerCase()} sifatida tasdiqlaysizmi?`
          : ''
      }
      confirmLabel="Ha, tasdiqlayman"
      cancelLabel="Bekor qilish"
      loading={Boolean(approveConfirmPlan && approvingId === approveConfirmPlan.id)}
      onConfirm={() => {
        if (approveConfirmPlan) void approvePlan(approveConfirmPlan.id, approveConfirmPlan.status);
      }}
      onCancel={() => {
        if (approvingId) return;
        setApproveConfirmId(null);
      }}
    />
  );

  const createDialog = dialogOpen ? (
    <div className="confirm-dialog-root" role="presentation">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Yopish"
        onClick={() => {
          setDialogOpen(false);
          setEditingPlanId(null);
        }}
      />
      <div
        className="confirm-dialog !max-w-3xl !max-h-[min(92vh,900px)] !overflow-y-auto !p-5 sm:!p-6"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="confirm-dialog__close"
          aria-label="Yopish"
          onClick={() => {
            setDialogOpen(false);
            setEditingPlanId(null);
          }}
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <div className="confirm-dialog__header">
          <div className="confirm-dialog__icon">
            <Calendar className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="confirm-dialog__title">
              {editingPlanId ? 'Yuklash taqsimotini tahrirlash' : 'Yuklash taqsimotini shakllantirish'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {activeProduct
                ? getProductLabel(activeProduct, RAILWAY)
                : filterProductType
                  ? getProductLabel(filterProductType, RAILWAY)
                  : 'Mahsulot tanlang'}
            </p>
          </div>
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleCreate}>
          <div
            className={`rounded-xl border px-3 py-2.5 text-sm ${
              overWagonBudget
                ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100'
                : wagonBudget > 0
                  ? 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-100'
                  : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100'
            }`}
          >
            <p className="font-medium">
              Estakadada: {productAvailability?.tareReadyWagons ?? 0} ta
              {reservedUnfilled > 0 ? (
                <span className="font-normal opacity-80">
                  {' '}
                  · boshqa rejalarda band: {reservedUnfilled}
                </span>
              ) : null}
              <span className="font-normal">
                {' '}
                · ajratish mumkin: {wagonBudget} ta
              </span>
            </p>
            {overWagonBudget ? (
              <p className="mt-0.5 text-[13px] font-medium">
                Rejaga kiritilgan vagonlar soni estakadagilardan oshib ketdi: siz{' '}
                {plannedTotal} ta yozdingiz, tayyor {wagonBudget} ta ({overBy} ta ortiqcha).
                «Ajratish» ustunidagi sonlarni kamaytiring.
              </p>
            ) : wagonBudget <= 0 ? (
              <p className="mt-0.5 text-[13px] opacity-80">
                Eslatma: Taqsimot faqat <strong>estakadaga qo‘yilgan</strong> bo‘sh vagonlar
                bo‘yicha shakllantiriladi. Avval Temir yo‘l → Qo‘riqlash → estakada bosqichlarini
                yakunlang.
                {reservedUnfilled > 0
                  ? ` Hozir ${reservedUnfilled} ta vagon boshqa tasdiqlangan rejalarga band.`
                  : ''}
              </p>
            ) : (
              <p className="mt-0.5 text-[13px] opacity-80">
                Eslatma: Taqsimot faqat estakadaga qo‘yilgan bo‘sh vagonlar bo‘yicha
                shakllantiriladi.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="admin-field">
              Faol buyurtma
              <select value={orderId} onChange={e => onSelectOrder(e.target.value)} required>
                <option value="">Tanlang...</option>
                {orderId && !dialogBalances.some(o => o.orderId === orderId) ? (
                  <option value={orderId}>Joriy buyurtma (arxiv)</option>
                ) : null}
                {dialogBalances.map(o => (
                  <option key={o.orderId} value={o.orderId}>
                    {o.orderNumber}
                    {o.productType ? ` · ${getProductLabel(o.productType, RAILWAY)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              Reja sanasi
              <DatePicker
                value={planDate}
                onChange={setPlanDate}
                required
              />
            </label>
          </div>

          {selectedOrder ? (
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2.5 dark:bg-slate-900/60">
                <p className="text-sm font-medium text-gray-800 dark:text-slate-200">
                  Hududlar bo‘yicha taqsimot
                </p>
                <span
                  className={`admin-role-badge ${
                    overWagonBudget ? 'admin-role-badge--amber' : 'admin-role-badge--blue'
                  }`}
                >
                  {selectedRegions} hudud · ajratilgan {plannedTotal} / mumkin {wagonBudget}
                  {overWagonBudget ? ` · ortiqcha ${overBy}` : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-800">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Hudud</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Stansiya</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Buyurtma</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Qoldiq</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400 w-28">
                        Ajratish
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.lines.map(line => (
                      <tr key={line.lineId} className="border-t border-gray-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-slate-100">
                          {line.contractor}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-slate-400">
                          {line.destinationStation || '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.orderedWagons}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                          {line.remainingWagons}
                        </td>
                        <td className="px-3 py-2">
                          <label className="admin-field !gap-0">
                            <PlanLineQtyInput
                              remaining={line.remainingWagons}
                              value={allocations[line.lineId] ?? 0}
                              onChange={raw => setLineQty(line.lineId, line.remainingWagons, raw)}
                            />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <label className="admin-field">
            Izoh (ixtiyoriy)
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Masalan: Kengsoyga yetkazish — 1-smena"
            />
          </label>

          {error ? <p className="confirm-dialog__error">{error}</p> : null}

          <div className="confirm-dialog__actions !mt-0">
            <button
              type="button"
              className="btn-secondary confirm-dialog__btn"
              onClick={() => {
                setDialogOpen(false);
                setEditingPlanId(null);
              }}
              disabled={submitting}
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="btn-primary confirm-dialog__btn"
              disabled={submitting || plannedTotal === 0 || overWagonBudget}
              title={
                overWagonBudget
                  ? `Ruxsatdan oshib ketdi (ortiqcha ${overBy}). «Ajratish» ustunidagi sonlarni kamaytiring.`
                  : plannedTotal === 0
                    ? 'Kamida bitta vagon kiriting'
                    : undefined
              }
            >
              {submitting ? 'Saqlanmoqda...' : editingPlanId ? 'Rejani saqlash' : 'Rejani yaratish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (loading) {
    return <div className="py-12 text-center text-gray-400 dark:text-slate-500">Yuklanmoqda...</div>;
  }

  if (viewPlan) {
    const approveBtn = planApproveAction(viewPlan);
    const lines = viewPlan.lines ?? [];

    return (
      <div className="space-y-5">
        <div className="ui-card overflow-hidden">
          <div className="marketing-order-page__bar">
            <div className="marketing-order-page__bar-main">
              <ProductDetailBackButton onClick={() => setViewPlanId(null)} />
              <div className="min-w-0">
                <h2 className="marketing-order-page__title">
                  {viewPlan.productType
                    ? getProductLabel(viewPlan.productType, RAILWAY)
                    : 'Yuklash taqsimoti'}
                </h2>
                <p className="marketing-order-page__subtitle">{viewPlan.planNumber}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {approveBtn}
              {canCreate ? (
                <button
                  type="button"
                  className="table-row-ctrl table-row-ctrl--secondary whitespace-nowrap"
                  onClick={() => openEdit(viewPlan)}
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                  Tahrirlash
                </button>
              ) : null}
              {canCreate ? (
                <button
                  type="button"
                  className="admin-icon-btn admin-icon-btn--danger"
                  title="O'chirish"
                  onClick={() => askDeletePlan(viewPlan)}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
            <h3 className="admin-dash-section-title !mb-0">Hudud / stansiya / vagon</h3>
            <span className="admin-role-badge admin-role-badge--blue">
              {viewPlan.plannedWagons} vagon · {lines.length} yo‘nalish
            </span>
          </div>

          <div className="order-sheet-card !m-0 !rounded-none !border-0 !shadow-none dark:!bg-transparent">
            <div className="order-sheet-body !p-0 !pb-0">
              <div className="order-sheet-table-box !mx-0 !mt-0 !rounded-none">
                <div className="order-sheet-scroll">
                  <table className="order-sheet-table">
                    <thead>
                      <tr>
                        <th>Hudud</th>
                        <th>Stansiya</th>
                        <th>Ajratilgan vagon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="admin-table__empty">
                            Yo‘nalishlar yo‘q
                          </td>
                        </tr>
                      ) : (
                        lines.map(line => (
                          <tr key={line.id}>
                            <td className="whitespace-nowrap font-medium">{line.contractor}</td>
                            <td className="whitespace-nowrap text-sm text-gray-600 dark:text-slate-300">
                              {line.destinationStation || '—'}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">{line.plannedWagons}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {createDialog}
        {deleteConfirmDialog}
        {approveConfirmDialog}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MarketingOrdersHome
        title={LOGISTICS_LABELS[RAILWAY]}
        productEntries={productEntries}
        filterProductType={filterProductType}
        onFilterProductChange={next => {
          setFilterProductType(next);
          setListError('');
        }}
        periodControl={renderPeriodPicker()}
        canCreate={canCreate}
        onCreate={openCreate}
        createLabel="Yangi taqsimot"
      >
        {listError ? (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{listError}</p>
        ) : null}

        {matchingPlans.length === 0 ? (
          <div className="order-sheet-card">
            <div className="order-sheet-table-box">
              <div className="order-sheet-scroll">
                <div className="order-sheet-empty-state py-16 px-6 text-center">
                  <Package className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-slate-600" strokeWidth={1.5} />
                  <p className="order-sheet-empty-state-primary">
                    {filterProductType
                      ? `${formatPeriodRangeLabel(periodFrom, periodTo)} · ${getProductLabel(filterProductType, RAILWAY)}`
                      : formatPeriodRangeLabel(periodFrom, periodTo)}
                  </p>
                  <p className="order-sheet-empty-state-secondary">
                    {filterProductType
                      ? 'Bu davr va mahsulot bo‘yicha yuklash taqsimoti yo‘q'
                      : 'Bu davrda yuklash taqsimoti yo‘q'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <PlanList
            plans={matchingPlans}
            activePlanId={viewPlanId}
            onSelect={plan => setViewPlanId(plan.id)}
          />
        )}
      </MarketingOrdersHome>

      {createDialog}
      {deleteConfirmDialog}
      {approveConfirmDialog}
    </div>
  );
}
