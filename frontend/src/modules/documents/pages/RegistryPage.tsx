import { isReadyForWaybill, registeredVisitKeys } from '../../../shared/utils/wagonQueueState';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Columns,
  Database,
  FileCheck2,
  FileText,
  Layers,
  Lock,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  Stamp,
  TrainFront,
  Trash2,
  Undo2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry, LoadingTask, MonthlyOrder } from '../../../shared/types';
import { YukXatiView } from '../../../shared/components/YukXatiView';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { DocumentChipButton } from '../../../shared/components/DocumentPackChip';
import { OrderSheetMenu } from '../../../shared/components/OrderSheetMenu';
import { WagonEntryPermitView } from '../../../shared/components/WagonEntryPermitView';
import { toLatinProductName } from '../../../shared/utils/cyrillicToLatin';
import { PartyProductsSummary, PartyWagonKindsSummary } from '../../../shared/components/PartyTableSummaries';
import { isWagonKind, type WagonKind } from '../../../shared/utils/wagonKinds';
import { notifyOrdersChanged, startAutoRefresh, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { buildYukXatiModel, isYukXatiPrintReady, type YukXatiModel } from '../../../shared/utils/yukXatiModel';
import { printYukXati } from '../../../shared/utils/yukXatiPrint';
import { DocumentPrintButton } from '../../../shared/components/DocumentPrintButton';
import {
  blocksNextRegistry,
  isRegistryWorkflowLocked,
  usesSequentialWorkflow,
  isRegistryReturned,
  needsShiftApproval,
  needsPermitAgreement,
  needsSecurityAgreement,
  registryRejectionSummary,
  getRegistryPendingActionInfo,
} from '../../../shared/utils/registryWorkflow';
import { LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';
import { excludeOneCOrders } from '../../../shared/utils/oneCSources';
import { defectActDisplayName, hasDefectAct, resolveDefectActType, type DefectActType } from '../../../shared/constants/defectActTypes';
import { DefectActView } from '../../../shared/components/DefectActView';
import { buildDefectActModel } from '../../../shared/utils/defectActModel';
import type { EmptyWagonUnit } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DocsHubToolbar } from '../../../shared/components/DocsHubToolbar';
import { DocsHubPagination } from '../../../shared/components/DocsHubPagination';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { formatDateDisplay } from '../../../shared/utils/dates';
import { useDocsHubQuery } from '../../../shared/hooks/useDocsHubQuery';
import { formatDateTimeDisplay } from '../../../shared/utils/dates';
import {
  docsDateInRange,
  docsDateKey,
  docsMatchesSearch,
  paginateItems,
} from '../../../shared/utils/docsHubFilter';

type ModalMode =
  | 'create'
  | 'edit'
  | 'economist-permit'
  | 'economist-security'
  | 'permit'
  | 'security'
  | 'shift'
  | 'send'
  | 'handover'
  | null;

type RegistryActionConfirm =
  | { kind: 'shift' }
  | { kind: 'economist-permit' }
  | { kind: 'economist-security' }
  | { kind: 'permit' }
  | { kind: 'security' }
  | { kind: 'send' }
  | { kind: 'handover' }
  | { kind: 'annex-approve' }
  | { kind: 'annex-return' };

type RegZone = 'create' | 'agree' | 'docs' | 'done';

type WagonRow = {
  sealConfirmedByScaleAt?: string | null;
  sealConfirmedBySecurityAt?: string | null;
  scaleExitedAt?: string | null;
  id: string;
  wagonNumber: string;
  cisternNumber: string;
  wagonType: string;
  product: string;
  tare: string;
  brutto: string;
  netto: string;
  sealNumber?: string;
  status: string;
  loadingComment: string;
  defectActFileName: string;
  defectActNumber: string;
  loadingBatchNumber: string;
  loadingCompletedAt: string;
};

type PooledWagonRow = WagonRow & {
  arrivalId: string;
  arrivalNumber: string;
  arrivalDate: string;
};

type OutgoingDraftGroup = {
  key: string;
  partyNumber: string;
  date: string;
  rows: PooledWagonRow[];
};

function pooledWagonKey(row: Pick<PooledWagonRow, 'arrivalId' | 'id' | 'wagonNumber'>): string {
  return `${row.arrivalId}:${row.id || row.wagonNumber}`;
}

function outgoingPartyNumber(batchNumber: string, date: string): string {
  const batch = String(batchNumber || "").trim();
  if (/^WB-\d{4}-\d{3,}/i.test(batch)) return batch.toUpperCase();
  if (/^OB-\d{4}-\d{3,}/i.test(batch)) return batch.toUpperCase().replace(/^OB-/, 'WB-');
  const d = date ? new Date(date) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const mmyy = `${String(validDate.getMonth() + 1).padStart(2, '0')}${String(validDate.getFullYear()).slice(-2)}`;
  return `WB-${mmyy}-001`;
}

function nettoWeightOf(netto?: string | number | null, tare?: string | number | null, brutto?: string | number | null): string {
  if (netto != null && String(netto).trim()) return String(netto).trim();
  const parse = (value?: string | number | null) => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const normalized = String(value || '').replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const tareValue = parse(tare);
  const bruttoValue = parse(brutto);
  if (tareValue == null || bruttoValue == null) return '';
  return String(Math.max(0, Math.round((bruttoValue - tareValue) * 1000) / 1000));
}


function parseCsvList(value?: string | null): string[] {
  return (value || '')
    .split(/[,;|\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseSealNumbers(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[/,;|\s]+/)
    .map(s => s.trim())
    .filter(s => Boolean(s) && /[0-9A-Za-z]/.test(s));
}

function parseWeightMap(raw?: string | null): Map<string, string> {
  const map = new Map<string, string>();
  const text = (raw || '').trim();
  if (!text) return map;
  for (const part of text.split(/[,;]/).map(p => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.+?)\s*[:=]\s*(.+)$/);
    if (m) map.set(m[1].trim(), m[2].trim());
  }
  return map;
}


function sameProduct(a?: string | null, b?: string | null): boolean {
  const normalize = (v?: string | null) => {
    const s = (v || '').trim().toLowerCase();
    if (!s) return '';
    if (s.includes('suyultirilgan') || s.includes('propan') || s.includes('butan') || s.includes('lpg') || s.includes('spbt')) return 'lpg';
    if (s.includes('polietilen') || s.includes('etilen') || s.includes('pe')) return 'polietilen';
    if (s.includes('oltingugurt') || s.includes('sulfur') || s.includes('ol')) return 'oltingugurt';
    if (s.includes('kondensat') || s.includes('gk')) return 'kondensat';
    if (s.includes('buten') || s.includes('b1')) return 'buten';
    return s;
  };
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right;
}

function getMatchingActiveOrders(
  orders: MonthlyOrder[],
  wagonProduct?: string | null,
  currentOrderId?: string | null,
): MonthlyOrder[] {
  return orders.filter(order => {
    // Yopilgan (Completed) yoki boshqa nofaol buyurtmalar yangi biriktirish uchun chiqmasin
    const isAvailable = order.status === 'Active' || (Boolean(currentOrderId) && order.id === currentOrderId);
    if (!isAvailable) return false;

    // Mahsulot turi bo'yicha qat'iy tekshiruv
    return sameProduct(order.productType, wagonProduct);
  });
}

function wagonTypeText(value?: string | null): string {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return '—';
  if (normalized.includes('cistern') || normalized.includes('sisterna')) return 'Vagon-sisterna';
  if (normalized.includes('closed') || normalized.includes('yopiq')) return 'Yopiq turdagi vagon';
  if (normalized.includes('fitting') || normalized.includes('platform')) return 'Fiting platforma';
  return value || '—';
}

function isCreateHealthy(row: WagonRow): boolean {
  return !row.scaleExitedAt && isReadyForWaybill({ status: row.status, tareWeight: row.tare, grossWeight: row.brutto,
    sealNumber: row.sealNumber || '', sealConfirmedByScaleAt: row.sealConfirmedByScaleAt || null,
    sealConfirmedBySecurityAt: row.sealConfirmedBySecurityAt || null, defectActNumber: row.defectActNumber || null });
}

function formatEmptyWagonStatus(status?: string): { label: string; tone: string } {
  const s = (status || '').trim();
  switch (s) {
    case 'Estakada':
      return { label: 'Estakadada (Yuklanmagan)', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };
    case 'ToRailwayScale':
      return { label: 'Tarozi kutmoqda (Bo‘sh)', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' };
    case 'AwaitingTare':
      return { label: 'Tara o‘lchash kutilmoqda', tone: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' };
    case 'Tared':
      return { label: 'Tara olingan (Bo‘sh)', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' };
    case 'ReadyForEstakada':
      return { label: 'Estakadaga tayyor', tone: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' };
    case 'Returned':
      return { label: 'Bo‘sh chiqarishga tayyor', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
    case 'Loading':
      return { label: 'Estakadada (Bo‘sh)', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };
    case 'Loaded':
      return { label: 'Yuk ortilmagan (Bo‘sh)', tone: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' };
    case 'Cancelled':
      return { label: 'Bekor qilingan', tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' };
    default:
      return { label: 'Bo‘sh vagon', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };
  }
}

function isWagonLoaded(row: WagonRow): boolean {
  // Qat'iy qoida: Agar tarasi olinmagan yoki brutto/netto chiqmagan bo'lsa - DEMAK U BO'SH!
  // Faqat haqiqatda yuk ortilgan (plomba bor yoki netto > 0 yoki brutto > tare) bo'lsagina - yuklangan!
  if (row.sealNumber && String(row.sealNumber).trim() && String(row.sealNumber).trim() !== '—') {
    return true;
  }
  const net = Number(String(row.netto || '').replace(',', '.'));
  if (!isNaN(net) && net > 0) {
    return true;
  }
  if (row.brutto && row.tare && row.brutto !== '—' && row.tare !== '—') {
    const b = Number(String(row.brutto).replace(',', '.'));
    const t = Number(String(row.tare).replace(',', '.'));
    if (!isNaN(b) && !isNaN(t) && b > t) {
      return true;
    }
  }
  return false;
}


function isCreateDefective(row: WagonRow): boolean {
  return row.status === 'Returned' && !row.scaleExitedAt;
}

function isAwaitingSeal(row: WagonRow): boolean {
  return !row.scaleExitedAt
    && row.status !== 'Returned'
    && !row.sealNumber?.trim()
    && Number((row.netto || '').replace(',', '.')) > 0;
}

function wagonRowsOf(task: LoadingTask | EmptyWagonArrival): WagonRow[] {
  if (task.wagons && task.wagons.length > 0) {
    return [...task.wagons]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(u => {
        const tare = u.tareWeight && u.tareWeight !== '—' ? u.tareWeight : '';
        const brutto = u.grossWeight && u.grossWeight !== '—' ? u.grossWeight : '';
        const netto = nettoWeightOf(u.nettoWeight, tare, brutto);
        const seal = u.sealNumber && u.sealNumber !== '—' ? u.sealNumber : '';
        return {
          id: u.id,
          wagonNumber: u.wagonNumber,
          cisternNumber: u.wagonType?.toLowerCase() === 'platform' ? (u.cisternNumber || '') : '',
          wagonType: u.wagonType || '',
          product: toLatinProductName(u.productType || task.productType) || u.productType || task.productType || 'Suyultirilgan gaz',
          tare,
          brutto,
          netto,
          sealNumber: seal,
          sealConfirmedByScaleAt: u.sealConfirmedByScaleAt,
          sealConfirmedBySecurityAt: u.sealConfirmedBySecurityAt,
          scaleExitedAt: u.scaleExitedAt,
          status: u.status,
          loadingComment: u.loadingComment || '',
          defectActFileName: u.defectActFileName || '',
          defectActNumber: u.defectActNumber || '',
          loadingBatchNumber: u.loadingBatchNumber || '',
          loadingCompletedAt: u.loadingCompletedAt || u.grossWeighedAt || u.tareWeighedAt || '',
        };
      });
  }
  const nums = parseCsvList(task.wagonNumbers);
  const tares = parseWeightMap(task.tareWeight);
  const bruttos = parseWeightMap(task.grossWeight);
  return nums.map(wagonNumber => ({
    id: wagonNumber,
    wagonNumber,
    // Wagon turi noma’lum legacy yozuvda konteynerni taxminan vagonga biriktirmaymiz.
    cisternNumber: '',
    wagonType: '',
    product: toLatinProductName(task.productType) || task.productType || 'Suyultirilgan gaz',
    tare: tares.get(wagonNumber) || '',
    brutto: bruttos.get(wagonNumber) || '',
    netto: nettoWeightOf(null, tares.get(wagonNumber), bruttos.get(wagonNumber)),
    status: task.stage === 'Sealed' ? 'Sealed' : '',
    loadingComment: '',
    defectActFileName: '',
    defectActNumber: '',
    loadingBatchNumber: '',
    loadingCompletedAt: task.loadingCompletedAt || '',
  }));
}

function isFullyAgreed(r: LoadingRegistry): boolean {
  return (
    r.isEconomistApprovedWithPermit
    && r.isEconomistApprovedWithSecurity
    && r.isApprovedByPermit
    && r.isApprovedBySecurity
  );
}

function registryZone(r: LoadingRegistry): Exclude<RegZone, 'create'> {
  if (r.exitedToKengsoyAt && r.isSentToOneC && r.isSentToENakl) return 'done';
  if (isFullyAgreed(r)) return 'docs';
  return 'agree';
}

function registryStatusText(r: LoadingRegistry): string {
  if (isRegistryReturned(r)) return 'Qaytarilgan';
  if (r.exitedToKengsoyAt) {
    return 'Kengsoyga chiqarildi';
  }
  const zone = registryZone(r);
  if (zone === 'agree') {
    if (r.isApprovedByPermit && !r.isApprovedBySecurity) {
      return 'Ruxsatnoma kelishgan · Qo‘riqlash kutilmoqda';
    }
    if (r.isApprovedByPermit && r.isApprovedBySecurity) {
      return 'Kelishilgan';
    }
    return r.isApprovedByShiftSupervisor ? 'Kelishuv kutilmoqda' : 'ICHDX smena boshlig‘i tasdig‘i kutilmoqda';
  }
  if (zone === 'docs') {
    if (!r.exitedToKengsoyAt) return 'Vagonlarni olib chiqish kutilmoqda';
    if (!r.isSentToOneC || !r.isSentToENakl) return '1C / e-nakl kutilmoqda';
    return 'Chiqish rasmiylashtirilmoqda';
  }
  return 'Yakunlangan';
}

function registryStatusClass(r: LoadingRegistry): string {
  if (isRegistryReturned(r)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
  }
  if (r.exitedToKengsoyAt || registryZone(r) === 'done') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  if (!r.isSentToOneC || !r.isSentToENakl) {
    return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
  }
  if (r.isApprovedByPermit && !r.isApprovedBySecurity) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  }
  if (r.isApprovedByPermit && r.isApprovedBySecurity) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
}

function WagonUnitsPanel({ rows, compact = false }: { rows: WagonRow[]; compact?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Vagon ro‘yxati yo‘q</p>;
  }
  return (
    <div className={`reghub-wagons${compact ? ' reghub-wagons--compact' : ' reghub-wagons--detail'}`}>
      {compact ? (
        <div className="reghub-wagons__head">
          <strong>Vagonlar</strong>
          <em>{rows.length} ta</em>
        </div>
      ) : null}
      <div className="reghub-wagons__scroll">
        <table className="reghub-wagons__table">
          <thead>
            <tr>
              <th>№</th>
              <th>Vagon raqami</th>
              <th>Konteynerlar</th>
              <th>Mahsulot</th>
              <th>Tara (t)</th>
              {!compact ? <><th>Brutto (t)</th><th>Netto (t)</th></> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.wagonNumber}-${i}`}>
                <td className="tabular-nums text-slate-400">{i + 1}</td>
                <td className="reghub-wagons__num">{row.wagonNumber}</td>
                <td className="tabular-nums text-slate-500">{row.cisternNumber || '—'}</td>
                <td className="font-medium text-slate-700 dark:text-slate-200">{row.product || '—'}</td>
                <td className="tabular-nums font-medium">{row.tare || '—'}</td>
                {!compact ? (
                  <>
                    <td className="tabular-nums text-slate-700 dark:text-slate-200">{row.brutto || '—'}</td>
                    <td className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{row.netto || '—'}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RegistryPage() {
  const { user } = useAuth();
  const { can, role: rbacRole } = useRbacPermission();
  const role = user?.role || rbacRole || '';
  const position = user?.position || '';
  const department = user?.department || '';
  const isAdmin = role.toLowerCase() === 'admin' || role === 'Admin' || /admin/i.test(role);
  const location = useLocation();
  const navigate = useNavigate();
  const isCreateHub = location.pathname === '/registry/create' || location.pathname.endsWith('/registry/create');
  const isApproveHub = location.pathname === '/registry/approve' || location.pathname.endsWith('/registry/approve');
  const isPermitAgreeHub = location.pathname === '/registry/agree/permit' || location.pathname.endsWith('/registry/agree/permit');
  const isSecurityAgreeHub = location.pathname === '/registry/agree/security' || location.pathname.endsWith('/registry/agree/security');
  const isRegistryWorkHub = isCreateHub || isApproveHub || isPermitAgreeHub || isSecurityAgreeHub;
  const [searchParams, setSearchParams] = useSearchParams();
  const arrivalIdFromQuery = searchParams.get('arrivalId');
  const yxFromQuery = searchParams.get('yx');
  const expandedFromQuery = searchParams.get('expanded');
  const zoneFromQuery = searchParams.get('zone');
  const fromQuery = searchParams.get('from') || (location.state as any)?.from;
  const preselectedWagons = (location.state as any)?.selectedWagons as string[] | undefined;

  const [loadingTasks, setLoadingTasks] = useState<LoadingTask[]>([]);
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [preparationChecked, setPreparationChecked] = useState(false);
  const [unfinishedRegistry, setUnfinishedRegistry] = useState<LoadingRegistry | null>(null);
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(() => expandedFromQuery);
  const ignoreExpandedQuery = useRef(false);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalTask, setModalTask] = useState<LoadingTask | null>(null);
  const [modalRegistry, setModalRegistry] = useState<LoadingRegistry | null>(null);
  const [registryNumber, setRegistryNumber] = useState('');
  const [wagonOrderIds, setWagonOrderIds] = useState<Record<string, string>>({});
  const [wagonRouteLines, setWagonRouteLines] = useState<Record<string, string>>({});
  const [selectedWagons, setSelectedWagons] = useState<Record<string, boolean>>({});
  const [modalWagonKeys, setModalWagonKeys] = useState<string[]>([]);
  const [securityApproved, setSecurityApproved] = useState(true);
  const [permitApproved, setPermitApproved] = useState(true);
  const [comment, setComment] = useState('');
  const [modalError, setModalError] = useState('');
  const [draftActionError, setDraftActionError] = useState('');
  const [draftActionSuccess, setDraftActionSuccess] = useState('');
  const [isDraftSubmitting, setIsDraftSubmitting] = useState(false);
  const [draftAttachedDefectKeys, setDraftAttachedDefectKeys] = useState<Record<string, string[]>>({});
  const [draftAttachedBufferKeys, setDraftAttachedBufferKeys] = useState<Record<string, string[]>>({});
  const [selectedDraftWagonKeys, setSelectedDraftWagonKeys] = useState<Record<string, boolean>>({});
  const [isDefectPickerOpen, setIsDefectPickerOpen] = useState(false);
  const [selectedPickerDefectKeys, setSelectedPickerDefectKeys] = useState<string[]>([]);
  const [isBufferPickerOpen, setIsBufferPickerOpen] = useState(false);
  const [selectedPickerBufferKeys, setSelectedPickerBufferKeys] = useState<string[]>([]);

  // Bo'sh / Yuklanmagan vagonlarni chiqarish holati
  const [isEmptyDispatchOpen, setIsEmptyDispatchOpen] = useState(false);
  const [emptySelectedWagonKeys, setEmptySelectedWagonKeys] = useState<Set<string>>(new Set());
  const [emptyDocType, setEmptyDocType] = useState('Xizmat xati');
  const [emptyDocNumber, setEmptyDocNumber] = useState('');
  const [emptyReason, setEmptyReason] = useState('Buyurtma bekor qilingan (Mahsulotsiz)');
  const [emptyComment, setEmptyComment] = useState('');
  const [emptySearch, setEmptySearch] = useState('');
  const [emptySubmitting, setEmptySubmitting] = useState(false);
  const [emptyError, setEmptyError] = useState('');
  const [emptyAttachedFileName, setEmptyAttachedFileName] = useState('');

  // Dual Window (Ikki oynali vagon tanlash) state
  const [draftViewMode, setDraftViewMode] = useState<'dual' | 'table'>('dual');
  const [dualSearch, setDualSearch] = useState('');
  const [dualFilter, setDualFilter] = useState<'all' | 'sealed' | 'empty' | 'defective'>('all');
  const [dualLeftSelectedKeys, setDualLeftSelectedKeys] = useState<string[]>([]);
  const [dualRightSelectedKeys, setDualRightSelectedKeys] = useState<string[]>([]);
  const [batchAssignOrderId, setBatchAssignOrderId] = useState('');
  const [batchAssignLineId, setBatchAssignLineId] = useState('');
  const userClosedDraft = useRef(false);

  const [previewModel, setPreviewModel] = useState<YukXatiModel | null>(null);
  const [previewRegistry, setPreviewRegistry] = useState<LoadingRegistry | null>(null);
  const [, setPreviewLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editRegistryNumber, setEditRegistryNumber] = useState('');
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionSaving, setRevisionSaving] = useState(false);
  const [revisionError, setRevisionError] = useState('');

  const [isEditingRegistry, setIsEditingRegistry] = useState(false);
  const [editLoadingRegistryNumber, setEditLoadingRegistryNumber] = useState('');
  const [editLoadingRegistryComment, setEditLoadingRegistryComment] = useState('');
  const [selectedEditWagonKeys, setSelectedEditWagonKeys] = useState<Record<string, boolean>>({});
  const [editAttachedDefectKeys, setEditAttachedDefectKeys] = useState<string[]>([]);
  const [editAttachedBufferKeys, setEditAttachedBufferKeys] = useState<string[]>([]);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editActionError, setEditActionError] = useState('');

  const [annexRegistry, setAnnexRegistry] = useState<LoadingRegistry | null>(null);
  const [annexComment, setAnnexComment] = useState('');
  const [annexError, setAnnexError] = useState('');
  const [annexBusy, setAnnexBusy] = useState(false);
  const [annexReturnOpen, setAnnexReturnOpen] = useState(false);
  const [deleteConfirmRegistry, setDeleteConfirmRegistry] = useState<LoadingRegistry | null>(null);
  const [deletingRegistry, setDeletingRegistry] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<RegistryActionConfirm | null>(null);
  const [actionConfirmBusy, setActionConfirmBusy] = useState(false);
  const [entryPermitTarget, setEntryPermitTarget] = useState<EmptyWagonArrival | null>(null);
  const [viewedDefectTarget, setViewedDefectTarget] = useState<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit } | null>(null);

  const openDefectActModal = useCallback((row: { arrivalId?: string; wagonNumber: string }) => {
    let arrival: EmptyWagonArrival | undefined;
    if (row.arrivalId) {
      arrival = arrivals.find(a => a.id === row.arrivalId);
    }
    if (!arrival) {
      arrival = arrivals.find(a => (a.wagons ?? []).some(u => u.wagonNumber === row.wagonNumber));
    }
    if (!arrival) return;
    const unit = (arrival.wagons ?? []).find(u => u.wagonNumber === row.wagonNumber);
    if (!unit) return;
    setViewedDefectTarget({ arrival, unit });
  }, [arrivals]);

  // ICHDX xodimlari: Dispetcher, Smena boshlig'i, Muhandis-texnik, Iqtisodchi, Admin
  const isIchdxUser = Boolean(
    isAdmin
    || /dispatch|dispetch/i.test(role)
    || /econom|iqtisod/i.test(role)
    || /muhandis|texnik|dispetch|iqtisod/i.test(position)
    || /ichdx|ishlab chiqarish|dispetch/i.test(department)
    || can('documents.registry.approve-shift')
    || can('documents.registry.approve-economist')
    || can('documents.registry.create')
    || can('documents.registry.write')
  );

  const isPermitUser = Boolean(
    isAdmin
    || /permit|ruxsat/i.test(role)
    || /ruxsatnoma/i.test(position)
    || /ruxsatnoma/i.test(department)
    || can('documents.registry.approve-permit')
  );

  const isSecurityUser = Boolean(
    isAdmin
    || /security|qo[‘']riq|xavfsiz/i.test(role)
    || /qo[‘']riqlash|xavfsizlik|no[‘']j/i.test(position)
    || /qo[‘']riqlash|xavfsizlik|no[‘']j/i.test(department)
    || can('documents.registry.approve-security')
  );

  const pendingActionInfo = unfinishedRegistry ? getRegistryPendingActionInfo(unfinishedRegistry) : null;
  const sequenceBlockMessage = unfinishedRegistry
    ? `Avval ${unfinishedRegistry.registryNumber} yuk xati siklini yakunlang: ${pendingActionInfo ? pendingActionInfo.detailText : 'vagonlar chiqarilib, yuk xati 1C va E-nakl uchun ro‘yxatdan o‘tkazilishi kerak.'}`
    : '';
  const preparationBlockMessage = !preparationChecked
    ? 'Yuk xatlari holati tekshirilmaguncha chiqishga tayyorlash yopiq. Ma’lumotlarni yangilang.'
    : sequenceBlockMessage;

  const canCreate = isAdmin || isIchdxUser;
  const canEdit = can('documents.registry.update') || isIchdxUser || isAdmin;
  const canDelete = can('documents.registry.delete') || isAdmin;
  const canApprovePermit = isPermitUser || isIchdxUser;
  const canApproveSecurity = isSecurityUser;
  const canApproveShift = isIchdxUser;
  const canSendExternal = can('documents.registry.send-external') || isIchdxUser || isAdmin;
  const canHandover = can('documents.registry.handover') || isAdmin;
  const hub = useDocsHubQuery();

  // 1C tarozi va SHGKM plomba avtomatik tushishi
  const oneCDate = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${d}.${m}.${y}`;
  })();
  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const [registryResult, arrivalResult, taskResult, orderResult, queueResult] = await Promise.all([
        api.getLoadingRegistries(),
        api.getEmptyWagonArrivals(),
        canCreate ? api.getEconomistNotifications().catch(() => ({ success: false, data: [] as LoadingTask[] })) : Promise.resolve(null),
        canCreate ? api.getOrders(LOGISTICS_TYPES.Railway).catch(() => ({ success: false, data: [] as MonthlyOrder[] })) : Promise.resolve(null),
        api.getGateWeighingQueue().catch(() => ({ data: null })),
      ]);
      if (!registryResult.success || !registryResult.data) {
        setPreparationChecked(false);
        return;
      }
      setUnfinishedRegistry(registryResult.data.find(blocksNextRegistry) ?? null);
      setPreparationChecked(true);
      const queueArrivals = (queueResult?.data as { emptyWagonsQueue?: EmptyWagonArrival[] })?.emptyWagonsQueue ?? [];
      const directArrivals = (arrivalResult.data ?? []) as EmptyWagonArrival[];
      const arrivalsMap = new Map<string, EmptyWagonArrival>();
      for (const arr of directArrivals) {
        arrivalsMap.set(arr.id, arr);
      }
      for (const arr of queueArrivals) {
        if (!arrivalsMap.has(arr.id)) arrivalsMap.set(arr.id, arr);
      }
      const arrivals = Array.from(arrivalsMap.values());
      setArrivals(arrivals);
      setRegistries((registryResult.data ?? []).filter(r => {
        if ((r.registryNumber || '').includes('-1C-')) return false;
        return true;
      }));
      // Buyurtmalar modulida barcha kelishuvlardan o‘tgan yakuniy holat `Active`.
      setOrders(excludeOneCOrders((orderResult?.data ?? []).filter(o => o.status === 'Active' || o.status === 'Completed')));
      if (canCreate) {
        setLoadingTasks((taskResult?.data ?? []).filter(t => !(t.arrivalNumber || '').startsWith('1C-')));
      } else {
        setLoadingTasks([]);
      }
    } catch {
      setPreparationChecked(false);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [canCreate]);

  const syncOneCData = useCallback(async (customDate?: string) => {
    try {
      const targetDate = customDate ?? oneCDate;
      let apiDate = '';
      if (targetDate.includes('.')) {
        const [d, m, y] = targetDate.split('.');
        apiDate = `${y}${m}${d}`;
      } else {
        apiDate = targetDate.replace(/\D/g, '');
      }
      await api.syncOneCWeighings(apiDate, apiDate);
      await load({ silent: true });
    } catch {
      await load({ silent: true });
    }
  }, [oneCDate, load]);

  useEffect(() => {
    load();
    void syncOneCData();
    // Umumiy 5s "ma'lumot o'zgardi" signali (realtimeSync) load()ni allaqachon
    // qayta yuklaydi — bu yerda faqat 1C bilan davriy sinxronizatsiya qoladi,
    // u o'zi ham muvaffaqiyatdan keyin load({silent:true}) chaqiradi.
    const unsub = subscribeOrdersChanged(() => load({ silent: true }));
    const stopPoll = startAutoRefresh(() => {
      void syncOneCData();
    });
    return () => {
      unsub();
      stopPoll();
    };
  }, [load, syncOneCData]);

  const registeredWagonKeys = useMemo(() => registeredVisitKeys(registries, arrivals), [registries, arrivals]);

  const isWagonRegistered = (arrivalId: string, wagonNumber: string) => {
    const key = `${arrivalId}:${wagonNumber}`.trim().toLowerCase();
    return registeredWagonKeys.has(key);
  };

  const pooledWagons = useMemo<PooledWagonRow[]>(() => (
    arrivals.flatMap(arrival => wagonRowsOf(arrival).map(row => ({
      ...row,
      arrivalId: arrival.id,
      arrivalNumber: arrival.arrivalNumber,
      arrivalDate: arrival.arrivalDate || arrival.createdAt || '',
    })))
  ), [arrivals]);

  const createTasks = useMemo(
    () => loadingTasks.filter(task => wagonRowsOf(task).some(row =>
      !isWagonRegistered(task.id, row.wagonNumber)
      && (isCreateHealthy(row) || isAwaitingSeal(row) || (isCreateDefective(row) && hasDefectAct(row))))),
    [loadingTasks, registeredWagonKeys],
  );

  const createPoolRows = useMemo(() => pooledWagons
    .filter(row => !isWagonRegistered(row.arrivalId, row.wagonNumber)
      && (isCreateHealthy(row) || isAwaitingSeal(row) || (isCreateDefective(row) && hasDefectAct(row))))
    .sort((a, b) => docsDateKey(b.arrivalDate).localeCompare(docsDateKey(a.arrivalDate))
      || a.wagonNumber.localeCompare(b.wagonNumber, 'uz')),
    [pooledWagons, registeredWagonKeys]);

  const outgoingDraftGroups = useMemo<OutgoingDraftGroup[]>(() => {
    const allAvailableRows = createPoolRows.filter(row => row.status !== 'Returned' || hasDefectAct(row));
    if (allAvailableRows.length === 0) return [];

    const healthyRows = allAvailableRows.filter(row => row.status !== 'Returned');
    const displayRows = healthyRows.length > 0 ? healthyRows : allAvailableRows;

    const dates = displayRows
      .map(row => row.loadingCompletedAt || row.arrivalDate)
      .filter(Boolean)
      .sort();
    const date = dates.at(-1) || new Date().toISOString();

    const now = new Date();
    const period = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(2)}`;
    const prefix = `WB-${period}-`;
    const existingSeqs = registries
      .map(r => r.registryNumber || '')
      .filter(num => num.startsWith(prefix))
      .map(num => {
        const rem = num.slice(prefix.length).split('-')[0];
        const n = parseInt(rem, 10);
        return isNaN(n) ? 0 : n;
      });
    const nextSeq = (existingSeqs.length > 0 ? Math.max(...existingSeqs) : 0) + 1;
    const pNumber = `${prefix}${String(nextSeq).padStart(3, '0')}`;

    return [{
      key: 'ready-pool',
      partyNumber: pNumber,
      date,
      rows: [...displayRows].sort((a, b) => a.wagonNumber.localeCompare(b.wagonNumber, 'uz')),
    }];
  }, [createPoolRows, registries]);

  const createModalRows = useMemo(() => {
    const keys = new Set(modalWagonKeys);
    if (modalMode === 'edit') {
      return pooledWagons.filter(row => keys.has(pooledWagonKey(row)));
    }
    return createPoolRows.filter(row => keys.has(pooledWagonKey(row)));
  }, [modalMode, pooledWagons, createPoolRows, modalWagonKeys]);

  const selectedCreateModalRows = useMemo(
    () => createModalRows.filter(row => selectedWagons[pooledWagonKey(row)]),
    [createModalRows, selectedWagons],
  );

  const visibleRegistries = useMemo(() => {
    if (role === 'Economist' || role === 'Admin') return registries;
    // Yuk xati shakllantirilgan zahoti 10-bosqichdagi ikkala kelishuv
    // tomoniga tushadi. Alohida ichki “yuborildi” bayrog‘i eski reyestrlarda
    // bo‘lmasligi mumkin, shu sababli hujjatni butunlay yashirmaymiz.
    if (role === 'Permit' || role === 'Security') return registries;
    return registries;
  }, [registries, role]);

  const byZone = useMemo(() => {
    const map: Record<RegZone, { tasks: LoadingTask[]; regs: LoadingRegistry[] }> = {
      create: { tasks: [], regs: [] },
      agree: { tasks: [], regs: [] },
      docs: { tasks: [], regs: [] },
      done: { tasks: [], regs: [] },
    };
    if (canCreate) map.create.tasks = createTasks;

    for (const r of visibleRegistries) {
      const arr = arrivals.find(a => a.id.toLowerCase() === (r.emptyWagonArrivalId || '').toLowerCase());
      const isArrExited = arr ? arr.stage === 'Exited' : false;
      const isDone = Boolean((r.exitedToKengsoyAt || isArrExited) && r.isSentToOneC && r.isSentToENakl);

      if (role === 'Permit') {
        if (!r.isApprovedByPermit || isRegistryReturned(r)) {
          map.agree.regs.push(r);
        } else if (isDone) {
          map.done.regs.push(r);
        } else {
          map.docs.regs.push(r);
        }
        continue;
      }

      if (role === 'Security') {
        if (!r.isApprovedBySecurity || isRegistryReturned(r)) {
          map.agree.regs.push(r);
        } else if (isDone) {
          map.done.regs.push(r);
        } else {
          map.docs.regs.push(r);
        }
        continue;
      }

      const z = isDone ? 'done' : registryZone(r);
      map[z].regs.push(r);
    }
    return map;
  }, [canCreate, createTasks, visibleRegistries, role, arrivals]);

  useEffect(() => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      const current = sp.get('expanded');
      if (expandedId) {
        if (current === expandedId) return prev;
        sp.set('expanded', expandedId);
      } else if (current) {
        sp.delete('expanded');
      } else {
        return prev;
      }
      return sp;
    }, { replace: true });
  }, [expandedId, setSearchParams]);

  const closeExpanded = useCallback(() => {
    userClosedDraft.current = true;
    if (isEditingRegistry) {
      setIsEditingRegistry(false);
      setEditActionError('');
      return;
    }
    if (fromQuery) {
      navigate(fromQuery);
      return;
    }
    ignoreExpandedQuery.current = true;
    setExpandedId(null);
    setSearchParams(prev => {
      if (!prev.has('expanded') && !prev.has('arrivalId')) return prev;
      const sp = new URLSearchParams(prev);
      sp.delete('expanded');
      sp.delete('arrivalId');
      return sp;
    }, { replace: true });
  }, [isEditingRegistry, fromQuery, navigate, setSearchParams]);

  useEffect(() => {
    if (!expandedFromQuery) {
      ignoreExpandedQuery.current = false;
      return;
    }
    if (ignoreExpandedQuery.current) return;
    if (expandedFromQuery.startsWith('task:')) {
      const taskId = expandedFromQuery.slice('task:'.length);
      if (isCreateHub) return;
      if (createTasks.some(task => task.id === taskId)) {
        setExpandedId(expandedFromQuery);
      }
      return;
    }
    if (expandedFromQuery.startsWith('reg:')) {
      if (isApproveHub || isPermitAgreeHub || isSecurityAgreeHub) return;
      const regId = expandedFromQuery.slice('reg:'.length);
      const reg = visibleRegistries.find(item => item.id === regId);
      if (reg) {
        setExpandedId(expandedFromQuery);
      }
    }
  }, [
    createTasks,
    expandedFromQuery,
    isApproveHub,
    isCreateHub,
    isPermitAgreeHub,
    isSecurityAgreeHub,
    visibleRegistries,
  ]);

  useEffect(() => {
    if (!canApproveShift || isApproveHub || loading) return;
    if (role !== 'Dispatching') return;

    const zone = searchParams.get('zone');
    if (zone === 'agree') {
      const sp = new URLSearchParams(searchParams);
      sp.delete('zone');
      const q = sp.toString();
      navigate(q ? `/registry/approve?${q}` : '/registry/approve', { replace: true });
      return;
    }

    const expanded = searchParams.get('expanded');
    if (expanded?.startsWith('reg:')) {
      const regId = expanded.slice('reg:'.length);
      const reg = visibleRegistries.find(item => item.id === regId);
      if (reg && needsShiftApproval(reg)) {
        navigate(`/registry/approve?${searchParams.toString()}`, { replace: true });
      }
    }
  }, [
    canApproveShift,
    isApproveHub,
    loading,
    navigate,
    role,
    searchParams,
    visibleRegistries,
  ]);

  useEffect(() => {
    if (!canCreate || isCreateHub || loading) return;

    const zone = searchParams.get('zone');
    if (zone === 'create') {
      const sp = new URLSearchParams(searchParams);
      sp.delete('zone');
      const q = sp.toString();
      navigate(q ? `/registry/create?${q}` : '/registry/create', { replace: true });
      return;
    }

    const expanded = searchParams.get('expanded');
    if (expanded?.startsWith('task:')) {
      const sp = new URLSearchParams(searchParams);
      navigate(`/registry/create?${sp.toString()}`, { replace: true });
      return;
    }

    if (!expanded?.startsWith('reg:') && searchParams.get('stage') !== 'w12'
      && arrivalIdFromQuery && createTasks.some(task => task.id === arrivalIdFromQuery)) {
      navigate(`/registry/create?arrivalId=${arrivalIdFromQuery}`, { replace: true });
    }
  }, [
    arrivalIdFromQuery,
    canCreate,
    createTasks,
    isCreateHub,
    loading,
    navigate,
    searchParams,
  ]);

  useEffect(() => {
    if (!arrivalIdFromQuery) return;
    if (searchParams.get('expanded')?.startsWith('reg:')) return;
    if (ignoreExpandedQuery.current) return;

    const target = arrivalIdFromQuery.toLowerCase().trim();
    const directReg = visibleRegistries.find(
      r => (r.emptyWagonArrivalId ?? '').toLowerCase() === target
        || (r.id ?? '').toLowerCase() === target
        || (r.registryNumber ?? '').toLowerCase() === target,
    );
    const reg = directReg ?? visibleRegistries.find(
      r => (r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase() === target),
    );
    if (!reg) return;

    const fromParam = fromQuery ? `&from=${encodeURIComponent(fromQuery)}` : '';
    if (isRegistryWorkHub) {
      if (reg.exitedToKengsoyAt || reg.isSentToOneC) {
        navigate(`/registry?expanded=reg:${reg.id}${fromParam}`, { replace: true });
      }
      return;
    }
    setExpandedId(`reg:${reg.id}`);
  }, [arrivalIdFromQuery, isRegistryWorkHub, visibleRegistries, fromQuery, navigate, searchParams]);

  const filterRegistriesByArrival = useCallback((regs: LoadingRegistry[], arrivalTarget?: string | null) => {
    if (!arrivalTarget) return regs;
    const target = arrivalTarget.toLowerCase().trim();
    if (!target) return regs;

    const arrivalObj = arrivals.find(
      a => a.id.toLowerCase() === target || (a.arrivalNumber ?? '').toLowerCase() === target
    );
    const targetArrivalId = arrivalObj ? arrivalObj.id.toLowerCase() : target;
    const targetArrivalNum = arrivalObj?.arrivalNumber?.toLowerCase() ?? '';

    // 1. Avval to'g'ridan-to'g'ri mos keluvchi (asosiy partiyasi shu bo'lgan) yuk xatlarini tekshiramiz
    const directMatches = regs.filter(r => {
      const regArrId = (r.emptyWagonArrivalId ?? '').toLowerCase();
      const regId = (r.id ?? '').toLowerCase();
      return regArrId === target || regArrId === targetArrivalId || regId === target;
    });

    if (directMatches.length > 0) {
      return directMatches;
    }

    // 2. Agar to'g'ridan-to'g'ri yuk xati bo'lmasa, vagonlari biriktirilgan (wagonRoutes) yuk xatlarini qaytaramiz
    return regs.filter(r =>
      (r.wagonRoutes ?? []).some(w => {
        const srcId = (w.sourceArrivalId ?? '').toLowerCase();
        const srcNum = (w.sourceArrivalNumber ?? '').toLowerCase();
        return srcId === target || srcId === targetArrivalId || (targetArrivalNum && srcNum === targetArrivalNum);
      })
    );
  }, [arrivals]);

  const shiftPendingRegs = useMemo(() => {
    const all = visibleRegistries.filter(needsShiftApproval);
    return filterRegistriesByArrival(all, arrivalIdFromQuery);
  }, [arrivalIdFromQuery, filterRegistriesByArrival, visibleRegistries]);

  const permitAgreePendingRegs = useMemo(() => {
    const all = visibleRegistries.filter(
      r => !r.exitedToKengsoyAt && (needsPermitAgreement(r) || r.isApprovedByPermit) && !isRegistryReturned(r),
    );
    const sorted = [...all].sort((a, b) => {
      const aPending = needsPermitAgreement(a) ? 1 : 0;
      const bPending = needsPermitAgreement(b) ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      return docsDateKey(b.preparedAt || '').localeCompare(docsDateKey(a.preparedAt || ''));
    });
    return filterRegistriesByArrival(sorted, arrivalIdFromQuery);
  }, [arrivalIdFromQuery, filterRegistriesByArrival, visibleRegistries]);

  const securityAgreePendingRegs = useMemo(() => {
    const all = visibleRegistries.filter(
      r => !r.exitedToKengsoyAt && (needsSecurityAgreement(r) || r.isApprovedBySecurity) && !isRegistryReturned(r),
    );
    const sorted = [...all].sort((a, b) => {
      const aPending = needsSecurityAgreement(a) ? 1 : 0;
      const bPending = needsSecurityAgreement(b) ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      return docsDateKey(b.preparedAt || '').localeCompare(docsDateKey(a.preparedAt || ''));
    });
    return filterRegistriesByArrival(sorted, arrivalIdFromQuery);
  }, [arrivalIdFromQuery, filterRegistriesByArrival, visibleRegistries]);

  const createHubRegs = useMemo(() => {
    if (!isCreateHub) return [];
    return visibleRegistries.filter(r =>
      !r.exitedToKengsoyAt && (!r.isSentToOneC || !r.isSentToENakl),
    );
  }, [isCreateHub, visibleRegistries]);

  const boardItems = useMemo(() => ({
    tasks: canCreate && isCreateHub ? byZone.create.tasks : [],
    regs: isCreateHub
      ? createHubRegs
      : isApproveHub
        ? shiftPendingRegs
        : isPermitAgreeHub
          ? (isAdmin || canApprovePermit ? permitAgreePendingRegs : [])
          : isSecurityAgreeHub
            ? (isAdmin || canApproveSecurity ? securityAgreePendingRegs : [])
            : [
              ...(zoneFromQuery === 'agree'
                ? byZone.agree.regs
                : zoneFromQuery === 'docs'
                  ? byZone.docs.regs
                  : byZone.done.regs),
            ].filter(r => !(role === 'Dispatching' && needsShiftApproval(r))),
  }), [
    byZone,
    canApprovePermit,
    canApproveSecurity,
    canApproveShift,
    canCreate,
    createHubRegs,
    isAdmin,
    isApproveHub,
    isCreateHub,
    isPermitAgreeHub,
    isSecurityAgreeHub,
    permitAgreePendingRegs,
    role,
    securityAgreePendingRegs,
    shiftPendingRegs,
    zoneFromQuery,
  ]);

  type YukHubRow =
    | { kind: 'task'; task: LoadingTask; date: string; product: string; search: string }
    | { kind: 'reg'; registry: LoadingRegistry; date: string; product: string; search: string };

  const yukHubRows = useMemo<YukHubRow[]>(() => {
    const tasks: YukHubRow[] = boardItems.tasks.map(task => ({
      kind: 'task',
      task,
      date: task.arrivalDate || task.createdAt || '',
      product: (toLatinProductName(task.productType) || task.productType || '').trim(),
      search: [task.arrivalNumber, task.productType, ...wagonRowsOf(task).map(row => row.wagonNumber)]
        .filter(Boolean)
        .join(' '),
    }));
    const regs: YukHubRow[] = boardItems.regs.map(registry => ({
      kind: 'reg',
      registry,
      date: registry.preparedAt || '',
      product: (toLatinProductName(registry.productType) || registry.productType || '').trim(),
      search: [
        registry.arrivalNumber,
        registry.registryNumber,
        registry.productType,
        ...(registry.wagonRoutes ?? []).map(route => route.wagonNumber),
      ].filter(Boolean).join(' '),
    }));
    return [...tasks, ...regs].sort((a, b) => docsDateKey(b.date).localeCompare(docsDateKey(a.date)));
  }, [boardItems]);

  const yukProductOptions = useMemo(
    () => [...new Set(yukHubRows.map(row => row.product).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'uz'))
      .map(value => ({ value, label: value })),
    [yukHubRows],
  );

  const filteredYukRows = useMemo(
    () => yukHubRows.filter(row => {
      if (!docsDateInRange(row.date, hub.from, hub.to)) return false;
      if (hub.product && row.product.toLowerCase() !== hub.product.toLowerCase()) return false;
      return docsMatchesSearch(row.search, hub.search);
    }),
    [yukHubRows, hub.from, hub.to, hub.product, hub.search],
  );

  /** Ekrandagi filtrlar bo'yicha yuk xatlari — vagon darajasida Excelga chiqadi. */
  const exportYukExcel = () => {
    const rows: Array<Array<string | number>> = [
      ['Hujjat raqami', 'Sana', 'Partiya', 'Mahsulot', 'Kontragent', 'Jo‘natish stansiyasi',
       'Vagon №', 'Sisterna', 'Nomuvofiq', 'Holat'],
    ];
    for (const row of filteredYukRows) {
      if (row.kind === 'task') {
        const task = row.task;
        for (const wagon of wagonRowsOf(task)) {
          rows.push([
            '—', formatDateDisplay(row.date), task.arrivalNumber || '—', row.product || '—',
            '—', '—', wagon.wagonNumber || '—', wagon.cisternNumber || '', '', 'Shakllantirilmagan',
          ]);
        }
        continue;
      }
      const registry = row.registry;
      const routes = registry.wagonRoutes ?? [];
      const state = registry.exitedToKengsoyAt
        ? 'Chiqib ketgan'
        : registry.isApprovedByPermit && registry.isApprovedBySecurity
          ? 'Kelishilgan'
          : 'Kelishuvda';
      if (routes.length === 0) {
        rows.push([registry.registryNumber || '—', formatDateDisplay(row.date),
          registry.arrivalNumber || '—', row.product || '—', registry.contractorName || '—',
          registry.destinationStation || '—', '—', '', '', state]);
        continue;
      }
      for (const route of routes) {
        rows.push([
          registry.registryNumber || '—',
          formatDateDisplay(row.date),
          route.sourceArrivalNumber || registry.arrivalNumber || '—',
          route.productType || row.product || '—',
          route.contractorName || registry.contractorName || '—',
          route.destinationStation || registry.destinationStation || '—',
          route.wagonNumber || '—',
          '',
          route.isDefective ? 'ha' : '',
          state,
        ]);
      }
    }
    exportSheet(`yuk_xatlari_${todayStamp()}.xlsx`, 'Yuk xatlari', rows);
  };

  const pagedYuk = paginateItems(filteredYukRows, hub.page, hub.pageSize);
  const viewedTask = expandedId?.startsWith('task:')
    ? createTasks.find(task => `task:${task.id}` === expandedId) ?? null
    : null;
  const viewedRegistry = expandedId?.startsWith('reg:')
    ? visibleRegistries.find(registry => `reg:${registry.id}` === expandedId) ?? null
    : null;
  const viewedDraftGroup = !preparationBlockMessage && expandedId?.startsWith('draft:')
    ? outgoingDraftGroups.find(group => `draft:${group.key}` === expandedId) ?? null
    : null;

  const effectiveDraftGroupRows = useMemo<PooledWagonRow[]>(() => {
    if (!viewedDraftGroup) return [];
    const baseRows = viewedDraftGroup.rows;
    const attachedDefect = draftAttachedDefectKeys[viewedDraftGroup.key] || [];
    const attachedBuffer = draftAttachedBufferKeys[viewedDraftGroup.key] || [];
    const allAttached = [...attachedDefect, ...attachedBuffer];
    if (allAttached.length === 0) return baseRows;
    const attachedRows = createPoolRows.filter(r =>
      allAttached.includes(pooledWagonKey(r))
      && !baseRows.some(br => pooledWagonKey(br) === pooledWagonKey(r))
    );
    return [...baseRows, ...attachedRows];
  }, [viewedDraftGroup, draftAttachedDefectKeys, draftAttachedBufferKeys, createPoolRows]);

  const availableEmptyWagons = useMemo(() => {
    return pooledWagons.filter(row => {
      if (row.scaleExitedAt) return false;
      if (isWagonRegistered(row.arrivalId, row.wagonNumber)) return false;
      // Yuklanish yoki jo'natish jarayonida bo'lgan (estakada, yuklanayotgan, yuklangan, tortilayotgan, plombalangan)
      // vagonlar bo'sh vagonlar ro'yxatiga kirmaydi!
      const activeLoadingStatuses = [
        'Estakada', 'EstakadaPlaced', 'Loading', 'Loaded',
        'ToRailwayScale', 'GrossWeighed', 'SealPending', 'Ready', 'Sealed'
      ];
      if (activeLoadingStatuses.includes(row.status || '')) return false;
      // Yuklangan vagonlarni bo'sh vagonlar ro'yxatidan chiqarib tashlaymiz
      if (isWagonLoaded(row)) return false;
      // Faqat haqiqatda bo'sh/nuqsonli (Returned) yoki yuk ortilmasdan qaytariladigan bo'sh vagonlar
      return true;
    });
  }, [pooledWagons, registeredWagonKeys]);

  const filteredEmptyWagons = useMemo(() => {
    const q = emptySearch.trim().toLowerCase();
    if (!q) return availableEmptyWagons;
    return availableEmptyWagons.filter(
      w =>
        w.wagonNumber.toLowerCase().includes(q) ||
        (w.arrivalNumber || '').toLowerCase().includes(q) ||
        (w.product || '').toLowerCase().includes(q) ||
        (w.status || '').toLowerCase().includes(q),
    );
  }, [availableEmptyWagons, emptySearch]);

  const toggleSelectAllEmpty = () => {
    if (emptySelectedWagonKeys.size === filteredEmptyWagons.length && filteredEmptyWagons.length > 0) {
      setEmptySelectedWagonKeys(new Set());
    } else {
      setEmptySelectedWagonKeys(new Set(filteredEmptyWagons.map(pooledWagonKey)));
    }
  };

  const toggleSelectEmptyWagon = (key: string) => {
    setEmptySelectedWagonKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submitEmptyDispatch = async () => {
    if (preparationBlockMessage) {
      setEmptyError(preparationBlockMessage);
      return;
    }
    if (emptySelectedWagonKeys.size === 0) {
      setEmptyError('Kamida bitta vagonni tanlang.');
      return;
    }
    if (!emptyDocNumber.trim()) {
      setEmptyError('Asos hujjati raqami va sanasini kiritish majburiy! (Masalan: Xizmat xati № 48, 28.09.2026 yoki GU-23 № 14)');
      return;
    }
    const docNum = emptyDocNumber.trim();
    setEmptySubmitting(true);
    setEmptyError('');

    try {
      const selectedWagons = availableEmptyWagons.filter(w =>
        emptySelectedWagonKeys.has(pooledWagonKey(w)),
      );
      const wagonNumbers = selectedWagons.map(w => w.wagonNumber);
      const firstArrivalId = selectedWagons[0]?.arrivalId;

      const res = await api.dispatchEmptyWagons({
        wagonNumbers,
        arrivalId: firstArrivalId,
        docType: emptyDocType,
        docNumber: docNum,
        reason: emptyReason,
        comment: emptyComment.trim(),
        operatorName: 'Iqtisodchi',
      });

      if (!res.success) {
        throw new Error(res.message || 'Bo‘sh vagonlarni tayyorlashda xatolik yuz berdi.');
      }

      // Agar hozir qoralama (viewedDraftGroup) ochiq bo'lsa, tanlangan bo'sh vagonlarni avtomatik tarzda ushbu yuk xati tarkibiga biriktiramiz
      if (viewedDraftGroup) {
        const newlyDispatchedKeys = selectedWagons.map(pooledWagonKey);
        setDraftAttachedDefectKeys(prev => ({
          ...prev,
          [viewedDraftGroup.key]: [...new Set([...(prev[viewedDraftGroup.key] || []), ...newlyDispatchedKeys])],
        }));
        setSelectedDraftWagonKeys(prev => {
          const next = { ...prev };
          newlyDispatchedKeys.forEach(k => { next[k] = true; });
          return next;
        });
      }

      notifyOrdersChanged();
      await load({ silent: true });
      setIsEmptyDispatchOpen(false);
      setEmptySelectedWagonKeys(new Set());
      setEmptyComment('');
      setEmptyDocNumber('');
      setEmptyAttachedFileName('');
    } catch (err: unknown) {
      setEmptyError(err instanceof Error ? err.message : 'Bo‘sh vagonlarni tayyorlashda xatolik.');
    } finally {
      setEmptySubmitting(false);
    }
  };

  const availableDefectRowsForDraft = useMemo(() => {
    if (!viewedDraftGroup) return [];
    const currentKeys = new Set(effectiveDraftGroupRows.map(pooledWagonKey));
    return createPoolRows.filter(row =>
      row.status === 'Returned'
      && hasDefectAct(row)
      && !currentKeys.has(pooledWagonKey(row))
    );
  }, [viewedDraftGroup, effectiveDraftGroupRows, createPoolRows]);

  const availableBufferRowsForDraft = useMemo(() => {
    if (!viewedDraftGroup) return [];
    const currentKeys = new Set(effectiveDraftGroupRows.map(pooledWagonKey));
    const attachedElsewhere = new Set(
      Object.entries(draftAttachedBufferKeys)
        .filter(([k]) => k !== viewedDraftGroup.key)
        .flatMap(([, keys]) => keys),
    );
    return createPoolRows.filter(row =>
      row.status !== 'Returned'
      && isCreateHealthy(row)
      && !currentKeys.has(pooledWagonKey(row))
      && !attachedElsewhere.has(pooledWagonKey(row))
    );
  }, [viewedDraftGroup, effectiveDraftGroupRows, draftAttachedBufferKeys, createPoolRows]);

  useEffect(() => {
    if (preparationBlockMessage) return;
    if (isCreateHub && outgoingDraftGroups.length > 0 && !expandedId && !userClosedDraft.current) {
      setExpandedId(`draft:${outgoingDraftGroups[0].key}`);
    } else if (preselectedWagons && preselectedWagons.length > 0 && outgoingDraftGroups.length > 0 && !expandedId) {
      setExpandedId(`draft:${outgoingDraftGroups[0].key}`);
    }
  }, [isCreateHub, preselectedWagons, outgoingDraftGroups, expandedId, preparationBlockMessage]);

  useEffect(() => {
    if (viewedDraftGroup) {
      setDraftActionError('');
      const initial: Record<string, boolean> = {};
      const hasWagonPreselection = Array.isArray(preselectedWagons) && preselectedWagons.length > 0;
      const hasArrivalPreselection = Boolean(arrivalIdFromQuery);
      effectiveDraftGroupRows.forEach(r => {
        let isSelected = false;
        if (hasWagonPreselection) {
          isSelected = preselectedWagons.includes(r.wagonNumber);
        } else if (hasArrivalPreselection) {
          isSelected = r.arrivalId.toLowerCase() === arrivalIdFromQuery?.toLowerCase();
        }
        initial[pooledWagonKey(r)] = isSelected;
      });
      setSelectedDraftWagonKeys(initial);
    }
  }, [viewedDraftGroup?.key, preselectedWagons, arrivalIdFromQuery]);

  useEffect(() => {
    if (viewedDraftGroup) {
      setSelectedDraftWagonKeys(prev => {
        let changed = false;
        const next = { ...prev };
        const hasWagonPreselection = Array.isArray(preselectedWagons) && preselectedWagons.length > 0;
        const hasArrivalPreselection = Boolean(arrivalIdFromQuery);
        effectiveDraftGroupRows.forEach(r => {
          const k = pooledWagonKey(r);
          if (next[k] === undefined) {
            let isSelected = false;
            if (hasWagonPreselection) {
              isSelected = preselectedWagons.includes(r.wagonNumber);
            } else if (hasArrivalPreselection) {
              isSelected = r.arrivalId.toLowerCase() === arrivalIdFromQuery?.toLowerCase();
            }
            next[k] = isSelected;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [effectiveDraftGroupRows, preselectedWagons, arrivalIdFromQuery]);

  const selectedDraftRows = useMemo(() => {
    return effectiveDraftGroupRows.filter(r => selectedDraftWagonKeys[pooledWagonKey(r)]);
  }, [effectiveDraftGroupRows, selectedDraftWagonKeys]);

  const isAllDraftSelected = effectiveDraftGroupRows.length > 0 && selectedDraftRows.length === effectiveDraftGroupRows.length;
  const isDraftIndeterminate = selectedDraftRows.length > 0 && selectedDraftRows.length < effectiveDraftGroupRows.length;

  const handleToggleSelectAllDraft = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    effectiveDraftGroupRows.forEach(r => {
      next[pooledWagonKey(r)] = checked;
    });
    setSelectedDraftWagonKeys(next);
    setDraftActionError('');
  };

  const assignedDraftKeysSet = useMemo(() => {
    return new Set(selectedDraftRows.map(pooledWagonKey));
  }, [selectedDraftRows]);

  const availableReserveRows = useMemo(() => {
    return createPoolRows.filter(r => {
      const k = pooledWagonKey(r);
      if (assignedDraftKeysSet.has(k)) return false;
      if (r.status === 'Returned' && !hasDefectAct(r)) return false;
      return true;
    });
  }, [createPoolRows, assignedDraftKeysSet]);

  const filteredReserveRows = useMemo(() => {
    return availableReserveRows.filter(row => {
      if (dualFilter === 'sealed' && !row.sealNumber) return false;
      if (dualFilter === 'empty' && isWagonLoaded(row)) return false;
      if (dualFilter === 'defective' && row.status !== 'Returned' && !hasDefectAct(row)) return false;
      if (dualSearch.trim()) {
        const q = dualSearch.trim().toLowerCase();
        const num = (row.wagonNumber || '').toLowerCase();
        const prod = (row.product || '').toLowerCase();
        const arr = (row.arrivalNumber || '').toLowerCase();
        const seal = (row.sealNumber || '').toLowerCase();
        if (!num.includes(q) && !prod.includes(q) && !arr.includes(q) && !seal.includes(q)) return false;
      }
      return true;
    });
  }, [availableReserveRows, dualFilter, dualSearch]);

  const totalDraftNetto = useMemo(() => {
    return selectedDraftRows.reduce((acc, r) => acc + (parseFloat(r.netto) || 0), 0);
  }, [selectedDraftRows]);

  const isAllLeftReserveSelected = filteredReserveRows.length > 0 && filteredReserveRows.every(r => dualLeftSelectedKeys.includes(pooledWagonKey(r)));
  const isLeftReserveIndeterminate = dualLeftSelectedKeys.length > 0 && !isAllLeftReserveSelected;

  const handleToggleSelectAllLeftReserve = (checked: boolean) => {
    if (checked) {
      setDualLeftSelectedKeys(filteredReserveRows.filter(row => !isAwaitingSeal(row)).map(pooledWagonKey));
    } else {
      setDualLeftSelectedKeys([]);
    }
  };

  const isAllRightDraftSelected = selectedDraftRows.length > 0 && selectedDraftRows.every(r => dualRightSelectedKeys.includes(pooledWagonKey(r)));
  const isRightDraftIndeterminate = dualRightSelectedKeys.length > 0 && !isAllRightDraftSelected;

  const handleToggleSelectAllRightDraft = (checked: boolean) => {
    if (checked) {
      setDualRightSelectedKeys(selectedDraftRows.map(pooledWagonKey));
    } else {
      setDualRightSelectedKeys([]);
    }
  };

  const handleTransferToDraft = useCallback((keysToTransfer?: string[]) => {
    if (preparationBlockMessage) {
      setDraftActionError(preparationBlockMessage);
      return;
    }
    const requestedKeys = keysToTransfer || dualLeftSelectedKeys;
    const keys = requestedKeys.filter(key => {
      const row = createPoolRows.find(candidate => pooledWagonKey(candidate) === key);
      return row ? !isAwaitingSeal(row) : false;
    });
    if (keys.length !== requestedKeys.length) {
      setDraftActionError('Qizil rangdagi vagon uchun avval 1C / Plomba bo‘limida plomba raqamini kiriting');
    }
    if (keys.length === 0 || !viewedDraftGroup) return;

    const baseKeys = new Set(viewedDraftGroup.rows.map(pooledWagonKey));
    const toAttachBuffer: string[] = [];
    const toAttachDefect: string[] = [];

    keys.forEach(k => {
      if (!baseKeys.has(k)) {
        const row = createPoolRows.find(r => pooledWagonKey(r) === k);
        if (row && (row.status === 'Returned' || hasDefectAct(row))) {
          toAttachDefect.push(k);
        } else {
          toAttachBuffer.push(k);
        }
      }
    });

    if (toAttachBuffer.length > 0) {
      setDraftAttachedBufferKeys(prev => ({
        ...prev,
        [viewedDraftGroup.key]: [...new Set([...(prev[viewedDraftGroup.key] || []), ...toAttachBuffer])],
      }));
    }
    if (toAttachDefect.length > 0) {
      setDraftAttachedDefectKeys(prev => ({
        ...prev,
        [viewedDraftGroup.key]: [...new Set([...(prev[viewedDraftGroup.key] || []), ...toAttachDefect])],
      }));
    }

    const newOrderAssignments: Record<string, string> = {};
    const newRouteAssignments: Record<string, string> = {};
    keys.forEach(k => {
      if (!wagonOrderIds[k]) {
        const r = createPoolRows.find(row => pooledWagonKey(row) === k);
        if (r && r.status !== 'Returned') {
          const match = getMatchingActiveOrders(orders, r.product, null);
          if (match.length === 1) {
            newOrderAssignments[k] = match[0].id;
            if (match[0].lines.length === 1) {
              newRouteAssignments[k] = match[0].lines[0].id;
            }
          }
        }
      }
    });
    if (Object.keys(newOrderAssignments).length > 0) {
      setWagonOrderIds(prev => ({ ...prev, ...newOrderAssignments }));
      setWagonRouteLines(prev => ({ ...prev, ...newRouteAssignments }));
    }

    setSelectedDraftWagonKeys(prev => {
      const next = { ...prev };
      keys.forEach(k => { next[k] = true; });
      return next;
    });
    setDualLeftSelectedKeys(prev => prev.filter(k => !keys.includes(k)));
    if (keys.length > 0) {
      setDraftActionSuccess(`${keys.length} ta vagon tarkibga muvaffaqiyatli qo‘shildi. Yuk xatini shakllantirish uchun buyurtma/yo‘nalishni tanlab, pastdagi «Yuk xatini shakllantirish» tugmasini bosing.`);
      if (keys.length !== requestedKeys.length) {
        setDraftActionError('Plomba raqami kiritilmagan yoki nomuvofiq vagonlar tarkibga qo‘shilmadi (zaxirada qoldi).');
      } else {
        setDraftActionError('');
      }
    } else {
      setDraftActionSuccess('');
    }
  }, [dualLeftSelectedKeys, viewedDraftGroup, createPoolRows, preparationBlockMessage]);

  const handleRemoveFromDraft = useCallback((keysToRemove: string[]) => {
    if (keysToRemove.length === 0 || !viewedDraftGroup) return;
    const removeSet = new Set(keysToRemove);

    setDraftAttachedBufferKeys(prev => ({
      ...prev,
      [viewedDraftGroup.key]: (prev[viewedDraftGroup.key] || []).filter(k => !removeSet.has(k)),
    }));
    setDraftAttachedDefectKeys(prev => ({
      ...prev,
      [viewedDraftGroup.key]: (prev[viewedDraftGroup.key] || []).filter(k => !removeSet.has(k)),
    }));

    setSelectedDraftWagonKeys(prev => {
      const next = { ...prev };
      keysToRemove.forEach(k => { next[k] = false; });
      return next;
    });
    setDualRightSelectedKeys(prev => prev.filter(k => !removeSet.has(k)));
    setDraftActionSuccess(`${keysToRemove.length} ta vagon zaxiraga qaytarildi.`);
    setDraftActionError('');
  }, [viewedDraftGroup]);

  const handleTransferAllToDraft = useCallback(() => {
    if (availableReserveRows.length === 0 || !viewedDraftGroup) return;
    handleTransferToDraft(availableReserveRows.map(pooledWagonKey));
  }, [availableReserveRows, viewedDraftGroup, handleTransferToDraft]);

  const handleRemoveAllFromDraft = useCallback(() => {
    if (selectedDraftRows.length === 0 || !viewedDraftGroup) return;
    handleRemoveFromDraft(selectedDraftRows.map(pooledWagonKey));
  }, [selectedDraftRows, viewedDraftGroup, handleRemoveFromDraft]);

  const handleApplyOrderAndRouteToAll = (orderId: string, lineId: string) => {
    if (!orderId) return;
    const nextOrderIds = { ...wagonOrderIds };
    const nextRouteLines = { ...wagonRouteLines };
    selectedDraftRows.forEach(r => {
      const k = pooledWagonKey(r);
      nextOrderIds[k] = orderId;
      if (lineId) {
        nextRouteLines[k] = lineId;
      }
    });
    setWagonOrderIds(nextOrderIds);
    setWagonRouteLines(nextRouteLines);
    setDraftActionError('');
  };

  const effectiveEditRegistryRows = useMemo<PooledWagonRow[]>(() => {
    if (!viewedRegistry || !isEditingRegistry) return [];
    const regWagonNumbers = new Set((viewedRegistry.wagonRoutes ?? []).map(r => (r.wagonNumber || '').trim().toLowerCase()));

    const baseRows = pooledWagons.filter(row =>
      regWagonNumbers.has(String(row.wagonNumber || "").trim().toLowerCase()) &&
      (!viewedRegistry.emptyWagonArrivalId || row.arrivalId.toLowerCase() === viewedRegistry.emptyWagonArrivalId.toLowerCase() || (viewedRegistry.wagonRoutes ?? []).some(rt => rt.sourceArrivalId?.toLowerCase() === row.arrivalId.toLowerCase()))
    );

    viewedRegistry.wagonRoutes?.forEach(rt => {
      const exists = baseRows.some(r => String(r.wagonNumber || "").trim().toLowerCase() === String(rt.wagonNumber || "").trim().toLowerCase());
      if (!exists) {
        const rtObj = rt as Record<string, any>;
        const tare = rtObj.tareWeight || '';
        const brutto = rtObj.grossWeight || '';
        const netto = rtObj.nettoWeight || (rtObj.netWeight ? String(rtObj.netWeight) : '') || (rtObj.NetWeight ? String(rtObj.NetWeight) : '') || nettoWeightOf(null, tare, brutto);
        const seal = rtObj.sealNumber || '';
        baseRows.push({
          id: `rt-${rt.wagonNumber}`,
          arrivalId: rt.sourceArrivalId || viewedRegistry.emptyWagonArrivalId || '',
          arrivalNumber: viewedRegistry.registryNumber,
          arrivalDate: viewedRegistry.preparedAt || '',
          wagonNumber: rt.wagonNumber,
          cisternNumber: '',
          wagonType: 'sisterna',
          product: rt.productType || viewedRegistry.productType,
          status: rt.isDefective ? 'Returned' : 'Loaded',
          tare,
          brutto,
          netto,
          sealNumber: seal,
          defectActFileName: rt.defectActFileName || '',
          defectActNumber: '',
          loadingBatchNumber: '',
          loadingCompletedAt: '',
          loadingComment: '',
        });
      }
    });

    const allEditAttached = [...editAttachedDefectKeys, ...editAttachedBufferKeys];
    const attachedRows = createPoolRows.filter(r =>
      allEditAttached.includes(pooledWagonKey(r)) &&
      !baseRows.some(br => pooledWagonKey(br) === pooledWagonKey(r))
    );

    return [...baseRows, ...attachedRows];
  }, [viewedRegistry, isEditingRegistry, pooledWagons, editAttachedDefectKeys, editAttachedBufferKeys, createPoolRows]);

  const availableDefectRowsForEdit = useMemo(() => {
    if (!viewedRegistry || !isEditingRegistry) return [];
    const currentKeys = new Set(effectiveEditRegistryRows.map(pooledWagonKey));
    return createPoolRows.filter(row =>
      row.status === 'Returned' &&
      hasDefectAct(row) &&
      !currentKeys.has(pooledWagonKey(row))
    );
  }, [viewedRegistry, isEditingRegistry, effectiveEditRegistryRows, createPoolRows]);

  const availableBufferRowsForEdit = useMemo(() => {
    if (!viewedRegistry || !isEditingRegistry) return [];
    const currentKeys = new Set(effectiveEditRegistryRows.map(pooledWagonKey));
    return createPoolRows.filter(row =>
      row.status !== 'Returned' &&
      isCreateHealthy(row) &&
      !currentKeys.has(pooledWagonKey(row))
    );
  }, [viewedRegistry, isEditingRegistry, effectiveEditRegistryRows, createPoolRows]);

  const selectedEditRows = useMemo(() => {
    return effectiveEditRegistryRows.filter(r => Boolean(selectedEditWagonKeys[pooledWagonKey(r)]));
  }, [effectiveEditRegistryRows, selectedEditWagonKeys]);

  const isAllEditSelected = effectiveEditRegistryRows.length > 0 && selectedEditRows.length === effectiveEditRegistryRows.length;
  const isEditIndeterminate = selectedEditRows.length > 0 && selectedEditRows.length < effectiveEditRegistryRows.length;

  const handleToggleSelectAllEdit = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    effectiveEditRegistryRows.forEach(r => {
      next[pooledWagonKey(r)] = checked;
    });
    setSelectedEditWagonKeys(next);
    setEditActionError('');
  };

  const handleGenerateYukXatiFromDraft = async (_group: OutgoingDraftGroup, draftRows: PooledWagonRow[]) => {
    try {
      setIsDraftSubmitting(true);
      setDraftActionError('');

      if (draftRows.length === 0) {
        setDraftActionError('Yuk xatini shakllantirish uchun kamida bitta vagonni tanlang');
        setIsDraftSubmitting(false);
        return;
      }

      const healthyRows = draftRows.filter(r => r.status !== 'Returned');

      const missingOrder = healthyRows.find(r => !wagonOrderIds[pooledWagonKey(r)]);
      if (missingOrder) {
        setDraftActionError(`${missingOrder.wagonNumber} vagoni uchun tasdiqlangan buyurtma tanlanmagan`);
        setIsDraftSubmitting(false);
        return;
      }

      const missingRoute = healthyRows.find(r => !wagonRouteLines[pooledWagonKey(r)]);
      if (missingRoute) {
        setDraftActionError(`${missingRoute.wagonNumber} vagoni uchun stansiya va kontragent tanlanmagan`);
        setIsDraftSubmitting(false);
        return;
      }

      const now = new Date();
      const period = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(2)}`;
      const prefix = `WB-${period}-`;
      const existingSeqs = registries
        .map(r => r.registryNumber || '')
        .filter(num => num.startsWith(prefix))
        .map(num => {
          const rem = num.slice(prefix.length).split('-')[0];
          const n = parseInt(rem, 10);
          return isNaN(n) ? 0 : n;
        });
      const nextSeq = (existingSeqs.length > 0 ? Math.max(...existingSeqs) : 0) + 1;
      const regNumber = `${prefix}${String(nextSeq).padStart(3, '0')}`;
      if (sequenceBlockMessage) {
        setDraftActionError(sequenceBlockMessage);
        setIsDraftSubmitting(false);
        return;
      }
      const res = await api.createLoadingRegistry({
        emptyWagonArrivalId: draftRows[0].arrivalId,
        registryNumber: regNumber,
        monthlyOrderId: null,
        monthlyOrderLineId: null,
        wagonRoutes: draftRows.map(row => {
          const formKey = pooledWagonKey(row);
          return {
            wagonNumber: row.wagonNumber,
            monthlyOrderId: wagonOrderIds[formKey] || null,
            monthlyOrderLineId: wagonRouteLines[formKey] || null,
            includeDefective: row.status === 'Returned',
            sourceArrivalId: row.arrivalId,
          };
        }),
      });

      if (!res.success) throw new Error(res.message || 'Yuk xati yaratilmadi');
      setDraftAttachedBufferKeys(prev => {
        const next = { ...prev };
        delete next[_group.key];
        return next;
      });
      setDraftAttachedDefectKeys(prev => {
        const next = { ...prev };
        delete next[_group.key];
        return next;
      });
      notifyOrdersChanged();
      await load({ silent: true });
      if (res.data?.id) {
        navigate(`/registry?expanded=reg:${res.data.id}`);
      } else {
        closeExpanded();
      }
    } catch (err) {
      setDraftActionError(err instanceof Error ? err.message : 'Yuk xatini shakllantirishda xatolik yuz berdi');
    } finally {
      setIsDraftSubmitting(false);
    }
  };

  const openCreateModal = (task?: LoadingTask, draftGroup?: OutgoingDraftGroup) => {
    if (preparationBlockMessage) {
      navigate('/registry/create');
      return;
    }
    const sourceRows = draftGroup?.rows
      ?? (task
        ? createPoolRows.filter(row => row.arrivalId.toLowerCase() === task.id.toLowerCase())
        : createPoolRows.filter(row => selectedWagons[pooledWagonKey(row)]));
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    setModalTask(task ?? null);
    setModalRegistry(null);
    const defaultRegNumber = draftGroup
      ? (draftGroup.partyNumber.startsWith('IB-') ? `WB-${draftGroup.partyNumber.slice(3)}` : (draftGroup.partyNumber.includes('-') ? `WB-${draftGroup.partyNumber.split('-').slice(1).join('-')}` : `WB-${draftGroup.partyNumber}`))
      : `WB-${stamp}`;
    setRegistryNumber(defaultRegNumber);
    setWagonOrderIds({});
    setWagonRouteLines({});
    setModalWagonKeys(sourceRows.map(pooledWagonKey));
    setSelectedWagons(Object.fromEntries(sourceRows.map(row => [pooledWagonKey(row), true])));
    setComment('');
    setSecurityApproved(true);
    setModalMode('create');
  };

  const startEditingRegistry = (registry: LoadingRegistry) => {
    const regWagonNumbers = new Set((registry.wagonRoutes ?? []).map(r => (r.wagonNumber || '').trim().toLowerCase()));

    const attachedRows = pooledWagons.filter(row =>
      regWagonNumbers.has(String(row.wagonNumber || "").trim().toLowerCase()) &&
      (!registry.emptyWagonArrivalId || row.arrivalId.toLowerCase() === registry.emptyWagonArrivalId.toLowerCase() || (registry.wagonRoutes ?? []).some(rt => rt.sourceArrivalId?.toLowerCase() === row.arrivalId.toLowerCase()))
    );

    const initialOrderIds: Record<string, string> = {};
    const initialRouteLines: Record<string, string> = {};
    const initialSelected: Record<string, boolean> = {};

    (registry.wagonRoutes ?? []).forEach(route => {
      const row = attachedRows.find(r => String(r.wagonNumber || "").trim().toLowerCase() === String(route.wagonNumber || "").trim().toLowerCase());
      const key = row ? pooledWagonKey(row) : `${route.wagonNumber}:${route.sourceArrivalId || registry.emptyWagonArrivalId || ''}`;
      initialSelected[key] = true;
      if (route.monthlyOrderId) initialOrderIds[key] = route.monthlyOrderId;
      if (route.monthlyOrderLineId) initialRouteLines[key] = route.monthlyOrderLineId;
    });

    setExpandedId(`reg:${registry.id}`);
    setIsEditingRegistry(true);
    setEditLoadingRegistryNumber(registry.registryNumber);
    setEditLoadingRegistryComment('');
    setEditActionError('');
    setWagonOrderIds(prev => ({ ...prev, ...initialOrderIds }));
    setWagonRouteLines(prev => ({ ...prev, ...initialRouteLines }));
    setSelectedEditWagonKeys(initialSelected);
    setEditAttachedDefectKeys([]);
    setEditAttachedBufferKeys([]);
  };

  const openEditModal = (registry: LoadingRegistry) => {
    startEditingRegistry(registry);
  };

  const handleSaveRegistryEdit = async () => {
    if (!viewedRegistry) return;
    setEditActionError('');

    const regNum = (editLoadingRegistryNumber || viewedRegistry.registryNumber || '').trim();
    if (!regNum) {
      setEditActionError('Hujjat raqami aniqlanmadi');
      return;
    }

    const trimmedComment = editLoadingRegistryComment.trim();
    if (!trimmedComment) {
      setEditActionError('Tahrir sababini izoh sifatida kiritish majburiy');
      return;
    }

    if (selectedEditRows.length === 0) {
      setEditActionError('Kamida 1 ta vagon tanlangan bo‘lishi kerak');
      return;
    }

    for (const r of selectedEditRows) {
      const defective = r.status === 'Returned';
      if (defective) continue;
      const k = pooledWagonKey(r);
      const ordId = wagonOrderIds[k];
      const routeId = wagonRouteLines[k];
      if (!ordId) {
        setEditActionError(`${r.wagonNumber} vagoni uchun buyurtma tanlanmagan`);
        return;
      }
      if (!routeId) {
        setEditActionError(`${r.wagonNumber} vagoni uchun stansiya va kontragent yo‘nalishi tanlanmagan`);
        return;
      }
    }

    const wagonRoutesPayload = selectedEditRows.map(r => {
      const defective = r.status === 'Returned';
      const k = pooledWagonKey(r);
      const ord = orders.find(o => o.id === wagonOrderIds[k]);
      const line = ord?.lines.find(l => l.id === wagonRouteLines[k]);
      const defectiveHasOrder = Boolean(ord?.id && line?.id);
      return {
        wagonNumber: r.wagonNumber,
        sourceArrivalId: r.arrivalId || undefined,
        monthlyOrderId: defective ? (defectiveHasOrder ? ord?.id : undefined) : ord?.id,
        monthlyOrderLineId: defective ? (defectiveHasOrder ? line?.id : undefined) : line?.id,
        productType: r.product,
        nettoWeight: Number(r.netto) || 0,
        includeDefective: defective,
        isDefective: defective,
        defectActNumber: defective ? (r.defectActNumber || undefined) : undefined,
      };
    });

    setIsEditSubmitting(true);
    try {
      const res = await api.updateLoadingRegistry(viewedRegistry.id, {
        registryNumber: regNum,
        revisionComment: trimmedComment,
        wagonRoutes: wagonRoutesPayload,
      });
      if (!res.success) throw new Error(res.message || 'Saqlash amalga oshmadi');
      notifyOrdersChanged();
      setIsEditingRegistry(false);
      await load();
    } catch (err: unknown) {
      setEditActionError(err instanceof Error ? err.message : 'Tahrirni saqlashda xatolik yuz berdi');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  useEffect(() => {
    if (!arrivalIdFromQuery || !isCreateHub || loading) return;
    if (expandedFromQuery?.startsWith('reg:') || searchParams.get('stage') === 'w12') return;
    const task = createTasks.find(t => t.id === arrivalIdFromQuery);
    if (!task) return;
    openCreateModal(task);
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      if (!sp.has('arrivalId')) return prev;
      sp.delete('arrivalId');
      return sp;
    }, { replace: true });
  }, [arrivalIdFromQuery, createTasks, isCreateHub, loading, setSearchParams, expandedFromQuery, searchParams]);

  useEffect(() => {
    if (!expandedFromQuery || !isCreateHub || loading) return;
    if (!expandedFromQuery.startsWith('task:')) return;
    const taskId = expandedFromQuery.slice('task:'.length);
    const task = createTasks.find(item => item.id === taskId);
    if (!task) return;
    openCreateModal(task);
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      if (!sp.has('expanded')) return prev;
      sp.delete('expanded');
      return sp;
    }, { replace: true });
  }, [createTasks, expandedFromQuery, isCreateHub, loading, setSearchParams]);

  // Approve-hub (`/registry/approve`) ochilganda avtomatik modal ko'rsatmaymiz.
  // Modal faqat jadvaldagi "Tasdiqlash" tugmasi bosilganda ochiladi (2-rasmdagi jadval ko'rinishi).

  const closeModal = () => {
    setModalMode(null);
    setModalTask(null);
    setModalRegistry(null);
    setRegistryNumber('');
    setWagonOrderIds({});
    setWagonRouteLines({});
    setModalWagonKeys([]);
    setSelectedWagons({});
    setComment('');
    setModalError('');
  };

  const buildDetailedYukXatiModel = async (
    registry: LoadingRegistry,
    arrival: EmptyWagonArrival | null,
    extraUnitsList?: EmptyWagonUnit[],
  ): Promise<YukXatiModel> => {
    const extraUnits = extraUnitsList ?? arrivals.flatMap(item => (item.wagons ?? []).map(unit => ({
      ...unit,
      emptyWagonArrivalId: item.id,
    })));
    if (!arrival?.dailyPlanId) return buildYukXatiModel(registry, arrival, null, null, extraUnits);
    try {
      const plansRes = await api.getPlans();
      const plan = (plansRes.data ?? []).find(p => p.id === arrival.dailyPlanId) ?? null;
      if (!plan?.monthlyOrderId) return buildYukXatiModel(registry, arrival, plan, null, extraUnits);
      const ordersRes = await api.getOrders(LOGISTICS_TYPES.Railway);
      const order = (ordersRes.data ?? []).find(o => o.id === plan.monthlyOrderId) ?? null;
      return buildYukXatiModel(registry, arrival, plan, order, extraUnits);
    } catch {
      return buildYukXatiModel(registry, arrival, null, null, extraUnits);
    }
  };

  const openYukXatiPreview = async (registry: LoadingRegistry, startEdit = false) => {
    setPreviewLoading(true);
    setRevisionError('');
    try {
      const [res, queueRes] = await Promise.all([
        api.getEmptyWagonArrivals(),
        api.getGateWeighingQueue().catch(() => ({ data: null })),
      ]);
      const arrivalsList = (res.data ?? []) as EmptyWagonArrival[];
      const queueArrivals = ((queueRes?.data as { emptyWagonsQueue?: EmptyWagonArrival[] })?.emptyWagonsQueue ?? []);
      const arrivalsMap = new Map<string, EmptyWagonArrival>();
      for (const arr of arrivalsList) arrivalsMap.set(arr.id.toLowerCase(), arr);
      for (const arr of queueArrivals) {
        if (!arrivalsMap.has(arr.id.toLowerCase())) arrivalsMap.set(arr.id.toLowerCase(), arr);
      }
      const allArrivals = Array.from(arrivalsMap.values());
      const arrival =
        allArrivals.find(a => a.id.toLowerCase() === (registry.emptyWagonArrivalId || '').toLowerCase()) ?? null;
      const extraUnits = allArrivals.flatMap(item => (item.wagons ?? []).map(unit => ({
        ...unit,
        emptyWagonArrivalId: item.id,
      })));
      setPreviewRegistry(registry);
      const model = await buildDetailedYukXatiModel(registry, arrival, extraUnits);
      setPreviewModel(model);
      setEditRegistryNumber(registry.registryNumber);
      setRevisionComment('');
      setEditMode(startEdit);
    } catch (err) {
      console.error('Yuk xati preview error:', err);
      const extraUnits = arrivals.flatMap(item => (item.wagons ?? []).map(unit => ({
        ...unit,
        emptyWagonArrivalId: item.id,
      })));
      setPreviewRegistry(registry);
      setPreviewModel(buildYukXatiModel(registry, null, null, null, extraUnits));
      setEditRegistryNumber(registry.registryNumber);
      setRevisionComment('');
      setEditMode(startEdit);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeYukXatiPreview = () => {
    setPreviewModel(null);
    setPreviewRegistry(null);
    setEditMode(false);
    setEditRegistryNumber('');
    setRevisionComment('');
    setRevisionError('');
    setSearchParams(prev => {
      if (!prev.has('yx')) return prev;
      const sp = new URLSearchParams(prev);
      sp.delete('yx');
      return sp;
    }, { replace: true });
  };

  const openedYxRef = useRef<string | null>(null);
  useEffect(() => {
    if (!yxFromQuery || registries.length === 0) return;
    if (openedYxRef.current === yxFromQuery) return;
    const reg = registries.find(r => r.id.toLowerCase() === yxFromQuery.toLowerCase());
    if (!reg) return;
    openedYxRef.current = yxFromQuery;
    void openYukXatiPreview(reg);
  }, [yxFromQuery, registries]);

  const saveYukXatiRevision = async () => {
    if (!previewRegistry) return;
    const note = revisionComment.trim();
    if (!note) {
      setRevisionError('Saqlashdan oldin izoh majburiy');
      return;
    }
    const number = editRegistryNumber.trim();
    if (!number) {
      setRevisionError('Yuk xati raqami bo‘sh bo‘lmasligi kerak');
      return;
    }
    setRevisionSaving(true);
    setRevisionError('');
    try {
      const res = await api.updateLoadingRegistry(previewRegistry.id, {
        registryNumber: number,
        revisionComment: note,
      });
      if (!res.success) throw new Error(res.message || 'Saqlash amalga oshmadi');
      notifyOrdersChanged();
      await load({ silent: true });
      closeYukXatiPreview();
    } catch (err) {
      setRevisionError(err instanceof Error ? err.message : 'Saqlash amalga oshmadi');
    } finally {
      setRevisionSaving(false);
    }
  };

  const handleDeleteRegistry = async () => {
    if (!deleteConfirmRegistry) return;
    setDeletingRegistry(true);
    try {
      const res = await api.deleteLoadingRegistry(deleteConfirmRegistry.id);
      if (!res.success) throw new Error(res.message || "O'chirishda xatolik yuz berdi");
      const deletedId = deleteConfirmRegistry.id;
      setDeleteConfirmRegistry(null);
      if (viewedRegistry?.id === deletedId) {
        setExpandedId(null);
      }
      notifyOrdersChanged();
      await load({ silent: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "O'chirishda xatolik yuz berdi");
    } finally {
      setDeletingRegistry(false);
    }
  };

  const createRegistry = async () => {
    if (sequenceBlockMessage) {
      setModalError(sequenceBlockMessage);
      return;
    }
    const selectedRows = selectedCreateModalRows;
    if (selectedRows.length === 0) {
      setModalError('Yuk xatiga kamida bitta vagonni tanlang');
      return;
    }
    const healthySelected = selectedRows.filter(row => row.status !== 'Returned');
    if (healthySelected.some(row => !wagonOrderIds[pooledWagonKey(row)])) {
      setModalError('Sog‘lom vagonlarning har biri uchun buyurtmani tanlang');
      return;
    }
    if (healthySelected.some(row => !wagonRouteLines[pooledWagonKey(row)])) {
      setModalError('Sog‘lom vagonlar uchun jo‘natish stansiyasini tanlang');
      return;
    }
    const incompleteDefectiveAssignment = selectedRows
      .filter(row => row.status === 'Returned')
      .some(row => Boolean(wagonOrderIds[pooledWagonKey(row)]) !== Boolean(wagonRouteLines[pooledWagonKey(row)]));
    if (incompleteDefectiveAssignment) {
      setModalError('Nomuvofiq vagon uchun buyurtma va stansiyani birga tanlang yoki ikkalasini ham bo‘sh qoldiring');
      return;
    }
    const res = await api.createLoadingRegistry({
      emptyWagonArrivalId: selectedRows[0].arrivalId,
      registryNumber: registryNumber.trim(),
      monthlyOrderId: null,
      monthlyOrderLineId: null,
      wagonRoutes: selectedRows.map(row => ({
        wagonNumber: row.wagonNumber,
        monthlyOrderId: wagonOrderIds[pooledWagonKey(row)] || null,
        monthlyOrderLineId: wagonRouteLines[pooledWagonKey(row)] || null,
        includeDefective: row.status === 'Returned',
        sourceArrivalId: row.arrivalId,
      })),
    });
    if (!res.success) throw new Error(res.message || 'Reyestr yaratilmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
    if (isCreateHub && res.data?.id) {
      navigate(`/registry?expanded=reg:${res.data.id}`);
    }
  };

  const updateRegistry = async () => {
    if (!modalRegistry) return;
    const note = comment.trim();
    if (!note) {
      setModalError('Saqlashdan oldin o‘zgarish sababi bo‘yicha izoh yozish majburiy');
      return;
    }
    const number = registryNumber.trim();
    if (!number) {
      setModalError('Yuk xati raqami bo‘sh bo‘lmasligi kerak');
      return;
    }
    const selectedRows = selectedCreateModalRows;
    if (selectedRows.length === 0) {
      setModalError('Yuk xatiga kamida bitta vagonni tanlang');
      return;
    }
    const healthySelected = selectedRows.filter(row => row.status !== 'Returned');
    if (healthySelected.some(row => !wagonOrderIds[pooledWagonKey(row)])) {
      setModalError('Sog‘lom vagonlarning har biri uchun buyurtmani tanlang');
      return;
    }
    if (healthySelected.some(row => !wagonRouteLines[pooledWagonKey(row)])) {
      setModalError('Sog‘lom vagonlar uchun jo‘natish stansiyasini tanlang');
      return;
    }
    const incompleteDefectiveAssignment = selectedRows
      .filter(row => row.status === 'Returned')
      .some(row => Boolean(wagonOrderIds[pooledWagonKey(row)]) !== Boolean(wagonRouteLines[pooledWagonKey(row)]));
    if (incompleteDefectiveAssignment) {
      setModalError('Nomuvofiq vagon uchun buyurtma va stansiyani birga tanlang yoki ikkalasini ham bo‘sh qoldiring');
      return;
    }

    setActionConfirmBusy(true);
    try {
      const res = await api.updateLoadingRegistry(modalRegistry.id, {
        registryNumber: number,
        revisionComment: note,
        wagonRoutes: selectedRows.map(row => ({
          wagonNumber: row.wagonNumber,
          monthlyOrderId: wagonOrderIds[pooledWagonKey(row)] || null,
          monthlyOrderLineId: wagonRouteLines[pooledWagonKey(row)] || null,
          includeDefective: row.status === 'Returned',
          sourceArrivalId: row.arrivalId,
        })),
      });
      if (!res.success) throw new Error(res.message || 'Saqlash amalga oshmadi');
      closeModal();
      notifyOrdersChanged();
      await load({ silent: true });
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Saqlash amalga oshmadi');
    } finally {
      setActionConfirmBusy(false);
    }
  };

  const approveShift = async (registry: LoadingRegistry) => {
    const res = await api.approveLoadingRegistryByShift(registry.id);
    if (!res.success) throw new Error(res.message || 'Tasdiqlash amalga oshmadi');
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const approvePermit = async () => {
    if (!modalRegistry) return;
    if (!permitApproved && !comment.trim()) {
      setModalError('Rad etishda izoh majburiy');
      return;
    }
    const res = await api.approvePermit(modalRegistry.id, permitApproved, comment);
    if (!res.success) throw new Error(res.message || 'Kelishish amalga oshmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const approveEconomistWithPermit = async () => {
    if (!modalRegistry) return;
    const res = await api.approveEconomistWithPermit(modalRegistry.id, comment);
    if (!res.success) throw new Error(res.message || 'Kelishish amalga oshmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const approveEconomistWithSecurity = async () => {
    if (!modalRegistry) return;
    const res = await api.approveEconomistWithSecurity(modalRegistry.id, comment);
    if (!res.success) throw new Error(res.message || 'Kelishish amalga oshmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const approveSecurity = async () => {
    if (!modalRegistry) return;
    if (!securityApproved && !comment.trim()) {
      setModalError('Rad etishda izoh majburiy');
      return;
    }
    const res = await api.approveSecurity(modalRegistry.id, securityApproved, comment);
    if (!res.success) throw new Error(res.message || 'Kelishish amalga oshmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const sendExternal = async () => {
    if (!modalRegistry) return;
    const res = await api.sendToExternal(modalRegistry.id, comment);
    if (!res.success) throw new Error(res.message || 'Ro‘yxatdan o‘tkazish amalga oshmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const handover = async () => {
    if (!modalRegistry) return;
    const res = await api.handoverToMachinist(modalRegistry.id, comment);
    if (!res.success) throw new Error(res.message || 'Topshirish amalga oshmadi');
    closeModal();
    notifyOrdersChanged();
    await load({ silent: true });
  };

  const canAnnexDecidePermit = Boolean(
    annexRegistry
    && !isRegistryWorkflowLocked(annexRegistry)
    && canApprovePermit
    && (!usesSequentialWorkflow(annexRegistry) || role === 'Permit' || isAdmin)
    && annexRegistry.isApprovedByShiftSupervisor
    && !annexRegistry.isApprovedByPermit,
  );

  const canAnnexDecideSecurity = Boolean(
    annexRegistry
    && !isRegistryWorkflowLocked(annexRegistry)
    && canApproveSecurity
    && (!usesSequentialWorkflow(annexRegistry) || role === 'Security' || isAdmin)
    && annexRegistry.isApprovedByShiftSupervisor
    && annexRegistry.isApprovedByPermit
    && !annexRegistry.isApprovedBySecurity,
  );


  const submitAnnexDecision = async (approved: boolean) => {
    if (!annexRegistry) return;
    if (!approved && annexComment.trim().length < 3) {
      setAnnexError('Qaytarish sababini yozing (kamida 3 belgi)');
      return;
    }
    setAnnexBusy(true);
    setAnnexError('');
    try {
      let res;
      if (canAnnexDecideSecurity) {
        res = await api.approveSecurity(annexRegistry.id, approved, annexComment);
      } else if (canAnnexDecidePermit) {
        res = await api.approvePermit(annexRegistry.id, approved, annexComment);
      } else if (canApproveShift) {
        if (!approved) {
          res = await api.approvePermit(annexRegistry.id, false, `ICHDX tomonidan qaytarildi: ${annexComment}`);
        } else {
          res = await api.approveLoadingRegistryByShift(annexRegistry.id);
        }
      } else {
        throw new Error('Bu yuk xati bo‘yicha qaror qabul qilib bo‘lmaydi');
      }
      if (!res.success) throw new Error(res.message || 'Amal bajarilmadi');
      setAnnexBusy(false);
      setAnnexReturnOpen(false);
      setAnnexRegistry(null);
      notifyOrdersChanged();
      await load({ silent: true });
    } catch (err: unknown) {
      setAnnexError(err instanceof Error ? err.message : 'Tasdiqlashda xatolik');
      setAnnexBusy(false);
    }
  };

  const requestActionConfirm = (kind: RegistryActionConfirm['kind']) => {
    setModalError('');
    setAnnexError('');
    if (kind === 'annex-return' && annexComment.trim().length < 3) {
      setAnnexError('Qaytarish sababini yozing (kamida 3 belgi)');
      return;
    }
    setActionConfirm({ kind });
  };

  const executeRegistryAction = async (kind: RegistryActionConfirm['kind']) => {
    setModalError('');
    setAnnexError('');

    if (kind === 'permit' && !permitApproved && !comment.trim()) {
      setModalError('Rad etishda izoh majburiy');
      return;
    }
    if (kind === 'security' && !securityApproved && !comment.trim()) {
      setModalError('Rad etishda izoh majburiy');
      return;
    }
    if (kind === 'annex-return' && annexComment.trim().length < 3) {
      setAnnexError('Qaytarish sababini yozing (kamida 3 belgi)');
      return;
    }

    setActionConfirmBusy(true);
    try {
      switch (kind) {
        case 'shift': {
          const targetReg = modalRegistry || annexRegistry;
          if (!targetReg) return;
          await approveShift(targetReg);
          closeModal();
          break;
        }
        case 'economist-permit':
          await approveEconomistWithPermit();
          break;
        case 'economist-security':
          await approveEconomistWithSecurity();
          break;
        case 'permit':
          await approvePermit();
          break;
        case 'security':
          await approveSecurity();
          break;
        case 'send':
          await sendExternal();
          break;
        case 'handover':
          await handover();
          break;
        case 'annex-approve':
          await submitAnnexDecision(true);
          break;
        case 'annex-return':
          await submitAnnexDecision(false);
          break;
      }
      setActionConfirm(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Amal bajarilmadi';
      if (kind === 'annex-approve' || kind === 'annex-return') {
        setAnnexError(message);
      } else {
        setModalError(message);
      }
    } finally {
      setActionConfirmBusy(false);
    }
  };

  const actionConfirmCopy = (() => {
    if (!actionConfirm) return null;
    const registryLabel = annexRegistry?.registryNumber
      ?? modalRegistry?.registryNumber
      ?? modalTask?.arrivalNumber
      ?? 'Yuk xati';

    switch (actionConfirm.kind) {
      case 'shift':
        return {
          title: 'Yuk xatini kelishish',
          message: `${registryLabel} yuk xatidagi ma’lumotlarni tekshirib, kelishilgan deb tasdiqlaysizmi?\n\nKelishuvdan so‘ng Ruxsatnoma byurosi va Qo‘riqlash xizmati kelishuvi ochiladi.`,
          confirmLabel: 'Ha, kelishildi',
        };
      case 'annex-approve':
        return {
          title: canAnnexDecideSecurity ? 'Chiqarishga ruxsat berish' : 'Ruxsatnoma kelishuvi',
          message: canAnnexDecideSecurity
            ? `${registryLabel} yuk xatidagi ma’lumotlarni tekshirib, vagonlarni chiqarishga ruxsat etilgan deb belgilaysizmi?`
            : `${registryLabel} yuk xatidagi ma’lumotlarni tekshirib, kelishilgan deb belgilaysizmi?`,
          confirmLabel: canAnnexDecideSecurity ? 'Ha, ruxsat etildi' : 'Ha, kelishildi',
        };
      case 'annex-return':
        return {
          title: 'Yuk xatini qaytarish',
          message: `${registryLabel} yuk xatini iqtisodchiga qaytarasizmi?\n\nSabab: ${annexComment.trim()}`,
          confirmLabel: 'Ha, qaytaraman',
          variant: 'danger' as const,
        };
      default:
        return null;
    }
  })();

  /** Yuk xatlari sahifasi — faqat shu partiyaning yuk xati. */
  const registryDocumentButton = (registry: LoadingRegistry) => (
    <DocumentChipButton
      title={registry.registryNumber || 'Yuk xatini ko‘rish'}
      onClick={() => void openYukXatiPreview(registry)}
    />
  );

  const registryActions = (r: LoadingRegistry): ReactNode[] => {
    const isShiftApproved = Boolean(r.isApprovedByShiftSupervisor && r.shiftSupervisorApprovedByName?.trim());
    const permitOk = r.isApprovedByPermit;
    const secOk = r.isApprovedBySecurity;
    const ecoPermitOk = r.isEconomistApprovedWithPermit;
    const ecoSecurityOk = r.isEconomistApprovedWithSecurity;
    const onecOk = r.isSentToOneC;
    const naklOk = r.isSentToENakl;
    const handed = !!r.handoverToMachinistAt;
    const actions: ReactNode[] = [];

    if (!isRegistryWorkflowLocked(r) && canApproveShift && !isShiftApproved) {
      actions.push(
        <button
          key="shift-return"
          type="button"
          className="btn-secondary !text-rose-600 dark:!text-rose-400 !border-rose-300 dark:!border-rose-700 !px-2 !py-1 !text-xs inline-flex items-center gap-1 whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setAnnexRegistry(r);
            setModalRegistry(r);
            setAnnexComment('');
            setAnnexError('');
            setAnnexReturnOpen(true);
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          Qaytarish
        </button>,
        <button
          key="shift-approve"
          type="button"
          className="btn-primary !px-2.5 !py-1 !text-xs inline-flex items-center gap-1.5 whitespace-nowrap !bg-emerald-600 hover:!bg-emerald-700 text-white font-medium shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            setAnnexRegistry(r);
            setModalRegistry(r);
            requestActionConfirm('shift');
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          Kelishildi
        </button>,
      );
    }

    if (!isRegistryWorkflowLocked(r) && canCreate && isShiftApproved && !ecoPermitOk) {
      actions.push(
        <button
          key="eco-permit"
          type="button"
          className="btn-secondary reghub-agreement-action reghub-agreement-action--permit !px-2.5 !py-1 !text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setModalRegistry(r);
            setModalTask(null);
            setComment('');
            setModalMode('economist-permit');
          }}
        >
          <Stamp className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          Ruxsatnomaga
        </button>,
      );
    }

    if (!isRegistryWorkflowLocked(r) && canCreate && isShiftApproved && !ecoSecurityOk) {
      actions.push(
        <button
          key="eco-security"
          type="button"
          className="btn-secondary reghub-agreement-action reghub-agreement-action--security !px-2.5 !py-1 !text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setModalRegistry(r);
            setModalTask(null);
            setComment('');
            setModalMode('economist-security');
          }}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          Qo‘riqlashga
        </button>,
      );
    }

    if (!isRegistryWorkflowLocked(r) && canApprovePermit && (!usesSequentialWorkflow(r) || role === 'Permit' || isAdmin) && isShiftApproved && !permitOk) {
      actions.push(
        <button
          key="permit-return"
          type="button"
          className="btn-secondary !text-rose-600 dark:!text-rose-400 !border-rose-300 dark:!border-rose-700 !px-2 !py-1 !text-xs inline-flex items-center gap-1 whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setAnnexRegistry(r);
            setAnnexComment('');
            setAnnexError('');
            setAnnexReturnOpen(true);
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          Qaytarish
        </button>,
        <button
          key="permit-approve"
          type="button"
          className="btn-primary !px-2.5 !py-1 !text-xs inline-flex items-center gap-1.5 whitespace-nowrap !bg-emerald-600 hover:!bg-emerald-700 text-white font-medium shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            setAnnexRegistry(r);
            requestActionConfirm('annex-approve');
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          Kelishildi
        </button>,
      );
    }

    if (!isRegistryWorkflowLocked(r) && canApproveSecurity && (!usesSequentialWorkflow(r) || role === 'Security' || isAdmin) && r.isApprovedByShiftSupervisor && permitOk && !secOk) {
      actions.push(
        <button
          key="sec-return"
          type="button"
          className="btn-secondary !text-rose-600 dark:!text-rose-400 !border-rose-300 dark:!border-rose-700 !px-2 !py-1 !text-xs inline-flex items-center gap-1 whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setAnnexRegistry(r);
            setAnnexComment('');
            setAnnexError('');
            setAnnexReturnOpen(true);
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          Qaytarish
        </button>,
        <button
          key="sec-approve"
          type="button"
          className="btn-primary !px-2.5 !py-1 !text-xs inline-flex items-center gap-1.5 whitespace-nowrap !bg-emerald-600 hover:!bg-emerald-700 text-white font-medium shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            setAnnexRegistry(r);
            requestActionConfirm('annex-approve');
          }}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          Ruxsat etildi
        </button>,
      );
    }

    const isExited = Boolean(r.exitedToKengsoyAt);

    if (canSendExternal && isExited && ecoPermitOk && ecoSecurityOk && permitOk && secOk && !onecOk && !naklOk) {
      actions.push(
        <button
          key="send"
          type="button"
          className="btn-primary !px-3 !py-2 !text-sm whitespace-nowrap"
          onClick={() => {
            setModalRegistry(r);
            setModalTask(null);
            setComment('');
            setModalMode('send');
          }}
        >
          1C / E-nakl ro‘yxatini tasdiqlash
        </button>,
      );
    }

    if (!isRegistryWorkflowLocked(r) && canHandover && permitOk && secOk && !isExited && !handed) {
      actions.push(
        <button
          key="handover"
          type="button"
          className="btn-primary !px-3 !py-2 !text-sm whitespace-nowrap"
          onClick={() => {
            setModalRegistry(r);
            setModalTask(null);
            setComment('');
            setModalMode('handover');
          }}
        >
          Temir yo‘lga
        </button>,
      );
    }

    return actions;
  };

  const approveHubWagonRows = (registry: LoadingRegistry) => {
    const arrival = registry.emptyWagonArrivalId
      ? arrivals.find(item => item.id.toLowerCase() === registry.emptyWagonArrivalId.toLowerCase())
      : undefined;
    const routes = registry.wagonRoutes ?? [];
    if (routes.length > 0) {
      return routes.map(route => {
        const wagonNumber = String(route.wagonNumber || "").trim().toLowerCase();
        const sourceArrivalId = route.sourceArrivalId?.trim().toLowerCase();
        const exact = pooledWagons.find(row =>
          String(row.wagonNumber || "").trim().toLowerCase() === wagonNumber
          && (!sourceArrivalId || row.arrivalId.toLowerCase() === sourceArrivalId),
        );
        if (exact) return exact;
        const rObj = route as Record<string, any>;
        const tare = rObj.tareWeight || '';
        const brutto = rObj.grossWeight || '';
        const netto = rObj.nettoWeight || (rObj.netWeight ? String(rObj.netWeight) : '') || (rObj.NetWeight ? String(rObj.NetWeight) : '') || nettoWeightOf(null, tare, brutto);
        const seal = rObj.sealNumber || '';
        return {
          id: route.wagonNumber,
          wagonNumber: route.wagonNumber,
          cisternNumber: '',
          wagonType: 'sisterna',
          product: toLatinProductName(route.productType || registry.productType) || 'Suyultirilgan gaz',
          tare,
          brutto,
          netto,
          sealNumber: seal,
          status: 'Sealed',
          loadingComment: '',
          defectActFileName: '',
          defectActNumber: '',
          loadingBatchNumber: '',
          loadingCompletedAt: '',
          arrivalId: route.sourceArrivalId || registry.emptyWagonArrivalId || '',
          arrivalNumber: '',
          arrivalDate: registry.preparedAt || '',
        };
      });
    }
    return arrival ? wagonRowsOf(arrival) : [];
  };

  const renderRegCard = (r: LoadingRegistry, idx: number, showStatus = true) => {
    const key = `reg:${r.id}`;
    const registryRows = approveHubWagonRows(r);
    const summaryRows = registryRows.map(row => ({
      wagonType: isWagonKind(row.wagonType) ? row.wagonType : ('sisterna' as WagonKind),
      productType: toLatinProductName(row.product) || row.product || '',
      isDefective: row.status === 'Returned' || Boolean(row.defectActNumber || row.defectActFileName),
    }));
    const fallbackRows = (r.wagonRoutes || []).map(route => ({
      wagonType: 'sisterna' as WagonKind,
      productType: toLatinProductName(route.productType) || route.productType || '',
      isDefective: Boolean(route.isDefective),
    }));
    const finalSummaryRows = summaryRows.length > 0
      ? summaryRows
      : fallbackRows.length > 0
        ? fallbackRows
        : Array.from({ length: r.wagonCount || 1 }).map(() => ({
            wagonType: 'sisterna' as WagonKind,
            productType: toLatinProductName(r.productType) || r.productType || 'Suyultirilgan gaz',
            isDefective: false,
          }));

    const dateLabel = formatDateTimeDisplay(r.preparedAt);
    const statusText = registryStatusText(r);
    const statusClass = registryStatusClass(r);

    return (
      <tr
        key={key}
        className="party-row-open-trigger cursor-pointer"
        onClick={() => setExpandedId(key)}
        title="Yuk xati tarkibini to‘liq ko‘rish"
      >
        <td className="reestr-num">{idx + 1}</td>
        <td className="whitespace-nowrap font-mono font-bold text-center">
          <div className="party-cell-with-indicator">
            <span>{r.registryNumber || '—'}</span>
            <span className="party-row-open-indicator" aria-hidden="true">
              <ChevronDown className="h-4 w-4 -rotate-90" strokeWidth={2.25} />
            </span>
          </div>
        </td>
        <td>{dateLabel || '—'}</td>
        <td className="text-center font-semibold">
          {r.wagonCount} ta
        </td>
        <td><PartyProductsSummary rows={finalSummaryRows} /></td>
        <td><PartyWagonKindsSummary rows={finalSummaryRows} /></td>
        {showStatus ? (
          <td>
            <b className={`inline-flex max-w-full truncate rounded-lg border px-2 py-1 text-sm font-semibold ${statusClass}`}>{statusText}</b>
          </td>
        ) : null}
        <td onClick={event => event.stopPropagation()}>
          <div className="flex items-center gap-1.5 justify-center flex-nowrap">
            {registryDocumentButton(r)}
            {registryActions(r)}
          </div>
        </td>
      </tr>
    );
  };

  const emptyHint = isCreateHub
    ? 'Plomba yakunlangach partiyalar shu yerda paydo bo‘ladi. Yuk xati shakllangach Yuklash jarayonlari → Yuk xatlari arxiviga tushadi.'
    : isApproveHub
      ? 'Iqtisodchi yuk xatini shakllantirgach partiyalar shu yerda paydo bo‘ladi. Tasdiqlangach Yuklash jarayonlari → Yuk xatlari arxivida kelishuv bosqichiga o‘tadi.'
      : isPermitAgreeHub
        ? 'Ruxsatnomaga kelishuv kutilayotgan yuk xatlari shu yerda paydo bo‘ladi.'
        : isSecurityAgreeHub
          ? 'Qo‘riqlashga kelishuv kutilayotgan yuk xatlari shu yerda paydo bo‘ladi.'
          : 'Shakllangan yuk xatlari arxivi. Kelishuv, ro‘yxatdan o‘tkazish va chiqish holati jadvalda ko‘rinadi.';

  const board = () => {
    if (loading) {
      return (
        <div className="thub-empty">
          <p className="thub-empty__title">Yuklanmoqda…</p>
        </div>
      );
    }

    const itemsEmpty = isCreateHub
      ? createPoolRows.length === 0 && boardItems.regs.length === 0
      : boardItems.tasks.length === 0 && boardItems.regs.length === 0;

    if (itemsEmpty) {
      return (
        <div className="thub-empty">
          <PackageOpen className="mx-auto mb-2 h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="thub-empty__title">Partiya yo‘q</p>
          <p className="thub-empty__text">{emptyHint}</p>
          {canCreate && isCreateHub ? (
            <Link to="/seals" className="btn-secondary !mt-3 !inline-flex !text-sm">
              <Lock className="w-3.5 h-3.5" strokeWidth={2} />
              Plomba o‘rnatishga
            </Link>
          ) : null}
        </div>
      );
    }

    if (isCreateHub) {
      const enaklRegs = [...boardItems.regs].sort((a, b) =>
        docsDateKey(b.preparedAt || '').localeCompare(docsDateKey(a.preparedAt || '')),
      );

      const readyWagonCount = outgoingDraftGroups.reduce((acc, g) => acc + g.rows.length, 0);

      return (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Shakllantirilgan yuk xatlari</h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Barcha yaratilgan va tasdiqlash jarayonidagi yuk xatlari ro‘yxati
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  userClosedDraft.current = false;
                  if (outgoingDraftGroups.length > 0) {
                    setExpandedId(`draft:${outgoingDraftGroups[0].key}`);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all shadow-sm bg-sky-600 text-white hover:bg-sky-700 active:scale-[0.99] cursor-pointer shadow-sky-600/20"
                title="Chiqishga tayyor vagonlardan yangi yuk xati shakllantirish (Dual oyna)"
              >
                <Columns className="h-4 w-4 stroke-[2.5]" />
                <span>Yuk xati tayyorlash (Dual oyna)</span>
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  readyWagonCount > 0
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {readyWagonCount} ta vagon tayyor
                </span>
              </button>
            </div>
          </div>

          <div className="thub-table-wrap reestr-table-wrap mb-4">
            <table className="thub-table reestr-table docs-hub-table registry-archive-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Hujjat raqami</th>
                  <th>Sana / vaqt</th>
                  <th>Vagon soni</th>
                  <th>Mahsulot</th>
                  <th>Vagon turi</th>
                  <th>Holat</th>
                  <th>Hujjat</th>
                </tr>
              </thead>
              <tbody>
                {outgoingDraftGroups.map((group, gIdx) => {
                  const draftSummaryRows = group.rows.map(row => ({
                    wagonType: isWagonKind(row.wagonType) ? row.wagonType : ('sisterna' as WagonKind),
                    productType: toLatinProductName(row.product) || row.product || '',
                    isDefective: row.status === 'Returned' || Boolean(row.defectActNumber || row.defectActFileName),
                  }));
                  return (
                    <tr
                      key={`draft:${group.key}`}
                      className="cursor-pointer bg-sky-50/40 hover:bg-sky-100/50 dark:bg-sky-950/20 dark:hover:bg-sky-900/30 font-semibold"
                      onClick={() => setExpandedId(`draft:${group.key}`)}
                    >
                      <td className="thub-mono reestr-num text-center">{gIdx + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="thub-table__code text-sky-700 dark:text-sky-300 font-bold">{group.partyNumber}</span>
                          <span className="inline-flex rounded-md border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:border-sky-700 dark:bg-sky-900 dark:text-sky-200">
                            Yangi / Tayyor
                          </span>
                        </div>
                      </td>
                      <td>{formatDateTimeDisplay(group.date)}</td>
                      <td className="text-center font-bold text-sky-700 dark:text-sky-300">{group.rows.length} ta</td>
                      <td><PartyProductsSummary rows={draftSummaryRows} /></td>
                      <td><PartyWagonKindsSummary rows={draftSummaryRows} /></td>
                      <td>
                        <b className="inline-flex max-w-full truncate rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Shakllantirishga tayyor
                        </b>
                      </td>
                      <td onClick={event => event.stopPropagation()}>
                        <button
                          type="button"
                          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap !bg-sky-600 !text-white hover:!bg-sky-700"
                          onClick={() => setExpandedId(`draft:${group.key}`)}
                        >
                          <FileText className="w-3.5 h-3.5" strokeWidth={2} />
                          Yuk xati tayyorlash ({group.rows.length})
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {enaklRegs.map((registry, idx) => renderRegCard(registry, outgoingDraftGroups.length + idx))}
                {outgoingDraftGroups.length === 0 && enaklRegs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Hozircha shakllantirilgan yuk xatlari mavjud emas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    if (isApproveHub) {
      const regs = [...boardItems.regs].sort((a, b) =>
        docsDateKey(b.preparedAt || '').localeCompare(docsDateKey(a.preparedAt || '')),
      );

      if (regs.length === 0) {
        return (
          <div className="thub-empty">
            <p className="thub-empty__title">Tasdiqlash kutilayotgan yuk xati yo‘q</p>
            <p className="thub-empty__text">Iqtisodchi yuk xatini shakllantirgach partiyalar shu yerda paydo bo‘ladi.</p>
          </div>
        );
      }

      return (
        <div className="thub-table-wrap reestr-table-wrap">
          <table className="thub-table reestr-table docs-hub-table registry-archive-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Hujjat raqami</th>
                <th>Sana / vaqt</th>
                <th>Vagon soni</th>
                <th>Mahsulot</th>
                <th>Vagon turi</th>
                <th>Holat</th>
                <th>Hujjat</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((registry, idx) => renderRegCard(registry, idx))}
            </tbody>
          </table>
        </div>
      );
    }

    if (isPermitAgreeHub) {
      const regs = [...boardItems.regs].sort((a, b) =>
        docsDateKey(b.preparedAt || '').localeCompare(docsDateKey(a.preparedAt || '')),
      );

      if (regs.length === 0) {
        return (
          <div className="thub-empty">
            <p className="thub-empty__title">
              {arrivalIdFromQuery
                ? 'Ushbu partiya bo‘yicha kelishuv kutilayotgan yuk xati yo‘q'
                : 'Kelishuv kutilayotgan yuk xati yo‘q'}
            </p>
            <p className="thub-empty__text">
              {arrivalIdFromQuery
                ? 'Tanlangan partiyada kelishuv kutilayotgan yuk xati mavjud emas.'
                : 'Tasdiqlangan yuk xatlari kelishuv uchun shu yerda paydo bo‘ladi.'}
            </p>
            {arrivalIdFromQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchParams(prev => {
                    const sp = new URLSearchParams(prev);
                    sp.delete('arrivalId');
                    return sp;
                  }, { replace: true });
                }}
                className="btn-primary !mt-3 !inline-flex !text-sm"
              >
                Barcha partiyalarni ko‘rish
              </button>
            )}
          </div>
        );
      }

      return (
        <div className="thub-table-wrap reestr-table-wrap">
          <table className="thub-table reestr-table docs-hub-table registry-archive-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Hujjat raqami</th>
                <th>Sana / vaqt</th>
                <th>Vagon soni</th>
                <th>Mahsulot</th>
                <th>Vagon turi</th>
                <th>Holat</th>
                <th>Hujjat</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((registry, idx) => renderRegCard(registry, idx))}
            </tbody>
          </table>
        </div>
      );
    }

    if (isSecurityAgreeHub) {
      const regs = [...boardItems.regs].sort((a, b) =>
        docsDateKey(b.preparedAt || '').localeCompare(docsDateKey(a.preparedAt || '')),
      );

      if (regs.length === 0) {
        return (
          <div className="thub-empty">
            <p className="thub-empty__title">
              {arrivalIdFromQuery
                ? 'Ushbu partiya bo‘yicha qo‘riqlash kelishuvi kutilayotgan yuk xati yo‘q'
                : 'Qo‘riqlash kelishuvi kutilayotgan yuk xati yo‘q'}
            </p>
            <p className="thub-empty__text">
              {arrivalIdFromQuery
                ? 'Tanlangan partiyada qo‘riqlash kelishuvi kutilayotgan yuk xati mavjud emas.'
                : 'Qo‘riqlash kelishuvi kutilayotgan yuk xatlari shu yerda paydo bo‘ladi.'}
            </p>
            {arrivalIdFromQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchParams(prev => {
                    const sp = new URLSearchParams(prev);
                    sp.delete('arrivalId');
                    return sp;
                  }, { replace: true });
                }}
                className="btn-primary !mt-3 !inline-flex !text-sm"
              >
                Barcha partiyalarni ko‘rish
              </button>
            )}
          </div>
        );
      }

      return (
        <div className="thub-table-wrap reestr-table-wrap">
          <table className="thub-table reestr-table docs-hub-table registry-archive-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Hujjat raqami</th>
                <th>Sana / vaqt</th>
                <th>Vagon soni</th>
                <th>Mahsulot</th>
                <th>Vagon turi</th>
                <th>Holat</th>
                <th>Hujjat</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((registry, idx) => renderRegCard(registry, idx))}
            </tbody>
          </table>
        </div>
      );
    }

    if (filteredYukRows.length === 0) {
      return (
        <div className="thub-empty">
          <p className="thub-empty__title">Mos yuk xati yo‘q</p>
          <p className="thub-empty__text">Qidiruv yoki davrni o‘zgartiring.</p>
        </div>
      );
    }

    return (
      <div className="thub-table-wrap reestr-table-wrap">
        <table className="thub-table reestr-table docs-hub-table registry-archive-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Hujjat raqami</th>
              <th>Sana / vaqt</th>
              <th>Vagon soni</th>
              <th>Mahsulot</th>
              <th>Vagon turi</th>
              <th>Holat</th>
              <th>Hujjat</th>
            </tr>
          </thead>
          <tbody>
            {pagedYuk.slice.map((row, i) => {
              const idx = pagedYuk.startIndex + i;
              return row.kind === 'reg'
                ? renderRegCard(row.registry, idx, true)
                : null;
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Both view modes share action labels, handlers and counts.
  const renderDraftCompositionActions = () => (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Yuk xati tarkibiga vagon qo‘shish">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEmptyDispatchOpen(true);
                        setEmptySelectedWagonKeys(new Set());
                        setEmptyError('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 transition-colors shadow-xs cursor-pointer"
                      title="Yuklanmagan / Bo‘sh vagonlarni ushbu tarkibga qo‘shish yoki alohida chiqarish"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={2} />
                      <span>Bo‘sh vagon qo‘shish</span>
                      {availableEmptyWagons.length > 0 && (
                        <span className="rounded-full bg-amber-200/90 px-1.5 py-0.2 text-[10px] font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                          {availableEmptyWagons.length} ta
                        </span>
                      )}
                    </button>

                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                          onClick={() => {
                            setSelectedPickerDefectKeys([]);
                            setIsDefectPickerOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 stroke-[2.5] text-amber-700 dark:text-amber-300" />
                          <span>Nomuvofiq vagon qo‘shish</span>
                          {availableDefectRowsForDraft.length > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold shadow-xs dark:bg-amber-500 dark:text-slate-950">
                              {availableDefectRowsForDraft.length}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-200"
                          onClick={() => {
                            setSelectedPickerBufferKeys([]);
                            setIsBufferPickerOpen(true);
                          }}
                        >
                          <Layers className="h-4 w-4 stroke-[2.5] text-sky-700 dark:text-sky-300" />
                          <span>Qolgan vagonlardan qo‘shish</span>
                          {availableBufferRowsForDraft.length > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-sky-600 text-white text-xs font-bold shadow-xs dark:bg-sky-500 dark:text-slate-950">
                              {availableBufferRowsForDraft.length}
                            </span>
                          )}
                        </button>
    </div>
  );

  const renderDraftDualWindow = () => {
    if (!viewedDraftGroup) return null;

    return (
      <div className="space-y-4 p-4 lg:p-6 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800">
        {draftActionSuccess && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{draftActionSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setDraftActionSuccess('')}
              className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer font-bold px-1"
              title="Yopish"
            >
              ✕
            </button>
          </div>
        )}
        {draftActionError && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{draftActionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setDraftActionError('')}
              className="text-rose-600 hover:text-rose-800 dark:text-rose-400 cursor-pointer font-bold px-1"
              title="Yopish"
            >
              ✕
            </button>
          </div>
        )}
        {/* 2 COLUMN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* CHAP OYNA (Left Panel): Mavjud vagonlar zaxirasi */}
          <div className="lg:col-span-5 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Mavjud vagonlar zaxirasi</h4>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300" title="Zaxiradagi jami vagonlar">
                        {availableReserveRows.length} ta
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Tarkibga biriktirish mumkin bo‘lgan vagonlar</p>
                  </div>
                </div>
                
              </div>

              {/* Search and Filters */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Vagon №, mahsulot, partiya, plomba..."
                    value={dualSearch}
                    onChange={e => setDualSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  {dualSearch && (
                    <button
                      type="button"
                      onClick={() => setDualSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDualFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      dualFilter === 'all'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Barchasi ({availableReserveRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDualFilter('sealed')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      dualFilter === 'sealed'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Plombali ({availableReserveRows.filter(r => Boolean(r.sealNumber)).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDualFilter('empty')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      dualFilter === 'empty'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Bo‘sh ({availableReserveRows.filter(r => (r.status === 'Returned' || hasDefectAct(r)) && !isWagonLoaded(r)).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDualFilter('defective')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      dualFilter === 'defective'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Nomuvofiq ({availableReserveRows.filter(r => r.status === 'Returned' || hasDefectAct(r)).length})
                  </button>
                </div>
              </div>
            </div>

            {/* Select All & Action bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 text-xs">
              <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllLeftReserveSelected}
                  ref={el => { if (el) el.indeterminate = isLeftReserveIndeterminate; }}
                  onChange={e => handleToggleSelectAllLeftReserve(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <span>Barchasini tanlash</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {dualLeftSelectedKeys.length} ta tanlandi
                </span>
                <button
                  type="button"
                  onClick={() => handleTransferToDraft()}
                  disabled={dualLeftSelectedKeys.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer"
                >
                  <span>Tarkibga o‘tkazish</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleTransferAllToDraft()}
                  disabled={availableReserveRows.length === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Zaxiradagi barcha vagonlarni tarkibga o‘tkazish"
                >
                  <span>Barchasini o‘tkazish</span>
                </button>
              </div>
            </div>

            {/* List of Reserve Wagons */}
            <div className="p-3 overflow-y-auto max-h-[580px] space-y-2.5 min-h-[260px]">
              {filteredReserveRows.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Database className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="text-xs font-medium">Zaxirada mos vagonlar topilmadi</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {createPoolRows.length === 0
                      ? 'Chiqishga tayyor vagonlar hali mavjud emas (tarozi va plombalash kutilmoqda)'
                      : 'Barcha mavjud vagonlar allaqachon tarkibga qo‘shilgan yoki filtrga to‘g‘ri kelmaydi'}
                  </p>
                </div>
              ) : (
                filteredReserveRows.map(row => {
                  const formKey = pooledWagonKey(row);
                  const isSelected = dualLeftSelectedKeys.includes(formKey);
                  const isDefective = row.status === 'Returned' || hasDefectAct(row);
                  const awaitingSeal = isAwaitingSeal(row);

                  return (
                    <div
                      key={formKey}
                      onClick={() => {
                        if (awaitingSeal) {
                          setDraftActionError('Qizil rangdagi vagon uchun avval 1C / Plomba bo‘limida plomba raqamini kiriting');
                          return;
                        }
                        setDualLeftSelectedKeys(prev =>
                          prev.includes(formKey) ? prev.filter(k => k !== formKey) : [...prev, formKey]
                        );
                      }}
                      className={`group relative flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30 shadow-xs ring-1 ring-sky-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-300 dark:hover:border-slate-700 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={awaitingSeal}
                          onChange={e => {
                            e.stopPropagation();
                            setDualLeftSelectedKeys(prev =>
                              e.target.checked ? [...prev, formKey] : prev.filter(k => k !== formKey)
                            );
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                              № {row.wagonNumber}
                            </span>
                            <span className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              {toLatinProductName(row.product || '')}
                            </span>
                            {row.netto && (
                              <span className="text-xs font-semibold text-sky-700 dark:text-sky-300 font-mono">
                                {parseFloat(row.netto).toFixed(1)} t
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                            {row.sealNumber ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                SHGKM: {row.sealNumber}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                                title="Bu vagon uchun SHGKM plombasi yoki 1C ga kiritilmagan. Adminga murojaat qiling (/admin/integrations/1c orqali to'g'irlanadi)"
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                SHGKM plombasi yoki 1C ga kiritilmagan
                              </span>
                            )}
                            <span>·</span>
                            <span>Partiya: {row.arrivalNumber || '—'}</span>
                            {isDefective && (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                Brak
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {awaitingSeal ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/weighing?zone=seals&arrivalId=${encodeURIComponent(row.arrivalId)}`);
                          }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-600 hover:text-white dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 cursor-pointer"
                          title="1C / Plomba bo‘limida plomba raqamini kiritish"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>1C / Plomba</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleTransferToDraft([formKey]);
                          }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-all hover:bg-sky-600 hover:text-white hover:border-sky-600 active:scale-95 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 cursor-pointer"
                          title="Ushbu vagonni tarkibga qo‘shish"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Qo‘shish</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* MIDDLE CONTROLS (Desktop transfer buttons) */}
          <div className="hidden lg:col-span-1 lg:flex flex-col items-center justify-center gap-3 pt-28">
            <button
              type="button"
              onClick={() => handleTransferToDraft()}
              disabled={dualLeftSelectedKeys.length === 0}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md hover:bg-sky-700 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Tanlangan vagonlarni tarkibga o‘tkazish"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleRemoveFromDraft(dualRightSelectedKeys)}
              disabled={dualRightSelectedKeys.length === 0}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 shadow-sm hover:bg-rose-50 hover:border-rose-300 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 cursor-pointer"
              title="Tanlangan vagonlarni zaxiraga qaytarish"
            >
              <Undo2 className="w-5 h-5" />
            </button>
          </div>

          {/* O‘NG OYNA (Right Panel): Yuk xatiga biriktirilgan tarkib */}
          <div className="lg:col-span-6 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <TrainFront className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Yuk xatiga biriktirilgan tarkib</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Shakllantirilayotgan yuk xatiga kiritilgan vagonlar va yo‘nalishlar
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {selectedDraftRows.length} ta vagon
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono">
                    {totalDraftNetto.toFixed(1)} t
                  </span>
                </div>
              </div>

              {/* Batch assign toolbar */}
              <div className="p-2.5 rounded-xl border border-sky-100 bg-sky-50/40 dark:border-sky-950 dark:bg-sky-950/20">
                <div className="text-[11px] font-bold text-sky-900 dark:text-sky-300 mb-1.5 flex items-center justify-between">
                  <span>Tezkor to‘ldirish (barcha vagonlarga qo‘llash):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <select
                      value={batchAssignOrderId}
                      onChange={e => {
                        setBatchAssignOrderId(e.target.value);
                        setBatchAssignLineId('');
                      }}
                      className="w-full py-1 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">— Buyurtma tanlash —</option>
                      {orders.filter(o => o.status === 'Active' && (selectedDraftRows.length === 0 || selectedDraftRows.some(r => sameProduct(o.productType, r.product)))).map(o => (
                        <option key={o.id} value={o.id}>
                          {o.orderNumber} ({toLatinProductName(o.productType || '')})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-6">
                    <select
                      value={batchAssignLineId}
                      onChange={e => setBatchAssignLineId(e.target.value)}
                      disabled={!batchAssignOrderId}
                      className="w-full py-1 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="">— Stansiya va kontragent —</option>
                      {(orders.find(o => o.id === batchAssignOrderId)?.lines || []).map(line => {
                        const isOverLimit = line.wagonCount > 0 && (line.fulfilledWagonCount ?? 0) >= line.wagonCount;
                        const remaining = line.wagonCount > 0 ? Math.max(0, line.wagonCount - (line.fulfilledWagonCount ?? 0)) : 0;
                        return (
                          <option key={line.id} value={line.id}>
                            {line.destinationStation} — {line.contractor || 'Kontragent'} {line.wagonCount > 0 ? (isOverLimit ? `[Limit to‘lgan: ${line.fulfilledWagonCount}/${line.wagonCount} ⚠️]` : `(Qoldiq: ${remaining} ta)`) : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      disabled={!batchAssignOrderId}
                      onClick={() => handleApplyOrderAndRouteToAll(batchAssignOrderId, batchAssignLineId)}
                      className="w-full py-1 px-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      Qo‘llash
                    </button>
                  </div>
                </div>
                {(() => {
                  const selectedLine = orders.find(o => o.id === batchAssignOrderId)?.lines.find(l => l.id === batchAssignLineId);
                  if (!selectedLine) return null;
                  const isOver = selectedLine.wagonCount > 0 && (selectedLine.fulfilledWagonCount ?? 0) >= selectedLine.wagonCount;
                  if (isOver) {
                    return (
                      <div className="mt-2 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg p-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span><strong>Ogohlantirish (Limit to‘lgan):</strong> {selectedLine.destinationStation} ({selectedLine.contractor}) bo‘yicha reja {selectedLine.wagonCount} ta, bajarilgan {selectedLine.fulfilledWagonCount} ta. Vagonlar ogohlantirish bilan biriktiriladi va yuk xati shakllantiriladi.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Select All & Action bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 text-xs">
              <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllRightDraftSelected}
                  ref={el => { if (el) el.indeterminate = isRightDraftIndeterminate; }}
                  onChange={e => handleToggleSelectAllRightDraft(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Barchasini tanlash</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {dualRightSelectedKeys.length} ta tanlandi
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveFromDraft(dualRightSelectedKeys)}
                  disabled={dualRightSelectedKeys.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Zaxiraga qaytarish</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAllFromDraft()}
                  disabled={selectedDraftRows.length === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                  title="Tarkibdagi barcha vagonlarni zaxiraga qaytarish"
                >
                  <span>Barchasini qaytarish</span>
                </button>
              </div>
            </div>

            {/* List of Assigned Wagons */}
            <div className="p-3 overflow-y-auto max-h-[580px] space-y-3 min-h-[260px]">
              {selectedDraftRows.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <TrainFront className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="text-xs font-medium">Hozircha vagonlar biriktirilmagan</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Chap tarafdagi zaxiradan vagonlarni tanlab tarkibga qo‘shing</p>
                </div>
              ) : (
                selectedDraftRows.map((row, idx) => {
                  const formKey = pooledWagonKey(row);
                  const isSelected = dualRightSelectedKeys.includes(formKey);
                  const defective = row.status === 'Returned';
                  const currentOrderId = wagonOrderIds[formKey] || '';
                  const currentRouteLine = wagonRouteLines[formKey] || '';
                  const matchingOrders = getMatchingActiveOrders(orders, row.product, currentOrderId);
                  const selectedOrder = orders.find(o => o.id === currentOrderId);
                  const isConfigured = defective || (currentOrderId && currentRouteLine);

                  return (
                    <div
                      key={formKey}
                      className={`p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs ring-1 ring-emerald-500/20'
                          : isConfigured
                            ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                            : 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => {
                              setDualRightSelectedKeys(prev =>
                                e.target.checked ? [...prev, formKey] : prev.filter(k => k !== formKey)
                              );
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                          />
                          <span className="text-xs font-semibold text-slate-400">#{idx + 1}</span>
                          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                            № {row.wagonNumber}
                          </span>
                          <span className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            {toLatinProductName(row.product || '')}
                          </span>
                          {row.netto && (
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 font-mono">
                              {parseFloat(row.netto).toFixed(1)} t
                            </span>
                          )}
                          {row.sealNumber && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <Lock className="w-3 h-3 text-slate-400" />
                              {row.sealNumber}
                            </span>
                          )}
                          {defective && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Brak
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFromDraft([formKey])}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md transition-colors dark:hover:bg-rose-950/50 cursor-pointer"
                          title="Tarkibdan chiqarish (zaxiraga qaytarish)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Selectors for Healthy Wagons */}
                      {!defective ? (
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              Buyurtma:
                            </label>
                            <select
                              value={currentOrderId}
                              onChange={e => {
                                const nextOrderId = e.target.value;
                                setWagonOrderIds(prev => ({ ...prev, [formKey]: nextOrderId }));
                                setWagonRouteLines(prev => {
                                  const next = { ...prev };
                                  delete next[formKey];
                                  return next;
                                });
                                setDraftActionError('');
                              }}
                              className={`w-full py-1 px-2 text-xs rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white ${
                                !currentOrderId
                                  ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-400/30'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <option value="">— Buyurtma tanlang —</option>
                              {matchingOrders.map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.orderNumber} ({toLatinProductName(o.productType || '')})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              Stansiya va kontragent:
                            </label>
                            <select
                              value={currentRouteLine}
                              disabled={!currentOrderId}
                              onChange={e => {
                                setWagonRouteLines(prev => ({ ...prev, [formKey]: e.target.value }));
                                setDraftActionError('');
                              }}
                              className={`w-full py-1 px-2 text-xs rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-50 ${
                                currentOrderId && !currentRouteLine
                                  ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-400/30'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <option value="">— Stansiya / Kontragent —</option>
                              {(selectedOrder?.lines || []).map(line => {
                                const isOverLimit = line.wagonCount > 0 && (line.fulfilledWagonCount ?? 0) >= line.wagonCount;
                                const remaining = line.wagonCount > 0 ? Math.max(0, line.wagonCount - (line.fulfilledWagonCount ?? 0)) : 0;
                                return (
                                  <option key={line.id} value={line.id}>
                                    {line.destinationStation} — {line.contractor || 'Kontragent'} {line.wagonCount > 0 ? (isOverLimit ? `[Limit to‘lgan: ${line.fulfilledWagonCount}/${line.wagonCount} ⚠️]` : `(Qoldiq: ${remaining} ta)`) : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-amber-700 dark:text-amber-400">
                          Ushbu vagon nuqsonli bo‘lgani uchun zavodga qaytariladi yoki ta’mirlashga yo‘naltiriladi.
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const leavePreparation = (registryId?: string) => {
    setModalMode(null);
    setIsEmptyDispatchOpen(false);
    setIsDefectPickerOpen(false);
    setIsBufferPickerOpen(false);
    userClosedDraft.current = true;
    setExpandedId(registryId ? `reg:${registryId}` : null);
  };

  const isPreparingNewRegistry = (isCreateHub && !viewedRegistry)
    || Boolean(expandedId?.startsWith('draft:') || expandedId?.startsWith('task:'))
    || modalMode === 'create'
    || (isEmptyDispatchOpen && !isEditingRegistry);
  if (isPreparingNewRegistry && preparationBlockMessage) {
    const blockingPending = unfinishedRegistry ? getRegistryPendingActionInfo(unfinishedRegistry) : null;
    return (
      <div className="thub reestr reghub">
        <section className="ui-card p-6 sm:p-7 space-y-5" role="status">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shadow-xs">
              <AlertTriangle className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Chiqishga tayyorlash vaqtincha yopiq</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Ketma-ketlik qoidasiga ko‘ra, yangi yuk xati shakllantirishdan oldin avvalgi yuk xati sikli to‘liq yakunlanishi kerak.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/50 dark:bg-amber-950/25 space-y-4">
            <div className="text-sm font-semibold text-amber-950 dark:text-amber-200 leading-relaxed">
              {loading ? 'Yuk xatlari holati tekshirilmoqda…' : sequenceBlockMessage || preparationBlockMessage}
            </div>

            {blockingPending && (
              <div className="rounded-xl border border-amber-300/80 bg-white/95 p-4 dark:border-amber-800/70 dark:bg-slate-900/90 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Hozirda kim bosishi / tasdiqlashi kutilmoqda:
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">
                    № {blockingPending.registryNumber}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Hozirgi mas’ul:</span>
                    <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      {blockingPending.responsibleRole}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Kutilayotgan amal:</span>
                    <span className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                      {blockingPending.actionName}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 leading-relaxed border border-slate-200/80 dark:border-slate-800">
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">Tushuntirish: </strong>
                  {blockingPending.detailText}
                </div>
              </div>
            )}

            {blockingPending && (
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Yuk xati sikli bosqichlari:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                  {blockingPending.steps.map((st) => (
                    <div
                      key={st.stepNumber}
                      className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                        st.isDone
                          ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : st.isRejected
                          ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 ring-2 ring-rose-400/40'
                          : st.isCurrent
                          ? 'border-amber-400 bg-amber-100/90 text-amber-950 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-200 ring-2 ring-amber-400/60 shadow-xs font-medium'
                          : 'border-slate-200/80 bg-slate-50/70 text-slate-400 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-500'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1 font-mono text-[11px] font-bold">
                          <span>{st.stepNumber}-bosqich</span>
                          <span>
                            {st.isDone ? '✓ Bajarildi' : st.isRejected ? '✕ Qaytarildi' : st.isCurrent ? '⏳ Kutilmoqda' : 'Navbatda'}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{st.title}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{st.role}</div>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] font-medium">
                        {st.isDone ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">Yakunlangan</span>
                        ) : st.isRejected ? (
                          <span className="text-rose-700 dark:text-rose-400 font-bold">Rad etilgan</span>
                        ) : (
                          <span className={st.isCurrent ? 'text-amber-800 dark:text-amber-300 font-bold' : 'text-slate-400'}>
                            {st.actionRequired}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {preparationChecked && unfinishedRegistry && (
              <Link
                className="btn-primary !py-2.5 !px-5 inline-flex items-center gap-2 shadow-xs"
                onClick={() => leavePreparation(unfinishedRegistry.id)}
                to={`/registry?expanded=reg:${unfinishedRegistry.id}`}
              >
                <FileText className="w-4 h-4" />
                Avvalgi yuk xatini ochish ({unfinishedRegistry.registryNumber})
              </Link>
            )}
            <button type="button" className="btn-secondary !py-2.5 !px-4" disabled={loading} onClick={() => void load()}>
              Holatni yangilash
            </button>
            <Link className="btn-secondary !py-2.5 !px-4" onClick={() => leavePreparation()} to="/registry">
              Yuk xatlari ro‘yxati
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="thub reestr reghub">
      <section className="thub__main reestr-main">
        {viewedRegistry || viewedDraftGroup || (viewedTask && !isRegistryWorkHub) ? (
          <div className="marketing-order-page space-y-4">
            <div className="marketing-order-page__bar ui-card flex items-center justify-between">
              <div className="marketing-order-page__bar-main">
                <ProductDetailBackButton localOnly={isEditingRegistry} onClick={closeExpanded} />
                <div className="min-w-0">
                  <h2 className="marketing-order-page__title">
                    {viewedDraftGroup
                      ? 'Yuk xati tayyorlash'
                      : (viewedRegistry && isEditingRegistry)
                        ? 'Yuk xatini tahrirlash'
                        : 'Yuk xati'}
                  </h2>
                  <p className="marketing-order-page__subtitle">
                    {viewedDraftGroup?.partyNumber || viewedTask?.arrivalNumber || viewedRegistry?.registryNumber || '—'}
                    {viewedRegistry && isEditingRegistry ? ' · Saqlashdan oldin izoh yozish majburiy' : ''}
                  </p>
                </div>
              </div>
              {viewedRegistry && !isEditingRegistry && registryActions(viewedRegistry).length > 0 && (
                <div className="flex items-center gap-2 pr-2">
                  {registryActions(viewedRegistry)}
                </div>
              )}
            </div>

            <section className="order-sheet-card registry-detail-card">
              <header className="order-sheet-header">
                <div className="order-sheet-header__main">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                    <FileText className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <div className="order-sheet-header__text">
                    <div className="order-sheet-header__title-row">
                      <span className="order-sheet-header__product font-mono font-bold">
                        {viewedDraftGroup?.partyNumber || ((viewedRegistry && isEditingRegistry) ? 'Yuk xatini tahrirlash' : (viewedTask ? 'Yuk xati tayyorlash' : viewedRegistry?.registryNumber || 'Yuk xati'))}
                      </span>
                      <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        {viewedDraftGroup
                          ? `${selectedDraftRows.length} / ${effectiveDraftGroupRows.length} ta vagon`
                          : (viewedRegistry && isEditingRegistry)
                            ? `${selectedEditRows.length} / ${effectiveEditRegistryRows.length} ta vagon`
                            : `${viewedTask?.wagonCount || viewedRegistry?.wagonCount || 0} ta vagon`}
                      </span>
                    </div>
                    <span className="order-sheet-header__code">
                      {viewedDraftGroup
                        ? `${new Set(effectiveDraftGroupRows.map(r => r.arrivalNumber || r.arrivalId).filter(Boolean)).size} ta manba kirish partiyasi`
                        : (viewedRegistry && isEditingRegistry)
                          ? `${viewedRegistry.registryNumber} · Tahrirlash rejimi`
                          : viewedTask?.arrivalNumber || viewedRegistry?.registryNumber || '—'}
                    </span>
                  </div>
                </div>
                {viewedDraftGroup && (
                  <div className="order-sheet-header__aside flex items-center gap-2 flex-wrap">
                    {renderDraftCompositionActions()}

                    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setDraftViewMode('dual')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          draftViewMode === 'dual'
                            ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-900 dark:text-sky-300'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                        title="Ikki oynali doska rejimi (zaxira va tarkib yonma-yon)"
                      >
                        <Columns className="w-3.5 h-3.5" />
                        <span>Dual oyna (Tarkib tanlash)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftViewMode('table')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          draftViewMode === 'table'
                            ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-900 dark:text-sky-300'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                        title="Kengaytirilgan 12 ustunli jadval rejimi"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Kengaytirilgan jadval</span>
                      </button>
                    </div>
                  </div>
                )}
                {!viewedDraftGroup && !isEditingRegistry && (
                  <div className="order-sheet-header__aside">
                    {viewedRegistry ? registryActions(viewedRegistry) : null}
                    {viewedRegistry ? registryDocumentButton(viewedRegistry) : null}
                    {viewedRegistry && !isRegistryWorkflowLocked(viewedRegistry) && (canEdit || canDelete) && !viewedRegistry.isSentToENakl && !viewedRegistry.isSentToOneC ? (
                      <OrderSheetMenu
                        items={[
                          ...(canEdit ? [{
                            key: 'edit',
                            label: 'Tahrirlash',
                            icon: Pencil,
                            onClick: () => openEditModal(viewedRegistry),
                          }] : []),
                          ...(canDelete ? [{
                            key: 'delete',
                            label: "O'chirish",
                            icon: Trash2,
                            variant: 'danger' as const,
                            onClick: () => setDeleteConfirmRegistry(viewedRegistry),
                          }] : []),
                        ]}
                      />
                    ) : null}
                    {viewedTask ? (
                      <button type="button" className="btn-primary !text-sm" onClick={() => openCreateModal(viewedTask)}>
                        Yuk xati tayyorlash
                      </button>
                    ) : null}
                  </div>
                )}
              </header>
              {viewedRegistry && (viewedRegistry.exitedToKengsoyAt || viewedRegistry.isSentToOneC) && !isEditingRegistry && (
                <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Ushbu yuk xati ({viewedRegistry.registryNumber}) bo‘yicha barcha kelishuvlar yakunlangan va vagonlar jo‘natilgan.</span>
                </div>
              )}
              {viewedRegistry && isEditingRegistry && (
                <div className="mx-6 mt-4 flex flex-col md:flex-row items-stretch md:items-end gap-4 rounded-xl border border-sky-100 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                  <div className="shrink-0">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Hujjat raqami
                    </label>
                    <div className="inline-flex h-[42px] items-center rounded-xl border border-sky-200 bg-white px-4 text-sm font-mono font-bold text-sky-900 shadow-xs select-all dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300">
                      {editLoadingRegistryNumber || viewedRegistry.registryNumber}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Izoh <span className="text-rose-500 font-bold">* majburiy</span>
                    </label>
                    <input
                      type="text"
                      className="w-full h-[42px] rounded-xl border border-rose-300 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-rose-800 dark:bg-slate-800 dark:text-slate-100"
                      value={editLoadingRegistryComment}
                      onChange={e => {
                        setEditLoadingRegistryComment(e.target.value);
                        setEditActionError('');
                      }}
                      placeholder="O‘zgarish sababi (masalan: vagon yoki stansiya yangilandi)"
                    />
                  </div>
                </div>
              )}
              {draftActionError ? (
                <div className="mx-6 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {draftActionError}
                </div>
              ) : null}
              {editActionError ? (
                <div className="mx-6 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {editActionError}
                </div>
              ) : null}
              <div className="order-sheet-body">
                {viewedDraftGroup ? (
                  draftViewMode === 'dual' ? (
                    renderDraftDualWindow()
                  ) : (
                    <div className="reghub-wagons reghub-wagons--detail">
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Kengaytirilgan jadval: {effectiveDraftGroupRows.length} ta vagon
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            {effectiveDraftGroupRows.filter(r => isWagonLoaded(r)).length} ta yuklangan
                          </span>
                          {effectiveDraftGroupRows.some(r => !isWagonLoaded(r)) && (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="font-semibold text-amber-700 dark:text-amber-300">
                                {effectiveDraftGroupRows.filter(r => !isWagonLoaded(r)).length} ta bo‘sh
                              </span>
                            </>
                          )}
                        </div>
                        
                      </div>
                    <div className="reghub-wagons__scroll">
                      <table className="reghub-wagons__table reghub-wagons__table--draft">
                        <thead>
                          <tr className="h-11 text-[14px]">
                            <th style={{ width: '3%' }} className="py-3 text-center text-[14px]">
                              <div className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                                  checked={isAllDraftSelected}
                                  ref={el => {
                                    if (el) el.indeterminate = isDraftIndeterminate;
                                  }}
                                  onChange={e => handleToggleSelectAllDraft(e.target.checked)}
                                  title={isAllDraftSelected ? 'Barchasini bekor qilish' : 'Barchasini tanlash'}
                                />
                              </div>
                            </th>
                            <th style={{ width: '2.5%' }} className="py-3 text-center text-[14px]">№</th>
                            <th style={{ width: '6.5%' }} className="py-3 text-center text-[14px]">Vagon raqami</th>
                            <th style={{ width: '8%' }} className="py-3 text-center text-[14px]">Vagon turi</th>
                            <th style={{ width: '11%' }} className="py-3 text-center text-[14px]">Mahsulot</th>
                            <th style={{ width: '4.5%' }} className="py-3 text-center text-[14px]">Tara</th>
                            <th style={{ width: '4.5%' }} className="py-3 text-center text-[14px]">Brutto</th>
                            <th style={{ width: '4.5%' }} className="py-3 text-center text-[14px]">Netto</th>
                            <th style={{ width: '7.5%' }} className="py-3 text-center text-[14px]">Plomba</th>
                            <th style={{ width: '10%' }} className="py-3 text-[14px]">Tasdiqlangan buyurtma</th>
                            <th style={{ width: '28%' }} className="py-3 text-[14px]">Stansiya va kontragent</th>
                            <th style={{ width: '10%' }} className="py-3 text-center text-[14px]">Holat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {effectiveDraftGroupRows.map((row, index) => {
                            const formKey = pooledWagonKey(row);
                            const defective = row.status === 'Returned';
                            const isAttachedDefect = Boolean(draftAttachedDefectKeys[viewedDraftGroup.key]?.includes(formKey));
                            const isAttachedBuffer = Boolean(draftAttachedBufferKeys[viewedDraftGroup.key]?.includes(formKey));
                            const currentOrderId = wagonOrderIds[formKey] || '';
                            const matchingOrdersForRow = getMatchingActiveOrders(orders, row.product, currentOrderId);
                            const selectedOrderForWagon = orders.find(order => order.id === currentOrderId);
                            const isChecked = Boolean(selectedDraftWagonKeys[formKey]);

                            return (
                              <tr
                                key={formKey}
                                className={`transition-colors ${
                                  isChecked
                                    ? ''
                                    : 'opacity-50 bg-slate-50/60 dark:bg-slate-900/40'
                                }`}
                              >
                                <td className="text-center">
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                                      checked={isChecked}
                                      onChange={e => {
                                        setSelectedDraftWagonKeys(prev => ({
                                          ...prev,
                                          [formKey]: e.target.checked,
                                        }));
                                        setDraftActionError('');
                                      }}
                                      aria-label={`${row.wagonNumber} vagonini tanlash`}
                                    />
                                  </div>
                                </td>
                                <td className="tabular-nums text-slate-500 text-[14px] text-center">{index + 1}</td>
                                <td className="reghub-wagons__num text-[14px] font-bold text-center whitespace-nowrap">{row.wagonNumber}</td>
                                <td className="text-[14px] leading-snug text-slate-800 dark:text-slate-200 text-center whitespace-normal break-words">{wagonTypeText(row.wagonType)}</td>
                                <td className="text-[14px] leading-snug text-slate-800 dark:text-slate-200 text-center whitespace-normal break-words">{toLatinProductName(row.product) || row.product || 'Mahsulotsiz'}</td>
                                <td className="tabular-nums text-[14px] text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">{defective ? '—' : row.tare ? `${row.tare} t` : '—'}</td>
                                <td className="tabular-nums text-[14px] text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">{defective ? '—' : row.brutto ? `${row.brutto} t` : '—'}</td>
                                <td className="font-bold tabular-nums text-[14px] text-emerald-600 dark:text-emerald-400 text-center whitespace-nowrap">{defective ? '—' : row.netto ? `${row.netto} t` : '—'}</td>
                                <td className="text-center px-1">
                                  {row.sealNumber ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      {parseSealNumbers(row.sealNumber).map(seal => (
                                        <span
                                          key={seal}
                                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[13px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        >
                                          <Lock className="w-3 h-3 text-emerald-600" />
                                          {seal}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span
                                      className="inline-flex items-start gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 leading-tight max-w-[130px]"
                                      title="Bu vagon uchun SHGKM plombasi yoki 1C ga kiritilmagan. Adminga murojaat qiling (/admin/integrations/1c orqali to'g'irlanadi)"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                      SHGKM plombasi yoki 1C ga kiritilmagan
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {defective ? (
                                    <span className="text-[14px] text-slate-500 dark:text-slate-400 italic">Buyurtmasiz</span>
                                  ) : (
                                    <select
                                      className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[14px] text-center font-mono font-medium text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                      value={wagonOrderIds[formKey] || ''}
                                      disabled={!isChecked}
                                      onChange={e => {
                                        const nextOrderId = e.target.value;
                                        const matchingOrder = orders.find(o => o.id === nextOrderId);
                                        setWagonOrderIds(prev => ({ ...prev, [formKey]: nextOrderId }));
                                        if (matchingOrder && matchingOrder.lines.length === 1) {
                                          setWagonRouteLines(prev => ({ ...prev, [formKey]: matchingOrder.lines[0].id }));
                                        } else {
                                          setWagonRouteLines(prev => ({ ...prev, [formKey]: '' }));
                                        }
                                        setDraftActionError('');
                                      }}
                                    >
                                      <option value="">Tanlang</option>
                                      {matchingOrdersForRow.length === 0 ? (
                                        <option value="" disabled>Mos yo‘q</option>
                                      ) : null}
                                      {matchingOrdersForRow.map(order => (
                                        <option key={order.id} value={order.id}>
                                          {order.orderNumber}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td>
                                  {defective ? (
                                    <span className="text-[14px] text-slate-500 dark:text-slate-400 italic">
                                      Nomuvofiqlik dalolatnomasi
                                    </span>
                                  ) : (
                                    <select
                                      className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] text-left font-medium text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                                      value={wagonRouteLines[formKey] || ''}
                                      disabled={!isChecked || !selectedOrderForWagon}
                                      title={selectedOrderForWagon?.lines.find(line => line.id === wagonRouteLines[formKey]) ? `${selectedOrderForWagon.lines.find(line => line.id === wagonRouteLines[formKey])?.destinationStation || ''} — ${selectedOrderForWagon.lines.find(line => line.id === wagonRouteLines[formKey])?.contractor || ''}` : ''}
                                      onChange={e => {
                                        setWagonRouteLines(prev => ({ ...prev, [formKey]: e.target.value }));
                                        setDraftActionError('');
                                      }}
                                    >
                                      <option value="">
                                        {selectedOrderForWagon ? 'Stansiya va kontragentni tanlang' : 'Avval buyurtmani tanlang'}
                                      </option>
                                      {selectedOrderForWagon?.lines.map(line => (
                                        <option key={line.id} value={line.id} title={`${line.destinationStation || 'Stansiya ko‘rsatilmagan'} — ${line.contractor}`}>
                                          {line.destinationStation || 'Stansiya ko‘rsatilmagan'} — {line.contractor}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td className="text-center px-1">
                                  <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    {defective ? (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[14px] font-semibold text-rose-700 transition-all hover:bg-rose-100 hover:border-rose-400 hover:shadow-xs active:scale-[0.98] dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
                                        title="Dalolatnomani ko‘rish"
                                        onClick={() => openDefectActModal(row)}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        <span>{defectActDisplayName(row) || 'Dalolatnoma'}</span>
                                      </button>
                                    ) : (
                                      <span className="inline-flex max-w-full items-center whitespace-normal text-center leading-tight rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[14px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        Yuk xatiga tayyor
                                      </span>
                                    )}
                                    {isAttachedDefect && (
                                      <button
                                        type="button"
                                        title="Tarkibdan chiqarish"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                        onClick={() => {
                                          setDraftAttachedDefectKeys(prev => ({
                                            ...prev,
                                            [viewedDraftGroup.key]: (prev[viewedDraftGroup.key] || []).filter(k => k !== formKey),
                                          }));
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {isAttachedBuffer && (
                                      <button
                                        type="button"
                                        title="Tarkibdan chiqarish (qolgan vagonlar ro‘yxatiga qaytarish)"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                        onClick={() => {
                                          setDraftAttachedBufferKeys(prev => ({
                                            ...prev,
                                            [viewedDraftGroup.key]: (prev[viewedDraftGroup.key] || []).filter(k => k !== formKey),
                                          }));
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
                ) : (viewedRegistry && isEditingRegistry) ? (
                  <div className="reghub-wagons reghub-wagons--detail">
                    <div className="reghub-wagons__scroll">
                      <table className="reghub-wagons__table reghub-wagons__table--draft">
                        <thead>
                          <tr className="h-11 text-[14px]">
                            <th style={{ width: '3%' }} className="py-3 text-center text-[14px]">
                              <div className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                                  checked={isAllEditSelected}
                                  ref={el => {
                                    if (el) el.indeterminate = isEditIndeterminate;
                                  }}
                                  onChange={e => handleToggleSelectAllEdit(e.target.checked)}
                                  title={isAllEditSelected ? 'Barchasini bekor qilish' : 'Barchasini tanlash'}
                                />
                              </div>
                            </th>
                            <th style={{ width: '2.5%' }} className="py-3 text-center text-[14px]">№</th>
                            <th style={{ width: '6.5%' }} className="py-3 text-center text-[14px]">Vagon raqami</th>
                            <th style={{ width: '8%' }} className="py-3 text-center text-[14px]">Vagon turi</th>
                            <th style={{ width: '11%' }} className="py-3 text-center text-[14px]">Mahsulot</th>
                            <th style={{ width: '4.5%' }} className="py-3 text-center text-[14px]">Tara</th>
                            <th style={{ width: '4.5%' }} className="py-3 text-center text-[14px]">Brutto</th>
                            <th style={{ width: '4.5%' }} className="py-3 text-center text-[14px]">Netto</th>
                            <th style={{ width: '7.5%' }} className="py-3 text-center text-[14px]">Plomba</th>
                            <th style={{ width: '10%' }} className="py-3 text-[14px]">Tasdiqlangan buyurtma</th>
                            <th style={{ width: '28%' }} className="py-3 text-[14px]">Stansiya va kontragent</th>
                            <th style={{ width: '10%' }} className="py-3 text-center text-[14px]">Holat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {effectiveEditRegistryRows.map((row, index) => {
                            const formKey = pooledWagonKey(row);
                            const defective = row.status === 'Returned';
                            const isAttachedDefect = Boolean(editAttachedDefectKeys.includes(formKey));
                            const isAttachedBuffer = Boolean(editAttachedBufferKeys.includes(formKey));
                            const currentOrderId = wagonOrderIds[formKey] || '';
                            const matchingOrdersForRow = getMatchingActiveOrders(orders, row.product, currentOrderId);
                            const selectedOrderForWagon = orders.find(order => order.id === currentOrderId);
                            const isChecked = Boolean(selectedEditWagonKeys[formKey]);

                            return (
                              <tr
                                key={formKey}
                                className={`transition-colors ${
                                  isChecked
                                    ? ''
                                    : 'opacity-50 bg-slate-50/60 dark:bg-slate-900/40'
                                }`}
                              >
                                <td className="text-center">
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                                      checked={isChecked}
                                      onChange={e => {
                                        setSelectedEditWagonKeys(prev => ({
                                          ...prev,
                                          [formKey]: e.target.checked,
                                        }));
                                        setEditActionError('');
                                      }}
                                      aria-label={`${row.wagonNumber} vagonini tanlash`}
                                    />
                                  </div>
                                </td>
                                <td className="tabular-nums text-slate-500 text-[14px] text-center">{index + 1}</td>
                                <td className="reghub-wagons__num text-[14px] font-bold text-center whitespace-nowrap">{row.wagonNumber}</td>
                                <td className="text-[14px] leading-snug text-slate-800 dark:text-slate-200 text-center whitespace-normal break-words">{wagonTypeText(row.wagonType)}</td>
                                <td className="text-[14px] leading-snug text-slate-800 dark:text-slate-200 text-center whitespace-normal break-words">{toLatinProductName(row.product) || row.product || 'Mahsulotsiz'}</td>
                                <td className="tabular-nums text-[14px] text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">{defective ? '—' : row.tare ? `${row.tare} t` : '—'}</td>
                                <td className="tabular-nums text-[14px] text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">{defective ? '—' : row.brutto ? `${row.brutto} t` : '—'}</td>
                                <td className="font-bold tabular-nums text-[14px] text-emerald-600 dark:text-emerald-400 text-center whitespace-nowrap">{defective ? '—' : row.netto ? `${row.netto} t` : '—'}</td>
                                <td className="text-center px-1">
                                  {row.sealNumber ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      {parseSealNumbers(row.sealNumber).map(seal => (
                                        <span
                                          key={seal}
                                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[13px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        >
                                          <Lock className="w-3 h-3 text-emerald-600" />
                                          {seal}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span
                                      className="inline-flex items-start gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 leading-tight max-w-[130px]"
                                      title="Bu vagon uchun SHGKM plombasi yoki 1C ga kiritilmagan. Adminga murojaat qiling (/admin/integrations/1c orqali to'g'irlanadi)"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                      SHGKM plombasi yoki 1C ga kiritilmagan
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {defective ? (
                                    <span className="text-[14px] text-slate-500 dark:text-slate-400 italic">Buyurtmasiz</span>
                                  ) : (
                                    <select
                                      className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[14px] text-center font-mono font-medium text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                      value={wagonOrderIds[formKey] || ''}
                                      disabled={!isChecked}
                                      onChange={e => {
                                        const nextOrderId = e.target.value;
                                        const matchingOrder = orders.find(o => o.id === nextOrderId);
                                        setWagonOrderIds(prev => ({ ...prev, [formKey]: nextOrderId }));
                                        if (matchingOrder && matchingOrder.lines.length === 1) {
                                          setWagonRouteLines(prev => ({ ...prev, [formKey]: matchingOrder.lines[0].id }));
                                        } else {
                                          setWagonRouteLines(prev => ({ ...prev, [formKey]: '' }));
                                        }
                                        setEditActionError('');
                                      }}
                                    >
                                      <option value="">Tanlang</option>
                                      {matchingOrdersForRow.length === 0 ? (
                                        <option value="" disabled>Mos yo‘q</option>
                                      ) : null}
                                      {matchingOrdersForRow.map(order => (
                                        <option key={order.id} value={order.id}>
                                          {order.orderNumber}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td>
                                  {defective ? (
                                    <span className="text-[14px] text-slate-500 dark:text-slate-400 italic">
                                      Nomuvofiqlik dalolatnomasi
                                    </span>
                                  ) : (
                                    <select
                                      className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] text-left font-medium text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                                      value={wagonRouteLines[formKey] || ''}
                                      disabled={!isChecked || !selectedOrderForWagon}
                                      title={selectedOrderForWagon?.lines.find(line => line.id === wagonRouteLines[formKey]) ? `${selectedOrderForWagon.lines.find(line => line.id === wagonRouteLines[formKey])?.destinationStation || ''} — ${selectedOrderForWagon.lines.find(line => line.id === wagonRouteLines[formKey])?.contractor || ''}` : ''}
                                      onChange={e => {
                                        setWagonRouteLines(prev => ({ ...prev, [formKey]: e.target.value }));
                                        setEditActionError('');
                                      }}
                                    >
                                      <option value="">
                                        {selectedOrderForWagon ? 'Stansiya va kontragentni tanlang' : 'Avval buyurtmani tanlang'}
                                      </option>
                                      {selectedOrderForWagon?.lines.map(line => (
                                        <option key={line.id} value={line.id} title={`${line.destinationStation || 'Stansiya ko‘rsatilmagan'} — ${line.contractor}`}>
                                          {line.destinationStation || 'Stansiya ko‘rsatilmagan'} — {line.contractor}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td className="text-center px-1">
                                  <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    {defective ? (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[14px] font-semibold text-rose-700 transition-all hover:bg-rose-100 hover:border-rose-400 hover:shadow-xs active:scale-[0.98] dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
                                        title="Dalolatnomani ko‘rish"
                                        onClick={() => openDefectActModal(row)}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        <span>{defectActDisplayName(row) || 'Dalolatnoma'}</span>
                                      </button>
                                    ) : (
                                      <span className="inline-flex max-w-full items-center whitespace-normal text-center leading-tight rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[14px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        Yuk xatiga tayyor
                                      </span>
                                    )}
                                    {isAttachedDefect && (
                                      <button
                                        type="button"
                                        title="Tarkibdan chiqarish"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                        onClick={() => {
                                          setEditAttachedDefectKeys(prev => prev.filter(k => k !== formKey));
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {isAttachedBuffer && (
                                      <button
                                        type="button"
                                        title="Tarkibdan chiqarish (qolgan vagonlar ro‘yxatiga qaytarish)"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                        onClick={() => {
                                          setEditAttachedBufferKeys(prev => prev.filter(k => k !== formKey));
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : viewedRegistry ? (
                  <div className="p-4 sm:p-5">
                    <div className="thub-table-wrap reestr-table-wrap scalehub-party-table !max-h-none !overflow-y-visible overflow-x-auto rounded-xl border border-slate-200 shadow-xs dark:border-slate-700">
                      <table className="thub-table reestr-table reestr-table--compact">
                        <thead>
                          <tr>
                            <th style={{ width: '3%' }} className="text-center">№</th>
                            <th style={{ width: '8%' }} className="text-center">Vagon raqami</th>
                            <th style={{ width: '8%' }} className="text-center">Vagon turi</th>
                            <th style={{ width: '9%' }} className="text-center">Mahsulot</th>
                            <th style={{ width: '5.5%' }} className="text-center">Tara</th>
                            <th style={{ width: '5.5%' }} className="text-center">Brutto</th>
                            <th style={{ width: '5.5%' }} className="text-center">Netto</th>
                            <th style={{ width: '8%' }} className="text-center">Plomba</th>
                            <th style={{ width: '12%' }} className="text-center">Tasdiqlangan buyurtma</th>
                            <th style={{ width: '25.5%' }} className="text-center">Stansiya va kontragent</th>
                            <th style={{ width: '10%' }} className="text-center">Holat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(viewedRegistry.wagonRoutes && viewedRegistry.wagonRoutes.length > 0
                            ? viewedRegistry.wagonRoutes.map((route, index) => {
                                const wagonNumber = String(route.wagonNumber || "").trim();
                                const sourceArrivalId = route.sourceArrivalId?.trim().toLowerCase();
                                const matchingPooled = pooledWagons.find(row =>
                                  String(row.wagonNumber || "").trim().toLowerCase() === wagonNumber.toLowerCase()
                                  && (!sourceArrivalId || row.arrivalId.toLowerCase() === sourceArrivalId),
                                ) ?? pooledWagons.find(row =>
                                  String(row.wagonNumber || "").trim().toLowerCase() === wagonNumber.toLowerCase(),
                                );
                                const defective = Boolean(route.isDefective || matchingPooled?.status === 'Returned');
                                const product = toLatinProductName(route.productType || matchingPooled?.product || viewedRegistry.productType) || '—';
                                const wagonType = matchingPooled?.wagonType || 'sisterna';
                                const orderNo = defective ? 'Buyurtmasiz' : (route.orderNumber || viewedRegistry.orderNumber || '—');
                                const routeText = defective
                                  ? 'Nomuvofiqlik dalolatnomasi'
                                  : `${route.destinationStation || viewedRegistry.destinationStation || '—'} — ${route.contractorName || viewedRegistry.contractorName || '—'}`;
                                const statusLabel = defective
                                  ? (matchingPooled ? defectActDisplayName(matchingPooled) : 'Dalolatnomali') || 'Dalolatnomali'
                                  : 'Yuk xatiga kiritilgan';

                                return (
                                  <tr key={`${wagonNumber}-${index}`} className={defective ? 'bg-rose-50/40 dark:bg-rose-950/20' : undefined}>
                                    <td className="thub-mono reestr-num text-center">{index + 1}</td>
                                    <td className="text-center"><span className="thub-table__code">{wagonNumber}</span></td>
                                    <td className="text-center">{wagonTypeText(wagonType)}</td>
                                    <td className="text-center">
                                      {defective ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                                          Nomuvofiq vagon
                                        </span>
                                      ) : (
                                        product
                                      )}
                                    </td>
                                    {(() => {
                                      const rObj = route as Record<string, any>;
                                      const tareVal = (matchingPooled?.tare && matchingPooled.tare !== '—')
                                        ? matchingPooled.tare
                                        : (rObj.tareWeight && rObj.tareWeight !== '—')
                                          ? rObj.tareWeight
                                          : '';
                                      const bruttoVal = (matchingPooled?.brutto && matchingPooled.brutto !== '—')
                                        ? matchingPooled.brutto
                                        : (rObj.grossWeight && rObj.grossWeight !== '—')
                                          ? rObj.grossWeight
                                          : '';
                                      const nettoVal = (matchingPooled?.netto && matchingPooled.netto !== '—')
                                        ? matchingPooled.netto
                                        : (rObj.nettoWeight && rObj.nettoWeight !== '—')
                                          ? rObj.nettoWeight
                                          : (rObj.netWeight || rObj.NetWeight ? String(rObj.netWeight || rObj.NetWeight) : nettoWeightOf(null, tareVal, bruttoVal));
                                      const sealVal = (matchingPooled?.sealNumber && matchingPooled.sealNumber !== '—')
                                        ? matchingPooled.sealNumber
                                        : (rObj.sealNumber && rObj.sealNumber !== '—')
                                          ? rObj.sealNumber
                                          : '';
                                      return (
                                        <>
                                          <td className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                                            {defective ? '—' : tareVal ? `${tareVal} t` : '—'}
                                          </td>
                                          <td className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                                            {defective ? '—' : bruttoVal ? `${bruttoVal} t` : '—'}
                                          </td>
                                          <td className="text-center font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {defective ? '—' : nettoVal ? `${nettoVal} t` : '—'}
                                          </td>
                                          <td className="text-center px-1">
                                            {sealVal ? (
                                              <div className="flex flex-col items-center justify-center gap-0.5">
                                                {parseSealNumbers(sealVal).map(seal => (
                                                  <span
                                                    key={seal}
                                                    className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-teal-900 shadow-2xs dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200"
                                                  >
                                                    {seal}
                                                  </span>
                                                ))}
                                              </div>
                                            ) : (
                                              <span className="text-[14px] text-slate-400">—</span>
                                            )}
                                          </td>
                                        </>
                                      );
                                    })()}
                                    <td className="text-center font-mono font-medium text-slate-900 dark:text-slate-100">
                                      {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Buyurtmasiz</span> : orderNo}
                                    </td>
                                    <td className="text-center text-slate-700 dark:text-slate-300">
                                      {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Nomuvofiqlik dalolatnomasi</span> : routeText}
                                    </td>
                                    <td className="text-center">
                                      {defective ? (
                                        <button
                                          type="button"
                                          className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700 transition-all hover:bg-rose-100 hover:border-rose-400 hover:shadow-xs active:scale-[0.98] dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
                                          title="Dalolatnomani ko‘rish"
                                          onClick={() => openDefectActModal({
                                            arrivalId: sourceArrivalId || matchingPooled?.arrivalId,
                                            wagonNumber,
                                          })}
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          <span>{statusLabel}</span>
                                        </button>
                                      ) : (
                                        <span className="inline-flex whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[13px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                          {statusLabel}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            : approveHubWagonRows(viewedRegistry).map((row, index) => {
                                const defective = row.status === 'Returned';
                                const product = toLatinProductName(row.product) || row.product || 'Mahsulotsiz';
                                const orderNo = defective ? 'Buyurtmasiz' : (viewedRegistry.orderNumber || '—');
                                const routeText = defective
                                  ? 'Nomuvofiqlik dalolatnomasi'
                                  : `${viewedRegistry.destinationStation || '—'} — ${viewedRegistry.contractorName || '—'}`;
                                const statusLabel = defective
                                  ? defectActDisplayName(row) || 'Dalolatnomali'
                                  : 'Yuk xatiga kiritilgan';

                                const tareVal = (row.tare && row.tare !== '—') ? row.tare : '';
                                const bruttoVal = (row.brutto && row.brutto !== '—') ? row.brutto : '';
                                const nettoVal = (row.netto && row.netto !== '—') ? row.netto : nettoWeightOf(null, tareVal, bruttoVal);
                                const sealVal = (row.sealNumber && row.sealNumber !== '—') ? row.sealNumber : '';

                                return (
                                  <tr key={row.id} className={defective ? 'bg-rose-50/40 dark:bg-rose-950/20' : undefined}>
                                    <td className="thub-mono reestr-num text-center">{index + 1}</td>
                                    <td className="text-center"><span className="thub-table__code">{row.wagonNumber}</span></td>
                                    <td className="text-center">{wagonTypeText(row.wagonType)}</td>
                                    <td className="text-center">
                                      {defective ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                                          Nomuvofiq vagon
                                        </span>
                                      ) : (
                                        product
                                      )}
                                    </td>
                                    <td className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                                      {defective ? '—' : tareVal ? `${tareVal} t` : '—'}
                                    </td>
                                    <td className="text-center tabular-nums text-slate-600 dark:text-slate-300">
                                      {defective ? '—' : bruttoVal ? `${bruttoVal} t` : '—'}
                                    </td>
                                    <td className="text-center font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                      {defective ? '—' : nettoVal ? `${nettoVal} t` : '—'}
                                    </td>
                                    <td className="text-center px-1">
                                      {sealVal ? (
                                        <div className="flex flex-col items-center justify-center gap-0.5">
                                          {parseSealNumbers(sealVal).map(seal => (
                                            <span
                                              key={seal}
                                              className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-teal-900 shadow-2xs dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200"
                                            >
                                              {seal}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-[14px] text-slate-400">—</span>
                                      )}
                                    </td>
                                    <td className="text-center font-mono font-medium text-slate-900 dark:text-slate-100">
                                      {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Buyurtmasiz</span> : orderNo}
                                    </td>
                                    <td className="text-center text-slate-700 dark:text-slate-300">
                                      {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Nomuvofiqlik dalolatnomasi</span> : routeText}
                                    </td>
                                    <td className="text-center">
                                      {defective ? (
                                        <button
                                          type="button"
                                          className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700 transition-all hover:bg-rose-100 hover:border-rose-400 hover:shadow-xs active:scale-[0.98] dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
                                          title="Dalolatnomani ko‘rish"
                                          onClick={() => openDefectActModal({
                                            wagonNumber: row.wagonNumber,
                                          })}
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          <span>{statusLabel}</span>
                                        </button>
                                      ) : (
                                        <span className="inline-flex whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[13px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                          {statusLabel}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : viewedTask ? (
                  <WagonUnitsPanel rows={wagonRowsOf(viewedTask).filter(row => isCreateHealthy(row) || isCreateDefective(row))} />
                ) : null}
              </div>
              {viewedDraftGroup && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 rounded-b-2xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Tarkib: <strong className="text-slate-900 dark:text-white font-bold">{selectedDraftRows.length}</strong> ta vagon
                      {totalDraftNetto > 0 && (
                        <span className="ml-1 text-sky-700 dark:text-sky-300 font-bold font-mono">
                          ({totalDraftNetto.toFixed(1)} t netto)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDraftSubmitting || selectedDraftRows.length === 0}
                      className="btn-primary !text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed !bg-sky-600 hover:!bg-sky-700 shadow-md cursor-pointer flex items-center gap-2"
                      onClick={() => handleGenerateYukXatiFromDraft(viewedDraftGroup, selectedDraftRows)}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isDraftSubmitting
                          ? 'Shakllantirilmoqda…'
                          : selectedDraftRows.length > 0
                            ? `Yuk xatini shakllantirish (${selectedDraftRows.length} ta vagon)`
                            : 'Yuk xatini shakllantirish'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
              {viewedRegistry && isEditingRegistry && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/90 px-3.5 py-2 text-sm font-semibold text-amber-950 shadow-sm transition-all hover:bg-amber-100/90 hover:border-amber-400 hover:shadow active:scale-[0.98] dark:border-amber-700/80 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/60"
                      onClick={() => {
                        setSelectedPickerDefectKeys([]);
                        setIsDefectPickerOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 stroke-[2.5] text-amber-700 dark:text-amber-300" />
                      <span>Nomuvofiq vagon qo‘shish</span>
                      {availableDefectRowsForEdit.length > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold shadow-xs dark:bg-amber-500 dark:text-slate-950">
                          {availableDefectRowsForEdit.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50/90 px-3.5 py-2 text-sm font-semibold text-sky-950 shadow-sm transition-all hover:bg-sky-100/90 hover:border-sky-400 hover:shadow active:scale-[0.98] dark:border-sky-700/80 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60"
                      onClick={() => {
                        setSelectedPickerBufferKeys([]);
                        setIsBufferPickerOpen(true);
                      }}
                    >
                      <Layers className="h-4 w-4 stroke-[2.5] text-sky-700 dark:text-sky-300" />
                      <span>Qolgan vagonlardan qo‘shish</span>
                      {availableBufferRowsForEdit.length > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-sky-600 text-white text-xs font-bold shadow-xs dark:bg-sky-500 dark:text-slate-950">
                          {availableBufferRowsForEdit.length}
                        </span>
                      )}
                    </button>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Tanlangan: <strong className="text-slate-900 dark:text-white font-bold">{selectedEditRows.length}</strong> / {effectiveEditRegistryRows.length} ta vagon
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      className="btn-secondary !text-sm whitespace-nowrap"
                      onClick={() => {
                        setIsEditingRegistry(false);
                        setEditActionError('');
                      }}
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="button"
                      disabled={isEditSubmitting || selectedEditRows.length === 0}
                      className="btn-primary !text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleSaveRegistryEdit}
                    >
                      {isEditSubmitting
                        ? 'Saqlanmoqda…'
                        : `Tahrirni saqlash (${selectedEditRows.length} ta vagon)`}
                    </button>
                  </div>
                </div>
              )}
              {viewedRegistry && !isEditingRegistry && registryActions(viewedRegistry).length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                  {registryActions(viewedRegistry)}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            {!isRegistryWorkHub ? (
              <>
                <DocsHubToolbar
                  search={hub.search}
                  onSearchChange={hub.setSearch}
                  searchPlaceholder="Partiya, vagon yoki yuk xati №…"
                  preset={hub.preset}
                  onPreset={hub.pickPreset}
                  from={hub.from}
                  to={hub.to}
                  onFromChange={hub.onFromChange}
                  onToChange={hub.onToChange}
                  product={hub.product}
                  productOptions={yukProductOptions}
                  onProductChange={hub.setProduct}
                  actions={
                    <button
                      type="button"
                      className="btn-secondary !h-9 !py-0 !px-3.5 !text-xs !font-bold flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/30 shrink-0"
                      onClick={exportYukExcel}
                      disabled={filteredYukRows.length === 0}
                      title="Filtrlangan yuk xatlarini vagon darajasida Excel fayliga yuklash"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Excel yuklash</span>
                    </button>
                  }
                />
                {board()}
                <DocsHubPagination
                  total={filteredYukRows.length}
                  page={pagedYuk.page}
                  pageSize={hub.pageSize}
                  onPageChange={hub.setPage}
                  onPageSizeChange={hub.setPageSize}
                  unitLabel="yuk xati"
                />
              </>
            ) : (
              <div className="space-y-4">
                <div className="marketing-order-page__bar ui-card">
                  <div className="marketing-order-page__bar-main">
                    <ProductDetailBackButton onClick={() => navigate(fromQuery || '/dashboard')} />
                    <div className="min-w-0">
                      <h2 className="marketing-order-page__title">
                        {isCreateHub
                          ? 'Yuk xati shakllantirish'
                          : isApproveHub
                            ? 'Yuk xatini tasdiqlash'
                            : isPermitAgreeHub
                              ? 'Yuk xatini kelishish (Ruxsatnoma byurosi)'
                              : 'Yuk xatini kelishish (Qo‘riqlash xizmati)'}
                      </h2>
                      <p className="marketing-order-page__subtitle">
                        {isCreateHub
                          ? 'Tayyor partiyalar asosida yuk xati shakllantirish'
                          : isApproveHub
                            ? 'Shakllangan yuk xatlarini ko‘rib chiqish va tasdiqlash'
                            : isPermitAgreeHub
                              ? 'Ruxsatnoma byurosi kelishuvi'
                              : 'Qo‘riqlash xizmati kelishuvi'}
                      </p>
                    </div>
                    {(isCreateHub || Boolean(viewedDraftGroup)) && (
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEmptyDispatchOpen(true);
                            setEmptySelectedWagonKeys(new Set());
                            setEmptyError('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 transition-colors shadow-xs"
                          title="Yuk ortilmagan yoki bo‘sh vagonlarni asos ko‘rsatib yuk xatiga kiritish va chiqarish"
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={2} />
                          <span>Bo‘sh vagonlar yuk xati</span>
                          {availableEmptyWagons.length > 0 ? (
                            <span className="rounded-full bg-amber-200/90 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                              {availableEmptyWagons.length} ta
                            </span>
                          ) : null}
                        </button>

                      </div>
                    )}
                  </div>
                </div>
                {arrivalIdFromQuery && (isPermitAgreeHub || isSecurityAgreeHub || isApproveHub) && (() => {
                  const target = arrivalIdFromQuery.toLowerCase();
                  const matchedArrival = arrivals.find(
                    a => a.id.toLowerCase() === target || (a.arrivalNumber ?? '').toLowerCase() === target
                  );
                  const partyName = matchedArrival?.arrivalNumber ?? arrivalIdFromQuery;
                  return (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl mb-3">
                      <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className="font-semibold text-sky-800 dark:text-sky-300">Tanlangan partiya:</span>
                        <span className="font-bold text-sky-950 dark:text-white px-2 py-0.5 bg-white dark:bg-sky-900/60 rounded-md border border-sky-200 dark:border-sky-700">
                          {partyName}
                        </span>
                        {matchedArrival && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            ({matchedArrival.wagonCount} ta vagon)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchParams(prev => {
                            const sp = new URLSearchParams(prev);
                            sp.delete('arrivalId');
                            return sp;
                          }, { replace: true });
                        }}
                        className="text-xs font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-white underline cursor-pointer"
                      >
                        Barcha partiyalarni ko‘rish
                      </button>
                    </div>
                  );
                })()}
                {board()}
              </div>
            )}
          </div>
        )}
      </section>

      {modalMode ? (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={closeModal} />
          <div
            className={`confirm-dialog ${modalMode === 'create' || modalMode === 'edit'
                ? 'admin-user-dialog registry-create-dialog'
                : modalMode === 'send'
                  ? 'registry-send-dialog'
                  : modalMode === 'handover'
                    ? 'registry-handover-dialog'
                    : 'registry-approve-dialog'
              }`}
            role="dialog"
            aria-modal="true"
          >
            <button type="button" className="confirm-dialog__close" aria-label="Yopish" onClick={closeModal}>
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <div className="confirm-dialog__header">
              <div className="confirm-dialog__icon">
                <FileText className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="confirm-dialog__title">
                  {modalMode === 'create'
                    ? 'Yuk xati (reyestr) tayyorlash'
                    : modalMode === 'edit'
                      ? 'Yuk xatini tahrirlash'
                      : modalMode === 'shift'
                        ? 'Yuk xatini tasdiqlash'
                        : modalMode === 'economist-permit'
                          ? 'Ruxsatnoma byurosi bilan kelishish'
                          : modalMode === 'economist-security'
                            ? 'Qo‘riqlash xizmati bilan kelishish'
                            : modalMode === 'permit'
                              ? 'Ruxsatnoma tasdiqlash'
                              : modalMode === 'security'
                                ? 'Qo‘riqlash kelishuvi'
                                : modalMode === 'send'
                                  ? '1C va e-nakl ga kiritish'
                                  : 'Temir yo‘lga topshirish'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                  {modalMode === 'create'
                    ? `${outgoingPartyNumber(createModalRows[0]?.loadingBatchNumber || '', createModalRows[0]?.arrivalDate || '')} · ${createModalRows.length} vagon · ${new Set(createModalRows.map(row => row.product).filter(Boolean)).size === 1 ? (toLatinProductName(createModalRows[0]?.product) || createModalRows[0]?.product) : 'Aralash mahsulot'}`
                    : modalMode === 'edit'
                      ? `${modalRegistry?.registryNumber || ''} · ${selectedCreateModalRows.length} ta vagon tanlandi · Saqlashdan oldin izoh yozish majburiy`
                      : modalRegistry
                        ? modalMode === 'send' || modalMode === 'handover'
                          ? `${modalRegistry.registryNumber} · ${modalRegistry.wagonCount} vagon`
                          : modalRegistry.registryNumber
                        : null}
                </p>
              </div>
            </div>

            <form
              className="admin-user-form space-y-4"
              onSubmit={e => {
                e.preventDefault();
                void (async () => {
                  try {
                    setModalError('');
                    if (modalMode === 'create') {
                      await createRegistry();
                      return;
                    }
                    if (modalMode === 'edit') {
                      await updateRegistry();
                      return;
                    }
                    if (modalMode === 'shift') await executeRegistryAction('shift');
                    else if (modalMode === 'economist-permit') await executeRegistryAction('economist-permit');
                    else if (modalMode === 'economist-security') await executeRegistryAction('economist-security');
                    else if (modalMode === 'permit') await executeRegistryAction('permit');
                    else if (modalMode === 'security') await executeRegistryAction('security');
                    else if (modalMode === 'send') await executeRegistryAction('send');
                    else if (modalMode === 'handover') await executeRegistryAction('handover');
                  } catch (err) {
                    setModalError(err instanceof Error ? err.message : 'Amal bajarilmadi');
                  }
                })();
              }}
            >
              {modalMode === 'create' || modalMode === 'edit' ? (
                <>
                  <div className={`registry-create-dialog__meta-grid ${modalMode === 'create' ? 'registry-create-dialog__meta-grid--single' : ''}`}>
                    <label className="admin-field">
                      Reyestr raqami
                      <input
                        type="text"
                        required
                        value={registryNumber}
                        onChange={e => setRegistryNumber(e.target.value)}
                        className="font-mono"
                      />
                    </label>
                    {modalMode === 'edit' ? (
                      <label className="admin-field">
                        <span>
                          Izoh <small className="text-rose-600 dark:text-rose-400 font-semibold">majburiy</small>
                        </span>
                        <input
                          type="text"
                          required
                          value={comment}
                          onChange={e => {
                            setComment(e.target.value);
                            setModalError('');
                          }}
                          placeholder="O‘zgarish sababi (masalan: vagon yoki stansiya yangilandi)…"
                        />
                      </label>
                    ) : null}
                  </div>

                  <section className="registry-route-card">
                    <div className="registry-route-card__head">
                      <div className="registry-route-card__head-row">
                        <div>
                          <h3>Vagonlarni stansiyalarga taqsimlash</h3>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Har bir vagon uchun buyurtma, mahsulot va jo‘natish yo‘nalishini tanlang
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                          {selectedCreateModalRows.length}/{createModalRows.length} tanlandi
                        </span>
                      </div>
                      <p className="registry-create-dialog__hint">
                        Jadvalda faqat netto tortilgan vagonlar chiqadi — kirish partiyasi muhim emas. Har bir vagon tanlangan
                        kontragent va stansiyaga alohida biriktiriladi. Nomuvofiq vagon Temir yo‘l dalolatnomasi bilan qo‘shiladi.
                      </p>
                    </div>
                    <div className="registry-route-card__body">
                      <div className="registry-route-table-wrap">
                        <table className="registry-route-table">
                          <thead>
                            <tr>
                              <th>Tanlash</th>
                              <th>Vagon raqami</th>
                              <th>Mahsulot / netto</th>
                              <th>Buyurtma / mahsulot</th>
                              <th>Stansiya va kontragent</th>
                              <th>Dalolatnoma</th>
                            </tr>
                          </thead>
                          <tbody>
                            {createModalRows.map(row => {
                              const formKey = pooledWagonKey(row);
                              const defective = row.status === 'Returned';
                              const selectedOrderForWagon = orders.find(order => order.id === wagonOrderIds[formKey]);
                              const matchingOrders = getMatchingActiveOrders(orders, row.product, wagonOrderIds[formKey]);
                              const assignedLine = selectedOrderForWagon?.lines.find(line => line.id === wagonRouteLines[formKey]);
                              const checked = Boolean(selectedWagons[formKey]);
                              return (
                                <tr key={formKey} className={checked && (assignedLine || defective) ? 'is-assigned' : ''}>
                                  <td className="registry-route-table__check-cell">
                                    <input
                                      type="checkbox"
                                      className="registry-route-table__check"
                                      checked={checked}
                                      onChange={e => {
                                        setSelectedWagons(prev => ({ ...prev, [formKey]: e.target.checked }));
                                        setModalError('');
                                      }}
                                      aria-label={`${row.wagonNumber} vagonni tanlash`}
                                    />
                                  </td>
                                  <td>
                                    <span className="registry-route-table__wagon-num">{row.wagonNumber}</span>
                                  </td>
                                  <td>
                                    <div className="registry-route-table__product">
                                      <span>{toLatinProductName(row.product) || row.product || 'Mahsulot ko‘rsatilmagan'}</span>
                                      <small>{defective ? 'Nomuvofiqlik dalolatnomasi' : row.netto ? `Netto: ${row.netto} t` : 'Netto: —'}</small>
                                    </div>
                                  </td>
                                  <td className="registry-route-table__order-cell">
                                    <select
                                      className="registry-route-table__order-select"
                                      aria-label={`${row.wagonNumber} uchun buyurtma va mahsulot`}
                                      value={wagonOrderIds[formKey] || ''}
                                      disabled={!checked}
                                      onChange={e => {
                                        setWagonOrderIds(prev => ({ ...prev, [formKey]: e.target.value }));
                                        setWagonRouteLines(prev => ({ ...prev, [formKey]: '' }));
                                        setModalError('');
                                      }}
                                    >
                                      <option value="">{defective ? 'Buyurtmasiz chiqarish' : 'Buyurtma va mahsulotni tanlang'}</option>
                                      {matchingOrders.length === 0 ? (
                                        <option value="" disabled>Mos tasdiqlangan buyurtma topilmadi</option>
                                      ) : null}
                                      {matchingOrders.map(order => (
                                        <option key={order.id} value={order.id}>
                                          {order.orderNumber} — {toLatinProductName(order.productType) || order.productType} · {order.totalWagons} vagon
                                        </option>
                                      ))}
                                    </select>
                                    {defective ? <small className="mt-1 block text-[11px] text-rose-600 dark:text-rose-300">Qoldiqdan ayrilmaydi</small> : null}
                                  </td>
                                  <td className="registry-route-table__route-cell">
                                    <div className="registry-route-table__route-picker">
                                      <span className={`registry-route-table__route-display${assignedLine ? '' : ' is-placeholder'}`}>
                                        {assignedLine
                                          ? `${assignedLine.destinationStation || 'Stansiya ko‘rsatilmagan'} — ${assignedLine.contractor}`
                                          : selectedOrderForWagon
                                            ? 'Stansiya va kontragentni tanlang'
                                            : 'Avval buyurtmani tanlang'}
                                      </span>
                                      <select
                                        className="registry-route-table__route-select"
                                        aria-label={`${row.wagonNumber} uchun jo‘natish stansiyasi`}
                                        value={wagonRouteLines[formKey] || ''}
                                        disabled={!checked || !selectedOrderForWagon}
                                        onChange={e => {
                                          setWagonRouteLines(prev => ({ ...prev, [formKey]: e.target.value }));
                                          setModalError('');
                                        }}
                                      >
                                        <option value="">
                                          {selectedOrderForWagon ? 'Stansiya va kontragentni tanlang' : 'Avval buyurtmani tanlang'}
                                        </option>
                                        {selectedOrderForWagon?.lines.map(route => (
                                          <option key={route.id} value={route.id}>
                                            {route.destinationStation || 'Stansiya ko‘rsatilmagan'} — {route.contractor}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </td>
                                  <td>
                                    {defective ? (
                                      <span className="registry-route-table__defect-tag">
                                        {defectActDisplayName(row) || 'Dalolatnoma biriktirilgan'}
                                      </span>
                                    ) : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="registry-route-card__foot">
                      <button
                        type="button"
                        className="btn-secondary w-fit !px-3 !py-2 !text-xs"
                        onClick={() => {
                          const defectRows = createPoolRows.filter(row => row.status === 'Returned' && hasDefectAct(row));
                          setModalWagonKeys(prev => [...new Set([...prev, ...defectRows.map(pooledWagonKey)])]);
                          setSelectedWagons(prev => ({
                            ...prev,
                            ...Object.fromEntries(defectRows.map(row => [pooledWagonKey(row), true])),
                          }));
                        }}
                      >
                        <span className="text-base leading-none">+</span> Nomuvofiq vagon qo‘shish
                      </button>
                    </div>
                  </section>
                </>
              ) : null}

              {modalMode === 'send' ? (
                <div className="registry-send-dialog__content">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Yuk xati 1C va E-nakl tizimlarida ro‘yxatdan o‘tkazilgan bo‘lsa, tasdiqlang.
                    Bu amal hujjatni tashqi tizimlarga avtomatik yubormaydi; iqtisodchi tasdig‘ini qayd etadi.
                    Tarozi ma’lumotlarini 1C’dan olish alohida bosqichda bajariladi.
                  </p>
                  <div className="registry-send-dialog__flow" aria-label="Tashqi tizimlarda ro‘yxatdan o‘tganini tasdiqlash">
                    <div className="registry-send-dialog__system">
                      <span className="registry-send-dialog__system-icon registry-send-dialog__system-icon--1c">
                        <Database className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <div>
                        <strong>1C tizimi</strong>
                        <span>Yuk xati ma’lumotlari</span>
                      </div>
                    </div>
                    <span className="registry-send-dialog__arrow"><ArrowRight className="h-4 w-4" /></span>
                    <div className="registry-send-dialog__system">
                      <span className="registry-send-dialog__system-icon registry-send-dialog__system-icon--enakl">
                        <Send className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <div>
                        <strong>e-nakl</strong>
                        <span>Elektron ro‘yxatga olish</span>
                      </div>
                    </div>
                  </div>

                  <div className="registry-send-dialog__document">
                    <FileText className="h-5 w-5" strokeWidth={1.8} />
                    <div>
                      <span>Ro‘yxatdan o‘tkaziladigan yuk xati</span>
                      <strong>{modalRegistry?.registryNumber || '—'}</strong>
                    </div>
                    <b>{modalRegistry?.wagonCount ?? 0} ta vagon</b>
                  </div>

                  <label className="admin-field registry-send-dialog__comment">
                    <span>Izoh <small>ixtiyoriy</small></span>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Ro‘yxatdan o‘tkazish bo‘yicha izoh yozing…"
                      rows={3}
                    />
                  </label>
                </div>
              ) : modalMode === 'handover' ? (
                <div className="registry-handover-dialog__content">
                  <div className="registry-handover-dialog__route">
                    <span className="registry-handover-dialog__route-icon">
                      <FileCheck2 className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <div>
                      <span>Tayyor yuk xati</span>
                      <strong>{modalRegistry?.registryNumber || '—'}</strong>
                    </div>
                    <ArrowRight className="registry-handover-dialog__route-arrow" />
                    <span className="registry-handover-dialog__route-icon registry-handover-dialog__route-icon--railway">
                      <TrainFront className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <div>
                      <span>Qabul qiluvchi</span>
                      <strong>Temir yo‘l</strong>
                    </div>
                  </div>

                  <div className="registry-handover-dialog__summary">
                    <div>
                      <span>Partiya</span>
                      <strong>{modalRegistry?.registryNumber || '—'}</strong>
                    </div>
                    <div>
                      <span>Vagonlar</span>
                      <strong>{modalRegistry?.wagonCount ?? 0} ta</strong>
                    </div>
                    <div>
                      <span>Holat</span>
                      <strong>Topshirishga tayyor</strong>
                    </div>
                  </div>

                  <p className="registry-handover-dialog__notice">
                    Tasdiqlangandan so‘ng yuk xati Temir yo‘lga topshirilgan deb qayd etiladi va jarayon keyingi chiqish bosqichiga o‘tadi.
                  </p>

                  <label className="admin-field registry-handover-dialog__comment">
                    <span>Izoh <small>ixtiyoriy</small></span>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Topshirish bo‘yicha izoh yozing…"
                      rows={3}
                    />
                  </label>
                </div>
              ) : modalMode !== 'create' && modalMode !== 'edit' ? (
                <div className="registry-approve-dialog__content">
                  {modalRegistry ? (
                    <div className="registry-approve-dialog__summary">
                      <div>
                        <span>Partiya</span>
                        <strong>{modalRegistry.registryNumber || '—'}</strong>
                      </div>
                      <div>
                        <span>Vagonlar</span>
                        <strong>{modalRegistry.wagonCount ?? 0} ta</strong>
                      </div>
                      <div>
                        <span>Mahsulot</span>
                        <strong>
                          {toLatinProductName(modalRegistry.productType) || modalRegistry.productType || '—'}
                        </strong>
                      </div>
                    </div>
                  ) : null}

                  {modalMode === 'shift' ? (
                    <p className="registry-approve-dialog__notice">
                      ICHDX smena boshlig‘i sifatida yuk xatini tasdiqlaysiz. Tasdiqdan keyin Ruxsatnoma byurosi va Qo‘riqlash xizmati kelishuvi ochiladi.
                    </p>
                  ) : modalMode === 'economist-permit' || modalMode === 'economist-security' ? (
                    <p className="registry-approve-dialog__notice">
                      {modalMode === 'economist-permit'
                        ? 'Yuk xatini Ruxsatnoma byurosi bilan kelishasiz. Keyin ular alohida tasdiqlaydi.'
                        : 'Yuk xatini Qo‘riqlash xizmati bilan kelishasiz. Keyin ular alohida tasdiqlaydi.'}
                    </p>
                  ) : null}

                  {modalMode === 'permit' ? (
                    <label className="admin-field">
                      Qaror
                      <select value={permitApproved ? 'yes' : 'no'} onChange={e => setPermitApproved(e.target.value === 'yes')}>
                        <option value="yes">Kelishildi</option>
                        <option value="no">Kelishilmadi</option>
                      </select>
                    </label>
                  ) : null}

                  {modalMode === 'security' ? (
                    <label className="admin-field">
                      Qaror
                      <select value={securityApproved ? 'yes' : 'no'} onChange={e => setSecurityApproved(e.target.value === 'yes')}>
                        <option value="yes">Ruxsat etildi</option>
                        <option value="no">Ruxsat etilmadi</option>
                      </select>
                    </label>
                  ) : null}

                  <label className="admin-field registry-approve-dialog__comment">
                    <span>
                      Izoh
                      <small>
                        {(modalMode === 'permit' && !permitApproved) || (modalMode === 'security' && !securityApproved)
                          ? 'majburiy'
                          : 'ixtiyoriy'}
                      </small>
                    </span>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Qisqa izoh yozing…"
                      rows={3}
                      required={
                        (modalMode === 'permit' && !permitApproved)
                        || (modalMode === 'security' && !securityApproved)
                      }
                    />
                  </label>
                </div>
              ) : null}

              {modalError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{modalError}</p>
              ) : null}

              <div className={`confirm-dialog__actions ${modalMode === 'create' || modalMode === 'edit'
                  ? 'registry-create-dialog__actions'
                  : modalMode === 'send'
                    ? 'registry-send-dialog__actions'
                    : modalMode === 'handover'
                      ? 'registry-handover-dialog__actions'
                      : 'registry-approve-dialog__actions'
                }`}>
                <button type="button" className="btn-secondary confirm-dialog__btn" onClick={closeModal} disabled={actionConfirmBusy}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn-primary confirm-dialog__btn" disabled={actionConfirmBusy}>
                  {modalMode === 'create'
                    ? 'Yuk xatini yaratish'
                    : modalMode === 'edit'
                      ? 'Tahrirni saqlash'
                      : modalMode === 'shift'
                        ? 'Tasdiqlash'
                        : modalMode === 'economist-permit' || modalMode === 'economist-security'
                          ? 'Kelishish'
                          : modalMode === 'send'
                            ? 'Ro‘yxatdan o‘tkazish'
                            : modalMode === 'handover'
                              ? 'Temir yo‘lga topshirish'
                              : 'Tasdiqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {previewModel ? (
        <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Yuk xati">
          <div className="yx-preview-bar">
            <div>
              <div className="yx-preview-bar__title">Yuk xati — {previewModel.registryNumber}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {previewModel.etId}
                {previewModel.cargoName ? ` · ${previewModel.cargoName}` : ''}
                {previewModel.wagonCount ? ` · ${previewModel.wagonCount} vagon` : ''}
              </div>
              {previewRegistry && isRegistryReturned(previewRegistry) ? (
                <div className="yx-preview-returned">
                  {registryRejectionSummary(previewRegistry).map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="yx-preview-bar__actions">
              {previewRegistry ? registryActions(previewRegistry) : null}
              {canEdit && previewRegistry && !isRegistryWorkflowLocked(previewRegistry) && !previewRegistry.isSentToENakl && !previewRegistry.isSentToOneC ? (
                <button
                  type="button"
                  className="btn-secondary !px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5"
                  onClick={() => {
                    const reg = previewRegistry;
                    closeYukXatiPreview();
                    if (reg) openEditModal(reg);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Tahrirlash
                </button>
              ) : null}
              {!editMode ? (
                <DocumentPrintButton
                  ready={isYukXatiPrintReady(previewModel)}
                  onPrint={() => printYukXati(previewModel.registryId)}
                />
              ) : null}
              <button
                type="button"
                className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600"
                onClick={closeYukXatiPreview}
                aria-label="Yopish"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div
            className="yx-preview-scroll"
            onClick={e => {
              if (editMode) return;
              if ((e.target as HTMLElement).closest('.yuk-xati, .yx-edit-panel')) return;
              closeYukXatiPreview();
            }}
          >
            {editMode ? (
              <form
                className="yx-edit-panel"
                onSubmit={e => {
                  e.preventDefault();
                  void saveYukXatiRevision();
                }}
              >
                <h3 className="yx-edit-panel__title">Yuk xatini tahrirlash</h3>
                <p className="yx-edit-panel__hint">
                  {previewRegistry && isRegistryReturned(previewRegistry)
                    ? 'Qaytarilgan yuk xatini tuzating. Saqlashdan oldin nima o‘zgartirilgani haqida izoh yozish majburiy.'
                    : 'Yuk xati ma’lumotlarini tahrirlang. Saqlashdan oldin o‘zgarish sababi bo‘yicha izoh yozish majburiy.'}
                </p>
                <label className="admin-field">
                  Yuk xati raqami
                  <input
                    type="text"
                    required
                    value={editRegistryNumber}
                    onChange={e => setEditRegistryNumber(e.target.value)}
                    className="font-mono"
                  />
                </label>
                <label className="admin-field">
                  Izoh (majburiy)
                  <textarea
                    required
                    rows={3}
                    value={revisionComment}
                    onChange={e => setRevisionComment(e.target.value)}
                    placeholder="Masalan: vagon soni va plomba raqamlari yangilandi..."
                  />
                </label>
                {revisionError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{revisionError}</p>
                ) : null}
                <div className="yx-edit-panel__actions">
                  <button type="button" className="btn-secondary" onClick={() => setEditMode(false)}>
                    Bekor qilish
                  </button>
                  <button type="submit" className="btn-primary" disabled={revisionSaving}>
                    {revisionSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </div>
              </form>
            ) : (
              <YukXatiView model={previewModel} />
            )}
          </div>
        </div>
      ) : null}



      {annexReturnOpen && annexRegistry ? (
        <div className="confirm-dialog-root reghub-annex-return" role="presentation">
          <button
            type="button"
            className="confirm-dialog-backdrop"
            aria-label="Yopish"
            onClick={() => {
              if (!annexBusy) setAnnexReturnOpen(false);
            }}
          />
          <div
            className="confirm-dialog !max-w-[30rem] !w-[min(30rem,calc(100vw-1.5rem))] !p-5"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="confirm-dialog__close"
              aria-label="Yopish"
              disabled={annexBusy}
              onClick={() => {
                if (!annexBusy) setAnnexReturnOpen(false);
              }}
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <div className="confirm-dialog__header !mb-4">
              <div className="confirm-dialog__icon !bg-amber-50 !text-amber-700 dark:!bg-amber-950/50 dark:!text-amber-300">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="confirm-dialog__title">Yuk xatini qaytarish</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {annexRegistry.registryNumber}
                  {annexRegistry.arrivalNumber ? ` · ${annexRegistry.arrivalNumber}` : ''}
                  {` · ${annexRegistry.wagonCount} vagon`}
                </p>
              </div>
            </div>

            <div className="yx-return-card">
              <p className="yx-return-card__lead">
                {canAnnexDecideSecurity
                  ? 'Yuk xatida xato yoki kamchilik topilgan. Sababini yozing — iqtisodchi tuzatib qayta yuboradi.'
                  : 'Hujjatda xato yoki kamchilik bor. Sababini yozing — iqtisodchi tuzatib qayta yuboradi.'}
              </p>

              {annexError ? <p className="confirm-dialog__error mb-3">{annexError}</p> : null}

              <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-950 dark:text-amber-100 mb-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
                  Qaytarish sababi <span className="text-rose-500">*</span>
                </span>
                <textarea
                  rows={4}
                  autoFocus
                  disabled={annexBusy}
                  value={annexComment}
                  onChange={e => {
                    setAnnexComment(e.target.value);
                    if (annexError) setAnnexError('');
                  }}
                  placeholder="Masalan: plomba raqami mos emas, netto farqi bor, vagon raqami xato…"
                  className="security-issue-note"
                />
              </label>
              <p className="mt-1.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                Sabab Majmuadagi vagonlar va Jarayonlar tarixida ham ko‘rinadi.
              </p>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={annexBusy || actionConfirmBusy}
                onClick={() => requestActionConfirm('annex-return')}
              >
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                {annexBusy ? 'Qaytarilmoqda...' : 'Qaytarish'}
              </button>
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 py-1"
                disabled={annexBusy}
                onClick={() => setAnnexReturnOpen(false)}
              >
                Orqaga — kelishishga
              </button>
            </div>
          </div>
        </div>
      ) : null}



      {isDefectPickerOpen && (viewedDraftGroup || (viewedRegistry && isEditingRegistry)) ? (() => {
        const targetList = viewedDraftGroup ? availableDefectRowsForDraft : availableDefectRowsForEdit;
        const allKeys = targetList.map(pooledWagonKey);
        const isAllSelected = targetList.length > 0 && selectedPickerDefectKeys.length === targetList.length;
        const isIndeterminate = selectedPickerDefectKeys.length > 0 && selectedPickerDefectKeys.length < targetList.length;
        const titleDocNumber = viewedDraftGroup ? viewedDraftGroup.partyNumber : viewedRegistry?.registryNumber;

        return (
          <div className="confirm-dialog-root" role="presentation">
            <button
              type="button"
              className="confirm-dialog-backdrop"
              aria-label="Yopish"
              onClick={() => setIsDefectPickerOpen(false)}
            />
            <div
              className="confirm-dialog !p-6 !max-w-[1240px] !w-[96vw]"
              role="dialog"
              aria-modal="true"
              style={{ maxWidth: '1240px', width: '96vw' }}
            >
              <button
                type="button"
                className="confirm-dialog__close"
                aria-label="Yopish"
                onClick={() => setIsDefectPickerOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>

              <div className="confirm-dialog__header !mb-4">
                <div className="confirm-dialog__icon confirm-dialog__icon--warning">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1 pr-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="confirm-dialog__title !text-[17px] font-bold text-slate-900 dark:text-slate-100">
                      Nomuvofiq vagonlarni qo‘shish
                    </h2>
                    {targetList.length > 0 && (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-[13px] font-semibold text-amber-800 border border-amber-200 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Mavjud: {targetList.length} ta vagon
                      </span>
                    )}
                  </div>
                  <p className="confirm-dialog__desc !text-[14px] mt-1 text-slate-500 dark:text-slate-400">
                    Yuk xati ({titleDocNumber}) tarkibiga biriktiriladigan dalolatnomali nomuvofiq vagonlarni tanlang
                  </p>
                </div>
              </div>

              <div className="my-3 overflow-hidden rounded-xl border border-slate-300 shadow-xs dark:border-slate-700">
                <div className="max-h-[460px] overflow-y-auto">
                  <table className="w-full text-center border-collapse text-[14px]">
                    <thead className="sticky top-0 z-10 font-semibold text-slate-900 dark:text-slate-100">
                      <tr className="h-9 bg-[#d9e9f6] dark:bg-slate-800">
                        <th style={{ width: '44px' }} className="py-2 px-2 text-center border-b border-r border-slate-300 dark:border-slate-700">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              ref={el => {
                                if (el) el.indeterminate = isIndeterminate;
                              }}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedPickerDefectKeys(allKeys);
                                } else {
                                  setSelectedPickerDefectKeys([]);
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                              title={isAllSelected ? 'Barchasini bekor qilish' : 'Barchasini tanlash'}
                            />
                          </div>
                        </th>
                        <th style={{ width: '44px' }} className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">№</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Vagon raqami</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Vagon turi</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Hujjat raqami</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Mahsulot</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-slate-300 dark:border-slate-700">Dalolatnoma</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900">
                      {targetList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-[14px] text-slate-500 dark:text-slate-400">
                            Hozirda ro‘yxatdan o‘tkazilmagan boshqa nomuvofiq vagonlar mavjud emas.
                          </td>
                        </tr>
                      ) : (
                        targetList.map((row, index) => {
                          const key = pooledWagonKey(row);
                          const isSelected = selectedPickerDefectKeys.includes(key);

                          return (
                            <tr
                              key={key}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedPickerDefectKeys(prev => prev.filter(k => k !== key));
                                } else {
                                  setSelectedPickerDefectKeys(prev => [...prev, key]);
                                }
                              }}
                              className={`cursor-pointer transition-colors text-[14px] ${
                                isSelected
                                  ? 'bg-amber-50/80 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:hover:bg-amber-900/50'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <td className="py-1.5 px-2 text-center border-b border-r border-slate-300 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setSelectedPickerDefectKeys(prev => [...prev, key]);
                                      } else {
                                        setSelectedPickerDefectKeys(prev => prev.filter(k => k !== key));
                                      }
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                                  />
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] text-slate-500 tabular-nums border-b border-r border-slate-300 dark:border-slate-700">
                                {index + 1}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                {row.wagonNumber}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[12.5px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 leading-tight">
                                  {wagonTypeText(row.wagonType)}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 leading-tight">
                                  {row.arrivalNumber || '—'}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                {toLatinProductName(row.product) || row.product || 'Mahsulotsiz'}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-slate-300 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-700 transition-all hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 leading-tight"
                                  onClick={() => openDefectActModal(row)}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  <span>{defectActDisplayName(row) || 'Dalolatnoma'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-[14px] font-medium text-slate-600 dark:text-slate-400">
                  Jami <strong className="text-slate-900 dark:text-slate-100 font-bold">{targetList.length}</strong> ta vagondan{' '}
                  <strong className="text-amber-800 dark:text-amber-300 font-bold">{selectedPickerDefectKeys.length}</strong> tasi tanlandi
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="btn-secondary !text-[14px] !px-4 !py-2"
                    onClick={() => setIsDefectPickerOpen(false)}
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    disabled={selectedPickerDefectKeys.length === 0}
                    className="btn-primary !text-[14px] !px-4 !py-2 !bg-amber-600 hover:!bg-amber-700 disabled:opacity-50"
                    onClick={() => {
                      if (viewedDraftGroup) {
                        setDraftAttachedDefectKeys(prev => ({
                          ...prev,
                          [viewedDraftGroup.key]: [
                            ...(prev[viewedDraftGroup.key] || []),
                            ...selectedPickerDefectKeys,
                          ],
                        }));
                      } else if (viewedRegistry && isEditingRegistry) {
                        setEditAttachedDefectKeys(prev => [
                          ...prev,
                          ...selectedPickerDefectKeys,
                        ]);
                        setSelectedEditWagonKeys(prev => {
                          const next = { ...prev };
                          selectedPickerDefectKeys.forEach(k => {
                            next[k] = true;
                          });
                          return next;
                        });
                      }
                      setIsDefectPickerOpen(false);
                      setSelectedPickerDefectKeys([]);
                    }}
                  >
                    Tanlanganlarni qo‘shish ({selectedPickerDefectKeys.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {isBufferPickerOpen && (viewedDraftGroup || (viewedRegistry && isEditingRegistry)) ? (() => {
        const targetList = viewedDraftGroup ? availableBufferRowsForDraft : availableBufferRowsForEdit;
        const allKeys = targetList.map(pooledWagonKey);
        const isAllSelected = targetList.length > 0 && selectedPickerBufferKeys.length === targetList.length;
        const isIndeterminate = selectedPickerBufferKeys.length > 0 && selectedPickerBufferKeys.length < targetList.length;
        const titleDocNumber = viewedDraftGroup ? viewedDraftGroup.partyNumber : viewedRegistry?.registryNumber;

        return (
          <div className="confirm-dialog-root" role="presentation">
            <button
              type="button"
              className="confirm-dialog-backdrop"
              aria-label="Yopish"
              onClick={() => setIsBufferPickerOpen(false)}
            />
            <div
              className="confirm-dialog !p-6 !max-w-[1240px] !w-[96vw]"
              role="dialog"
              aria-modal="true"
              style={{ maxWidth: '1240px', width: '96vw' }}
            >
              <button
                type="button"
                className="confirm-dialog__close"
                aria-label="Yopish"
                onClick={() => setIsBufferPickerOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>

              <div className="confirm-dialog__header !mb-4">
                <div className="confirm-dialog__icon !bg-sky-100 !text-sky-700 dark:!bg-sky-950/50 dark:!text-sky-300">
                  <Layers className="h-6 w-6" />
                </div>
                <div className="flex-1 pr-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="confirm-dialog__title !text-[17px] font-bold text-slate-900 dark:text-slate-100">
                      Oldingi partiyalardan qolgan vagonlarni qo‘shish
                    </h2>
                    {targetList.length > 0 && (
                      <span className="rounded-full bg-sky-50 px-3 py-1 text-[13px] font-semibold text-sky-700 border border-sky-200 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        Mavjud: {targetList.length} ta vagon
                      </span>
                    )}
                  </div>
                  <p className="confirm-dialog__desc !text-[14px] mt-1 text-slate-500 dark:text-slate-400">
                    Yuk xati ({titleDocNumber}) tarkibiga biriktiriladigan oldingi partiyalarning tayyor vagonlarini tanlang
                  </p>
                </div>
              </div>

              <div className="my-3 overflow-hidden rounded-xl border border-slate-300 shadow-xs dark:border-slate-700">
                <div className="max-h-[460px] overflow-y-auto">
                  <table className="w-full text-center border-collapse text-[14px]">
                    <thead className="sticky top-0 z-10 font-semibold text-slate-900 dark:text-slate-100">
                      <tr className="h-9 bg-[#d9e9f6] dark:bg-slate-800">
                        <th style={{ width: '44px' }} className="py-2 px-2 text-center border-b border-r border-slate-300 dark:border-slate-700">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              ref={el => {
                                if (el) el.indeterminate = isIndeterminate;
                              }}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedPickerBufferKeys(allKeys);
                                } else {
                                  setSelectedPickerBufferKeys([]);
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                              title={isAllSelected ? 'Barchasini bekor qilish' : 'Barchasini tanlash'}
                            />
                          </div>
                        </th>
                        <th style={{ width: '44px' }} className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">№</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Vagon raqami</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Vagon turi</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Hujjat raqami</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Buyurtma raqami</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Mahsulot</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">Netto</th>
                        <th className="py-2 px-2 text-center text-[14px] font-semibold whitespace-nowrap border-b border-slate-300 dark:border-slate-700">Plomba raqami</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900">
                      {targetList.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-6 text-center text-[14px] text-slate-500 dark:text-slate-400">
                            Hozirda ro‘yxatdan o‘tkazilmagan boshqa tayyor vagonlar mavjud emas.
                          </td>
                        </tr>
                      ) : (
                        targetList.map((row, index) => {
                          const key = pooledWagonKey(row);
                          const isSelected = selectedPickerBufferKeys.includes(key);
                          const currentOrderId = wagonOrderIds[key] || '';
                          const matchingOrdersForRow = getMatchingActiveOrders(orders, row.product, currentOrderId);

                          return (
                            <tr
                              key={key}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedPickerBufferKeys(prev => prev.filter(k => k !== key));
                                } else {
                                  setSelectedPickerBufferKeys(prev => [...prev, key]);
                                }
                              }}
                              className={`cursor-pointer transition-colors text-[14px] ${
                                isSelected
                                  ? 'bg-sky-50/80 hover:bg-sky-100/80 dark:bg-sky-950/40 dark:hover:bg-sky-900/50'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <td className="py-1.5 px-2 text-center border-b border-r border-slate-300 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-center">
                                 <input
                                   type="checkbox"
                                   checked={isSelected}
                                   onChange={e => {
                                     if (e.target.checked) {
                                       setSelectedPickerBufferKeys(prev => [...prev, key]);
                                     } else {
                                       setSelectedPickerBufferKeys(prev => prev.filter(k => k !== key));
                                     }
                                   }}
                                   className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                                 />
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] text-slate-500 tabular-nums border-b border-r border-slate-300 dark:border-slate-700">
                                {index + 1}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                {row.wagonNumber}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[12.5px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 leading-tight">
                                  {wagonTypeText(row.wagonType)}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 leading-tight">
                                  {row.arrivalNumber || '—'}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                                {matchingOrdersForRow.length === 0 ? (
                                  <span className="text-[12.5px] text-slate-400 italic">Buyurtmasiz</span>
                                ) : matchingOrdersForRow.length === 1 ? (
                                  <span className="inline-flex rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 leading-tight">
                                    {matchingOrdersForRow[0].orderNumber}
                                  </span>
                                ) : (
                                  <select
                                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[12.5px] font-mono font-medium text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 cursor-pointer h-7"
                                    value={currentOrderId}
                                    onChange={e => {
                                      const nextOrderId = e.target.value;
                                      const matchingOrder = orders.find(o => o.id === nextOrderId);
                                      setWagonOrderIds(prev => ({ ...prev, [key]: nextOrderId }));
                                      if (matchingOrder && matchingOrder.lines.length === 1) {
                                        setWagonRouteLines(prev => ({ ...prev, [key]: matchingOrder.lines[0].id }));
                                      } else {
                                        setWagonRouteLines(prev => ({ ...prev, [key]: '' }));
                                      }
                                    }}
                                  >
                                    <option value="">Tanlang</option>
                                    {matchingOrdersForRow.map(order => (
                                      <option key={order.id} value={order.id}>
                                        {order.orderNumber}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                {toLatinProductName(row.product) || row.product || 'Mahsulotsiz'}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap border-b border-r border-slate-300 dark:border-slate-700">
                                {row.netto ? `${row.netto} t` : (row.brutto ? `${row.brutto} t` : '—')}
                              </td>
                              <td className="py-1.5 px-2 text-center text-[14px] whitespace-nowrap border-b border-slate-300 dark:border-slate-700">
                                {row.sealNumber ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5">
                                    {parseSealNumbers(row.sealNumber).map(seal => (
                                      <span
                                        key={seal}
                                        className="inline-block whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-[1px] font-mono text-[12px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 leading-tight"
                                      >
                                        {seal}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[14px] text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-[14px] font-medium text-slate-600 dark:text-slate-400">
                  Jami <strong className="text-slate-900 dark:text-slate-100 font-bold">{targetList.length}</strong> ta vagondan{' '}
                  <strong className="text-sky-700 dark:text-sky-300 font-bold">{selectedPickerBufferKeys.length}</strong> tasi tanlandi
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="btn-secondary !text-[14px] !px-4 !py-2"
                    onClick={() => setIsBufferPickerOpen(false)}
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    disabled={selectedPickerBufferKeys.length === 0}
                    className="btn-primary !text-[14px] !px-4 !py-2 !bg-sky-600 hover:!bg-sky-700 disabled:opacity-50"
                    onClick={() => {
                      const newOrderAssignments: Record<string, string> = {};
                      const newRouteAssignments: Record<string, string> = {};
                      selectedPickerBufferKeys.forEach(k => {
                        if (!wagonOrderIds[k]) {
                          const r = targetList.find(row => pooledWagonKey(row) === k);
                          if (r) {
                            const match = getMatchingActiveOrders(orders, r.product, null);
                            if (match.length === 1) {
                              newOrderAssignments[k] = match[0].id;
                              if (match[0].lines.length === 1) {
                                newRouteAssignments[k] = match[0].lines[0].id;
                              }
                            }
                          }
                        }
                      });
                      if (Object.keys(newOrderAssignments).length > 0) {
                        setWagonOrderIds(prev => ({ ...prev, ...newOrderAssignments }));
                        setWagonRouteLines(prev => ({ ...prev, ...newRouteAssignments }));
                      }

                      if (viewedDraftGroup) {
                        setDraftAttachedBufferKeys(prev => ({
                          ...prev,
                          [viewedDraftGroup.key]: [
                            ...(prev[viewedDraftGroup.key] || []),
                            ...selectedPickerBufferKeys,
                          ],
                        }));
                        setSelectedDraftWagonKeys(prev => {
                          const next = { ...prev };
                          selectedPickerBufferKeys.forEach(k => {
                            next[k] = true;
                          });
                          return next;
                        });
                      } else if (viewedRegistry && isEditingRegistry) {
                        setEditAttachedBufferKeys(prev => [
                          ...prev,
                          ...selectedPickerBufferKeys,
                        ]);
                        setSelectedEditWagonKeys(prev => {
                          const next = { ...prev };
                          selectedPickerBufferKeys.forEach(k => {
                            next[k] = true;
                          });
                          return next;
                        });
                      }
                      setIsBufferPickerOpen(false);
                      setSelectedPickerBufferKeys([]);
                    }}
                  >
                    Tanlanganlarni qo‘shish ({selectedPickerBufferKeys.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      <ConfirmDialog
        open={Boolean(actionConfirm && actionConfirmCopy)}
        title={actionConfirmCopy?.title ?? ''}
        message={actionConfirmCopy?.message ?? ''}
        confirmLabel={actionConfirmCopy?.confirmLabel}
        cancelLabel="Bekor qilish"
        variant={actionConfirmCopy?.variant ?? 'default'}
        loading={actionConfirmBusy || annexBusy}
        error={
          actionConfirm?.kind === 'annex-approve' || actionConfirm?.kind === 'annex-return'
            ? annexError || undefined
            : modalError || undefined
        }
        onConfirm={() => {
          if (!actionConfirm) return;
          void executeRegistryAction(actionConfirm.kind);
        }}
        onCancel={() => {
          if (actionConfirmBusy || annexBusy) return;
          setActionConfirm(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteConfirmRegistry)}
        title="Yuk xatini o‘chirish"
        message={`Haqiqatan ham ${deleteConfirmRegistry?.registryNumber || ''} raqamli yuk xatini o‘chirmoqchimisiz? Vagonlar yana bo‘sh holatga qaytadi va buyurtma hisobi tiklanadi.`}
        confirmLabel={deletingRegistry ? "O'chirilmoqda..." : "O'chirish"}
        cancelLabel="Bekor qilish"
        variant="danger"
        loading={deletingRegistry}
        onConfirm={() => void handleDeleteRegistry()}
        onCancel={() => {
          if (!deletingRegistry) setDeleteConfirmRegistry(null);
        }}
      />

      <WagonEntryPermitView
        arrival={entryPermitTarget}
        onClose={() => setEntryPermitTarget(null)}
      />

      {viewedDefectTarget ? (
        <DefectActView
          model={buildDefectActModel(viewedDefectTarget.arrival, viewedDefectTarget.unit)}
          actType={resolveDefectActType(
            viewedDefectTarget.unit.wagonType,
            viewedDefectTarget.unit.loadingComment,
            viewedDefectTarget.unit.defectActType as DefectActType | undefined,
          )}
          onClose={() => setViewedDefectTarget(null)}
        />
      ) : null}

      {isEmptyDispatchOpen ? (
        <div className="confirm-dialog-root" role="presentation">
          <button
            type="button"
            className="confirm-dialog-backdrop"
            aria-label="Yopish"
            onClick={() => !emptySubmitting && setIsEmptyDispatchOpen(false)}
          />
          <div
            className="confirm-dialog !max-w-[64rem] !w-[min(64rem,calc(100vw-2rem))] !p-6 sm:!p-7 !rounded-2xl shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="empty-dispatch-title"
          >
            <button
              type="button"
              className="confirm-dialog__close !top-5 !right-5 !p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Yopish"
              onClick={() => setIsEmptyDispatchOpen(false)}
              disabled={emptySubmitting}
            >
              <X className="w-5 h-5 text-slate-500" strokeWidth={2} />
            </button>

            <div className="confirm-dialog__header !mb-4 flex items-start gap-4">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 shrink-0 border border-amber-200 dark:border-amber-800 shadow-xs">
                <AlertTriangle className="w-7 h-7" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 id="empty-dispatch-title" className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Yuklanmagan / Bo‘sh vagonlarni chiqarish
                  </h2>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                    Bo‘sh jo‘natma
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-normal">
                  Kiritish sikli tugagan, mahsulot ortilmagan vagonlarni rasmiy asos bilan yuk xatiga biriktirish va zavoddan chiqarish
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-sm text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200 mb-5 space-y-1.5 shadow-xs">
              <p className="font-bold flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={2.2} />
                Rasmiy tartibda qayd etish:
              </p>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[13px] sm:text-sm">
                Tanlangan vagonlarga <strong>mahsulot ortilmagan</strong> deb qayd etiladi (Netto = 0.00 tn, Brutto = Tara). Ular 1C kutish to‘sig‘idan avtomatik o‘tkazilib, Yuk xati (Reestr) tuziladi hamda Ruxsatnoma byurosi va Qo‘riqlash xizmati tekshiruvidan so‘ng poyezd tarkibida stansiyaga chiqariladi.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Chiqarish asosi turi: <span className="text-rose-500 font-extrabold">*</span>
                </label>
                <select
                  value={emptyReason}
                  onChange={e => {
                    setEmptyReason(e.target.value);
                    if (e.target.value.includes('GU-23')) setEmptyDocType('GU-23 dalolatnoma');
                    else setEmptyDocType('Xizmat xati');
                  }}
                  disabled={emptySubmitting}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-xs focus:border-amber-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-medium"
                >
                  <option value="Buyurtma bekor qilingan (Mahsulotsiz)">Buyurtma bekor qilingan (Mahsulotsiz)</option>
                  <option value="GU-23 dalolatnomasi (Texnik nosozlik / Yaroqsiz)">GU-23 dalolatnomasi (Texnik nosozlik / Yaroqsiz)</option>
                  <option value="Ijarachiga / egasiga bo‘sh qaytarish (Shartnoma asosida)">Ijarachiga / egasiga bo‘sh qaytarish (Shartnoma asosida)</option>
                  <option value="Xizmat xati / Reja o‘zgargan (Yuk ortilmadi)">Xizmat xati / Reja o‘zgargan (Yuk ortilmadi)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Asos hujjati raqami va sanasi: <span className="text-rose-500 font-extrabold">* (Majburiy)</span>
                  </label>
                  {!emptyDocNumber.trim() && (
                    <span className="text-[11px] font-bold text-rose-500 animate-pulse">
                      Kiritish shart!
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={emptyDocNumber}
                  onChange={e => setEmptyDocNumber(e.target.value)}
                  disabled={emptySubmitting}
                  placeholder="Masalan: Xizmat xati № 48, 28.09.2026 yoki GU-23 № 14"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-800 shadow-xs focus:outline-hidden transition-all dark:bg-slate-800 dark:text-slate-100 ${
                    !emptyDocNumber.trim()
                      ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                      : 'border-slate-300 focus:border-amber-500 bg-white dark:border-slate-700'
                  }`}
                />
                {!emptyDocNumber.trim() && (
                  <p className="mt-1 text-xs text-rose-500 font-medium">
                    ⚠️ Asos hujjati raqami va sanasi kiritilmaguncha vagonlarni chiqarib bo‘lmaydi.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Asos hujjati fayli / skaneri (biriktirish):
                </label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 dark:border-amber-800 dark:bg-amber-950/30 px-3.5 py-2 text-sm font-medium text-amber-900 dark:text-amber-200 cursor-pointer shadow-xs transition-colors">
                    <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="truncate max-w-xs">{emptyAttachedFileName || 'Fayl biriktirish (PDF / rasm)'}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*,.doc,.docx"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setEmptyAttachedFileName(file.name);
                      }}
                    />
                  </label>
                  {emptyAttachedFileName && (
                    <button
                      type="button"
                      onClick={() => setEmptyAttachedFileName('')}
                      className="text-slate-400 hover:text-rose-500 p-1"
                      title="Faylni o‘chirish"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Qo‘shimcha izoh (ixtiyoriy):
                </label>
                <input
                  type="text"
                  value={emptyComment}
                  onChange={e => setEmptyComment(e.target.value)}
                  disabled={emptySubmitting}
                  placeholder="Masalan: Vagon toza emasligi sababli yuklanmadi, bo‘sh jo‘natilmoqda"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs focus:border-amber-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Vagonlarni tanlang:
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {emptySelectedWagonKeys.size} / {filteredEmptyWagons.length} ta tanlandi
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Qidirish (№, partiya)..."
                    value={emptySearch}
                    onChange={e => setEmptySearch(e.target.value)}
                    className="w-48 sm:w-60 rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={toggleSelectAllEmpty}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition-colors shadow-xs cursor-pointer"
                >
                  {emptySelectedWagonKeys.size === filteredEmptyWagons.length && filteredEmptyWagons.length > 0
                    ? 'Barchasini bekor qilish'
                    : 'Barchasini tanlash'}
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 mb-5 shadow-xs">
              {filteredEmptyWagons.length === 0 ? (
                <div className="p-8 text-center text-sm font-medium text-slate-400">
                  Kiritish sikli tugagan, yuklanmagan vagonlar topilmadi.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-xs uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 sticky top-0 font-bold z-10 backdrop-blur-xs">
                      <th className="p-3 w-10 text-center">✓</th>
                      <th className="p-3">№</th>
                      <th className="p-3">Vagon raqami</th>
                      <th className="p-3">Partiya raqami</th>
                      <th className="p-3">Mahsulot</th>
                      <th className="p-3">Joriy holat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {filteredEmptyWagons.map((w, idx) => {
                      const key = pooledWagonKey(w);
                      const isChecked = emptySelectedWagonKeys.has(key);
                      return (
                        <tr
                          key={key}
                          onClick={() => toggleSelectEmptyWagon(key)}
                          className={`cursor-pointer transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/25 ${isChecked ? 'bg-amber-50/90 dark:bg-amber-950/40 font-medium' : ''}`}
                        >
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectEmptyWagon(key)}
                              className="size-4 rounded border-slate-300 accent-amber-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                            {w.wagonNumber}
                          </td>
                          <td className="p-3 text-slate-700 dark:text-slate-300 font-mono text-sm">
                            {w.arrivalNumber || '—'}
                          </td>
                          <td className="p-3 text-slate-700 dark:text-slate-300 font-medium text-sm">
                            <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Bo‘sh ({toLatinProductName(w.product || 'Mahsulotsiz')})
                            </span>
                          </td>
                          <td className="p-3">
                            {(() => {
                              const st = formatEmptyWagonStatus(w.status);
                              return (
                                <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold border border-slate-200 dark:border-slate-700 ${st.tone}`}>
                                  {st.label}
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {emptyError ? (
              <p className="confirm-dialog__error mb-4 text-sm font-semibold">{emptyError}</p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {emptySelectedWagonKeys.size > 0
                  ? `${emptySelectedWagonKeys.size} ta vagon bo‘sh holatda yuk xatiga biriktiriladi`
                  : 'Chiqariladigan vagonlarni tanlang'}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary !text-sm !py-2.5 !px-4 !rounded-xl"
                  disabled={emptySubmitting}
                  onClick={() => setIsEmptyDispatchOpen(false)}
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  disabled={emptySubmitting || emptySelectedWagonKeys.size === 0 || !emptyDocNumber.trim()}
                  onClick={() => void submitEmptyDispatch()}
                  title={!emptyDocNumber.trim() ? "Asos hujjati raqami va sanasini kiritish majburiy!" : undefined}
                  className="inline-flex items-center gap-2 rounded-xl border border-transparent bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600 transition-colors shadow-md cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  {emptySubmitting
                    ? 'Tayyorlanmoqda...'
                    : `Yuk xatini shakllantirishga chiqarish (${emptySelectedWagonKeys.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
