import { activeRegistryMap, buildWagonWorkCards, wagonWorkTab } from '../../../shared/utils/wagonWorkState';
import { hasMeasuredNet, wagonVisitKey } from '../../../shared/utils/wagonQueueState';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  CircleDashed,
  FileCheck,
  FileText,
  History,
  PencilLine,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  TrainFront,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DefectActView } from '../../../shared/components/DefectActView';
import { HubZoneTabs, type HubZoneItem } from '../../../shared/components/HubZoneTabs';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry, LoadingTask } from '../../../shared/types';
import { hasDefectAct, resolveDefectActType, type DefectActType } from '../../../shared/constants/defectActTypes';
import { buildDefectActModel } from '../../../shared/utils/defectActModel';
import { formatDateDisplay } from '../../../shared/utils/dates';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { notifyWagonsLoaded } from '../../../shared/services/telegramService';
import { isOneCArrival } from '../../../shared/utils/oneCSources';
import { ReadyWagonGroups } from '../components/ReadyWagonGroups';
import { LoadingWagonEditHistory } from '../components/LoadingWagonEditHistory';
import { WagonKindArt } from '../../../shared/components/WagonKindArt';
import { WAGON_KIND_LABEL, type WagonKind } from '../../../shared/utils/wagonKinds';
import { WAGON_INTAKE_LOAD_STATE, type WagonIntakeLoadState } from '../../../shared/constants/wagonIntakeLoadState';
import {
  TABLE_ROW_ACTIONS,
  TABLE_ROW_BTN_PRIMARY,
  TABLE_ROW_BTN_SECONDARY,
  TABLE_ROW_BTN_WARN,
  TABLE_ROW_CTRL,
  tableRowStatusClass,
} from '../../../shared/utils/tableRowCtrl';

const WAGON_KINDS: WagonKind[] = ['sisterna', 'closed', 'platform'];

/**
 * Vagon holatlari (biznes mantiq):
 *  ready   — Yuklashga tayyor (estakadada)
 *  loading — Yuklanmoqda
 *  done    — Yuklangan: yuklash tugagan; brutto/netto va plomba hali jarayonda.
 *  exit    — Chiqishga tayyor: yuklanib, brutto/netto olingan va plombasi tasdiqlangan,
 *            yoki nomuvofiqlik dalolatnomasi tuzilgan. Darhol chiqishi shart emas —
 *            hududda qolib keyingi yuk xati bilan chiqishi mumkin; yuklash qayta boshlanmaydi.
 *            Yuk xatiga kiritilgan vagon bu sahifadan chiqadi (yuk xati moduli nazoratida).
 * «Nomuvofiqlik» alohida holat emas — istalgan holatdagi vagonda ogohlantirish belgisi.
 */
type WorkTab = 'ready' | 'loading' | 'done' | 'exit';

interface WagonCard {
  arrival: LoadingTask;
  unit: EmptyWagonUnit;
}

interface PartyRow {
  arrival: LoadingTask;
  wagons: WagonCard[];
  counts: Record<WorkTab, number>;
}

/** Nomuvofiqlik belgisi: qaytarilgan yoki dalolatnoma tuzilgan vagon (holatdan qat’i nazar). */
function isFlagged(unit: EmptyWagonUnit): boolean {
  return unit.status === 'Returned' || Boolean(unit.defectActNumber != null && String(unit.defectActNumber).trim());
}

function nettoWeightOf(netto?: string | null, tare?: string | null, brutto?: string | null): string {
  if (netto != null && String(netto).trim() && String(netto).trim() !== '—' && String(netto).trim() !== '0.00') return String(netto).trim();
  const parse = (value?: string | null) => {
    const normalized = (value || '').replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const tareValue = parse(tare);
  const bruttoValue = parse(brutto);
  if (tareValue == null || bruttoValue == null) return '';
  return String(Math.max(0, Math.round((bruttoValue - tareValue) * 1000) / 1000));
}

function tabOf(card: WagonCard, registeredMap?: Map<string, string>): WorkTab {
  return wagonWorkTab(card.unit, Boolean(registeredMap?.has(wagonVisitKey(card.arrival.id, card.unit.wagonNumber))));
}

function wagonTypeLabel(unit: EmptyWagonUnit): string {
  if (unit.wagonType === 'platform') return 'Fiting platforma';
  if (unit.wagonType === 'covered') return 'Yopiq turdagi vagon';
  return 'Vagon-sisterna';
}

const TABS: Array<Omit<HubZoneItem<WorkTab>, 'count'>> = [
  { id: 'ready', label: 'Yuklashga tayyor', hint: 'Kerakli vagonlarni tanlab yuklashni boshlang', icon: TrainFront, tone: 'sky' },
  { id: 'loading', label: 'Yuklanmoqda', hint: 'Hozir yuklanayotgan vagonlar', icon: CircleDashed, tone: 'amber' },
  { id: 'done', label: 'Yuklangan', hint: 'Yuklash tugagan; brutto/netto va plomba jarayonidagi vagonlar', icon: CheckCircle2, tone: 'done' },
  { id: 'exit', label: 'Chiqishga tayyor', hint: 'Plombalangan yoki dalolatnomasi tuzilgan; yuk xatini kutayotgan vagonlar', icon: Send, tone: 'emerald' },
];

const PARTY_STATUS_SHORT: Record<WorkTab, string> = {
  ready: 'Yuklashga tayyor',
  loading: 'Yuklanmoqda',
  done: 'Yuklangan',
  exit: 'Chiqishga tayyor',
};

const PARTY_STATUS_TONE: Record<WorkTab, string> = {
  ready: tableRowStatusClass('sky'),
  loading: tableRowStatusClass('amber'),
  done: tableRowStatusClass('emerald'),
  exit: tableRowStatusClass('emerald'),
};

function pendingWagonLabel(unit: EmptyWagonUnit): string {
  if (unit.status === 'ToRailwayScale')
    return hasMeasuredNet(unit) ? 'Brutto/netto tasdig‘i kutilmoqda' : 'Brutto/netto ma’lumoti kutilmoqda';
  if (!hasMeasuredNet(unit)) return 'Tara/brutto ma’lumoti tekshirilishi kerak';
  if (!unit.sealNumber || !String(unit.sealNumber).trim()) return 'Plomba o‘rnatish kutilmoqda';
  if (!unit.sealConfirmedByScaleAt) return 'Tarozibon plomba tasdig‘i kutilmoqda';
  if (!unit.sealConfirmedBySecurityAt) return 'Qo‘riqlash plomba tasdig‘i kutilmoqda';
  return 'Yuk xatini kutmoqda';
}

function statusMeta(card: WagonCard, registeredMap?: Map<string, string>) {
  const { unit, arrival } = card;
  const regNumber = registeredMap?.get(`${arrival.id.toLowerCase()}:${(unit.wagonNumber || '').trim().toLowerCase()}`);
  if (regNumber) {
    return { text: `Yuk xatida (${regNumber}) · chiqishga tayyor`, tone: 'emerald' as const };
  }
  const tab = tabOf(card, registeredMap);
  const { status } = unit;

  // Nosozlik / Dalolatnoma tuzilgan vagon:
  const isDefect = Boolean(unit.defectActNumber != null && String(unit.defectActNumber).trim()) || status === 'Returned';
  if (isDefect) {
    const act = unit.defectActNumber != null && String(unit.defectActNumber).trim() ? `№ ${unit.defectActNumber}` : '';
    const reason = unit.loadingComment?.trim() || unit.defectActType?.trim() || '';
    const label = act
      ? `Nosozlik (${act}) · Chiqishga tayyor`
      : reason
        ? `Nosozlik (${reason}) · Chiqishga tayyor`
        : 'Nosozlik dalolatnomasi · Chiqishga tayyor';
    return { text: label, tone: 'rose' as const };
  }

  if (tab === 'exit') {
    return { text: 'Chiqishga tayyor · plombalangan', tone: 'emerald' as const };
  }
  if (tab === 'loading') return { text: 'Yuklanmoqda', tone: 'amber' as const };
  if (tab === 'ready') return { text: 'Yuklashga tayyor', tone: 'sky' as const };
  if (status === 'Loaded') return { text: 'Yuklangan · estakadada', tone: 'sky' as const };
  return { text: pendingWagonLabel(unit), tone: 'amber' as const };
}

/** Nomuvofiqlik ogohlantirishi — holat yonida, alohida bosqich sifatida emas. */
function FlagBadge({ unit }: { unit: EmptyWagonUnit }) {
  if (!isFlagged(unit)) return null;
  const reason = unit.loadingComment?.trim();
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
      title={reason || 'Nomuvofiqlik aniqlangan'}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.2} />
      Nomuvofiqlik
    </span>
  );
}

function cardKey(card: WagonCard) {
  return `${card.arrival.id}:${card.unit.wagonNumber}`;
}

function asEmptyWagonArrival(task: LoadingTask): EmptyWagonArrival {
  return {
    ...task,
    notifiedDepartments: [],
    preparedDepartments: [],
    notes: task.loadingComment || '',
  };
}

function canEditWagon(unit: EmptyWagonUnit): boolean {
  if (unit.sealNumber != null && String(unit.sealNumber).trim()) return false;
  return ['Estakada', 'Tared', 'AwaitingTare', 'Loading', 'Loaded', 'GrossWeighed', 'Returned'].includes(unit.status);
}

function isSelectableUnit(unit: EmptyWagonUnit): boolean {
  return ['Estakada', 'Tared', 'AwaitingTare', 'Loading', 'Loaded'].includes(unit.status);
}

function partyProductLabel(party: PartyRow): string {
  const products = [
    ...new Set(
      party.wagons
        .map(card => card.unit.productType?.trim() || card.arrival.productType?.trim() || '')
        .filter(Boolean),
    ),
  ];
  return products.join(', ') || party.arrival.productType?.trim() || '—';
}

function partyDateLabel(task: LoadingTask): string {
  const raw = (task.arrivalDate || task.createdAt || '').slice(0, 10);
  return formatDateDisplay(raw) || '—';
}

function wagonEventRawDate(card: WagonCard): string | null | undefined {
  const { unit, arrival } = card;
  let value: string | null | undefined;

  if (unit.status === 'Returned') value = unit.defectActUploadedAt || unit.loadingCompletedAt || unit.loadingStartedAt || unit.tareWeighedAt;
  else if (unit.status === 'Sealed') value = unit.sealedAt || unit.grossWeighedAt || unit.loadingCompletedAt;
  else if (unit.status === 'SealPending') value = unit.grossWeighedAt || unit.loadingCompletedAt;
  else if (unit.status === 'GrossWeighed') value = unit.grossWeighedAt || unit.loadingCompletedAt;
  else if (unit.status === 'Loaded') value = unit.loadingCompletedAt || unit.loadingStartedAt;
  else if (unit.status === 'Loading') value = unit.loadingStartedAt || unit.tareWeighedAt;
  else value = arrival.createdAt || arrival.arrivalDate;

  value ||= arrival.createdAt || arrival.arrivalDate;
  return value;
}

function wagonEventTimestamp(card: WagonCard): number {
  const raw = wagonEventRawDate(card);
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function wagonEventDateTime(card: WagonCard): string {
  const value = wagonEventRawDate(card);
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${d}.${m}.${y} ${h}:${min}`;
}

function PartyStatusPills({ counts }: { counts: Record<WorkTab, number> }) {
  const items = TABS.filter(tab => counts[tab.id] > 0);
  if (items.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {items.map((tab, idx) => (
        <span key={tab.id} className="inline-flex items-center gap-1.5">
          {idx > 0 ? <span className="text-sm font-normal text-slate-300 dark:text-slate-600" aria-hidden>·</span> : null}
          <span className={`${TABLE_ROW_CTRL} ${PARTY_STATUS_TONE[tab.id]}`}>
            <span className="table-row-ctrl__dot" aria-hidden />
            {PARTY_STATUS_SHORT[tab.id]} {counts[tab.id]}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function LoadingPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromQuery = searchParams.get('from') || (location.state as any)?.from;
  const arrivalIdFromQuery = searchParams.get('arrivalId');
  const tabFromQuery = searchParams.get('tab') as WorkTab | null;

  const [tasks, setTasks] = useState<LoadingTask[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueError, setQueueError] = useState('');
  const [activeTab, setActiveTab] = useState<WorkTab>(() => {
    if (tabFromQuery === 'ready' || tabFromQuery === 'loading' || tabFromQuery === 'done' || tabFromQuery === 'exit') {
      return tabFromQuery;
    }
    return 'ready';
  });

  useEffect(() => {
    if (tabFromQuery === 'ready' || tabFromQuery === 'loading' || tabFromQuery === 'done' || tabFromQuery === 'exit') {
      if (activeTab !== tabFromQuery) {
        setActiveTab(tabFromQuery);
        setSelectedIds(new Set());
      }
    }
  }, [tabFromQuery]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [partyViewId, setPartyViewId] = useState<string | null>(() => arrivalIdFromQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'date' | 'batch' | 'wagonNumber' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'date' | 'batch' | 'wagonNumber') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'date' ? 'desc' : 'asc');
    }
  };
  const [actionConfirmTarget, setActionConfirmTarget] = useState<{ action: 'start' | 'complete' | 'sendToScale'; cards: WagonCard[] } | null>(null);
  const [returnTarget, setReturnTarget] = useState<WagonCard | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Admin Rollback (Orqaga qaytarish) State
  const isAdmin = user?.role === 'Admin' || user?.role?.toLowerCase() === 'admin';
  const [rollbackTarget, setRollbackTarget] = useState<{
    cards: WagonCard[];
    currentStageTitle: string;
    targetStageTitle: string;
    targetStep: 'ready' | 'loading' | 'done' | 'awaiting_tare';
    warningText: string;
  } | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackError, setRollbackError] = useState('');
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);

  const openRollback = (card: WagonCard) => {
    const tab = tabOf(card, registeredWagons);
    let currentStageTitle = '';
    let targetStageTitle = '';
    let targetStep: 'ready' | 'loading' | 'done' | 'awaiting_tare' = 'loading';
    let warningText = '';

    if (tab === 'exit') {
      currentStageTitle = "4-bosqich: Chiqishga tayyor (Plombalangan / Dalolatnoma)";
      targetStageTitle = "3-bosqich: Yuklangan (Plomba bekor qilinadi)";
      targetStep = 'done';
      warningText = "Ushbu vagonning plomba ma'lumotlari bekor qilinadi va u qayta brutto/plomba jarayoniga qaytariladi.";
    } else if (tab === 'done') {
      currentStageTitle = "3-bosqich: Yuklangan (Brutto / Tarozi jarayonida)";
      targetStageTitle = "2-bosqich: Yuklanmoqda (Yuklash davom etadi)";
      targetStep = 'loading';
      warningText = "Vagonning yuklash yakunlangani va brutto og'irligi bekor qilinadi, vagon yuklanmoqda holatiga qaytariladi.";
    } else if (tab === 'loading') {
      currentStageTitle = "2-bosqich: Yuklanmoqda";
      targetStageTitle = "1-bosqich: Yuklashga tayyor (Estakada)";
      targetStep = 'ready';
      warningText = "Vagonning yuklash boshlangani bekor qilinadi va u estakadada yuklashni kutish holatiga qaytariladi.";
    } else {
      currentStageTitle = "1-bosqich: Yuklashga tayyor (Estakada)";
      targetStageTitle = "Kirish / Tara tekshiruvi (AwaitingTare)";
      targetStep = 'awaiting_tare';
      warningText = "Vagon estakadadan chiqariladi va tara tekshiruvi / kirish holatiga qaytariladi.";
    }

    setRollbackTarget({
      cards: [card],
      currentStageTitle,
      targetStageTitle,
      targetStep,
      warningText,
    });
    setRollbackReason('');
    setRollbackError('');
  };

  const openBulkRollback = (cards: WagonCard[]) => {
    if (cards.length === 0) return;
    const tab = activeTab;
    let currentStageTitle = '';
    let targetStageTitle = '';
    let targetStep: 'ready' | 'loading' | 'done' | 'awaiting_tare' = 'loading';
    let warningText = '';

    if (tab === 'exit') {
      currentStageTitle = `4-bosqich: Chiqishga tayyor (${cards.length} ta vagon)`;
      targetStageTitle = "3-bosqich: Yuklangan";
      targetStep = 'done';
      warningText = `Tanlangan ${cards.length} ta vagonning plomba ma'lumotlari bekor qilinadi va 3-bosqichga qaytariladi.`;
    } else if (tab === 'done') {
      currentStageTitle = `3-bosqich: Yuklangan (${cards.length} ta vagon)`;
      targetStageTitle = "2-bosqich: Yuklanmoqda";
      targetStep = 'loading';
      warningText = `Tanlangan ${cards.length} ta vagonning yuklash yakunlangani bekor qilinadi va 2-bosqichga qaytariladi.`;
    } else if (tab === 'loading') {
      currentStageTitle = `2-bosqich: Yuklanmoqda (${cards.length} ta vagon)`;
      targetStageTitle = "1-bosqich: Yuklashga tayyor (Estakada)";
      targetStep = 'ready';
      warningText = `Tanlangan ${cards.length} ta vagonning yuklash boshlangani bekor qilinadi va 1-bosqichga qaytariladi.`;
    } else {
      currentStageTitle = `1-bosqich: Yuklashga tayyor (${cards.length} ta vagon)`;
      targetStageTitle = "Kirish / Tara tekshiruvi (AwaitingTare)";
      targetStep = 'awaiting_tare';
      warningText = `Tanlangan ${cards.length} ta vagon estakadadan chiqariladi va boshlang'ich holatga qaytariladi.`;
    }

    setRollbackTarget({
      cards,
      currentStageTitle,
      targetStageTitle,
      targetStep,
      warningText,
    });
    setRollbackReason('');
    setRollbackError('');
  };

  const submitRollback = async () => {
    if (!rollbackTarget || rollbackTarget.cards.length === 0) return;
    setRollbackSubmitting(true);
    setRollbackError('');
    setBusyKey(rollbackTarget.cards.length === 1 ? cardKey(rollbackTarget.cards[0]) : 'selected-rollback');

    try {
      for (const card of rollbackTarget.cards) {
        const res = await api.rollbackWarehouseWagon(
          card.arrival.id,
          card.unit.wagonNumber,
          rollbackTarget.targetStep,
          rollbackReason.trim() || 'Admin tomonidan orqaga qaytarildi'
        );
        if (!res.success) {
          throw new Error(res.message || `${card.unit.wagonNumber} vagonini qaytarishda xatolik`);
        }
      }

      notifyOrdersChanged();
      setRollbackTarget(null);
      setRollbackReason('');
      setSelectedIds(new Set());
      load({ silent: true });
    } catch (err: unknown) {
      setRollbackError(err instanceof Error ? err.message : 'Orqaga qaytarishda xatolik yuz berdi.');
      load({ silent: true });
    } finally {
      setRollbackSubmitting(false);
      setBusyKey(null);
    }
  };
  const [editTarget, setEditTarget] = useState<WagonCard | null>(null);
  const [historyTarget, setHistoryTarget] = useState<WagonCard | null>(null);
  const [editProductType, setEditProductType] = useState('');
  const [editLoadingComment, setEditLoadingComment] = useState('');
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editTareWeight, setEditTareWeight] = useState('');
  const [editGrossWeight, setEditGrossWeight] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [defectActTarget, setDefectActTarget] = useState<WagonCard | null>(null);
  const [defectActType, setDefectActType] = useState<DefectActType>('sisterna_no_product');
  const [defectActIssuing, setDefectActIssuing] = useState(false);

  interface InternalWagonEntry {
    wagonNumber: string;
    loadState: WagonIntakeLoadState;
  }

  const [showAddInternalModal, setShowAddInternalModal] = useState(false);
  const [internalWagonList, setInternalWagonList] = useState<InternalWagonEntry[]>([]);
  const [currentWagonInput, setCurrentWagonInput] = useState('');
  const [currentLoadState, setCurrentLoadState] = useState<WagonIntakeLoadState>(WAGON_INTAKE_LOAD_STATE.Bosh);
  const [wagonInputError, setWagonInputError] = useState('');
  const [internalProductType, setInternalProductType] = useState('Suyultirilgan gaz');
  const [internalWagonType, setInternalWagonType] = useState<WagonKind>('sisterna');
  const [internalComment, setInternalComment] = useState('Zavod ichki zaxirasi / oldingi partiya qoldig‘i');
  const [internalSubmitting, setInternalSubmitting] = useState(false);
  const [internalError, setInternalError] = useState('');

  const internalBoshCount = useMemo(
    () => internalWagonList.filter(w => w.loadState === WAGON_INTAKE_LOAD_STATE.Bosh).length,
    [internalWagonList]
  );
  const internalYukliCount = useMemo(
    () => internalWagonList.filter(w => w.loadState === WAGON_INTAKE_LOAD_STATE.Yukli).length,
    [internalWagonList]
  );

  const handleAddWagonNumber = () => {
    const clean = currentWagonInput.replace(/\D/g, '').trim();
    if (!clean) {
      setWagonInputError('Vagon raqamini kiriting');
      return;
    }
    if (clean.length !== 8) {
      setWagonInputError('Vagon raqami aniq 8 xonali raqam bo‘lishi shart (masalan: 58212648)');
      return;
    }
    if (internalWagonList.some(item => item.wagonNumber === clean)) {
      setWagonInputError('Ushbu vagon raqami ro‘yxatga allaqachon qo‘shilgan');
      return;
    }
    const alreadyExists = tasks.some(t =>
      (t.wagons ?? []).some(u => String(u.wagonNumber || '').trim() === clean && !u.scaleExitedAt)
    );
    if (alreadyExists) {
      setWagonInputError('Bu vagon raqami allaqachon tizimda / yuklash navbatida mavjud');
      return;
    }
    setInternalWagonList(prev => [...prev, { wagonNumber: clean, loadState: currentLoadState }]);
    setCurrentWagonInput('');
    setWagonInputError('');
  };

  const handleToggleLoadState = (wagonNum: string) => {
    setInternalWagonList(prev =>
      prev.map(item =>
        item.wagonNumber === wagonNum
          ? {
              ...item,
              loadState:
                item.loadState === WAGON_INTAKE_LOAD_STATE.Bosh
                  ? WAGON_INTAKE_LOAD_STATE.Yukli
                  : WAGON_INTAKE_LOAD_STATE.Bosh,
            }
          : item
      )
    );
  };

  const handleRemoveWagonNumber = (wagonNum: string) => {
    setInternalWagonList(prev => prev.filter(w => w.wagonNumber !== wagonNum));
  };

  const handleAddInternalWagons = async (e: React.FormEvent) => {
    e.preventDefault();
    if (internalWagonList.length === 0) {
      setInternalError('Kamida bitta vagon raqamini qo‘shing');
      return;
    }
    setInternalSubmitting(true);
    setInternalError('');
    try {
      const res = await api.addInternalWarehouseWagons({
        wagonNumbers: internalWagonList.map(w => w.wagonNumber).join(', '),
        productType: internalProductType,
        wagonType: internalWagonType,
        comment: internalComment.trim() || undefined,
        intakeLoadStates: internalWagonList.map(w => w.loadState).join(', '),
      });
      if (res.success) {
        setShowAddInternalModal(false);
        setInternalWagonList([]);
        setCurrentWagonInput('');
        setCurrentLoadState(WAGON_INTAKE_LOAD_STATE.Bosh);
        setWagonInputError('');
        load();
        notifyOrdersChanged();
      } else {
        setInternalError(res.message || 'Xatolik yuz berdi');
      }
    } catch (err: any) {
      setInternalError(err?.message || 'Server bilan bog‘lanishda xatolik');
    } finally {
      setInternalSubmitting(false);
    }
  };

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    Promise.all([api.getWarehouseLoadingTasks(), api.getEmptyWagonArrivals(), api.getLoadingRegistries()])
      .then(([taskRes, arrivalRes, registryRes]) => {
        const tasksById = new Map((taskRes.data ?? []).map(task => [task.id, task]));
        const freshTasks = (arrivalRes.data ?? []).filter(a => !isOneCArrival(a) && a.stage !== 'Cancelled').map(a => ({
          ...tasksById.get(a.id), ...a,
          stage: a.stage || '',
          tareWeight: a.tareWeight || '',
          loadingCompletedAt: a.loadingCompletedAt || null,
          loadingCompletedByName: a.loadingCompletedByName || '',
          loadingComment: tasksById.get(a.id)?.loadingComment || '',
          economistNotifiedAt: tasksById.get(a.id)?.economistNotifiedAt || null,
        }));
        setQueueError('');
        setTasks(freshTasks);
        setRegistries(registryRes.data ?? []);
      })
      .catch(() => setQueueError('Vagonlar va yuk xatlari ma’lumotlarini olib bo‘lmadi. Qayta yangilang.'))
      .finally(() => { if (!options?.silent) setLoading(false); });
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeOrdersChanged(() => load({ silent: true }));
    return unsub;
  }, [load]);

  // Chiqib ketmagan yuk xatlaridagi vagonlar: "arrivalId:vagon" → reyestr raqami.
  const registeredWagons = useMemo(() => activeRegistryMap(tasks, registries), [tasks, registries]);
  const cards = useMemo(() => buildWagonWorkCards(tasks, registries), [tasks, registries]);

  const parties = useMemo(() => {
    const map = new Map<string, PartyRow>();
    for (const card of cards) {
      let row = map.get(card.arrival.id);
      if (!row) {
        row = {
          arrival: card.arrival,
          wagons: [],
          counts: { ready: 0, loading: 0, done: 0, exit: 0 },
        };
        map.set(card.arrival.id, row);
      }
      row.wagons.push(card);
      row.counts[tabOf(card, registeredWagons)] += 1;
    }
    return [...map.values()].sort((a, b) => {
      const da = a.arrival.createdAt || a.arrival.arrivalDate || '';
      const db = b.arrival.createdAt || b.arrival.arrivalDate || '';
      return db.localeCompare(da);
    });
  }, [cards, registeredWagons]);

  const tabCounts = useMemo(
    () => ({
      ready: cards.filter(c => tabOf(c, registeredWagons) === 'ready').length,
      loading: cards.filter(c => tabOf(c, registeredWagons) === 'loading').length,
      done: cards.filter(c => tabOf(c, registeredWagons) === 'done').length,
      exit: cards.filter(c => tabOf(c, registeredWagons) === 'exit').length,
    }),
    [cards, registeredWagons],
  );

  const partyView = partyViewId ? parties.find(p => p.arrival.id === partyViewId) ?? null : null;

  useEffect(() => {
    if (!partyViewId || loading) return;
    if (!parties.some(p => p.arrival.id === partyViewId)) setPartyViewId(null);
  }, [partyViewId, loading, parties]);

  // Kirish partiyasi audit va kirish hujjati uchun saqlanadi, operatsion ish esa
  // zavod ichida bevosita mustaqil vagonlar fondida bajariladi.
  const poolWagons = useMemo(() => {
    const list = cards.filter(card => tabOf(card, registeredWagons) === activeTab);
    if (!sortField) return list;

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        const timeA = wagonEventTimestamp(a);
        const timeB = wagonEventTimestamp(b);
        cmp = timeA - timeB;
        if (cmp === 0) {
          const batchA = a.arrival.arrivalNumber || '';
          const batchB = b.arrival.arrivalNumber || '';
          cmp = batchA.localeCompare(batchB, undefined, { numeric: true });
        }
        if (cmp === 0) {
          const numA = a.unit.wagonNumber || '';
          const numB = b.unit.wagonNumber || '';
          cmp = numA.localeCompare(numB, undefined, { numeric: true });
        }
      } else if (sortField === 'batch') {
        const batchA = a.arrival.arrivalNumber || '';
        const batchB = b.arrival.arrivalNumber || '';
        cmp = batchA.localeCompare(batchB, undefined, { numeric: true });
        if (cmp === 0) {
          const timeA = wagonEventTimestamp(a);
          const timeB = wagonEventTimestamp(b);
          cmp = timeA - timeB;
        }
        if (cmp === 0) {
          const numA = a.unit.wagonNumber || '';
          const numB = b.unit.wagonNumber || '';
          cmp = numA.localeCompare(numB, undefined, { numeric: true });
        }
      } else if (sortField === 'wagonNumber') {
        const numA = a.unit.wagonNumber || '';
        const numB = b.unit.wagonNumber || '';
        cmp = numA.localeCompare(numB, undefined, { numeric: true });
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [activeTab, cards, sortField, sortOrder]);

  const visibleWagons = partyView?.wagons ?? poolWagons;
  const selectableWagons = useMemo(
    () => visibleWagons.filter(card => isSelectableUnit(card.unit)),
    [visibleWagons],
  );
  const selectedCards = useMemo(
    () => visibleWagons.filter(card => selectedIds.has(card.unit.id)),
    [visibleWagons, selectedIds],
  );
  const selectedReady = selectedCards.filter(card => tabOf(card, registeredWagons) === 'ready');
  const selectedLoading = selectedCards.filter(card => tabOf(card, registeredWagons) === 'loading');
  const selectedLoaded = selectedCards.filter(card => card.unit.status === 'Loaded');

  useEffect(() => {
    setSelectedIds(current => {
      const visible = new Set(selectableWagons.map(card => card.unit.id));
      const next = new Set([...current].filter(id => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [selectableWagons]);

  const closePartyView = () => {
    if (fromQuery) {
      navigate(fromQuery);
      return;
    }
    setSelectedIds(new Set());
    setPartyViewId(null);
    setSearchParams(prev => {
      if (!prev.has('arrivalId')) return prev;
      const sp = new URLSearchParams(prev);
      sp.delete('arrivalId');
      return sp;
    }, { replace: true });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(selectableWagons.map(card => card.unit.id)));

  const startWagons = async (group: WagonCard[]) => {
    if (group.length === 0) return;
    setBusyKey(group.length === 1 ? cardKey(group[0]) : 'selected-start');
    try {
      const res = await api.startWarehouseLoadingGroup(group.map(card => card.unit.id));
      if (!res.success) throw new Error(res.message || 'Yuklashni boshlab bo‘lmadi.');
      setSelectedIds(new Set());
      notifyOrdersChanged();
      load({ silent: true });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Yuklashni boshlab bo‘lmadi.');
      load({ silent: true });
    } finally {
      setBusyKey(null);
    }
  };

  const completeWagons = async (group: WagonCard[]) => {
    if (group.length === 0) return;
    setBusyKey(group.length === 1 ? cardKey(group[0]) : 'selected-complete');
    try {
      const res = await api.completeWarehouseLoadingGroup(group.map(card => card.unit.id));
      if (!res.success) throw new Error(res.message || 'Yuklashni tugatib bo‘lmadi.');
      const groupProducts = Array.from(new Set(
        group.map(c => c.unit.productType?.trim() || c.arrival.productType?.trim()).filter(Boolean)
      ));
      const loadedProduct = groupProducts.length === 1 ? groupProducts[0] : (groupProducts.length > 1 ? groupProducts.join(', ') : 'Polietilen');
      notifyWagonsLoaded({ wagonNumbers: group.map(c => c.unit.wagonNumber), count: group.length, productType: loadedProduct, grossWeight: group[0]?.unit.grossWeight, netWeight: group[0]?.unit.nettoWeight != null ? String(group[0]?.unit.nettoWeight) : undefined });
      setSelectedIds(new Set());
      notifyOrdersChanged();
      load({ silent: true });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Yuklashni tugatib bo‘lmadi.');
      load({ silent: true });
    } finally {
      setBusyKey(null);
    }
  };

  const sendToScaleWagons = async (group: WagonCard[]) => {
    if (group.length === 0) return;
    setBusyKey(group.length === 1 ? cardKey(group[0]) : 'selected-sendToScale');
    try {
      const res = await api.sendWarehouseLoadingToScale(group.map(card => card.unit.id));
      if (!res.success) throw new Error(res.message || 'Taroziga jo‘natib bo‘lmadi.');
      setSelectedIds(new Set());
      notifyOrdersChanged();
      load({ silent: true });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Taroziga jo‘natib bo‘lmadi.');
      load({ silent: true });
    } finally {
      setBusyKey(null);
    }
  };

  const openReturn = (card: WagonCard) => {
    setReturnTarget(card);
    setReturnReason('');
    setReturnError('');
  };

  const closeReturn = () => {
    if (returnSubmitting) return;
    setReturnTarget(null);
    setReturnReason('');
    setReturnError('');
  };

  const submitReturn = async () => {
    if (!returnTarget) return;
    const reason = returnReason.trim();
    if (reason.length < 3) {
      setReturnError('Nuqson yoki kamchilik sababini yozing');
      return;
    }
    setReturnSubmitting(true);
    setReturnError('');
    setBusyKey(cardKey(returnTarget));
    try {
      const res = await api.returnWarehouseWagonLoading(
        returnTarget.arrival.id,
        returnTarget.unit.wagonNumber,
        reason,
      );
      if (!res.success) throw new Error(res.message || 'Qaytarishda xatolik');
      notifyOrdersChanged();
      setReturnTarget(null);
      setReturnReason('');
      load({ silent: true });
    } catch (err: unknown) {
      setReturnError(err instanceof Error ? err.message : 'Qaytarishda xatolik');
    } finally {
      setReturnSubmitting(false);
      setBusyKey(null);
    }
  };

  const openEdit = (card: WagonCard) => {
    setEditTarget(card);
    setEditProductType(card.unit.productType?.trim() || card.arrival.productType?.trim() || '');
    setEditLoadingComment(card.unit.loadingComment?.trim() || '');
    setEditBatchNumber(String(card.unit.loadingBatchNumber || '').trim());
    setEditTareWeight(String(card.unit.tareWeight || '').trim());
    setEditGrossWeight(String(card.unit.grossWeight || '').trim());
    setEditComment('');
    setEditError('');
    setHistoryTarget(null);
  };

  const closeEdit = () => {
    if (editSubmitting) return;
    setEditTarget(null);
    setEditComment('');
    setEditError('');
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const comment = editComment.trim();
    if (comment.length < 3) {
      setEditError('Tahrirlash izohini yozing (kamida 3 belgi)');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    setBusyKey(cardKey(editTarget));
    try {
      const res = await api.editWarehouseWagonLoading(
        editTarget.arrival.id,
        editTarget.unit.wagonNumber,
        {
          editComment: comment,
          productType: editProductType,
          loadingComment: editTarget.unit.status === 'Returned' ? undefined : editLoadingComment,
          loadingBatchNumber: editBatchNumber,
          tareWeight: editTareWeight,
          grossWeight: editGrossWeight,
        },
      );
      if (!res.success) throw new Error(res.message || 'Saqlab bo‘lmadi');
      notifyOrdersChanged();
      setHistoryRefreshKey(key => key + 1);
      setEditTarget(null);
      setEditComment('');
      load({ silent: true });
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Saqlab bo‘lmadi');
    } finally {
      setEditSubmitting(false);
      setBusyKey(null);
    }
  };

  const anyBusy = busyKey != null;
  const editInputClass = 'order-sheet-input !rounded-xl !py-2.5 !text-sm !px-3';

  const openDefectAct = (card: WagonCard) => {
    setDefectActType(resolveDefectActType(
      card.unit.wagonType,
      card.unit.loadingComment,
      card.unit.defectActType as DefectActType | undefined,
    ));
    setDefectActTarget(card);
  };

  const closeDefectAct = () => {
    if (defectActIssuing) return;
    setDefectActTarget(null);
  };

  const issueDefectAct = async () => {
    if (!defectActTarget) return;
    setDefectActIssuing(true);
    try {
      const res = await api.issueDefectAct(defectActTarget.unit.id, defectActType);
      if (!res.success) throw new Error(res.message || 'Dalolatnomani tasdiqlab bo‘lmadi');
      closeDefectAct();
      notifyOrdersChanged();
      load({ silent: true });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Dalolatnomani tasdiqlab bo‘lmadi');
    } finally {
      setDefectActIssuing(false);
    }
  };

  const renderMetaActions = (card: WagonCard, fullWidth = false) => {
    if (card.unit.status === 'Returned') {
      const issued = hasDefectAct(card.unit);
      return (
        <button
          type="button"
          className={fullWidth
            ? `w-full justify-center ${issued ? 'btn-secondary !border-sky-300 !bg-sky-50 !text-sky-700 dark:!border-sky-700 dark:!bg-sky-950/40 dark:!text-sky-300' : 'btn-primary'}`
            : issued
              ? `${TABLE_ROW_BTN_SECONDARY} !border-sky-300 !bg-sky-50 !text-sky-700 dark:!border-sky-700 dark:!bg-sky-950/40 dark:!text-sky-300`
              : TABLE_ROW_BTN_PRIMARY}
          disabled={defectActIssuing}
          onClick={() => openDefectAct(card)}
        >
          <FileCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {issued ? card.unit.defectActNumber || 'Dalolatnoma' : 'Dalolatnoma tuzish'}
        </button>
      );
    }
    const secondaryBtn = fullWidth
      ? 'btn-secondary !px-3 !py-2 !text-sm w-full justify-center'
      : TABLE_ROW_BTN_SECONDARY;
    const row = fullWidth ? 'flex flex-col gap-2' : TABLE_ROW_ACTIONS;

    return (
      <div className={row}>
        {canEditWagon(card.unit) ? (
          <button
            type="button"
            className={secondaryBtn}
            disabled={anyBusy}
            onClick={() => openEdit(card)}
          >
            <PencilLine className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            Tahrirlash
          </button>
        ) : null}
        <button
          type="button"
          className={secondaryBtn}
          disabled={anyBusy}
          onClick={() => {
            setHistoryTarget(card);
            setEditTarget(null);
          }}
        >
          <History className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          Tarix
        </button>
      </div>
    );
  };

  const renderActions = (card: WagonCard, fullWidth = false) => {
    const key = cardKey(card);
    const busy = busyKey === key;
    const btn = fullWidth
      ? 'btn-primary !px-3 !py-2.5 !text-sm w-full justify-center'
      : TABLE_ROW_BTN_PRIMARY;
    const warnBtn = fullWidth
      ? 'inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
      : TABLE_ROW_BTN_WARN;
    const row = fullWidth ? 'flex flex-col gap-2' : TABLE_ROW_ACTIONS;
    const adminRollbackBtn = fullWidth
      ? 'inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-400 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition-colors'
      : 'inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition-colors';

    if (card.unit.status === 'Estakada') {
      return (
        <div className={row}>
          <button
            type="button"
            className={btn}
            disabled={anyBusy}
            onClick={() => setActionConfirmTarget({ action: 'start', cards: [card] })}
          >
            <Play className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            {busy ? '...' : fullWidth ? 'Yuklashni boshlash' : 'Boshlash'}
          </button>
          <button
            type="button"
            className={warnBtn}
            disabled={anyBusy}
            onClick={() => openReturn(card)}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            Qaytarish
          </button>
          {isAdmin && (
            <button
              type="button"
              className={adminRollbackBtn}
              disabled={anyBusy}
              onClick={() => openRollback(card)}
              title="Faqat Admin: Estakadadan orqaga (Kirish/Tara) qaytarish"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {fullWidth ? "Kirishga qaytarish" : "Orqaga"}
            </button>
          )}
        </div>
      );
    }

    if (card.unit.status === 'Loading') {
      return (
        <div className={row}>
          <button
            type="button"
            className={btn}
            disabled={anyBusy}
            onClick={() => setActionConfirmTarget({ action: 'complete', cards: [card] })}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            {busy ? '...' : fullWidth ? 'Yuklashni tugatish' : 'Tugatish'}
          </button>
          <button
            type="button"
            className={warnBtn}
            disabled={anyBusy}
            onClick={() => openReturn(card)}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            Qaytarish
          </button>
          {isAdmin && (
            <button
              type="button"
              className={adminRollbackBtn}
              disabled={anyBusy}
              onClick={() => openRollback(card)}
              title="Faqat Admin: Yuklashga tayyor (Estakada) holatiga qaytarish"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {fullWidth ? "Estakadaga qaytarish" : "Orqaga"}
            </button>
          )}
        </div>
      );
    }

    if (card.unit.status === 'Returned') {
      return renderMetaActions(card, fullWidth);
    }

    if (card.unit.status === 'Loaded') {
      return (
        <div className={row}>
          <button
            type="button"
            className={btn}
            disabled={anyBusy}
            onClick={() => setActionConfirmTarget({ action: 'sendToScale', cards: [card] })}
          >
            <Send className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            {busy ? '...' : fullWidth ? 'Taroziga jo‘natish' : 'Taroziga jo‘natish'}
          </button>
          <button
            type="button"
            className={warnBtn}
            disabled={anyBusy}
            onClick={() => openReturn(card)}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            Qaytarish
          </button>
          {isAdmin && (
            <button
              type="button"
              className={adminRollbackBtn}
              disabled={anyBusy}
              onClick={() => openRollback(card)}
              title="Faqat Admin: Yuklanmoqda (2-bosqich) holatiga qaytarish"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {fullWidth ? "Yuklashga qaytarish" : "Orqaga"}
            </button>
          )}
        </div>
      );
    }

    if (card.unit.status === 'ToRailwayScale') {
      return (
        <div className={row}>
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
            Tarozida
          </span>
          <button
            type="button"
            className={warnBtn}
            disabled={anyBusy}
            onClick={() => openReturn(card)}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            Qaytarish
          </button>
          {isAdmin && (
            <button
              type="button"
              className={adminRollbackBtn}
              disabled={anyBusy}
              onClick={() => openRollback(card)}
              title="Faqat Admin: Yuklanmoqda (2-bosqich) holatiga qaytarish"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {fullWidth ? "Yuklashga qaytarish" : "Orqaga"}
            </button>
          )}
        </div>
      );
    }

    if (Boolean(card.unit.defectActNumber != null && String(card.unit.defectActNumber).trim()) || card.unit.status === 'Returned') {
      return (
        <div className={row}>
          <button
            type="button"
            className={`${TABLE_ROW_BTN_SECONDARY} !border-rose-300 !bg-rose-50 !text-rose-700 hover:!bg-rose-100 dark:!border-rose-800 dark:!bg-rose-950/40 dark:!text-rose-300`}
            onClick={() => openDefectAct(card)}
          >
            <FileCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {card.unit.defectActNumber ? `Dalolatnoma № ${card.unit.defectActNumber}` : 'Dalolatnoma'}
          </button>
          {isAdmin && (
            <button
              type="button"
              className={adminRollbackBtn}
              disabled={anyBusy}
              onClick={() => openRollback(card)}
              title="Faqat Admin: Dalolatnomani bekor qilib avvalgi holatga qaytarish"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {fullWidth ? "Orqaga qaytarish" : "Orqaga"}
            </button>
          )}
        </div>
      );
    }

    // GrossWeighed / Plomba jarayoni / Chiqishga tayyor:
    const meta = statusMeta(card, registeredWagons);
    return (
      <div className={row}>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className={`notify-dept-pill notify-dept-pill--${meta.tone}`}>
            <span className="notify-dept-pill__dot" />
            {meta.text}
          </span>
          <FlagBadge unit={card.unit} />
        </span>
        {isAdmin && (
          <button
            type="button"
            className={adminRollbackBtn}
            disabled={anyBusy}
            onClick={() => openRollback(card)}
            title="Faqat Admin: Plombani bekor qilib Yuklangan (3-bosqich) holatiga qaytarish"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            {fullWidth ? "Yuklanganga qaytarish" : "Orqaga"}
          </button>
        )}
      </div>
    );
  };

  const isActionBusy = actionConfirmTarget != null && (
    actionConfirmTarget.cards.length === 1
      ? busyKey === cardKey(actionConfirmTarget.cards[0])
      : (actionConfirmTarget.action === 'complete'
          ? busyKey === 'selected-complete'
          : actionConfirmTarget.action === 'sendToScale'
            ? busyKey === 'selected-sendToScale'
            : busyKey === 'selected-start')
  );

  const confirmTitle = useMemo(() => {
    if (!actionConfirmTarget) return '';
    const isComplete = actionConfirmTarget.action === 'complete';
    const isSendToScale = actionConfirmTarget.action === 'sendToScale';
    const isSingle = actionConfirmTarget.cards.length === 1;
    if (isSendToScale) {
      return isSingle ? 'Taroziga jo‘natish' : 'Tanlangan vagonlarni taroziga jo‘natish';
    }
    if (isComplete) {
      return isSingle ? 'Yuklashni tugatish' : 'Tanlangan vagonlar yuklanishini tugatish';
    }
    return isSingle ? 'Yuklashni boshlash' : 'Tanlangan vagonlarni yuklashni boshlash';
  }, [actionConfirmTarget]);

  const confirmMessage = useMemo(() => {
    if (!actionConfirmTarget) return '';
    const isComplete = actionConfirmTarget.action === 'complete';
    const isSendToScale = actionConfirmTarget.action === 'sendToScale';
    const isSingle = actionConfirmTarget.cards.length === 1;
    if (isSendToScale) {
      if (isSingle) {
        const card = actionConfirmTarget.cards[0];
        const prod = card.unit.productType || card.arrival.productType || 'Mahsulot';
        return `Vagon №${card.unit.wagonNumber} (${prod}) taroziga (Brutto/Netto tortishga) jo‘natilsinmi?\n\nVagon Tarozibon navbatiga ("Taroziga jo‘natilgan") o‘tkaziladi.`;
      }
      return `Tanlangan ${actionConfirmTarget.cards.length} ta vagon taroziga (Brutto/Netto tortishga) jo‘natilsinmi?\n\nVagonlar: ${actionConfirmTarget.cards.map(c => c.unit.wagonNumber).join(', ')}`;
    }
    if (isComplete) {
      if (isSingle) {
        const card = actionConfirmTarget.cards[0];
        const prod = card.unit.productType || card.arrival.productType || 'Mahsulot';
        return `Vagon №${card.unit.wagonNumber} (${prod}) bo‘yicha yuklash jarayonini yakunlashni tasdiqlaysizmi?\n\nVagon "Yuklangan" holatiga o‘tkaziladi va estakadada qoladi.`;
      }
      return `Tanlangan ${actionConfirmTarget.cards.length} ta vagon bo‘yicha yuklash jarayonini yakunlashni tasdiqlaysizmi?\n\nVagonlar: ${actionConfirmTarget.cards.map(c => c.unit.wagonNumber).join(', ')}`;
    }
    if (isSingle) {
      const card = actionConfirmTarget.cards[0];
      const prod = card.unit.productType || card.arrival.productType || 'Mahsulot';
      return `Vagon №${card.unit.wagonNumber} (${prod}) bo‘yicha yuklash jarayonini boshlashni tasdiqlaysizmi?\n\nVagon "Yuklanmoqda" holatiga o‘tkaziladi.`;
    }
    return `Tanlangan ${actionConfirmTarget.cards.length} ta vagon bo‘yicha yuklash jarayonini boshlashni tasdiqlaysizmi?\n\nVagonlar: ${actionConfirmTarget.cards.map(c => c.unit.wagonNumber).join(', ')}`;
  }, [actionConfirmTarget]);

  const confirmBtnLabel = useMemo(() => {
    if (!actionConfirmTarget) return 'Tasdiqlash';
    const isComplete = actionConfirmTarget.action === 'complete';
    const isSendToScale = actionConfirmTarget.action === 'sendToScale';
    const count = actionConfirmTarget.cards.length;
    if (isSendToScale) {
      return count === 1 ? 'Taroziga jo‘natish' : `Taroziga jo‘natish (${count})`;
    }
    if (isComplete) {
      return count === 1 ? 'Ha, tugatish' : `Ha, tugatish (${count})`;
    }
    return count === 1 ? 'Ha, boshlash' : `Ha, boshlash (${count})`;
  }, [actionConfirmTarget]);

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!actionConfirmTarget}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmBtnLabel}
        cancelLabel="Bekor qilish"
        loading={isActionBusy}
        onConfirm={() => {
          if (!actionConfirmTarget) return;
          const group = actionConfirmTarget.cards;
          const action = actionConfirmTarget.action;
          setActionConfirmTarget(null);
          if (action === 'complete') void completeWagons(group);
          else if (action === 'sendToScale') void sendToScaleWagons(group);
          else void startWagons(group);
        }}
        onCancel={() => {
          if (isActionBusy) return;
          setActionConfirmTarget(null);
        }}
      />

      {returnTarget ? (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={closeReturn} />
          <div
            className="confirm-dialog !max-w-[28rem] !w-[min(28rem,calc(100vw-1.5rem))] !p-5"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="confirm-dialog__close"
              aria-label="Yopish"
              onClick={closeReturn}
              disabled={returnSubmitting}
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <div className="confirm-dialog__header !mb-4">
              <div className="confirm-dialog__icon !bg-amber-50 !text-amber-700 dark:!bg-amber-950/50 dark:!text-amber-300">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="confirm-dialog__title">Nomuvofiqlik aniqlangan</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vagon {returnTarget.unit.wagonNumber}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
              Nuqson yoki kamchilikni yozing. Bu vagon yuklashdan chiqariladi. Keyin Temir yo‘l sexi dalolatnoma biriktiradi —
              shundan so‘ng iqtisodchi yuk xatiga qo‘sha oladi.
            </p>

            {returnError ? <p className="confirm-dialog__error mb-3">{returnError}</p> : null}

            <label className="block mb-3">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-950 dark:text-amber-100 mb-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
                Sabab <span className="text-rose-500">*</span>
              </span>
              <textarea
                rows={4}
                autoFocus
                disabled={returnSubmitting}
                value={returnReason}
                onChange={e => {
                  setReturnReason(e.target.value);
                  if (returnError) setReturnError('');
                }}
                placeholder="Masalan: vagon eshigi buzilgan, idish oqadi…"
                className="security-issue-note"
              />
            </label>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={returnSubmitting}
                onClick={() => {
                  void submitReturn();
                }}
              >
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                {returnSubmitting ? 'Qaytarilmoqda...' : 'Qaytarish'}
              </button>
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 py-1"
                disabled={returnSubmitting}
                onClick={closeReturn}
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {rollbackTarget ? (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={() => !rollbackSubmitting && setRollbackTarget(null)} />
          <div
            className="confirm-dialog !max-w-[32rem] !w-[min(32rem,calc(100vw-1.5rem))] !p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rollback-dialog-title"
          >
            <button
              type="button"
              className="confirm-dialog__close"
              aria-label="Yopish"
              onClick={() => setRollbackTarget(null)}
              disabled={rollbackSubmitting}
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <div className="confirm-dialog__header !mb-4">
              <div className="confirm-dialog__icon !bg-rose-100 !text-rose-700 dark:!bg-rose-950/50 dark:!text-rose-300">
                <RotateCcw className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 id="rollback-dialog-title" className="confirm-dialog__title">
                    Bosqichni orqaga qaytarish
                  </h2>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                    Faqat Admin
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {rollbackTarget.cards.length === 1
                    ? `Vagon: ${rollbackTarget.cards[0].unit.wagonNumber}`
                    : `${rollbackTarget.cards.length} ta tanlangan vagon`}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/60 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Joriy bosqich:</span>
                  <span className="text-right font-medium text-amber-700 dark:text-amber-300">
                    {rollbackTarget.currentStageTitle}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Qaytariladigan bosqich:</span>
                  <span className="text-right font-bold text-emerald-700 dark:text-emerald-300">
                    {rollbackTarget.targetStageTitle}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">⚠️ Ogohlantirish:</p>
                <p className="mt-0.5">{rollbackTarget.warningText}</p>
              </div>

              {rollbackError ? <p className="confirm-dialog__error mb-2">{rollbackError}</p> : null}

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Qaytarish sababi / Izoh (ixtiyoriy):
                </span>
                <input
                  type="text"
                  autoFocus
                  disabled={rollbackSubmitting}
                  value={rollbackReason}
                  onChange={e => setRollbackReason(e.target.value)}
                  placeholder="Masalan: Operator adashib tugatgan, qayta yuklanishi kerak"
                  className="security-issue-note !py-2 !text-xs"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                className="btn-secondary !text-xs !py-2 !px-3"
                disabled={rollbackSubmitting}
                onClick={() => setRollbackTarget(null)}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-transparent bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-700 dark:hover:bg-rose-600 transition-colors shadow-sm"
                disabled={rollbackSubmitting}
                onClick={() => { void submitRollback(); }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {rollbackSubmitting ? 'Qaytarilmoqda...' : 'Orqaga qaytarishni tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {editTarget ? (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={closeEdit} />
          <div
            className="confirm-dialog !max-w-[40rem] !w-[min(40rem,calc(100vw-1.5rem))] !p-0 overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Vagonni tahrirlash</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vagon {editTarget.unit.wagonNumber}
                </p>
              </div>
              <button
                type="button"
                className="confirm-dialog__close !static"
                aria-label="Yopish"
                onClick={closeEdit}
                disabled={editSubmitting}
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="max-h-[min(72vh,720px)] overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Mahsulot</span>
                  <input
                    type="text"
                    className={editInputClass}
                    value={editProductType}
                    disabled={editSubmitting}
                    onChange={e => setEditProductType(e.target.value)}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Yuklash guruhi</span>
                  <input
                    type="text"
                    className={`${editInputClass} font-mono`}
                    value={editBatchNumber}
                    disabled={editSubmitting}
                    onChange={e => setEditBatchNumber(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Tara (tn)</span>
                  <input
                    type="text"
                    className={`${editInputClass} tabular-nums`}
                    value={editTareWeight}
                    disabled={editSubmitting}
                    onChange={e => setEditTareWeight(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Brutto (tn)</span>
                  <input
                    type="text"
                    className={`${editInputClass} tabular-nums`}
                    value={editGrossWeight}
                    disabled={editSubmitting}
                    onChange={e => setEditGrossWeight(e.target.value)}
                  />
                </label>
                {editTarget.unit.status !== 'Returned' ? (
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Yuklash izohi</span>
                    <textarea
                      rows={3}
                      className="security-issue-note !min-h-[5rem]"
                      value={editLoadingComment}
                      disabled={editSubmitting}
                      onChange={e => setEditLoadingComment(e.target.value)}
                    />
                  </label>
                ) : null}
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Tahrirlash izohi <span className="text-rose-500">*</span>
                  </span>
                  <textarea
                    rows={3}
                    autoFocus
                    className="security-issue-note"
                    value={editComment}
                    disabled={editSubmitting}
                    onChange={e => {
                      setEditComment(e.target.value);
                      if (editError) setEditError('');
                    }}
                    placeholder="Nima sababdan va qaysi ma’lumotlar o‘zgartirilayotganini yozing"
                  />
                </label>
              </div>

              {editError ? <p className="confirm-dialog__error">{editError}</p> : null}

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-secondary" disabled={editSubmitting} onClick={closeEdit}>
                  Bekor qilish
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={editSubmitting}
                  onClick={() => {
                    void submitEdit();
                  }}
                >
                  <PencilLine className="w-4 h-4" strokeWidth={2} />
                  {editSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>

              <LoadingWagonEditHistory unitId={editTarget.unit.id} refreshKey={historyRefreshKey} />
            </div>
          </div>
        </div>
      ) : null}

      {historyTarget ? (
        <div className="confirm-dialog-root" role="presentation">
          <button
            type="button"
            className="confirm-dialog-backdrop"
            aria-label="Yopish"
            onClick={() => setHistoryTarget(null)}
          />
          <div
            className="confirm-dialog !max-w-[40rem] !w-[min(40rem,calc(100vw-1.5rem))] !p-0 overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Tahrirlash tarixi</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {historyTarget.arrival.arrivalNumber} · vagon {historyTarget.unit.wagonNumber}
                </p>
              </div>
              <button
                type="button"
                className="confirm-dialog__close !static"
                aria-label="Yopish"
                onClick={() => setHistoryTarget(null)}
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="max-h-[min(72vh,720px)] overflow-y-auto px-5 py-4">
              <LoadingWagonEditHistory unitId={historyTarget.unit.id} refreshKey={historyRefreshKey} />
            </div>
          </div>
        </div>
      ) : null}

      {defectActTarget ? (
        <DefectActView
          model={buildDefectActModel(asEmptyWagonArrival(defectActTarget.arrival), defectActTarget.unit, {
            actType: defectActType,
            issuerName: user?.fullName,
          })}
          actType={defectActType}
          onActTypeChange={setDefectActType}
          onClose={closeDefectAct}
          onIssue={!hasDefectAct(defectActTarget.unit) ? issueDefectAct : undefined}
          issuing={defectActIssuing}
          editableType={!hasDefectAct(defectActTarget.unit)}
        />
      ) : null}

      {showAddInternalModal && (
        <div className="confirm-dialog-root" role="presentation">
          <button
            type="button"
            className="confirm-dialog-backdrop"
            aria-label="Yopish"
            onClick={() => {
              if (!internalSubmitting) setShowAddInternalModal(false);
            }}
          />
          <div
            className="confirm-dialog !max-w-[34rem] !w-[min(34rem,calc(100vw-1.5rem))] !p-0 overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <TrainFront className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Zavod ichki fondidan vagon qo‘shish
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Zavod hududida oldindan bo‘lgan zaxira vagonlar
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddInternalModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddInternalWagons} className="p-5 space-y-4">
              {internalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {internalError}
                </div>
              )}

              {/* Vagon turi — kiritishdagi kabi rasmli va nomlanish */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Vagon turi <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Vagon turi">
                  {WAGON_KINDS.map(kind => {
                    const isSelected = internalWagonType === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setInternalWagonType(kind)}
                        className={`relative group flex flex-col items-center justify-between p-2.5 rounded-xl border-2 transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-blue-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="absolute top-2 right-2">
                          {isSelected ? (
                            <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5" strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                          )}
                        </div>
                        <WagonKindArt kind={kind} className="h-10 w-24 my-1 transition-transform group-hover:scale-105" />
                        <span className={`text-xs font-bold text-center leading-tight mt-1 ${
                          isSelected ? 'text-blue-950 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'
                        }`}>
                          {WAGON_KIND_LABEL[kind]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mahsulot turi */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mahsulot turi <span className="text-red-500">*</span>
                </label>
                <select
                  value={internalProductType}
                  onChange={e => {
                    const val = e.target.value;
                    setInternalProductType(val);
                    if (val.includes('gaz') || val.includes('Buten') || val.includes('kondensat')) {
                      setInternalWagonType('sisterna');
                    } else if (val.includes('polimer') || val.includes('oltingugurt')) {
                      setInternalWagonType('closed');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100"
                >
                  <option value="Suyultirilgan gaz">Suyultirilgan gaz</option>
                  <option value="Etilenning polimerlari (polietilen)">Etilenning polimerlari (polietilen)</option>
                  <option value="Barcha turdagi oltingugurt">Barcha turdagi oltingugurt</option>
                  <option value="Tabiiy gaz kondensati">Tabiiy gaz kondensati</option>
                  <option value="Buten-1">Buten-1</option>
                </select>
              </div>

              {/* 8 talik raqam kiritish + Holat (Bo'sh / Yuklangan) + "+ Qo'shish" tugmasi */}
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-850/50 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Vagon raqami <span className="text-red-500">*</span>
                    </label>
                    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setCurrentLoadState(WAGON_INTAKE_LOAD_STATE.Bosh)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                          currentLoadState === WAGON_INTAKE_LOAD_STATE.Bosh
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                        }`}
                      >
                        ○ Bo‘sh
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentLoadState(WAGON_INTAKE_LOAD_STATE.Yukli)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                          currentLoadState === WAGON_INTAKE_LOAD_STATE.Yukli
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                        }`}
                      >
                        ● Yuklangan
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                        <TrainFront className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="Masalan: 58212648"
                        value={currentWagonInput}
                        onChange={e => {
                          setCurrentWagonInput(e.target.value.replace(/\D/g, '').slice(0, 8));
                          if (wagonInputError) setWagonInputError('');
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddWagonNumber();
                          }
                        }}
                        className={`w-full pl-9 pr-14 py-2 rounded-xl border font-mono text-sm font-bold tracking-wider outline-none transition-all ${
                          currentWagonInput.length === 8
                            ? 'border-emerald-500 bg-emerald-50/30 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200 focus:ring-2 focus:ring-emerald-400/20'
                            : 'border-slate-200 bg-white text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                        }`}
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-400">
                        {currentWagonInput.length}/8
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddWagonNumber}
                      disabled={currentWagonInput.length !== 8}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-xs font-semibold text-white shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" strokeWidth={2.5} />
                      Qo‘shish
                    </button>
                  </div>
                  {wagonInputError && (
                    <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{wagonInputError}</p>
                  )}
                </div>

                {/* Qo'shilgan vagonlar ro'yxati (Chiplar) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Qo‘shilgan vagonlar ({internalWagonList.length} ta)
                    </span>
                    {internalWagonList.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <span className="text-sky-600 dark:text-sky-400 font-semibold">{internalBoshCount} ta bo‘sh</span>,{' '}
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{internalYukliCount} ta yuklangan</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <button
                          type="button"
                          onClick={() => setInternalWagonList([])}
                          className="text-[11px] font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          Tozalash
                        </button>
                      </div>
                    )}
                  </div>

                  {internalWagonList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 py-3 px-4 text-center dark:border-slate-700 dark:bg-slate-900/40">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Hozircha vagonlar qo‘shilmagan. Yuqoridagi maydonga 8 xonali raqam yozib «Qo‘shish» tugmasini bosing.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      {internalWagonList.map(item => {
                        const isYukli = item.loadState === WAGON_INTAKE_LOAD_STATE.Yukli;
                        return (
                          <span
                            key={item.wagonNumber}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-xs font-bold transition-all shadow-2xs ${
                              isYukli
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200'
                                : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-200'
                            }`}
                          >
                            <TrainFront className={`w-3.5 h-3.5 ${isYukli ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`} />
                            <span>{item.wagonNumber}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleLoadState(item.wagonNumber)}
                              className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                isYukli
                                  ? 'bg-emerald-200/80 text-emerald-900 hover:bg-emerald-300 dark:bg-emerald-900 dark:text-emerald-200'
                                  : 'bg-blue-200/80 text-blue-900 hover:bg-blue-300 dark:bg-blue-900 dark:text-blue-200'
                              }`}
                              title="Holatini almashtirish (Bo‘sh ⇄ Yuklangan)"
                            >
                              {isYukli ? 'Yuklangan' : 'Bo‘sh'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveWagonNumber(item.wagonNumber)}
                              className={`rounded-full p-0.5 transition-colors cursor-pointer ${
                                isYukli
                                  ? 'text-emerald-700 hover:bg-emerald-200 hover:text-rose-600 dark:text-emerald-300 dark:hover:bg-emerald-900 dark:hover:text-rose-400'
                                  : 'text-blue-700 hover:bg-blue-200 hover:text-rose-600 dark:text-blue-300 dark:hover:bg-blue-900 dark:hover:text-rose-400'
                              }`}
                              title="O‘chirish"
                            >
                              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Izoh / Asos */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Izoh / Asos
                </label>
                <input
                  type="text"
                  value={internalComment}
                  onChange={e => setInternalComment(e.target.value)}
                  placeholder="Masalan: Zavod ichki zaxirasi / oldingi partiya qoldig‘i"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddInternalModal(false)}
                  disabled={internalSubmitting}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={internalSubmitting || internalWagonList.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {internalSubmitting
                    ? 'Qo‘shilmoqda...'
                    : internalWagonList.length === 0
                    ? 'Fondga qo‘shish (0 ta)'
                    : `Fondga qo‘shish (${internalWagonList.length} ta: ${internalBoshCount} bo‘sh, ${internalYukliCount} yuklangan)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  if (partyView) {
    return (
      <div className="thub reestr">
      {queueError && <p role="alert" className="mb-3 text-sm text-red-600">{queueError}</p>}
        <div className="marketing-order-page space-y-4">
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            <ProductDetailBackButton onClick={closePartyView} />
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">Yuklash partiyasi</h2>
              <p className="marketing-order-page__subtitle">{partyView.arrival.arrivalNumber}</p>
            </div>
          </div>
        </div>

        <section className="order-sheet-card">
          <header className="order-sheet-header">
            <div className="order-sheet-header__main">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                <TrainFront className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="order-sheet-header__text">
                <div className="order-sheet-header__title-row">
                  <span className="order-sheet-header__product">{partyProductLabel(partyView)}</span>
                </div>
                <span className="order-sheet-header__code">{partyView.arrival.arrivalNumber}</span>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {partyDateLabel(partyView.arrival)} · {partyView.wagons.length} ta vagon
                </p>
              </div>
            </div>
            <div className="order-sheet-header__aside">
              <PartyStatusPills counts={partyView.counts} />
            </div>
          </header>

          <div className="order-sheet-body p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="admin-dash-section-title !mb-0">Partiya vagonlari</h3>
              <div className="flex flex-wrap items-center gap-2">
                {selectableWagons.length > 0 ? (
                  <>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                      {selectedCards.length} ta tanlandi
                    </span>
                    {selectedCards.length > 0 ? (
                      <button type="button" className={TABLE_ROW_BTN_SECONDARY} onClick={() => setSelectedIds(new Set())}>
                        Tanlovni tozalash
                      </button>
                    ) : null}
                    {selectedReady.length > 0 ? (
                      <button
                        type="button"
                        className={TABLE_ROW_BTN_PRIMARY}
                        disabled={anyBusy}
                        onClick={() => setActionConfirmTarget({ action: 'start', cards: selectedReady })}
                      >
                        <Play className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                        {busyKey === 'selected-start' ? 'Yuklash boshlanmoqda...' : `Tanlanganlarni yuklashni boshlash (${selectedReady.length})`}
                      </button>
                    ) : null}
                    {selectedLoading.length > 0 ? (
                      <button
                        type="button"
                        className={TABLE_ROW_BTN_PRIMARY}
                        disabled={anyBusy}
                        onClick={() => setActionConfirmTarget({ action: 'complete', cards: selectedLoading })}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                        {busyKey === 'selected-complete' ? 'Tugatilmoqda...' : `Tanlanganlarni tugatish (${selectedLoading.length})`}
                      </button>
                    ) : null}
                    {selectedLoaded.length > 0 ? (
                      <button
                        type="button"
                        className={TABLE_ROW_BTN_PRIMARY}
                        disabled={anyBusy}
                        onClick={() => setActionConfirmTarget({ action: 'sendToScale', cards: selectedLoaded })}
                      >
                        <Send className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                        {busyKey === 'selected-sendToScale' ? 'Taroziga jo‘natilmoqda...' : `Tanlanganlarni taroziga jo‘natish (${selectedLoaded.length})`}
                      </button>
                    ) : null}
                    {isAdmin && selectedCards.length > 0 ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition-colors"
                        disabled={anyBusy}
                        onClick={() => openBulkRollback(selectedCards)}
                        title="Faqat Admin: Tanlangan vagonlarni avvalgi bosqichga qaytarish"
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                        Orqaga qaytarish ({selectedCards.length})
                      </button>
                    ) : null}
                  </>
                ) : null}
                <span className="admin-role-badge admin-role-badge--emerald">{partyView.wagons.length} ta</span>
              </div>
            </div>

            <div className="thub-table-wrap reestr-table-wrap">
              <table className="thub-table reestr-table reestr-table--compact">
                <thead>
                  <tr>
                    {selectableWagons.length > 0 ? (
                      <th className="!w-12 text-center">
                        <input
                          type="checkbox"
                          aria-label="Barcha vagonlarni tanlash"
                          checked={selectableWagons.length > 0 && selectedCards.length === selectableWagons.length}
                          onChange={event => event.target.checked ? selectAllVisible() : setSelectedIds(new Set())}
                          className="size-4 rounded border-slate-300 accent-blue-600"
                        />
                      </th>
                    ) : null}
                    <th>№</th>
                    <th>Vagon</th>
                    <th>Mahsulot</th>
                    <th>Sana / vaqt</th>
                    <th>Yuklash guruhi</th>
                    <th>Holat</th>
                    <th className="text-center">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {partyView.wagons.map((card, idx) => {
                    const meta = statusMeta(card, registeredWagons);
                    const key = cardKey(card);
                    return (
                      <tr key={key}>
                        {selectableWagons.length > 0 ? (
                          <td className="text-center">
                            {isSelectableUnit(card.unit) ? (
                              <input
                                type="checkbox"
                                aria-label={`${card.unit.wagonNumber} vagonini tanlash`}
                                checked={selectedIds.has(card.unit.id)}
                                onChange={() => toggleSelected(card.unit.id)}
                                className="size-4 rounded border-slate-300 accent-blue-600"
                              />
                            ) : null}
                          </td>
                        ) : null}
                        <td className="thub-mono reestr-num">{idx + 1}</td>
                        <td>
                          <span className="thub-table__code">{card.unit.wagonNumber}</span>
                        </td>
                        <td>{card.unit.productType?.trim() || card.arrival.productType?.trim() || '—'}</td>
                        <td className="whitespace-nowrap tabular-nums">{wagonEventDateTime(card)}</td>
                        <td>
                          {card.unit.loadingBatchNumber ? (
                            <span className="rounded-lg bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              {card.unit.loadingBatchNumber}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className={`notify-dept-pill notify-dept-pill--${meta.tone}`}>
                              <span className="notify-dept-pill__dot" />
                              {meta.text}
                            </span>
                            <FlagBadge unit={card.unit} />
                          </span>
                        </td>
                        <td className="text-center">{renderActions(card)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        {dialogs}
        </div>
      </div>
    );
  }

  return (
    <div className="thub reestr">
      {queueError && <p role="alert" className="mb-3 text-sm text-red-600">{queueError}</p>}
      <div className="space-y-5">
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            {fromQuery ? (
              <ProductDetailBackButton onClick={() => navigate(fromQuery)} />
            ) : null}
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">Estakadaga qo‘yish va yuklash</h2>
              <p className="marketing-order-page__subtitle">TM va XA sexi: Vagonlarni yuklash operatsiyalari</p>
            </div>
          </div>
          <div className="marketing-order-page__bar-actions flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
              onClick={() => {
                setInternalError('');
                setWagonInputError('');
                setCurrentWagonInput('');
                setCurrentLoadState(WAGON_INTAKE_LOAD_STATE.Bosh);
                setInternalWagonList([]);
                setShowAddInternalModal(true);
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Ichki vagon qo‘shish
            </button>
            <button
              type="button"
              className="btn-secondary !text-xs !py-1.5 !px-3 inline-flex items-center gap-1.5 font-medium"
              onClick={() => load()}
              title="Ma'lumotlarni yangilash"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
              Yangilash
            </button>
          </div>
        </div>

        <HubZoneTabs
          items={TABS.map(tab => ({ ...tab, count: `${tabCounts[tab.id]} ta` }))}
          value={activeTab}
          onChange={tab => {
            setActiveTab(tab);
            setSelectedIds(new Set());
          }}
          columns={4}
          label="Yuklash holatlari"
        />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="admin-dash-section-title !mb-0">Vagonlar fondi</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {activeTab === 'exit'
                  ? 'Ushbu vagonlar yuklanib, plombalangan. Zavoddan chiqarish uchun Yuk xati shakllantirish bo‘limiga o‘ting.'
                  : activeTab === 'done'
                  ? 'Yuklash tugallangan, brutto/tara tarozisi va plombalash jarayonidagi vagonlar.'
                  : activeTab === 'loading'
                  ? 'Hozirda yuklash jarayoni ketayotgan vagonlar.'
                  : 'Kirish hujjatidan mustaqil ravishda kerakli vagonlarni tanlang va yuklashni boshlang.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'exit' ? (
                <button
                  type="button"
                  onClick={() => navigate('/registry/create')}
                  className="btn-primary !text-sm !font-bold inline-flex items-center gap-2 !py-2 !px-4 rounded-xl shadow-xs cursor-pointer"
                  title="Yuk xatini shakllantirish bo‘limiga o‘tish"
                >
                  <FileText className="w-4 h-4 shrink-0" strokeWidth={2.2} />
                  <span className="font-bold text-sm tracking-tight">Yuk xati shakllantirishga o‘tish</span>
                </button>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">{selectedCards.length} ta tanlandi</span>
                  {selectedCards.length > 0 ? (
                    <button type="button" className={TABLE_ROW_BTN_SECONDARY} onClick={() => setSelectedIds(new Set())}>
                      Tanlovni tozalash
                    </button>
                  ) : null}
                  {selectedReady.length > 0 ? (
                    <button
                      type="button"
                      className={TABLE_ROW_BTN_PRIMARY}
                      disabled={anyBusy}
                      onClick={() => setActionConfirmTarget({ action: 'start', cards: selectedReady })}
                    >
                      <Play className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      Tanlanganlarni yuklashni boshlash ({selectedReady.length})
                    </button>
                  ) : null}
                  {selectedLoading.length > 0 ? (
                    <button
                      type="button"
                      className={TABLE_ROW_BTN_PRIMARY}
                      disabled={anyBusy}
                      onClick={() => setActionConfirmTarget({ action: 'complete', cards: selectedLoading })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      Tanlanganlarni tugatish ({selectedLoading.length})
                    </button>
                  ) : null}
                  {selectedLoaded.length > 0 ? (
                    <button
                      type="button"
                      className={TABLE_ROW_BTN_PRIMARY}
                      disabled={anyBusy}
                      onClick={() => setActionConfirmTarget({ action: 'sendToScale', cards: selectedLoaded })}
                    >
                      <Send className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      Tanlanganlarni taroziga jo‘natish ({selectedLoaded.length})
                    </button>
                  ) : null}
                  {isAdmin && selectedCards.length > 0 ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition-colors"
                      disabled={anyBusy}
                      onClick={() => openBulkRollback(selectedCards)}
                      title="Faqat Admin: Tanlangan vagonlarni avvalgi bosqichga qaytarish"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                      Orqaga qaytarish ({selectedCards.length})
                    </button>
                  ) : null}
                </>
              )}
              <span className="admin-role-badge admin-role-badge--emerald">{poolWagons.length} ta</span>
            </div>
          </div>

          {activeTab === 'exit' && poolWagons.length > 0 ? (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Yuklash yakunlangan:</strong> Ushbu vagonlar yuklanib, tarozidan o‘tgan va plombalangan. Chiqarish uchun <strong>Yuk xati (Reestr)</strong> rasmiylashtirilishi kerak.
              </span>
            </div>
          ) : null}

          {loading ? (
            <div className="thub-empty">
              <p className="thub-empty__title">Yuklanmoqda...</p>
            </div>
          ) : poolWagons.length === 0 ? (
            <div className="thub-empty">
              <TrainFront className="w-10 h-10 mx-auto text-gray-300 dark:text-slate-600 mb-2" strokeWidth={1.5} />
              <p className="thub-empty__title">Vagon yo‘q</p>
              <p className="thub-empty__text">Hozircha yuklash uchun vagon mavjud emas.</p>
            </div>
          ) : activeTab === 'ready' ? (
            <ReadyWagonGroups
              cards={poolWagons}
            selectedIds={selectedIds}
            onSelect={(ids, selected) => setSelectedIds(current => {
              const next = new Set(current);
              ids.forEach(id => { if (selected) next.add(id); else next.delete(id); });
              return next;
            })}
            isSelectable={isSelectableUnit}
            renderActions={renderActions}
            renderFlag={unit => <FlagBadge unit={unit} />}
            formatDate={wagonEventDateTime}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        ) : (
          <div className="thub-table-wrap reestr-table-wrap">
            <table className="thub-table reestr-table reestr-table--compact docs-hub-table loading-wagons-table">
              <thead>
                <tr>
                  <th className="col-check !w-12 text-center">
                    <input
                      type="checkbox"
                      aria-label="Barcha amaldagi vagonlarni tanlash"
                      checked={selectableWagons.length > 0 && selectedCards.length === selectableWagons.length}
                      onChange={event => event.target.checked ? selectAllVisible() : setSelectedIds(new Set())}
                      className="size-4 rounded border-slate-300 accent-blue-600"
                    />
                  </th>
                  <th className="col-num !w-14 text-center">№</th>
                  <th
                    className="whitespace-nowrap px-3 cursor-pointer select-none hover:text-blue-600 transition-colors"
                    onClick={() => handleSort('date')}
                    title="Sana va vaqt bo'yicha tartiblash"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Sana / vaqt</span>
                      {sortField === 'date' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="size-3.5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-blue-600 dark:text-blue-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </th>
                  <th
                    className="whitespace-nowrap px-3 cursor-pointer select-none hover:text-blue-600 transition-colors"
                    onClick={() => handleSort('batch')}
                    title="Hujjat raqami bo'yicha tartiblash"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Hujjat raqami</span>
                      {sortField === 'batch' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="size-3.5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-blue-600 dark:text-blue-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </th>
                  <th
                    className="whitespace-nowrap px-3 cursor-pointer select-none hover:text-blue-600 transition-colors"
                    onClick={() => handleSort('wagonNumber')}
                    title="Vagon raqami bo'yicha tartiblash"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Vagon raqami</span>
                      {sortField === 'wagonNumber' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="size-3.5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-blue-600 dark:text-blue-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </th>
                  <th className="whitespace-nowrap px-3">Vagon turi</th>
                  <th className="px-3 min-w-[140px]">Mahsulot</th>
                  {activeTab === 'exit' ? (
                    <>
                      <th className="col-weight !w-20 whitespace-nowrap">Tara</th>
                      <th className="col-weight !w-20 whitespace-nowrap">Brutto</th>
                      <th className="col-weight !w-20 whitespace-nowrap">Netto</th>
                      <th className="whitespace-nowrap px-3">Plomba</th>
                    </>
                  ) : null}
                  {activeTab !== 'done' ? (
                    <th className="whitespace-nowrap px-3">Holat</th>
                  ) : null}
                  {activeTab !== 'exit' ? (
                    <th className="whitespace-nowrap px-4 text-center">Amallar</th>
                  ) : (
                    <th className="whitespace-nowrap px-4 text-center">Yuk xati</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {poolWagons.map((card, idx) => {
                  const meta = statusMeta(card, registeredWagons);
                  return (
                    <tr key={cardKey(card)}>
                      <td className="col-check !w-12 text-center">
                        {isSelectableUnit(card.unit) ? (
                          <input
                            type="checkbox"
                            aria-label={`${card.unit.wagonNumber} vagonini tanlash`}
                            checked={selectedIds.has(card.unit.id)}
                            onChange={() => toggleSelected(card.unit.id)}
                            className="size-4 rounded border-slate-300 accent-blue-600"
                          />
                        ) : null}
                      </td>
                      <td className="col-num thub-mono reestr-num !w-14 text-center">{idx + 1}</td>
                      <td className="whitespace-nowrap tabular-nums px-3 text-slate-600 dark:text-slate-300">{wagonEventDateTime(card)}</td>
                      <td className="whitespace-nowrap px-3">
                        {card.arrival.arrivalNumber ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                            {card.arrival.arrivalNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="thub-table__code font-mono font-bold text-slate-900 dark:text-white">{card.unit.wagonNumber}</span>
                          <FlagBadge unit={card.unit} />
                        </span>
                        {card.unit.cisternNumber ? (
                          <div className="text-[11px] font-mono font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                            {card.unit.cisternNumber}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3">{wagonTypeLabel(card.unit)}</td>
                      <td className="px-3 text-slate-800 dark:text-slate-100">{card.unit.productType?.trim() || card.arrival.productType?.trim() || 'Tanlanmagan'}</td>
                      {activeTab === 'exit' ? (
                        <>
                          <td className="col-weight !w-20 tabular-nums text-center text-slate-700 dark:text-slate-200">
                            {String(card.unit.tareWeight || '').trim() || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="col-weight !w-20 tabular-nums text-center text-slate-700 dark:text-slate-200">
                            {String(card.unit.grossWeight || '').trim() || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="col-weight !w-20 tabular-nums font-semibold text-center text-emerald-600 dark:text-emerald-400">
                            {nettoWeightOf(card.unit.nettoWeight, card.unit.tareWeight, card.unit.grossWeight) || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="text-center px-2 py-2">
                            {Boolean(card.unit.sealNumber != null && String(card.unit.sealNumber).trim()) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80">
                                {String(card.unit.sealNumber).trim()}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </>
                      ) : null}
                      {activeTab !== 'done' ? (
                        <td className="whitespace-nowrap px-3">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className={`notify-dept-pill notify-dept-pill--${meta.tone}`}>
                              <span className="notify-dept-pill__dot" />
                              {meta.text}
                            </span>
                            <FlagBadge unit={card.unit} />
                          </span>
                        </td>
                      ) : null}
                      {activeTab !== 'exit' ? (
                        <td className="whitespace-nowrap px-3 text-center">{renderActions(card)}</td>
                      ) : (
                        <td className="whitespace-nowrap px-3 text-center">
                          <button
                            type="button"
                            onClick={() => navigate(`/registry/create?arrivalId=${card.arrival.id}`)}
                            className="btn-secondary !text-xs !py-1 !px-2.5 inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            title="Ushbu vagon partiyasi uchun Yuk xati yaratishga o‘tish"
                          >
                            <FileText className="h-3 w-3" />
                            Yuk xatiga
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialogs}
      </div>
    </div>
  );
}
