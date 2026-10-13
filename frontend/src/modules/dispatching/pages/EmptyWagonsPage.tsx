import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  CheckCircle2,
  ChevronDown,
  Hourglass,
  Eye,
  MapPinned,
  Package,
  PackageOpen,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Shield,
  Sparkles,
  TrainFront,
  Trash2,
  Warehouse,
  FileCheck,
  FileSpreadsheet,
  FileText,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../../../shared/types';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { notifyWagonAdded, notifyWagonsExited } from '../../../shared/services/telegramService';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { HubZoneTabs } from '../../../shared/components/HubZoneTabs';
import type { HubZoneTone } from '../../../shared/components/HubZoneTabs';
import { formatDateTimeDisplay } from '../../../shared/utils/dates';
import { toLatinProductName } from '../../../shared/utils/cyrillicToLatin';
import { OrderSheetMenu } from '../../../shared/components/OrderSheetMenu';
import { isOneCArrival, isRailwayEntryArrival } from '../../../shared/utils/oneCSources';
import {
  isWagonKind,
  WAGON_KIND_LABEL,
  WAGON_KIND_SUBTITLE,
  type WagonKind,
} from '../../../shared/utils/wagonKinds';
import { EmptyWagonIntakeDialog } from '../../../shared/components/EmptyWagonIntakeDialog';
import { EditPartyWagonsDialog } from '../../../shared/components/EditPartyWagonsDialog';
import { WagonKindArt } from '../../../shared/components/WagonKindArt';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { OrderSheetTableFooter } from '../../../shared/components/OrderSignatureStrip';
import {
  latestIntakeReturnNote,
  latestTareIssueNote,
} from '../../../shared/utils/arrivalIssueNotes';
import { getIntakePartyStatus, isGateInspectionDone, needsGateInspection } from '../../../shared/utils/intakePartyStatus';
import { SecurityInspectionDialog } from '../../../shared/components/SecurityInspectionDialog';
import { hasDefectAct, defectActDisplayName, resolveDefectActType, type DefectActType } from '../../../shared/constants/defectActTypes';
import { buildDefectActModel } from '../../../shared/utils/defectActModel';
import { DefectActView } from '../../../shared/components/DefectActView';
import { SealDefectActView } from '../../../shared/components/SealDefectActView';
import { WagonEntryPermitView } from '../../../shared/components/WagonEntryPermitView';
import { isRegistryReturned } from '../../../shared/utils/registryWorkflow';
import { getArrivalEntryPendingActionInfo } from '../../../shared/utils/entryWorkflow';
import { YukXatiView } from '../../../shared/components/YukXatiView';
import { DocumentChipButton } from '../../../shared/components/DocumentPackChip';
import { DocsHubToolbar } from '../../../shared/components/DocsHubToolbar';
import { exportSheet, todayStamp, type SheetCell } from '../../../shared/utils/excelExport';
import { DocsHubPagination } from '../../../shared/components/DocsHubPagination';
import { useDocsHubQuery } from '../../../shared/hooks/useDocsHubQuery';
import {
  docsDateInRange,
  docsDateKey,
  docsMatchesSearch,
  paginateItems,
} from '../../../shared/utils/docsHubFilter';
import { hasEntryPermitQr } from '../../../shared/utils/partyDocuments';
import { buildYukXatiModel, isYukXatiPrintReady, type YukXatiModel } from '../../../shared/utils/yukXatiModel';
import { printYukXati } from '../../../shared/utils/yukXatiPrint';
import { DocumentPrintButton } from '../../../shared/components/DocumentPrintButton';
import { isDashboardOnSiteStage, isTodayInTashkent } from '../../../shared/utils/dashboardOverview';
import {
  normalizeWagonOwnership,
  wagonOwnershipLabel,
  WAGON_OWNERSHIP,
} from '../../../shared/constants/wagonOwnership';
import { intakeLoadStateLabel, normalizeIntakeLoadState, WAGON_INTAKE_LOAD_STATE } from '../../../shared/constants/wagonIntakeLoadState';

function newestPartyFirst(a: EmptyWagonArrival, b: EmptyWagonArrival) {
  return docsDateKey(b.createdAt).localeCompare(docsDateKey(a.createdAt));
}

function OwnershipChip({ ownership }: { ownership?: string | null }) {
  const isMajmua = normalizeWagonOwnership(ownership) === WAGON_OWNERSHIP.Majmua;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
        isMajmua ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
      }`}
    >
      {isMajmua ? <Warehouse className="h-3 w-3" strokeWidth={2} /> : <MapPinned className="h-3 w-3" strokeWidth={2} />}
      {wagonOwnershipLabel(ownership)}
    </span>
  );
}

function LoadStateChip({ value }: { value?: string | null }) {
  const yukli = normalizeIntakeLoadState(value) === WAGON_INTAKE_LOAD_STATE.Yukli;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${yukli ? 'text-amber-700 dark:text-amber-400' : 'text-sky-700 dark:text-slate-300'}`}>
      {yukli ? <Package className="h-3 w-3" strokeWidth={2} /> : <PackageOpen className="h-3 w-3" strokeWidth={2} />}
      {intakeLoadStateLabel(value)}
    </span>
  );
}

/** Temir yo‘lning o‘z ishi (boshqaruvdagi umumiy 11 bosqich emas). */
type RailwayWorkLane = 'toSecurity' | 'toEstakada' | 'defectActs' | 'toKengsoy';
/** ICHDX yuboruvchi paneli. */
type IchdxHubTab = 'pending' | 'sent';

const RAILWAY_WORK: {
  id: RailwayWorkLane;
  title: string;
  hint: string;
  icon: typeof ArrowDownToLine;
}[] = [
  {
    id: 'toSecurity',
    title: 'Vagonlarni kiritish',
    hint: 'Bo‘sh vagonlarni zavod hududiga kiritish',
    icon: ArrowDownToLine,
  },
  {
    id: 'toEstakada',
    title: 'Estakadagacha',
    hint: 'Tara tortilgandan keyin yuklash estakadasiga qo‘yish',
    icon: MapPinned,
  },
  {
    id: 'defectActs',
    title: 'Dalolatnoma',
    hint: 'Nomuvofiqlik aniqlangan vagonlarga Temir yo‘l dalolatnomasi',
    icon: FileCheck,
  },
  {
    id: 'toKengsoy',
    title: 'Kengsoygacha',
    hint: 'Yuklangan · plomba · yuk xatidan keyin vagonlarni olib chiqish',
    icon: ArrowUpFromLine,
  },
];

function needsRailwayDefectAct(unit: Pick<EmptyWagonUnit, 'status' | 'defectActFileName' | 'defectActNumber'>): boolean {
  return unit.status === 'Returned' && !hasDefectAct(unit);
}

function pendingDefectActCount(item: EmptyWagonArrival): number {
  return (item.wagons ?? []).filter(needsRailwayDefectAct).length;
}

const STAGE_LABEL: Record<string, string> = {
  RailwayInspected: 'Ro\'yxatga olindi',
  KengsoyInspection: 'Vagonlarni kiritish kutilmoqda',
  SecurityInspection: 'Kirish kelishuvi kutilmoqda',
  ReadyForEstakada: 'Tara kutilmoqda',
  TareWeighing: 'Tara tortilmoqda',
  EstakadaPlaced: 'Yuklashga tayyor',
  Loading: 'Yuklanmoqda',
  Loaded: 'Yuklangan',
  ToRailwayScale: 'Brutto kutmoqda',
  GrossWeighed: 'Plomba kutmoqda',
  SealInstallation: 'Plomba o‘rnatilmoqda',
  SealPending: 'Plomba tasdig‘i kutilmoqda',
  Sealed: 'Yuk xati kutmoqda',
  RegistryPrepared: 'Yuk xati shakllantirildi',
  DocumentsIssued: '1C / e-naklga kiritildi',
  PermitAndSecurityApproved: 'Chiqishga ruxsat berildi',
  Exited: 'Kengsoyga chiqarildi',
};

/** ICHDX eslatma oluvchilari — tasdiq yo‘q, faqat ogohlantirish.
 *  Temir yo‘l yo‘q: ular o‘zlari vagon raqamini kiritadi. */
const NOTIFY_DEPARTMENTS = [
  { name: 'MS va MX xizmati' },
  { name: 'TM va XA smena muxandisi' },
  { name: "Qo'riqlash xizmati" },
  { name: 'Ruxsatnoma byurosi' },
] as const;

const DEPT_NAMES = NOTIFY_DEPARTMENTS.map(d => d.name);

const ROLE_DEPARTMENT: Record<string, string> = {
  Marketing: 'MS va MX xizmati',
  Management: 'MS va MX xizmati',
  Railway: "Temir yo'l sexi",
  Warehouse: 'TM va XA smena muxandisi',
  Security: "Qo'riqlash xizmati",
  Permit: 'Ruxsatnoma byurosi',
};

const STAGES = {
  RailwayInspected: 'RailwayInspected',
  KengsoyInspection: 'KengsoyInspection',
  SecurityInspection: 'SecurityInspection',
  ReadyForEstakada: 'ReadyForEstakada',
  TareWeighing: 'TareWeighing', // legacy — UI da ReadyForEstakada bilan bir xil
  EstakadaPlaced: 'EstakadaPlaced',
} as const;

function parseList(value?: string[] | string | null): string[] {
  if (Array.isArray(value)) return value.map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

/** Platforma konteyner-sisternalari: "010010/1 | 010010/6" */
function parseContainers(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*[|;·]\s*|\s*,\s*/)
    .map(v => v.trim())
    .filter(Boolean);
}

function parseNotified(item: EmptyWagonArrival): string[] {
  const list = parseList(item.notifiedDepartments);
  if (list.length) return list;
  // Temir yo'l kiritgan, lekin ICHDX hali xabarnoma yaratmagan
  if ((item.stage || '') === STAGES.RailwayInspected) return [];
  return [...DEPT_NAMES];
}

function getStage(item: EmptyWagonArrival): string {
  return item.stage || STAGES.KengsoyInspection;
}

function isReadyForEstakada(stage: string): boolean {
  return stage === STAGES.ReadyForEstakada || stage === STAGES.TareWeighing;
}

/** Estakadagacha yo‘nalishi: tayyor + estakadaga qo‘yilgan / yuklanayotgan. */
function isEstakadaLaneStage(stage: string): boolean {
  return (
    isReadyForEstakada(stage)
    || stage === STAGES.EstakadaPlaced
    || stage === 'Loading'
  );
}

/** "12345:21.50, 67890:22.10" yoki eski oddiy qiymat */
function parseWagonTares(tareWeight: string | undefined, wagonNumbers: string[]): { wagonNum: string; tare: string }[] {
  const pairs = new Map<string, string>();
  const raw = (tareWeight || '').trim();
  if (raw) {
    const parts = raw.split(/[,;]/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^(.+?)\s*[:=]\s*(.+)$/);
      if (m) {
        pairs.set(m[1].trim(), m[2].trim());
      }
    }
  }
  return wagonNumbers.map(num => ({
    wagonNum: num,
    tare: pairs.get(num) ?? '',
  }));
}

function unitsFromArrival(item: EmptyWagonArrival): EmptyWagonUnit[] {
  if (item.wagons && item.wagons.length > 0) {
    return [...item.wagons].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const nums = parseList(item.verifiedWagonNumbers || item.wagonNumbers);
  const tares = parseWagonTares(item.tareWeight, nums);
  const grosses = parseWagonTares(item.grossWeight, nums);
  const grossMap = new Map(grosses.map(r => [r.wagonNum, r.tare]));
  return tares.map((row, i) => ({
    id: `${item.id}-${row.wagonNum}`,
    wagonNumber: row.wagonNum,
    // Legacy mirror wagon turini saqlamaydi. Konteynerni pozitsiya bo‘yicha
    // taxmin qilish platforma konteynerini sisternaga chiqarib yuboradi.
    cisternNumber: '',
    wagonType: '',
    ownership: 'tashqi',
    status: row.tare ? 'Tared' : 'AwaitingTare',
    tareWeight: row.tare,
    grossWeight: grossMap.get(row.wagonNum) || '',
    nettoWeight: null,
    loadingComment: '',
    sortOrder: i,
  }));
}

type WagonRowLite = {
  id: string;
  wagonNumber: string;
  cisternNumber: string;
  wagonType: WagonKind | '';
  ownership: string;
  intakeLoadState: string;
  productType: string;
  status: string;
  loadingComment: string;
  defectActFileName?: string;
  defectActNumber?: string;
  defectActType?: string;
};

function rowsFromArrival(item: EmptyWagonArrival): WagonRowLite[] {
  return unitsFromArrival(item).map(u => ({
    id: u.id,
    wagonNumber: u.wagonNumber,
    cisternNumber: u.cisternNumber || '',
    wagonType: isWagonKind(u.wagonType) ? u.wagonType : '',
    ownership: u.ownership || 'tashqi',
    intakeLoadState: u.intakeLoadState || 'bosh',
    productType: u.productType || item.productType || '',
    status: u.status,
    loadingComment: u.loadingComment || '',
    defectActFileName: u.defectActFileName,
    defectActNumber: u.defectActNumber,
    defectActType: u.defectActType,
  }));
}

const KIND_ORDER: WagonKind[] = ['sisterna', 'closed', 'platform'];

function groupRowsByKind(rows: WagonRowLite[]) {
  const map = new Map<WagonKind | 'unknown', WagonRowLite[]>();
  for (const kind of KIND_ORDER) map.set(kind, []);
  map.set('unknown', []);
  for (const row of rows) {
    map.get(row.wagonType || 'unknown')!.push(row);
  }
  return map;
}

function kindStatsFromRows(rows: WagonRowLite[]) {
  const stats: Record<WagonKind | 'unknown', number> = {
    sisterna: 0,
    closed: 0,
    platform: 0,
    unknown: 0,
  };
  for (const row of rows) {
    if (row.wagonType) stats[row.wagonType] += 1;
    else stats.unknown += 1;
  }
  return stats;
}

/** Vagon partiyasi jadvallari uchun yagona, kesilmaydigan qisqa ko'rinish. */
function PartyProductsSummary({ rows, activeProduct }: { rows: WagonRowLite[]; activeProduct?: string }) {
  const normActive = activeProduct?.trim().toLowerCase();
  const latinActive = activeProduct ? toLatinProductName(activeProduct).trim().toLowerCase() : '';
  const isMatch = (name: string) => {
    if (!normActive) return false;
    const n = name.trim().toLowerCase();
    const l = toLatinProductName(name).trim().toLowerCase();
    return n === normActive || l === latinActive || n === latinActive || l === normActive;
  };

  let productNames = [...new Set(rows.map(row => row.productType?.trim()).filter(Boolean) as string[])].sort((a, b) => {
    if (isMatch(a) && !isMatch(b)) return -1;
    if (!isMatch(a) && isMatch(b)) return 1;
    return a.localeCompare(b, 'uz');
  });
  if (normActive) {
    const matchedNames = productNames.filter(isMatch);
    if (matchedNames.length > 0) {
      productNames = matchedNames;
    }
  }
  const noProductCount = normActive ? 0 : rows.filter(row => !row.productType?.trim()).length;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
      {productNames.map((name, index) => {
        const matched = isMatch(name);
        const count = rows.filter(row => row.productType?.trim() === name).length;
        return (
          <span
            key={name}
            className={`whitespace-nowrap transition-all ${
              matched
                ? 'inline-flex items-center gap-1 font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-100/90 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 rounded-md shadow-2xs'
                : normActive
                ? 'font-normal text-slate-400 dark:text-slate-500 opacity-60'
                : 'font-medium'
            }`}
          >
            {name} <b className={`tabular-nums ${matched ? 'font-black text-emerald-700 dark:text-emerald-300' : 'font-semibold text-violet-600 dark:text-violet-300'}`}>({count})</b>
            {index < productNames.length - 1 || noProductCount > 0 ? (
              <span className={`ml-1.5 ${matched ? 'text-emerald-400 dark:text-emerald-600' : 'text-slate-300 dark:text-slate-600'}`}>•</span>
            ) : null}
          </span>
        );
      })}
      {noProductCount > 0 ? (
        <span className="whitespace-nowrap font-medium text-amber-700 dark:text-amber-300">
          Mahsulotsiz <b>({noProductCount})</b>
        </span>
      ) : null}
    </div>
  );
}

function PartyWagonKindsSummary({ rows }: { rows: WagonRowLite[] }) {
  const stats = kindStatsFromRows(rows);
  const kinds = KIND_ORDER.filter(kind => stats[kind] > 0);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
      {kinds.map((kind, index) => (
        <span key={kind} className="inline-flex whitespace-nowrap items-center gap-1 font-medium">
          {WAGON_KIND_LABEL[kind]} <b className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">({stats[kind]})</b>
          {index < kinds.length - 1 || stats.unknown > 0 ? <span className="ml-1.5 text-slate-300 dark:text-slate-600">•</span> : null}
        </span>
      ))}
      {stats.unknown > 0 ? <span className="whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">Noma'lum <b>({stats.unknown})</b></span> : null}
    </div>
  );
}


/** Boshqaruv paneli bosqichlari uchun yakun / navbat yozuvlari (kalitlar DashboardPage tile key’lari). */
const ENTRY_STAGE_DONE_NOTES: Record<string, string> = {
  w1: 'Kiritish xizmat xati rasmiylashtirilgan',
  w2: 'Xizmat xati tasdiqlanib, ijro uchun yo‘naltirilgan',
  w3: 'Vagonlar qo‘riqlash tekshiruviga kiritilgan',
  'entry-permit': 'Ruxsatnoma byurosi vagonlarni kiritishni kelishgan',
  'entry-security': 'Qo‘riqlash xizmati vagonlarni tekshirib zavod hududiga kiritgan',
  'exit-security': 'Qo‘riqlash xizmati vagonlar va yuk xatini tekshirib chiqargan',
  'exit-railway': 'Temir yo‘l vagonlarni olib chiqqan',
  estakada: 'Vagonlar estakadaga olib borilgan',
};
const ENTRY_STAGE_AHEAD_NOTES: Record<string, string> = {
  w1: 'Kiritish xizmat xati hali rasmiylashtirilmagan',
  w2: 'Xizmat xati hali tasdiqlanmagan',
  w3: 'Vagonlar hali kiritilmagan',
  'entry-permit': 'Ruxsatnoma byurosi kelishuvi hali boshlanmagan',
  'entry-security': 'Qo‘riqlash tekshiruvi hali boshlanmagan',
  'exit-security': 'Chiqarish tekshiruvi hali boshlanmagan',
  'exit-railway': 'Vagonlar hali olib chiqilmagan',
};

export function EmptyWagonsPage() {
  const { user } = useAuth();
  const { can } = useRbacPermission();
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [allArrivals, setAllArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [partyViewId, setPartyViewId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('party');
    } catch {
      return null;
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [dispatchConfirmTarget, setDispatchConfirmTarget] = useState<EmptyWagonArrival | null>(null);
  const [railwayAdmitTarget, setRailwayAdmitTarget] = useState<EmptyWagonArrival | null>(null);
  const [stageUpdatingId, setStageUpdatingId] = useState<string | null>(null);
  const [handoverId, setHandoverId] = useState<string | null>(null);
  const [kengsoyExitTarget, setKengsoyExitTarget] = useState<LoadingRegistry | null>(null);
  const [railwayWork, setRailwayWork] = useState<RailwayWorkLane | null>(() => {
    try {
      const urlWork = new URLSearchParams(window.location.search).get('work');
      if (urlWork === 'toSecurity' || urlWork === 'toEstakada' || urlWork === 'defectActs' || urlWork === 'toKengsoy') {
        return urlWork;
      }
      const v = sessionStorage.getItem('empty-wagons-railway-work');
      if (v === 'toSecurity' || v === 'toEstakada' || v === 'toKengsoy') return v;
    } catch { /* ignore */ }
    return null;
  });
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [expandedArrivalId, setExpandedArrivalId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('empty-wagons-expanded-id');
    } catch {
      return null;
    }
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ignorePartyQuery = useRef(false);
  const arrivalIdFromQuery = searchParams.get('arrivalId');
  const [selectedKengsoyArrivalId, setSelectedKengsoyArrivalId] = useState<string | null>(() => arrivalIdFromQuery || null);

  useEffect(() => {
    if (arrivalIdFromQuery) {
      setSelectedKengsoyArrivalId(arrivalIdFromQuery);
    }
  }, [arrivalIdFromQuery]);

  const fromQuery = searchParams.get('from') || (location.state as any)?.from;
  const stepFromQuery = searchParams.get('step');
  const workFromQuery = searchParams.get('work');
  const menuDefectActs = workFromQuery === 'defectActs';
  const menuDefectArchive = workFromQuery === 'defectArchive';
  const menuGateCheck = workFromQuery === 'gateCheck';
  const menuEntryLetters = workFromQuery === 'entryLetters';
  const partyFromQuery = searchParams.get('party');
  const entryPermitFromQuery = searchParams.get('entryPermit');
  const defectActFromQuery = searchParams.get('defectAct');
  const viewFilter = searchParams.get('view');
  const viewOnSite = viewFilter === 'onsite';
  const viewDepartedToday = viewFilter === 'departed-today';

  const parseWorkLane = (raw?: string | null): RailwayWorkLane | null => {
    if (raw === 'toSecurity' || raw === 'toEstakada' || raw === 'defectActs' || raw === 'toKengsoy') return raw;
    return null;
  };

  const canCreate = can('empty-wagons.create') || can('empty-wagons.dispatch-approve') || user?.role === 'Dispatching' || user?.role === 'DispatchSupervisor' || user?.role === 'Railway' || user?.role === 'Admin';
  const isRailway = can('empty-wagons.transfer-estakada') || user?.role === 'Railway' || user?.role === 'Admin';
  const isAdmin = user?.role === 'Admin';
  const isSecurity = can('empty-wagons.security-inspect') || user?.role === 'Security' || user?.role === 'Admin';
  const isPermit = can('empty-wagons.permit-agree') || user?.role === 'Permit' || user?.role === 'Admin';
  const canGateAdmit = isSecurity || isPermit || isAdmin;
  const myDepartment = user?.role ? ROLE_DEPARTMENT[user.role] : undefined;

  const [listCollapsed, setListCollapsed] = useState<Record<string, boolean>>({});
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [editPartyArrival, setEditPartyArrival] = useState<EmptyWagonArrival | null>(null);
  const [securityTarget, setSecurityTarget] = useState<EmptyWagonArrival | null>(null);
  const [entryPermitTarget, setEntryPermitTarget] = useState<EmptyWagonArrival | null>(null);
  const [yukXatiPreview, setYukXatiPreview] = useState<YukXatiModel | null>(null);
  const [, setYukXatiPreviewLoading] = useState(false);
  const [permitConfirmTarget, setPermitConfirmTarget] = useState<EmptyWagonArrival | null>(null);
  const [defectActScaleOperator, setDefectActScaleOperator] = useState('');
  const [scaleOperatorsList, setScaleOperatorsList] = useState<string[]>([]);

  useEffect(() => {
    api.getScaleOperators()
      .then(res => {
        if (res.data?.length) setScaleOperatorsList(res.data);
      })
      .catch(() => {});
  }, []);

  const [defectActTarget, setDefectActTarget] = useState<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit } | null>(null);
  const [defectActType, setDefectActType] = useState<DefectActType>('sisterna_no_product');
  const [defectActIssuing, setDefectActIssuing] = useState(false);
  const [ichdxTab, setIchdxTab] = useState<IchdxHubTab>('pending');
  const hub = useDocsHubQuery();

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    const arrivalsReq = api.getEmptyWagonArrivals()
      .then(res => {
        const raw = res.data ?? [];
        setAllArrivals(raw);
        setArrivals(raw.filter(a => isRailwayEntryArrival(a)));
      })
      .catch(() => {
        setAllArrivals([]);
        setArrivals([]);
      });
    const regReq = api.getLoadingRegistries()
      .then(res => setRegistries(res.data ?? []))
      .catch(() => setRegistries([]));
    return Promise.all([arrivalsReq, regReq]).finally(() => {
      if (!silent) setLoading(false);
    });
  };

  const openDefectAct = (arrival: EmptyWagonArrival, unit: EmptyWagonUnit) => {
    setDefectActType(resolveDefectActType(unit.wagonType, unit.loadingComment, unit.defectActType as DefectActType | undefined));
    setDefectActScaleOperator(unit.sealConfirmedByScaleName || '');
    setDefectActTarget({ arrival, unit });
  };

  const closeDefectAct = () => {
    setDefectActTarget(null);
    setDefectActScaleOperator('');
    setDefectActIssuing(false);
    setSearchParams(prev => {
      if (!prev.has('defectAct')) return prev;
      const sp = new URLSearchParams(prev);
      sp.delete('defectAct');
      return sp;
    }, { replace: true });
  };

  const issueDefectAct = async (scaleOperator?: string) => {
    if (!defectActTarget) return;
    setDefectActIssuing(true);
    setError('');
    try {
      const res = await api.issueDefectAct(defectActTarget.unit.id, defectActType, scaleOperator);
      if (!res.success) throw new Error(res.message || 'Dalolatnomani tasdiqlab bo‘lmadi');
      closeDefectAct();
      notifyOrdersChanged();
      await load(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dalolatnomani tasdiqlab bo‘lmadi');
    } finally {
      setDefectActIssuing(false);
    }
  };

  const defectActDialog = defectActTarget ? (
    defectActTarget.unit.defectActType === 'SealBroken' ? (
      <SealDefectActView
        arrival={defectActTarget.arrival}
        unit={defectActTarget.unit}
        onClose={closeDefectAct}
      />
    ) : (
      <DefectActView
        model={buildDefectActModel(defectActTarget.arrival, defectActTarget.unit, {
          actType: defectActType,
          scaleOperatorName: defectActScaleOperator,
          issuerName: hasDefectAct(defectActTarget.unit) ? (defectActTarget.unit.defectActUploadedByName || defectActTarget.arrival.createdByName) : (user?.fullName || defectActTarget.unit.defectActUploadedByName || defectActTarget.arrival.createdByName),
        })}
        actType={defectActType}
        onActTypeChange={setDefectActType}
        scaleOperator={defectActScaleOperator}
        onScaleOperatorChange={setDefectActScaleOperator}
        scaleOperators={scaleOperatorsList}
        onClose={closeDefectAct}
        onIssue={!hasDefectAct(defectActTarget.unit) ? () => issueDefectAct(defectActScaleOperator) : undefined}
        issuing={defectActIssuing}
        editableType={!hasDefectAct(defectActTarget.unit)}
      />
    )
  ) : null;

  useEffect(() => {
    load();
    const unsubscribe = subscribeOrdersChanged(() => load(true));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, viewDepartedToday]);

  useEffect(() => {
    try {
      if (expandedArrivalId) sessionStorage.setItem('empty-wagons-expanded-id', expandedArrivalId);
      else sessionStorage.removeItem('empty-wagons-expanded-id');
    } catch { /* ignore */ }
  }, [expandedArrivalId]);

  useEffect(() => {
    try {
      if (railwayWork) sessionStorage.setItem('empty-wagons-railway-work', railwayWork);
      else sessionStorage.removeItem('empty-wagons-railway-work');
    } catch { /* ignore */ }
  }, [railwayWork]);

  const openPartyView = useCallback((id: string) => {
    ignorePartyQuery.current = false;
    setPartyViewId(id);
  }, []);

  const closePartyView = useCallback(() => {
    ignorePartyQuery.current = true;
    setPartyViewId(null);
    const from = searchParams.get('from') || (location.state as any)?.from;
    if (from) {
      // Boshqa sahifadan kelgan bo'lsa (dashboard, registry va h.k.) — o'sha sahifaga qayt
      navigate(from);
    } else if (isAdmin) {
      // Admin uchun agar from bo'lmasa ham to'g'ridan-to'g'ri Dashboarddagi shu partiyaga qaytish
      const partyParam = partyViewId ? `&party=${encodeURIComponent(partyViewId)}` : '';
      navigate(`/dashboard?focus=kirish${partyParam}`);
    } else {
      // Menyudan to'g'ridan to'g'ri kelgan bo'lsa — jadvalda qol
      setSearchParams(prev => {
        const sp = new URLSearchParams(prev);
        sp.delete('party');
        sp.delete('arrivalId');
        // Dashboard deep-link parametrlarini tozalash —
        // aks holda dashboardFocusId partiya ko'rinishini qayta ochadi
        sp.delete('from');
        sp.delete('stage');
        sp.delete('stageState');
        sp.delete('stageAt');
        return sp;
      }, { replace: true });
    }
  }, [searchParams, location.state, navigate, setSearchParams, isAdmin, partyViewId]);

  useEffect(() => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      const currentParty = sp.get('party');
      if (partyViewId) {
        if (currentParty === partyViewId) return prev;
        sp.set('party', partyViewId);
      } else if (currentParty) {
        sp.delete('party');
      } else {
        return prev;
      }
      return sp;
    }, { replace: true });
  }, [partyViewId, setSearchParams]);

  useEffect(() => {
    if (!partyFromQuery) {
      ignorePartyQuery.current = false;
      return;
    }
    if (ignorePartyQuery.current) return;
    if (arrivals.some(item => item.id === partyFromQuery) || allArrivals.some(item => item.id === partyFromQuery)) {
      setPartyViewId(partyFromQuery);
    }
  }, [partyFromQuery, arrivals, allArrivals]);

  useEffect(() => {
    if (!isRailway || menuEntryLetters || menuDefectArchive || menuGateCheck || !railwayWork) return;
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      if (sp.get('work') === railwayWork) return prev;
      sp.set('work', railwayWork);
      return sp;
    }, { replace: true });
  }, [isRailway, menuEntryLetters, menuDefectArchive, menuGateCheck, railwayWork, setSearchParams]);

  useEffect(() => {
    if (!isRailway || menuEntryLetters || menuDefectArchive || menuGateCheck) return;
    const lane = parseWorkLane(workFromQuery);
    if (lane) {
      setRailwayWork(prev => (prev === lane ? prev : lane));
      return;
    }
    setRailwayWork(prev => (prev === 'defectActs' ? 'toSecurity' : prev));
  }, [isRailway, menuEntryLetters, menuDefectArchive, menuGateCheck, workFromQuery]);

  const visibleArrivals = useMemo(() => {
    if (canCreate || isRailway) return arrivals;
    if (myDepartment) {
      return arrivals.filter(item =>
        parseNotified(item).includes(myDepartment)
        || Boolean(item.entryPermitShiftApprovedAt)
      );
    }
    return arrivals;
  }, [arrivals, canCreate, isRailway, myDepartment]);

  const viewFilteredArrivals = useMemo(() => {
    if (viewOnSite) {
      return visibleArrivals.filter(a => isDashboardOnSiteStage(getStage(a)));
    }
    if (viewDepartedToday) {
      const todayIds = new Set(
        registries
          .filter(r => isTodayInTashkent(r.exitedToKengsoyAt))
          .filter(r => !(r.registryNumber || '').includes('-1C-'))
          .map(r => r.emptyWagonArrivalId),
      );
      return visibleArrivals.filter(a => todayIds.has(a.id) && !isOneCArrival(a));
    }
    return visibleArrivals;
  }, [visibleArrivals, viewOnSite, viewDepartedToday, registries]);

  const pendingRailwayIntakes = useMemo(
    () => arrivals.filter(a => getStage(a) === STAGES.RailwayInspected),
    [arrivals],
  );

  useEffect(() => {
    if (!canCreate) return;
    if (pendingRailwayIntakes.length > 0) setIchdxTab('pending');
  }, [canCreate, pendingRailwayIntakes.length]);

  const processArrivals = useMemo(
    () => (isRailway
      ? viewFilteredArrivals.filter(a => getStage(a) !== 'Exited')
      : viewFilteredArrivals.filter(a => getStage(a) !== STAGES.RailwayInspected)),
    [viewFilteredArrivals, isRailway],
  );

  /** Qo‘riqlash xizmati va Ruxsatnoma byurosi kelishgan, hali Kengsoygacha olib chiqilmagan barcha yuk xatlari. */
  const allKengsoyReady = useMemo(
    () => registries.filter(r => {
      if (r.exitedToKengsoyAt || isRegistryReturned(r)) return false;
      const arr = arrivals.find(a => a.id.toLowerCase() === (r.emptyWagonArrivalId || '').toLowerCase());
      if (arr && getStage(arr) === 'Exited') return false;
      return (r.isApprovedBySecurity && r.isApprovedByPermit);
    }),
    [registries, arrivals],
  );

  const isRegistryOfArrival = useCallback((r: LoadingRegistry, targetIdOrNum: string | null) => {
    if (!targetIdOrNum) return true;
    const target = targetIdOrNum.toLowerCase().trim();
    const regArrId = (r.emptyWagonArrivalId ?? '').toLowerCase().trim();
    const regArrNum = (r.arrivalNumber ?? '').toLowerCase().trim();
    if (regArrId === target || regArrNum === target) return true;
    if ((r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase().trim() === target || (w.sourceArrivalNumber ?? '').toLowerCase().trim() === target)) {
      return true;
    }
    const matchArrival = arrivals.find(a => a.id.toLowerCase() === target || a.arrivalNumber.toLowerCase() === target);
    if (matchArrival) {
      const matchId = matchArrival.id.toLowerCase();
      const matchNum = matchArrival.arrivalNumber.toLowerCase();
      if (regArrId === matchId || regArrNum === matchNum) return true;
      if ((r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase().trim() === matchId || (w.sourceArrivalNumber ?? '').toLowerCase().trim() === matchNum)) {
        return true;
      }
    }
    return false;
  }, [arrivals]);

  const availableKengsoyArrivals = useMemo(() => {
    const map = new Map<string, { arrival: EmptyWagonArrival; regCount: number; wagonCount: number }>();
    for (const r of allKengsoyReady) {
      const arr = arrivals.find(a =>
        a.id.toLowerCase() === (r.emptyWagonArrivalId ?? '').toLowerCase()
        || (r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase() === a.id.toLowerCase())
      );
      if (arr) {
        const prev = map.get(arr.id) || { arrival: arr, regCount: 0, wagonCount: 0 };
        prev.regCount += 1;
        prev.wagonCount += (r.wagonCount || r.orderDeductedWagons || 0);
        map.set(arr.id, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.arrival.createdAt || '';
      const dateB = b.arrival.createdAt || '';
      return dateB.localeCompare(dateA);
    });
  }, [allKengsoyReady, arrivals]);

  const kengsoyReady = useMemo(() => {
    if (!selectedKengsoyArrivalId) return allKengsoyReady;
    return allKengsoyReady.filter(r => isRegistryOfArrival(r, selectedKengsoyArrivalId));
  }, [allKengsoyReady, selectedKengsoyArrivalId, isRegistryOfArrival]);

  const defectActArrivals = useMemo(
    () => arrivals.filter(a =>
      pendingDefectActCount(a) > 0
      && getStage(a) !== 'Exited'
      && getStage(a) !== 'Cancelled'),
    [arrivals],
  );

  const defectActWagons = useMemo(() => {
    const rows: Array<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit }> = [];
    const seen = new Set<string>();
    const sourceArrivals = allArrivals.length > 0 ? allArrivals : arrivals;
    for (const arrival of sourceArrivals) {
      if (getStage(arrival) === 'Cancelled') continue;
      for (const unit of arrival.wagons ?? []) {
        if (!hasDefectAct(unit) || seen.has(unit.id)) continue;
        seen.add(unit.id);
        rows.push({ arrival, unit });
      }
    }
    return rows;
  }, [allArrivals, arrivals]);

  const pendingDefectWagons = useMemo(() => {
    const rows: Array<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit }> = [];
    const seen = new Set<string>();
    for (const arrival of arrivals) {
      if (getStage(arrival) === 'Exited' || getStage(arrival) === 'Cancelled') continue;
      for (const unit of arrival.wagons ?? []) {
        if (!needsRailwayDefectAct(unit) || seen.has(unit.id)) continue;
        seen.add(unit.id);
        rows.push({ arrival, unit });
      }
    }
    return rows;
  }, [arrivals]);

  const countOfArrival = useCallback((a: EmptyWagonArrival) => {
    if (a.wagons && a.wagons.length > 0 && a.stage !== 'Exited') {
      const active = a.wagons.filter(u => !u.scaleExitedAt && u.status !== 'Exited' && u.status !== 'Departed').length;
      if (active > 0) return active;
    }
    return a.wagonCount || 0;
  }, []);

  const workCounts = useMemo(() => ({
    toSecurity: processArrivals
      .filter(a => getStage(a) === STAGES.RailwayInspected
        || getStage(a) === STAGES.KengsoyInspection
        || getStage(a) === STAGES.SecurityInspection)
      .reduce((s, a) => s + countOfArrival(a), 0),
    // Ro‘yxat bilan bir xil: tayyor + estakadada / yuklanayotgan — aks holda
    // Estakadaga olib borgach tab yana «Hali ochilmagan» bo‘lib qolardi.
    toEstakada: processArrivals
      .filter(a => isEstakadaLaneStage(getStage(a)))
      .reduce((s, a) => s + countOfArrival(a), 0),
    defectActs: pendingDefectWagons.length,
    toKengsoy: allKengsoyReady.reduce((s, r) => s + (r.wagonCount || 0), 0),
  }), [processArrivals, allKengsoyReady, pendingDefectWagons.length, countOfArrival]);

  /**
   * Vagonlarni kiritish — mustaqil doimiy yo‘nalish. Oldingi partiyaning tara,
   * yuklash yoki chiqish jarayoni yangi kirish panelini yopmasligi kerak.
   * Qolgan yo‘nalishlar ularda amaldagi vagon paydo bo‘lganda ochiladi.
   */
  const isWorkLaneOpen = (_id: RailwayWorkLane) => {
    return true;
  };

  const pickOpenRailwayWork = (): RailwayWorkLane => {
    if (workCounts.toSecurity > 0) return 'toSecurity';
    if (workCounts.toEstakada > 0) return 'toEstakada';
    if (workCounts.toKengsoy > 0) return 'toKengsoy';
    return 'toSecurity';
  };

  useEffect(() => {
    if (!isRailway || menuEntryLetters || menuDefectArchive || loading) return;
    if (railwayWork == null) {
      setRailwayWork(pickOpenRailwayWork());
      return;
    }
    if (!isWorkLaneOpen(railwayWork)) {
      setRailwayWork(pickOpenRailwayWork());
    }
  }, [isRailway, menuEntryLetters, menuDefectArchive, railwayWork, loading, workCounts]);

  const tableArrivals = useMemo(() => {
    if (!isRailway || railwayWork == null) return processArrivals;
    if (railwayWork === 'toSecurity') {
      return processArrivals.filter(a =>
        getStage(a) === STAGES.KengsoyInspection
        || getStage(a) === STAGES.SecurityInspection
        || getStage(a) === STAGES.RailwayInspected);
    }
    if (railwayWork === 'toEstakada') {
      return processArrivals.filter(a => isEstakadaLaneStage(getStage(a)));
    }
    if (railwayWork === 'defectActs') return defectActArrivals;
    return []; // toKengsoy — alohida reyestr ro‘yxati
  }, [isRailway, railwayWork, processArrivals, defectActArrivals]);

  const toggleListSection = (key: string) => {
    setListCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDispatchToExecution = async (item: EmptyWagonArrival) => {
    const units = unitsFromArrival(item);
    const nums = units.map(u => u.wagonNumber.trim()).filter(Boolean);
    if (nums.length === 0) {
      setError('Vagon ma’lumoti topilmadi — sahifani yangilang');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.createEmptyWagonArrival({
        wagonCount: nums.length,
        wagonNumbers: nums.join(', '),
        cisternNumbers: units.map(u => u.cisternNumber || '').join(', '),
        productType: '',
        notifiedDepartments: [...DEPT_NAMES],
        sourceArrivalId: item.id,
      });

      if (res.success) {
        setDispatchConfirmTarget(null);
        markStageCompleted('w2');
        if (res.data?.id) setExpandedArrivalId(res.data.id);
        const unitProducts = Array.from(new Set(units.map(u => u.productType?.trim()).filter(Boolean)));
        const derivedProduct = unitProducts.length === 1
          ? unitProducts[0]
          : (unitProducts.length > 1 ? unitProducts.join(', ') : item.productType);
        notifyWagonAdded({
          wagonNumbers: nums,
          count: nums.length,
          partyNumber: item.arrivalNumber,
          productType: derivedProduct,
          trackNumber: item.trackNumber,
        });
        notifyOrdersChanged();
        load(true);
      } else {
        setError(res.message || 'Saqlashda xatolik');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRailwayStep = async (item: EmptyWagonArrival, nextStage: string) => {
    setStageUpdatingId(item.id);
    try {
      await api.updateEmptyWagonStage(item.id, nextStage);
      setExpandedArrivalId(item.id);
      if (nextStage === STAGES.SecurityInspection) markStageCompleted('w3');
      else if (nextStage === STAGES.EstakadaPlaced) markStageCompleted('estakada');
      notifyOrdersChanged();
      load(true);
    } catch {
      // ignore
    } finally {
      setStageUpdatingId(null);
    }
  };

  const handleKengsoyExit = async (registry: LoadingRegistry) => {
    setHandoverId(registry.id);
    setError('');
    try {
      const res = await api.exitToKengsoy(registry.id);
      if (!res.success) throw new Error(res.message || 'Xatolik');
      const regProducts = Array.from(new Set((registry.wagonRoutes ?? []).map(r => r.productType?.trim()).filter(Boolean)));
      const derivedExitProduct = regProducts.length === 1 ? regProducts[0] : (regProducts.length > 1 ? regProducts.join(', ') : registry.productType);
      notifyWagonsExited({
        registryNumber: registry.registryNumber,
        wagonNumbers: (registry.wagonRoutes ?? []).map(r => r.wagonNumber).filter(Boolean),
        count: registry.wagonCount || 1,
        destination: "Kengsoy stansiyasi (O'TY)",
        totalWeight: registry.orderDeductedNetWeight,
        productType: derivedExitProduct,
      });
      setKengsoyExitTarget(null);
      setViewedKengsoyRegistryId(null);
      setPartyViewId(null);
      notifyOrdersChanged();
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vagonlarni olib chiqishda xatolik');
    } finally {
      setHandoverId(null);
    }
  };

  const handleSecurityAdmit = async (item: EmptyWagonArrival) => {
    setSecurityTarget(item);
  };

  const handleEntryPermitApprove = async (item: EmptyWagonArrival) => {
    setStageUpdatingId(item.id);
    setError('');
    try {
      const res = await api.approveEntryPermit(item.id);
      if (!res.success) throw new Error(res.message || 'Kelishishda xatolik');
      setPermitConfirmTarget(null);
      markStageCompleted('entry-permit');
      setExpandedArrivalId(item.id);
      if (res.data) {
        setArrivals(current => current.map(arrival => arrival.id === res.data.id ? res.data : arrival));
      }
      notifyOrdersChanged();
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kelishishda xatolik');
    } finally {
      setStageUpdatingId(null);
    }
  };

  const isSecurityReturned = (item: EmptyWagonArrival) =>
    getStage(item) === STAGES.KengsoyInspection && !!latestIntakeReturnNote(item.notes);

  const openPartyEdit = (item: EmptyWagonArrival) => {
    const units = item.wagons ?? [];
    if (units.length === 0) {
      setError('Vagon ma’lumoti topilmadi — sahifani yangilang');
      return;
    }
    setExpandedArrivalId(item.id);
    setEditPartyArrival(item);
  };

  const canEditIntakeParty = (item: EmptyWagonArrival) => {
    if (user?.role === 'Admin') return true;
    const stage = getStage(item);
    const canStage = stage === STAGES.RailwayInspected || stage === STAGES.KengsoyInspection;
    return canStage && can('empty-wagons.update');
  };

  /** Partiyani o‘chirish — RBAC huquqi yoki Admin. */
  const canDeleteIntakeParty = (item?: EmptyWagonArrival) => {
    if (user?.role === 'Admin') return true;
    if (!item) return can('empty-wagons.delete');
    const stage = getStage(item);
    const canStage = stage === STAGES.RailwayInspected || stage === STAGES.KengsoyInspection;
    return canStage && can('empty-wagons.delete');
  };

  const partyIntakeMenuItems = (item: EmptyWagonArrival) => {
    const items = [];
    if (canEditIntakeParty(item)) {
      items.push({
        key: `edit-${item.id}`,
        label: 'Tahrirlash',
        icon: Pencil,
        onClick: () => openPartyEdit(item),
      });
    }
    if (canDeleteIntakeParty(item)) {
      items.push({
        key: `delete-party-${item.id}`,
        label: "O'chirish",
        icon: Trash2,
        variant: 'danger' as const,
        onClick: () => {
          setError('');
          setDeleteId(item.id);
        },
      });
    }
    return items;
  };

  const railwayDisplayStatus = (item: EmptyWagonArrival) => {
    const pendingActs = pendingDefectActCount(item);
    if (railwayWork === 'defectActs' && pendingActs > 0) {
      return `Dalolatnoma kerak · ${pendingActs} ta`;
    }
    const stage = getStage(item);
    if (stage === STAGES.KengsoyInspection && latestIntakeReturnNote(item.notes)) {
      return 'Qayta ko‘rib chiqish';
    }
    const intakeStatus = getIntakePartyStatus(item, { railwayView: true });
    if (intakeStatus) return intakeStatus;
    if (isReadyForEstakada(stage)) {
      const units = item.wagons ?? [];
      const needsTare = units.length > 0
        ? units.some(u => u.status === 'AwaitingTare' && !u.tareWeighedAt && !String(u.tareWeight ?? '').trim())
        : !String(item.tareWeight ?? '').trim();
      return needsTare ? 'Tara tekshiruvi kutilmoqda' : 'Estakadaga olib borish';
    }
    if (stage === STAGES.EstakadaPlaced || stage === 'Loading') return 'Yuklashga tayyor';
    return STAGE_LABEL[stage] ?? stage;
  };

  const showRailwayAction = (item: EmptyWagonArrival) => {
    const stage = getStage(item);
    if (stage === STAGES.KengsoyInspection) return true;
    if (!isReadyForEstakada(stage)) return false;
    const units = item.wagons ?? [];
    return units.length > 0
      ? units.every(u => u.status === 'Returned' || u.status !== 'AwaitingTare' || Boolean(u.tareWeighedAt) || Boolean(String(u.tareWeight ?? '').trim()))
      : Boolean(String(item.tareWeight ?? '').trim());
  };

  const partyDisplayStatus = (item: EmptyWagonArrival) => {
    if (isRailway) return railwayDisplayStatus(item);
    const intakeStatus = getIntakePartyStatus(item);
    if (intakeStatus) return intakeStatus;
    const stage = getStage(item);
    return STAGE_LABEL[stage] ?? stage;
  };

  const exportKiritishExcel = (itemsToExport: EmptyWagonArrival[]) => {
    const filterVal = hub.product?.trim().toLowerCase();
    const filterLatin = hub.product ? toLatinProductName(hub.product).trim().toLowerCase() : '';
    const matchProd = (p?: string | null) => {
      if (!filterVal) return true;
      if (!p) return false;
      const norm = p.trim().toLowerCase();
      const lat = toLatinProductName(p).trim().toLowerCase();
      return norm === filterVal || lat === filterLatin || norm === filterLatin || lat === filterVal;
    };

    const rows: SheetCell[][] = [
      [
        '№',
        'Xizmat xati №',
        'Partiya №',
        'Sana / vaqt',
        'Vagon soni',
        'Mahsulot turi',
        'Vagon turi',
        'Bosqich / Holat',
        'Vagon №',
        'Sisterna / Konteyner №',
        'Mulkdorlik',
        'Yuklanganlik holati',
        'Yo‘l №',
        'Tuzuvchi',
        'Izoh',
      ],
    ];

    let rowIdx = 1;
    for (const arrival of itemsToExport) {
      const allRows = rowsFromArrival(arrival);
      // Filtr tanlangan bo'lsa, Excelga faqat o'sha mahsulotning vagonlari chiqadi!
      const rowsList = filterVal
        ? allRows.filter(u => matchProd(u.productType || arrival.productType))
        : allRows;

      if (filterVal && rowsList.length === 0 && !matchProd(arrival.productType)) {
        continue;
      }

      const docNo = arrival.entryPermitNumber || arrival.arrivalNumber || '—';
      const partyNo = arrival.arrivalNumber || '—';
      const dateStr = formatDateTimeDisplay(
        arrival.entryPermitShiftApprovedAt ||
        arrival.entryPermitPermitApprovedAt ||
        arrival.arrivalDate ||
        arrival.createdAt
      );
      const stageStr = partyDisplayStatus(arrival);
      const trackNo = arrival.trackNumber || '—';
      const createdBy = arrival.createdByName || '—';
      const notes = arrival.notes || '—';
      const countToDisplay = rowsList.length > 0 ? rowsList.length : arrival.wagonCount;

      if (rowsList.length === 0) {
        rows.push([
          rowIdx++,
          docNo,
          partyNo,
          dateStr,
          countToDisplay,
          arrival.productType || '—',
          '—',
          stageStr,
          arrival.wagonNumbers || '—',
          arrival.cisternNumbers || '—',
          '—',
          '—',
          trackNo,
          createdBy,
          notes,
        ]);
      } else {
        for (const u of rowsList) {
          rows.push([
            rowIdx++,
            docNo,
            partyNo,
            dateStr,
            countToDisplay,
            u.productType || arrival.productType || '—',
            u.wagonType || '—',
            stageStr,
            u.wagonNumber || '—',
            u.cisternNumber || '—',
            wagonOwnershipLabel(u.ownership),
            intakeLoadStateLabel(u.intakeLoadState),
            trackNo,
            createdBy,
            notes,
          ]);
        }
      }
    }

    exportSheet(
      `Kirish_xizmat_xatlari_${todayStamp()}`,
      'Kirish xizmat xatlari',
      rows
    );
  };

  const exportDefectActsExcel = (itemsToExport: Array<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit }>) => {
    const rows: SheetCell[][] = [
      [
        '№',
        'Vagon №',
        'Partiya №',
        'Dalolatnoma №',
        'Sana / vaqt',
        'Vagon turi',
        'Mahsulot',
        'Nomuvofiqlik sababi',
        'Sisterna / Konteyner №',
        'Mulkdorlik',
        'Holat',
      ],
    ];

    let rowIdx = 1;
    for (const item of itemsToExport) {
      const u = item.unit;
      const a = item.arrival;
      const dateStr = formatDateTimeDisplay(u.defectActUploadedAt || a.createdAt);
      const kind = isWagonKind(u.wagonType) ? WAGON_KIND_LABEL[u.wagonType] : (u.wagonType || '—');
      const productLabel = toLatinProductName(u.productType?.trim() || a.productType?.trim()) || u.productType?.trim() || a.productType?.trim() || '—';
      const comment = u.loadingComment?.trim() || 'Nomuvofiqlik aniqlangan';
      const actNo = u.defectActNumber?.trim() || '—';

      rows.push([
        rowIdx++,
        u.wagonNumber || '—',
        a.arrivalNumber || '—',
        actNo,
        dateStr,
        kind,
        productLabel,
        comment,
        u.cisternNumber || '—',
        wagonOwnershipLabel(u.ownership),
        u.defectActFileName ? 'Dalolatnoma yuklangan' : 'Nomuvofiq',
      ]);
    }

    exportSheet(
      `Dalolatnomalar_${todayStamp()}`,
      'Dalolatnomalar',
      rows
    );
  };


  const partyWagonCountDisplay = (item: EmptyWagonArrival, rows: WagonRowLite[]) => {
    if (!hub.product) return `${item.wagonCount} ta`;
    const filterVal = hub.product.trim().toLowerCase();
    const filterLatin = toLatinProductName(hub.product).trim().toLowerCase();
    const matchProd = (p?: string | null) => {
      if (!p) return false;
      const norm = p.trim().toLowerCase();
      const lat = toLatinProductName(p).trim().toLowerCase();
      return norm === filterVal || lat === filterLatin || norm === filterLatin || lat === filterVal;
    };
    const matched = rows.filter(r => matchProd(r.productType)).length;
    if (matched === item.wagonCount || matched === 0) return `${item.wagonCount} ta`;
    return `${matched} ta (${item.wagonCount} dan)`;
  };

  const partyStatusClass = (item: EmptyWagonArrival, label: string) => {
    const stage = getStage(item);
    const normalized = label.toLocaleLowerCase('uz-UZ');
    if ((stage === STAGES.KengsoyInspection && latestIntakeReturnNote(item.notes))
      || normalized.includes('qaytar') || normalized.includes('nomuvofiq')
      || normalized.includes('xato') || stage === 'Cancelled') {
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
    }
    if (normalized.includes('ruxsat berildi') || normalized.includes('tasdiqlandi')
      || normalized.includes('yakun') || normalized.includes('tayyor')
      || normalized.includes('qabul qilindi') || normalized.includes('chiqarildi')
      || stage === 'Loaded' || stage === 'Exited') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    }
    if (stage === 'RegistryPrepared' || stage === 'DocumentsIssued' || normalized.includes('1c') || normalized.includes('nakl')) {
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
    }
    if (normalized.includes('kutil') || normalized.includes('kelishuv')
      || normalized.includes('tekshiruv') || normalized.includes('dalolatnoma kerak')) {
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    }
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
  };

  const renderPartyDocument = (item: EmptyWagonArrival) => (
    hasEntryPermitQr(item) ? (
      <DocumentChipButton
        title={item.entryPermitNumber || 'Kiritish xizmat xatini ko‘rish'}
        onClick={() => setEntryPermitTarget(item)}
      />
    ) : (
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">—</span>
    )
  );

  const openYukXatiPreview = (registry: LoadingRegistry) => {
    setYukXatiPreviewLoading(true);
    try {
      const arrival = arrivals.find(a => a.id.toLowerCase() === (registry.emptyWagonArrivalId || '').toLowerCase()) ?? null;
      const extraUnits = arrivals.flatMap(item => (item.wagons ?? []).map(u => ({
        ...u,
        emptyWagonArrivalId: item.id,
      })));
      setYukXatiPreview(buildYukXatiModel(registry, arrival, null, null, extraUnits));
    } catch (e) {
      console.error(e);
      const extraUnits = arrivals.flatMap(item => (item.wagons ?? []).map(u => ({
        ...u,
        emptyWagonArrivalId: item.id,
      })));
      setYukXatiPreview(buildYukXatiModel(registry, null, null, null, extraUnits));
    } finally {
      setYukXatiPreviewLoading(false);
    }
  };

  const renderRegistryDocument = (registry: LoadingRegistry) => (
    <DocumentChipButton
      title={registry.registryNumber || 'Yuk xatini ko‘rish'}
      onClick={() => openYukXatiPreview(registry)}
    />
  );

  const renderYukXatiPreviewModal = () => (
    yukXatiPreview ? (
      <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Yuk xati">
        <div className="yx-preview-bar">
          <div>
            <div className="yx-preview-bar__title">Yuk xati — {yukXatiPreview.registryNumber}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {yukXatiPreview.etId}
              {yukXatiPreview.cargoName ? ` · ${yukXatiPreview.cargoName}` : ''}
              {yukXatiPreview.wagonCount ? ` · ${yukXatiPreview.wagonCount} vagon` : ''}
            </div>
          </div>
          <div className="yx-preview-bar__actions">
            <DocumentPrintButton
              ready={isYukXatiPrintReady(yukXatiPreview)}
              onPrint={() => printYukXati(yukXatiPreview.registryId)}
            />
            <button
              type="button"
              className="table-row-ctrl table-row-ctrl--secondary !bg-slate-800 !text-slate-100 !border-slate-600"
              onClick={() => setYukXatiPreview(null)}
              aria-label="Yopish"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div
          className="yx-preview-scroll"
          onClick={e => {
            if ((e.target as HTMLElement).closest('.yuk-xati')) return;
            setYukXatiPreview(null);
          }}
        >
          <YukXatiView model={yukXatiPreview} />
        </div>
      </div>
    ) : null
  );

  const renderRowManagementActions = (item: EmptyWagonArrival) => {
    const canApprove = canCreate && getStage(item) === STAGES.RailwayInspected;
    const canReview = canApprove || canEditIntakeParty(item);
    if (!canReview) return null;
    return (
      <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          onClick={e => {
            e.stopPropagation();
            openPartyView(item.id);
          }}
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          Ko‘rib chiqish
        </button>
      </div>
    );
  };

  const renderPartyActions = (
    item: EmptyWagonArrival,
    detailView = false,
    gateCheckPanel = false,
    suppressPrimary = false,
  ) => {
    const intakeItems = partyIntakeMenuItems(item);
    const gateReview = gateCheckPanel && needsGateInspection(item);
    const securityReview = gateReview || getStage(item) === STAGES.SecurityInspection;
    const showPrimary = !suppressPrimary && !detailView;
    return (
    <div className="flex items-center gap-1.5 shrink-0">
      {showPrimary && canDispatchParty(item) ? (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={submitting}
          onClick={e => {
            e.stopPropagation();
            setError('');
            setDispatchConfirmTarget(item);
          }}
        >
          <Send className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          Tasdiqlash va ijroga jo‘natish
        </button>
      ) : null}
      {isRailway
        && showRailwayAction(item)
        && !(detailView && getStage(item) === STAGES.KengsoyInspection)
        ? renderRailwayActions(item)
        : null}
      {intakeItems.length > 0 ? (
        <OrderSheetMenu items={intakeItems} />
      ) : null}
      {showPrimary && (isPermit || isAdmin) && securityReview && !item.entryPermitPermitApprovedAt ? (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={stageUpdatingId === item.id}
          onClick={e => { e.stopPropagation(); setPermitConfirmTarget(item); }}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {gateCheckPanel ? 'Ijro uchun qabul qilish' : 'Ijroga uchun qabul qilindi'}
        </button>
      ) : showPrimary && isSecurity && securityReview && !item.entryPermitPermitApprovedAt ? (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
          Ruxsatnoma byurosi kelishishi kutilmoqda
        </span>
      ) : showPrimary && (isSecurity || isAdmin) && securityReview && !item.entryPermitSecurityApprovedAt ? (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
          disabled={stageUpdatingId === item.id}
          onClick={e => {
            e.stopPropagation();
            void handleSecurityAdmit(item);
          }}
        >
          <Shield className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {gateCheckPanel ? 'Qabul qilish' : (
            <span className="text-left leading-tight">
              Vagonlarni tekshirib
              <br />
              kiritish
            </span>
          )}
        </button>
      ) : !detailView && canGateAdmit && getStage(item) === STAGES.KengsoyInspection && !gateCheckPanel ? (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">Vagonlarni kiritish kutilmoqda</span>
      ) : !detailView && canGateAdmit && ['ReadyForEstakada', 'TareWeighing', 'EstakadaPlaced', 'Loading', 'Loaded'].includes(getStage(item)) ? (
        <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">Kiritilgan</span>
      ) : null}
      {!detailView ? renderRowManagementActions(item) : null}
    </div>
    );
  };

  const renderRailwayActions = (item: EmptyWagonArrival) => {
    const stage = getStage(item);
    const busy = stageUpdatingId === item.id;

    if (stage === STAGES.RailwayInspected) {
      return (
        <div className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-sm font-semibold text-sky-700 whitespace-nowrap dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
            Ro'yxatga olindi
          </span>
        </div>
      );
    }
    if (stage === STAGES.KengsoyInspection) {
      const issue = latestIntakeReturnNote(item.notes);
      return (
        <div className="inline-flex items-center gap-1.5">
          {issue ? (
            <span
              className="inline-flex items-center gap-2 rounded-lg border border-rose-600 bg-rose-600 px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-white shadow-sm dark:border-rose-500 dark:bg-rose-600"
              title={issue}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              Qaytarilgan
            </span>
          ) : null}
          <button
            type="button"
            className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
            disabled={busy}
            onClick={e => {
              e.stopPropagation();
              setRailwayAdmitTarget(item);
            }}
          >
            <TrainFront className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            {busy ? '...' : issue ? 'Qayta yuborish' : 'Vagonlarni kiritish'}
          </button>
        </div>
      );
    }
    if (stage === STAGES.SecurityInspection) {
      const label = getIntakePartyStatus(item, { railwayView: true }) || 'Tasdiqlash jarayonida';
      return <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{label}</span>;
    }
    if (isReadyForEstakada(stage)) {
      const units = item.wagons ?? [];
      const needsTare = units.length > 0
        ? units.some(u => u.status === 'AwaitingTare' && !u.tareWeighedAt && !String(u.tareWeight ?? '').trim())
        : !String(item.tareWeight ?? '').trim();
      if (needsTare) {
        return <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Tara tekshiruvi kutilyapti</span>;
      }
      return (
        <button
          type="button"
          className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap !bg-emerald-600 hover:!bg-emerald-700"
          disabled={busy}
          onClick={e => {
            e.stopPropagation();
            void handleRailwayStep(item, STAGES.EstakadaPlaced);
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {busy ? '...' : 'Estakadaga olib borish'}
        </button>
      );
    }
    if (stage === STAGES.EstakadaPlaced || stage === 'Loading') {
      return <span className="text-sm font-semibold text-emerald-600">Yuklashga tayyor</span>;
    }
    return null;
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    setError('');
    try {
      const response = await api.deleteEmptyWagonArrival(deleteId);
      if (!response.success) {
        throw new Error(response.message || "Partiyani o'chirishda xatolik yuz berdi");
      }
      setDeleteId(null);
      notifyOrdersChanged();
      await load(true);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Partiyani o'chirishda xatolik yuz berdi");
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    if (!entryPermitFromQuery || arrivals.length === 0) return;
    const target = arrivals.find(a => a.id.toLowerCase() === entryPermitFromQuery.toLowerCase());
    if (!target) return;
    setEntryPermitTarget(target);
  }, [entryPermitFromQuery, arrivals]);

  useEffect(() => {
    if (!defectActFromQuery || arrivals.length === 0) return;
    for (const arrival of arrivals) {
      const unit = (arrival.wagons ?? []).find(u => u.id.toLowerCase() === defectActFromQuery.toLowerCase());
      if (unit) {
        openDefectAct(arrival, unit);
        if (isRailway) setRailwayWork('defectActs');
        break;
      }
    }
  }, [defectActFromQuery, arrivals]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeEntryPermit = () => {
    setEntryPermitTarget(null);
    setSearchParams(prev => {
      if (!prev.has('entryPermit')) return prev;
      const sp = new URLSearchParams(prev);
      sp.delete('entryPermit');
      return sp;
    }, { replace: true });
  };

  useEffect(() => {
    if (!arrivalIdFromQuery && !stepFromQuery && !workFromQuery) return;

    const clearDeepLink = () => {
      setSearchParams(prev => {
        if (!prev.has('arrivalId') && !prev.has('step')) return prev;
        const sp = new URLSearchParams(prev);
        sp.delete('arrivalId');
        sp.delete('step');
        return sp;
      }, { replace: true });
    };

    /** Zanjir bosqichi / work= → Temir yo‘l ish yo‘nalishi. */
    const laneFromQuery = (): RailwayWorkLane | null => {
      const fromWork = parseWorkLane(workFromQuery);
      if (fromWork) return fromWork;
      if (stepFromQuery === '1' || stepFromQuery === '3' || stepFromQuery === 'w1' || stepFromQuery === 'w3') return 'toSecurity';
      if (stepFromQuery === '2' || stepFromQuery === '5' || stepFromQuery === 'w2' || stepFromQuery === 'w5') return 'toEstakada';
      if (stepFromQuery === '11' || stepFromQuery === '12' || stepFromQuery === 'w11' || stepFromQuery === 'w12') return 'toKengsoy';
      return null;
    };

    if (arrivalIdFromQuery) {
      const target = arrivals.find(a => a.id === arrivalIdFromQuery);
      if (!target) return;
      if (menuGateCheck || workFromQuery === 'gateCheck') {
        setRailwayWork(null);
        setExpandedArrivalId(arrivalIdFromQuery);
        if (!ignorePartyQuery.current) {
          openPartyView(arrivalIdFromQuery);
        }
        clearDeepLink();
        return;
      }
      if (isRailway) {
        const fromQuery = laneFromQuery();
        const stage = getStage(target);
        const byStage: RailwayWorkLane =
          pendingDefectActCount(target) > 0
            ? 'defectActs'
            : stage === STAGES.KengsoyInspection || stage === STAGES.SecurityInspection || stage === STAGES.RailwayInspected
              ? 'toSecurity'
              : isEstakadaLaneStage(stage)
                ? 'toEstakada'
                : 'toKengsoy';
        setRailwayWork(fromQuery ?? byStage);
        setExpandedArrivalId(arrivalIdFromQuery);
        if (!ignorePartyQuery.current && (pendingDefectActCount(target) > 0 || fromQuery === 'defectActs')) {
          openPartyView(arrivalIdFromQuery);
        }
      } else {
        setExpandedArrivalId(arrivalIdFromQuery);
      }
      clearDeepLink();
      return;
    }

    if (isRailway && !menuGateCheck) {
      const lane = laneFromQuery();
      if (lane) setRailwayWork(lane);
      clearDeepLink();
    }
  }, [
    arrivalIdFromQuery,
    arrivals,
    isRailway,
    setSearchParams,
    stepFromQuery,
    workFromQuery,
  ]);

  const selectRailwayWork = (id: RailwayWorkLane) => {
    setRailwayWork(id);
    hub.setPage(1);
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      sp.set('work', id);
      sp.delete('arrivalId');
      sp.delete('step');
      return sp;
    }, { replace: true });
  };

  const totalWagons = useMemo(() => {
    if (isRailway && railwayWork === 'toKengsoy') {
      return kengsoyReady.reduce((s, r) => s + (r.wagonCount || 0), 0);
    }
    if (isRailway && railwayWork === 'defectActs') {
      return pendingDefectWagons.length;
    }
    return tableArrivals.reduce((sum, item) => sum + countOfArrival(item), 0);
  }, [isRailway, railwayWork, kengsoyReady, pendingDefectWagons.length, tableArrivals, countOfArrival]);

  const recipientList = useMemo(() => {
    if (menuGateCheck) return processArrivals.filter(needsGateInspection);
    if (isPermit || isSecurity) return processArrivals.filter(isGateInspectionDone);
    return processArrivals;
  }, [processArrivals, menuGateCheck, isPermit, isSecurity]);

  const matchParty = useCallback((item: EmptyWagonArrival) => {
    const primaryDate = item.entryPermitShiftApprovedAt || item.entryPermitPermitApprovedAt || item.entryPermitSecurityApprovedAt || item.arrivalDate || item.createdAt;
    const dates = [
      primaryDate,
      item.arrivalDate,
      item.createdAt,
      item.entryPermitShiftApprovedAt,
      item.entryPermitPermitApprovedAt,
    ].filter(Boolean) as string[];
    if (!docsDateInRange(primaryDate, hub.from, hub.to) && !dates.some(d => docsDateInRange(d, hub.from, hub.to))) {
      return false;
    }

    if (hub.product) {
      const filterVal = hub.product.trim().toLowerCase();
      const filterLatin = toLatinProductName(hub.product).trim().toLowerCase();
      const matchProd = (p?: string | null) => {
        if (!p) return false;
        const norm = p.trim().toLowerCase();
        const lat = toLatinProductName(p).trim().toLowerCase();
        return norm === filterVal || lat === filterLatin || norm === filterLatin || lat === filterVal;
      };
      const itemMatch = matchProd(item.productType);
      const wagonMatch = (item.wagons ?? []).some(w => matchProd(w.productType || item.productType));
      if (!itemMatch && !wagonMatch) return false;
    }

    const wagonsList = (item.wagons ?? []).map(unit => unit.wagonNumber).filter(Boolean).join(' ');
    const cisternsList = (item.wagons ?? []).map(unit => unit.cisternNumber).filter(Boolean).join(' ');
    const wagonTypes = (item.wagons ?? []).map(unit => unit.wagonType).filter(Boolean).join(' ');
    return docsMatchesSearch(
      [
        item.arrivalNumber,
        item.entryPermitNumber,
        item.productType,
        toLatinProductName(item.productType),
        item.wagonNumbers,
        item.cisternNumbers,
        wagonsList,
        cisternsList,
        wagonTypes,
        item.trackNumber,
        item.createdByName,
        item.notes,
      ].filter(Boolean).join(' '),
      hub.search,
    );
  }, [hub.from, hub.to, hub.product, hub.search]);

  const filteredPending = useMemo(
    () => pendingRailwayIntakes.filter(matchParty).sort(newestPartyFirst),
    [pendingRailwayIntakes, matchParty],
  );
  // Kiritish xizmat xatlari — kiritish jarayoni Tara bilan tugaydi: partiyaning barcha
  // (qaytarilmagan) vagonlari tara tekshiruvidan o‘tib yuklashga uzatilgach xat shakllanadi.
  // Yuk xati / chiqishga bog‘liq emas. Ichki fond (ZF-) va 1C yozuvlari xizmat xati emas.
  const entryProcessDone = useCallback((a: EmptyWagonArrival) => {
    // Agar Qo'riqlash yoki Ruxsatnoma byurosi kelishgan bo'lsa yoki xizmat xati raqami berilgan bo'lsa
    if (a.entryPermitNumber || a.entryPermitSecurityApprovedAt || a.entryPermitPermitApprovedAt || a.entryPermitShiftApprovedAt) return true;
    const s = getStage(a);
    if (['ReadyForEstakada', 'TareWeighing', 'Loading', 'SealInstallation', 'Exited'].includes(s)) return true;
    const units = (a.wagons ?? []).filter(u => u.status !== 'Returned');
    if (units.length > 0) return units.every(u => u.status !== 'AwaitingTare');
    return !['RailwayInspected', 'KengsoyInspection', 'SecurityInspection', 'Draft', 'Created'].includes(s);
  }, []);
  const entryLetterArrivals = useMemo(
    () => arrivals.filter(a =>
      !isOneCArrival(a)
      && !(a.arrivalNumber || '').startsWith('ZF-')
      && getStage(a) !== 'Cancelled'
      && entryProcessDone(a),
    ),
    [arrivals, entryProcessDone],
  );
  const filteredSent = useMemo(
    () => (menuEntryLetters ? entryLetterArrivals : processArrivals).filter(matchParty).sort(newestPartyFirst),
    [menuEntryLetters, entryLetterArrivals, processArrivals, matchParty],
  );
  const filteredInbox = useMemo(
    () => (menuGateCheck ? recipientList : recipientList.filter(matchParty)).sort(newestPartyFirst),
    [recipientList, matchParty, menuGateCheck],
  );
  const kiritishProductOptions = useMemo(
    () => [...new Set([...pendingRailwayIntakes, ...entryLetterArrivals, ...processArrivals, ...recipientList]
      .map(item => item.productType?.trim())
      .filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'uz'))
      .map(value => ({ value, label: value })),
    [pendingRailwayIntakes, entryLetterArrivals, processArrivals, recipientList],
  );

  const defectProductOptions = useMemo(
    () => [...new Set([...defectActWagons, ...pendingDefectWagons]
      .map(item => (toLatinProductName(item.unit.productType?.trim() || item.arrival.productType?.trim()) || item.unit.productType?.trim() || item.arrival.productType?.trim()))
      .filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'uz'))
      .map(value => ({ value, label: value })),
    [defectActWagons, pendingDefectWagons],
  );

  const matchDefectRow = useCallback((row: { arrival: EmptyWagonArrival; unit: EmptyWagonUnit }) => {
    const date = row.unit.defectActUploadedAt || row.arrival.createdAt || '';
    if (!docsDateInRange(date, hub.from, hub.to)) return false;
    const product = (toLatinProductName(row.unit.productType?.trim() || row.arrival.productType?.trim() || '') || '').trim();
    if (hub.product && product.toLowerCase() !== hub.product.toLowerCase()) return false;
    return docsMatchesSearch(
      [
        row.unit.wagonNumber,
        row.arrival.arrivalNumber,
        row.unit.defectActNumber,
        row.unit.loadingComment,
        product,
      ].filter(Boolean).join(' '),
      hub.search,
    );
  }, [hub.from, hub.to, hub.product, hub.search]);

  const pagedSent = paginateItems(filteredSent, hub.page, hub.pageSize);
  const pagedInbox = paginateItems(filteredInbox, hub.page, hub.pageSize);
  const visibleDefectRows = useMemo(
    () => (menuDefectArchive ? [...defectActWagons] : [...pendingDefectWagons])
      .filter(matchDefectRow)
      .sort((a, b) => {
        const da = menuDefectArchive
          ? (a.unit.defectActUploadedAt || a.arrival.createdAt)
          : a.arrival.createdAt;
        const db = menuDefectArchive
          ? (b.unit.defectActUploadedAt || b.arrival.createdAt)
          : b.arrival.createdAt;
        return docsDateKey(db).localeCompare(docsDateKey(da));
      }),
    [menuDefectArchive, defectActWagons, pendingDefectWagons, matchDefectRow],
  );
  const pagedDefects = paginateItems(visibleDefectRows, hub.page, hub.pageSize);

  useEffect(() => {
    hub.setPage(1);
    // Tab / ish turi o‘zgaganda 1-sahifaga qaytish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ichdxTab, railwayWork, menuDefectActs, menuDefectArchive, menuGateCheck, menuEntryLetters]);

  const deleting = arrivals.find(a => a.id === deleteId);
  const [viewedKengsoyRegistryId, setViewedKengsoyRegistryId] = useState<string | null>(null);
  const explicitKengsoyRegistryId = searchParams.get('registryId')?.trim().toLowerCase();
  const targetKengsoyQueryId = isRailway && railwayWork === 'toKengsoy'
    ? (searchParams.get('registryId') || searchParams.get('party') || searchParams.get('arrivalId'))
    : null;
  const activeKengsoyTargetId = (viewedKengsoyRegistryId || '').toLowerCase().trim();
  const viewedKengsoyRegistry = useMemo(() => {
    // An explicit waybill must never fall back to another document from the same entry.
    if (explicitKengsoyRegistryId) return registries.find(r => r.id.toLowerCase() === explicitKengsoyRegistryId) ?? null;
    if (activeKengsoyTargetId) {
      return (
        allKengsoyReady.find(r => (r.id ?? '').toLowerCase() === activeKengsoyTargetId) ??
        registries.find(r => (r.id ?? '').toLowerCase() === activeKengsoyTargetId) ??
        allKengsoyReady.find(r => isRegistryOfArrival(r, activeKengsoyTargetId)) ??
        registries.find(r => isRegistryOfArrival(r, activeKengsoyTargetId)) ??
        null
      );
    }
    // Faqat to'liq yakunlangan (Kengsoyga chiqib ketgan) yuk xatlari Dashboarddan kelganda avtomatik card holatida ochiladi:
    if (targetKengsoyQueryId) {
      const q = targetKengsoyQueryId.toLowerCase().trim();
      const exitedReg = registries.find(r =>
        Boolean(r.exitedToKengsoyAt) && (
          (r.id ?? '').toLowerCase() === q ||
          isRegistryOfArrival(r, q)
        )
      );
      if (exitedReg) return exitedReg;
    }
    return null;
  }, [explicitKengsoyRegistryId, activeKengsoyTargetId, targetKengsoyQueryId, allKengsoyReady, registries, isRegistryOfArrival]);
  // Boshqaruv panelidan kelganda (from=/dashboard) doim bitta partiya — uning vagonlar
  // jadvali ochiladi; qaysi bosqich/yo‘nalish bo‘lishidan qat’i nazar ro‘yxat ko‘rsatilmaydi.
  const dashboardFocusId = fromQuery ? (partyFromQuery || arrivalIdFromQuery) : null;
  const partyViewLookupId = partyViewId ?? dashboardFocusId;
  // Boshqaruv panelida bosilgan bosqich: tugagan bo‘lsa amal tugmasi o‘rniga yakun yozuvi.
  const stageFromQuery = searchParams.get('stage');
  const stageStateFromQuery = searchParams.get('stageState');
  const stageAtFromQuery = searchParams.get('stageAt');
  const stageNoteFromQuery = dashboardFocusId && stageFromQuery
    ? stageStateFromQuery === 'done'
      ? { tone: 'done' as const, text: ENTRY_STAGE_DONE_NOTES[stageFromQuery] ?? 'Bosqich bajarilgan', at: stageAtFromQuery }
      : stageStateFromQuery === 'ahead'
        ? { tone: 'ahead' as const, text: ENTRY_STAGE_AHEAD_NOTES[stageFromQuery] ?? 'Bu bosqich hali boshlanmagan', at: null }
        : null
    : null;
  // Shu oynada amal bajarilgach keyingi bosqich tugmasi chiqmaydi — yakun yozuvi qoladi,
  // foydalanuvchi «Orqaga» bilan boshqaruv paneliga qaytadi.
  const [completedNote, setCompletedNote] = useState<{ text: string; at: string } | null>(null);
  useEffect(() => { setCompletedNote(null); }, [partyViewLookupId]);
  const markStageCompleted = (key: string) => {
    if (!dashboardFocusId) return;
    setCompletedNote({ text: ENTRY_STAGE_DONE_NOTES[key] ?? 'Bosqich bajarildi', at: new Date().toISOString() });
  };
  const stageNote = stageNoteFromQuery
    ?? (completedNote ? { tone: 'done' as const, text: completedNote.text, at: completedNote.at } : null);
  const partyViewArrival = partyViewLookupId
    ? (arrivals.find(a => a.id === partyViewLookupId) ?? allArrivals.find(a => a.id === partyViewLookupId) ?? null)
    : null;
  const activeWork = RAILWAY_WORK.find(w => w.id === railwayWork);

  const renderNotifyPartyCard = (
    item: EmptyWagonArrival,
    arrivalIdx: number,
    mode: 'pending' | 'sent' | 'inbox',
    showStatus = true,
  ) => {
    const rows = rowsFromArrival(item);
    const dateLabel = formatDateTimeDisplay(item.entryPermitShiftApprovedAt || item.entryPermitPermitApprovedAt || item.arrivalDate || item.createdAt);
    const stageLabel = partyDisplayStatus(item);
    return (
      <tr
        key={item.id}
        className="party-row-open-trigger cursor-pointer"
        onClick={() => openPartyView(item.id)}
        title="Kiritish xizmat xati tarkibini to‘liq ko‘rish"
      >
        <td className="reestr-num">{arrivalIdx + 1}</td>
        <td className="whitespace-nowrap font-mono font-bold text-center">
          <div className="party-cell-with-indicator">
            <span>{item.arrivalNumber || '—'}</span>
            <span className="party-row-open-indicator" aria-hidden="true">
              <ChevronDown className="h-4 w-4 -rotate-90" strokeWidth={2.25} />
            </span>
          </div>
        </td>
        <td className="whitespace-nowrap tabular-nums">{dateLabel}</td>
        <td>{partyWagonCountDisplay(item, rows)}</td>
        <td><PartyProductsSummary rows={rows} activeProduct={hub.product} /></td>
        <td><PartyWagonKindsSummary rows={rows} /></td>
        {showStatus ? (
          <td>
            <b className={`inline-flex rounded-lg border px-2 py-1 text-sm font-semibold whitespace-nowrap ${partyStatusClass(item, mode === 'pending' ? 'Ro\'yxatga olindi' : stageLabel)}`}>
              {mode === 'pending' ? 'Ro\'yxatga olindi' : stageLabel}
            </b>
          </td>
        ) : null}
        <td onClick={e => e.stopPropagation()}>
          {renderPartyDocument(item)}
        </td>
      </tr>
    );
  };

  const renderPartyDocsTable = (
    items: EmptyWagonArrival[],
    mode: 'pending' | 'sent' | 'inbox',
    startIndex = 0,
    showStatus = true,
  ) => (
    <div className="thub-table-wrap reestr-table-wrap">
      <table className="thub-table reestr-table docs-hub-table registry-archive-table entry-letter-archive-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Hujjat raqami</th>
            <th>Sana / vaqt</th>
            <th>Vagon soni</th>
            <th>Mahsulot</th>
            <th>Vagon turi</th>
            {showStatus ? <th>Holat</th> : null}
            <th>Hujjat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => renderNotifyPartyCard(item, startIndex + i, mode, showStatus))}
        </tbody>
      </table>
    </div>
  );

  const partyIntakeGridCols = 'lg:grid-cols-[48px_minmax(180px,1.3fr)_155px_95px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(250px,.95fr)_145px_minmax(200px,.9fr)]';
  const partyIntakeGridColsNoActions = 'lg:grid-cols-[48px_minmax(180px,1.3fr)_155px_95px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(250px,.95fr)_145px]';

  const renderRailwayStylePartyTable = (
    items: EmptyWagonArrival[],
    startIndex = 0,
    gateCheckPanel = false,
    showActionsColumn = true,
  ) => (
    <div className="railway-intake-table overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
      {showActionsColumn ? partyTableHeader : partyTableHeaderNoActions}
      {items.map((item, arrivalIdx) => {
        const rows = rowsFromArrival(item);
        const dateLabel = formatDateTimeDisplay(item.entryPermitShiftApprovedAt || item.entryPermitPermitApprovedAt || item.arrivalDate || item.createdAt);
        const stageLabel = partyDisplayStatus(item);

        return (
          <article
            key={item.id}
            className="overflow-hidden border-b border-slate-200 transition last:border-b-0 bg-white dark:border-slate-700 dark:bg-slate-900 hover:bg-sky-50/45 dark:hover:bg-slate-800/70"
          >
            <div className={`grid grid-cols-1 transition-colors ${showActionsColumn ? partyIntakeGridCols : partyIntakeGridColsNoActions} lg:items-stretch`}>
              <button
                type="button"
                className="party-row-open-trigger contents text-left"
                onClick={() => openPartyView(item.id)}
                aria-haspopup="dialog"
                title="Partiya tarkibini to‘liq ko‘rish"
              >
                <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  {startIndex + arrivalIdx + 1}
                </span>
                <div className="party-cell-with-indicator border-r border-slate-200 py-3 dark:border-slate-700">
                  <span className="min-w-0 font-mono text-sm font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">{item.arrivalNumber}</span>
                  <span className="party-row-open-indicator" aria-hidden="true">
                    <ChevronDown className="h-4 w-4 -rotate-90" strokeWidth={2.25} />
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-sm tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {dateLabel}
                </div>
                <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">{partyWagonCountDisplay(item, rows)}</p>
                </div>
                <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                  <PartyProductsSummary rows={rows} activeProduct={hub.product} />
                </div>
                <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                  <PartyWagonKindsSummary rows={rows} />
                </div>
                <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                  <span className={`inline-flex rounded-lg border px-2 py-1 ${isRailway ? 'text-[14px]' : 'text-[11px]'} font-semibold whitespace-nowrap ${partyStatusClass(item, stageLabel)}`}>{stageLabel}</span>
                </div>
              </button>
              <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-2 py-2 dark:border-slate-700 last:border-r-0" onClick={e => e.stopPropagation()}>
                {renderPartyDocument(item)}
              </div>
              {showActionsColumn ? (
                <div className="flex min-w-0 items-center justify-center px-2 py-2" onClick={e => e.stopPropagation()}>
                  {renderPartyActions(item, false, gateCheckPanel)}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );

  const partyTableHeader = (
    <div className={`hidden border-b border-slate-300 bg-[#dcecf8] lg:grid ${partyIntakeGridCols} dark:border-slate-700 dark:bg-slate-800`}>
      {['№', 'Hujjat raqami', 'Sana / vaqt', 'Vagon soni', 'Mahsulot', 'Vagon turi', 'Holat', 'Kirish hujjati', 'Amallar'].map(label => (
        <span key={label} className={`flex items-center justify-center border-r border-slate-300 px-3 py-3.5 ${isRailway ? 'text-[13px]' : 'text-xs'} font-semibold text-slate-800 last:border-r-0 dark:border-slate-700 dark:text-slate-200`}>{label}</span>
      ))}
    </div>
  );

  const partyTableHeaderNoActions = (
    <div className={`hidden border-b border-slate-300 bg-[#dcecf8] lg:grid ${partyIntakeGridColsNoActions} dark:border-slate-700 dark:bg-slate-800`}>
      {['№', 'Hujjat raqami', 'Sana / vaqt', 'Vagon soni', 'Mahsulot', 'Vagon turi', 'Holat', 'Kirish hujjati'].map(label => (
        <span key={label} className={`flex items-center justify-center border-r border-slate-300 px-3 py-3.5 ${isRailway ? 'text-[13px]' : 'text-xs'} font-semibold text-slate-800 last:border-r-0 dark:border-slate-700 dark:text-slate-200`}>{label}</span>
      ))}
    </div>
  );



  const canDispatchParty = (item: EmptyWagonArrival) =>
    (user?.role === 'Dispatching' || user?.role === 'DispatchSupervisor' || user?.role === 'Admin' || can('empty-wagons.dispatch-approve') || can('empty-wagons.create')) && getStage(item) === STAGES.RailwayInspected;

  const dispatchConfirmDialog = (
    <ConfirmDialog
      open={!!dispatchConfirmTarget}
      title="Ijro uchun jo‘natish"
      message={
        dispatchConfirmTarget
          ? `"${dispatchConfirmTarget.arrivalNumber}" partiyasi (${dispatchConfirmTarget.wagonCount} ta vagon) tasdiqlanib, ijro uchun jo‘natilsinmi?`
          : ''
      }
      confirmLabel="Ha, jo‘natish"
      cancelLabel="Yo‘q"
      loading={submitting}
      error={error}
      onConfirm={() => {
        if (dispatchConfirmTarget) void handleDispatchToExecution(dispatchConfirmTarget);
      }}
      onCancel={() => {
        if (submitting) return;
        setDispatchConfirmTarget(null);
        setError('');
      }}
    />
  );

  const railwayAdmitBusy = Boolean(railwayAdmitTarget && stageUpdatingId === railwayAdmitTarget.id);
  const railwayAdmitDialog = (
    <ConfirmDialog
      open={!!railwayAdmitTarget}
      title="Vagonlarni olib kirish"
      message={
        railwayAdmitTarget
          ? `"${railwayAdmitTarget.arrivalNumber}" partiyasi (${railwayAdmitTarget.wagonCount} ta vagon) zavod hududiga olib kirilsinmi?`
          : ''
      }
      confirmLabel="Ha, olib kirish"
      cancelLabel="Yo‘q"
      loading={railwayAdmitBusy}
      onConfirm={() => {
        if (!railwayAdmitTarget) return;
        void handleRailwayStep(railwayAdmitTarget, STAGES.SecurityInspection).then(() => {
          setRailwayAdmitTarget(null);
        });
      }}
      onCancel={() => {
        if (railwayAdmitBusy) return;
        setRailwayAdmitTarget(null);
      }}
    />
  );

  const kengsoyExitDialog = (
    <ConfirmDialog
      open={!!kengsoyExitTarget}
      title="Vagonlarni olib chiqish"
      message={
        kengsoyExitTarget
          ? `"${kengsoyExitTarget.registryNumber}" yuk xati bo‘yicha ${kengsoyExitTarget.wagonCount || 0} ta vagonni olib chiqasizmi?`
          : ''
      }
      confirmLabel="Ha, olib chiqish"
      cancelLabel="Bekor qilish"
      error={error || undefined}
      loading={Boolean(kengsoyExitTarget && handoverId === kengsoyExitTarget.id)}
      onConfirm={() => {
        if (kengsoyExitTarget) void handleKengsoyExit(kengsoyExitTarget);
      }}
      onCancel={() => {
        if (handoverId) return;
        setKengsoyExitTarget(null);
        setError('');
      }}
    />
  );

  const renderGateCheckDetailFooter = (item: EmptyWagonArrival) => {
    const securityReview = getStage(item) === STAGES.SecurityInspection || needsGateInspection(item);
    if (!securityReview) return null;

    if ((isPermit || isAdmin) && !item.entryPermitPermitApprovedAt) {
      return (
        <OrderSheetTableFooter>
          <div className="order-sheet-footer-actions">
            <button
              type="button"
              className="btn-primary order-sheet-approve-btn"
              disabled={stageUpdatingId === item.id}
              onClick={() => setPermitConfirmTarget(item)}
            >
              <Shield className="w-4 h-4" strokeWidth={2} />
              Ijro uchun qabul qilish
            </button>
          </div>
        </OrderSheetTableFooter>
      );
    }

    if (isSecurity && !item.entryPermitPermitApprovedAt) {
      return (
        <OrderSheetTableFooter>
          <p className="w-full px-1 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-300">
            Ruxsatnoma byurosi kelishishi kutilmoqda
          </p>
        </OrderSheetTableFooter>
      );
    }

    if ((isSecurity || isAdmin) && !item.entryPermitSecurityApprovedAt) {
      return (
        <OrderSheetTableFooter>
          <div className="order-sheet-footer-actions">
            <button
              type="button"
              className="btn-primary order-sheet-approve-btn"
              disabled={stageUpdatingId === item.id}
              onClick={() => { void handleSecurityAdmit(item); }}
            >
              <Shield className="w-4 h-4" strokeWidth={2} />
              {menuGateCheck ? 'Qabul qilish' : 'Vagonlarni tekshirib kiritish'}
            </button>
          </div>
        </OrderSheetTableFooter>
      );
    }

    return null;
  };

  if (isRailway && railwayWork === 'toKengsoy' && viewedKengsoyRegistry && (!dashboardFocusId || workFromQuery === 'toKengsoy')) {
    const r = viewedKengsoyRegistry;
    const arrival = arrivals.find(a => a.id.toLowerCase() === (r.emptyWagonArrivalId || '').toLowerCase())
      ?? allArrivals.find(a => a.id.toLowerCase() === (r.emptyWagonArrivalId || '').toLowerCase());
    const busy = handoverId === r.id;
    const routes = r.wagonRoutes ?? [];
    const allWagons = (allArrivals.length > 0 ? allArrivals : arrivals).flatMap(a => a.wagons ?? []);

    return (
      <div className="marketing-order-page space-y-4">
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            <ProductDetailBackButton onClick={() => {
              setViewedKengsoyRegistryId(null);
              const from = searchParams.get('from') || (location.state as any)?.from;
              if (from) {
                navigate(from);
              } else {
                setSearchParams(prev => {
                  const p = new URLSearchParams(prev);
                  p.delete('party');
                  p.delete('arrivalId');
                  p.delete('registryId');
                  p.delete('from');
                  p.delete('stage');
                  p.delete('stageState');
                  p.delete('stageAt');
                  return p;
                }, { replace: true });
              }
            }} />
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">Kengsoygacha olib chiqish</h2>
              <p className="marketing-order-page__subtitle">{r.registryNumber || 'Yuk xati'}</p>
            </div>
          </div>
        </div>

        <section className="order-sheet-card railway-party-detail-card">
          <header className="order-sheet-header">
            <div className="order-sheet-header__main">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                <FileText className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="order-sheet-header__text">
                <div className="order-sheet-header__title-row">
                  <span className="order-sheet-header__product">{r.registryNumber || 'Yuk xati'}</span>
                  <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                    {r.wagonCount || (routes.length > 0 ? routes.length : (arrival?.wagonCount || 0))} ta vagon
                  </span>
                </div>
                <span className="order-sheet-header__code">{r.registryNumber}</span>
              </div>
            </div>
            <div className="order-sheet-header__aside">
              {renderRegistryDocument(r)}
            </div>
          </header>

          {r.exitedToKengsoyAt && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Ushbu yuk xati ({r.registryNumber}) bo‘yicha vagonlar Kengsoygacha olib chiqilgan ({formatDateTimeDisplay(r.exitedToKengsoyAt)}).</span>
            </div>
          )}

          <div className="order-sheet-body p-4 sm:p-5">
            <div className="thub-table-wrap reestr-table-wrap scalehub-party-table !max-h-none !overflow-y-visible overflow-x-auto rounded-xl border border-slate-200 shadow-xs dark:border-slate-700">
              <table className="thub-table reestr-table reestr-table--compact">
                <thead>
                  <tr>
                    <th style={{ width: '4%' }} className="text-center">№</th>
                    <th style={{ width: '11%' }} className="text-center">Vagon raqami</th>
                    <th style={{ width: '10%' }} className="text-center">Vagon turi</th>
                    <th style={{ width: '11%' }} className="text-center">Mahsulot</th>
                    <th style={{ width: '7%' }} className="text-center">Netto</th>
                    <th style={{ width: '12%' }} className="text-center">Tasdiqlangan buyurtma</th>
                    <th style={{ width: '30%' }} className="text-center">Stansiya va kontragent</th>
                    <th style={{ width: '15%' }} className="text-center">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {(routes.length > 0
                    ? routes.map((route, index) => {
                        const wagonNumber = route.wagonNumber.trim();
                        const matchingUnit = allWagons.find(u =>
                          u.wagonNumber.trim().toLowerCase() === wagonNumber.toLowerCase()
                        );
                        const defective = Boolean(route.isDefective || matchingUnit?.status === 'Returned');
                        const product = toLatinProductName(route.productType || matchingUnit?.productType || r.productType) || 'Suyultirilgan gaz';
                        const wagonType = isWagonKind(matchingUnit?.wagonType) ? WAGON_KIND_LABEL[matchingUnit.wagonType] : 'Vagon-sisterna';
                        const rawNetto = matchingUnit?.nettoWeight;
                        const nettoDisplay = rawNetto ? (Number(rawNetto) > 1000 ? `${(Number(rawNetto) / 1000).toFixed(1)} t` : `${rawNetto} t`) : '—';
                        const orderNo = defective ? 'Buyurtmasiz' : (route.orderNumber || r.orderNumber || '—');
                        const routeText = defective
                          ? 'Nomuvofiqlik dalolatnomasi'
                          : `${route.destinationStation || r.destinationStation || '—'} — ${route.contractorName || r.contractorName || '—'}`;
                        const defectDisplayName = matchingUnit?.defectActNumber ? `IR-${matchingUnit.defectActNumber}` : (defective ? 'Dalolatnomali' : '');

                        return (
                          <tr key={`${wagonNumber}-${index}`}>
                            <td className="thub-mono reestr-num text-center">{index + 1}</td>
                            <td className="text-center"><span className="thub-table__code">{wagonNumber}</span></td>
                            <td className="text-center">{wagonType}</td>
                            <td className="text-center">{product}</td>
                            <td className="text-center font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {defective ? '—' : nettoDisplay}
                            </td>
                            <td className="text-center font-mono font-medium text-slate-900 dark:text-slate-100">
                              {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Buyurtmasiz</span> : orderNo}
                            </td>
                            <td className="text-center text-slate-700 dark:text-slate-300">
                              {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Nomuvofiqlik dalolatnomasi</span> : routeText}
                            </td>
                            <td className="text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-lg border px-2.5 py-1 text-[13px] font-semibold ${
                                defective
                                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              }`}>
                                {defective ? defectDisplayName : 'Yuk xatiga kiritilgan'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    : (arrival?.wagons ?? []).map((unit, index) => {
                        const defective = unit.status === 'Returned';
                        const product = toLatinProductName(unit.productType || r.productType) || 'Suyultirilgan gaz';
                        const wagonType = isWagonKind(unit.wagonType) ? WAGON_KIND_LABEL[unit.wagonType] : 'Vagon-sisterna';
                        const rawNetto = unit.nettoWeight;
                        const nettoDisplay = rawNetto ? (Number(rawNetto) > 1000 ? `${(Number(rawNetto) / 1000).toFixed(1)} t` : `${rawNetto} t`) : '—';
                        const orderNo = defective ? 'Buyurtmasiz' : (r.orderNumber || '—');
                        const routeText = defective
                          ? 'Nomuvofiqlik dalolatnomasi'
                          : `${r.destinationStation || '—'} — ${r.contractorName || '—'}`;
                        const defectDisplayName = unit.defectActNumber ? `IR-${unit.defectActNumber}` : (defective ? 'Dalolatnomali' : '');

                        return (
                          <tr key={unit.id}>
                            <td className="thub-mono reestr-num text-center">{index + 1}</td>
                            <td className="text-center"><span className="thub-table__code">{unit.wagonNumber}</span></td>
                            <td className="text-center">{wagonType}</td>
                            <td className="text-center">{product}</td>
                            <td className="text-center font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {defective ? '—' : nettoDisplay}
                            </td>
                            <td className="text-center font-mono font-medium text-slate-900 dark:text-slate-100">
                              {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Buyurtmasiz</span> : orderNo}
                            </td>
                            <td className="text-center text-slate-700 dark:text-slate-300">
                              {defective ? <span className="text-slate-500 dark:text-slate-400 italic">Nomuvofiqlik dalolatnomasi</span> : routeText}
                            </td>
                            <td className="text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-lg border px-2.5 py-1 text-[13px] font-semibold ${
                                defective
                                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              }`}>
                                {defective ? defectDisplayName : 'Yuk xatiga kiritilgan'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            <OrderSheetTableFooter>
              <div className="order-sheet-footer-actions">
                {r.exitedToKengsoyAt ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Kengsoygacha olib chiqilgan
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-primary order-sheet-approve-btn whitespace-nowrap"
                    disabled={busy}
                    onClick={() => setKengsoyExitTarget(r)}
                  >
                    <TrainFront className="w-4 h-4 shrink-0" strokeWidth={2} />
                    {busy ? 'Bajarilmoqda...' : 'Vagonlarni olib chiqish'}
                  </button>
                )}
              </div>
            </OrderSheetTableFooter>
          </div>
        </section>

        {kengsoyExitDialog}
        {defectActDialog}
        {renderYukXatiPreviewModal()}
      </div>
    );
  }

  if (dashboardFocusId && !partyViewArrival && loading) {
    return (
      <div className="marketing-order-page space-y-4">
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            <ProductDetailBackButton onClick={() => {
              const from = searchParams.get('from') || (location.state as any)?.from;
              if (from) {
                navigate(from);
              } else {
                setSearchParams(prev => {
                  const p = new URLSearchParams(prev);
                  p.delete('party');
                  p.delete('arrivalId');
                  p.delete('from');
                  p.delete('stage');
                  p.delete('stageState');
                  p.delete('stageAt');
                  return p;
                }, { replace: true });
              }
            }} />
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">Vagonlarni kiritish</h2>
              <p className="marketing-order-page__subtitle">Yuklanmoqda…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (partyViewArrival) {
    const rows = rowsFromArrival(partyViewArrival);
    const stageLabel = partyDisplayStatus(partyViewArrival);
    const issue = latestIntakeReturnNote(partyViewArrival.notes);

    return (
      <div className="marketing-order-page space-y-4">
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            <ProductDetailBackButton onClick={closePartyView} />
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">
                {isRailway && railwayWork === 'toKengsoy' ? 'Kengsoygacha olib chiqish' : 'Vagonlarni kiritish'}
              </h2>
              <p className="marketing-order-page__subtitle">{partyViewArrival.arrivalNumber}</p>
            </div>
          </div>
        </div>

        <section className="order-sheet-card railway-party-detail-card">
          <header className="order-sheet-header">
            <div className="order-sheet-header__main">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                <TrainFront className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="order-sheet-header__text">
                <div className="order-sheet-header__title-row">
                  <span className="order-sheet-header__product">
                    {isRailway && railwayWork === 'toKengsoy' ? 'Kengsoygacha olib chiqish' : 'Vagonlarni kiritish'}
                  </span>
                  <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${partyStatusClass(partyViewArrival, stageLabel)}`}>
                    {stageLabel}
                  </span>
                </div>
                <span className="order-sheet-header__code">{partyViewArrival.arrivalNumber}</span>
              </div>
            </div>
            <div className="order-sheet-header__aside">
              {renderPartyDocument(partyViewArrival)}
              {stageNote
                ? (partyIntakeMenuItems(partyViewArrival).length > 0 ? <OrderSheetMenu items={partyIntakeMenuItems(partyViewArrival)} /> : null)
                : renderPartyActions(partyViewArrival, true, menuGateCheck, menuGateCheck)}
            </div>
          </header>

          <div className="order-sheet-body">
            {issue ? (
              <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <span>{issue}</span>
              </div>
            ) : null}
            {(() => {
              const entryPending = getArrivalEntryPendingActionInfo(partyViewArrival);
              if (entryPending.isEntryDone || (isRailway && railwayWork === 'toKengsoy')) return null;
              return (
                <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 dark:border-amber-900/50 dark:bg-amber-950/25 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shadow-xs">
                      <AlertTriangle className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Vagonlarni kiritish jarayoni
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Zavod hududiga kiritish uchun qadamlar ketma-ketligi va hozirgi mas’ul
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-300/80 bg-white/95 p-4 dark:border-amber-800/70 dark:bg-slate-900/90 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Hozirda kim bosishi / tasdiqlashi kutilmoqda:
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">
                        № {entryPending.arrivalNumber} ({entryPending.wagonCount} ta vagon)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Hozirgi mas’ul:</span>
                        <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          {entryPending.responsibleRole}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Kutilayotgan amal:</span>
                        <span className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          {entryPending.actionName}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 leading-relaxed border border-slate-200/80 dark:border-slate-800">
                      <strong className="text-slate-900 dark:text-slate-100 font-semibold">Tushuntirish: </strong>
                      {entryPending.detailText}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Kiritish sikli bosqichlari:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                      {entryPending.steps.map((st) => (
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
                </div>
              );
            })()}
            {!menuEntryLetters && (isRailway || isAdmin) && pendingDefectActCount(partyViewArrival) > 0 ? (
              <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-100">
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                <span>
                  Nomuvofiqlik aniqlangan. Temir yo‘l dalolatnomasini tizimda tuzing — so‘ng iqtisodchi yuk xatiga qo‘sha oladi.
                </span>
              </div>
            ) : null}

            <div className="order-sheet-table-box">
              <div className="order-sheet-scroll">
                <table className="order-sheet-table railway-party-detail-table">
                  <thead>
                    <tr>
                      <th className="!w-14">№</th>
                      <th>Vagon raqami</th>
                      <th>Vagon turi</th>
                      <th>Mahsulot</th>
                      <th>Kelish holati</th>
                      <th>Tegishlilik</th>
                      <th>Konteyner / sisterna</th>
                      {(isRailway || isAdmin) ? <th>Nomuvofiqlik dalolatnomasi</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const containers = parseContainers(row.cisternNumber);
                      return (
                        <tr key={`${row.id}-${index}`}>
                          <td className="order-sheet-num order-sheet-center">{index + 1}</td>
                          <td className="order-sheet-center">
                            <strong className="font-mono text-sm tracking-wide">{row.wagonNumber}</strong>
                          </td>
                          <td className="order-sheet-center">
                            {row.wagonType ? WAGON_KIND_LABEL[row.wagonType] : 'Noma’lum'}
                          </td>
                          <td className="order-sheet-center">{row.productType?.trim() || 'Tanlanmagan'}</td>
                          <td className="order-sheet-center">{intakeLoadStateLabel(row.intakeLoadState)}</td>
                          <td className="order-sheet-center">{wagonOwnershipLabel(row.ownership)}</td>
                          <td className="order-sheet-center">
                            {containers.length > 0 ? containers.join(' · ') : '—'}
                          </td>
                          {(isRailway || isAdmin) ? (
                            <td className="order-sheet-center">
                              {row.status === 'Returned' ? (
                                <div className="flex flex-col items-center gap-1.5">
                                  {hasDefectAct(row) ? (
                                    <button
                                      type="button"
                                      className="table-row-ctrl table-row-ctrl--document inline-flex items-center gap-1"
                                      onClick={() => {
                                        const unit = partyViewArrival.wagons?.find(u => u.id === row.id);
                                        if (unit) openDefectAct(partyViewArrival, unit);
                                      }}
                                    >
                                      <FileCheck className="h-3.5 w-3.5" /> {defectActDisplayName(row)}
                                    </button>
                                  ) : menuEntryLetters ? (
                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-row-ctrl table-row-ctrl--primary inline-flex items-center gap-1"
                                      onClick={() => {
                                        const unit = partyViewArrival.wagons?.find(u => u.id === row.id);
                                        if (unit) openDefectAct(partyViewArrival, unit);
                                      }}
                                    >
                                      <FileCheck className="h-3.5 w-3.5" />
                                      Dalolatnoma tuzish
                                    </button>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                    <tr className="order-sheet-total">
                      <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                      <td className="order-sheet-center font-bold">{rows.length} ta vagon</td>
                      <td colSpan={(isRailway || isAdmin) ? 5 : 4} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {stageNote ? (
              <OrderSheetTableFooter>
                <p className={`flex w-full items-center gap-2 px-1 py-0.5 text-sm font-semibold ${stageNote.tone === 'done' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {stageNote.tone === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
                  <span>{stageNote.text}</span>
                  {stageNote.at ? (
                    <span className="font-medium text-slate-500 dark:text-slate-400">· {formatDateTimeDisplay(stageNote.at)}</span>
                  ) : null}
                </p>
              </OrderSheetTableFooter>
            ) : isRailway && railwayWork === 'toKengsoy' ? (() => {
              const r = allKengsoyReady.find(item => isRegistryOfArrival(item, partyViewArrival.id))
                ?? registries.find(item => !item.exitedToKengsoyAt && isRegistryOfArrival(item, partyViewArrival.id));
              const busy = r ? handoverId === r.id : false;
              return (
                <OrderSheetTableFooter>
                  <div className="order-sheet-footer-actions">
                    {r ? (
                      <button
                        type="button"
                        className="btn-primary order-sheet-approve-btn whitespace-nowrap"
                        disabled={busy}
                        onClick={() => setKengsoyExitTarget(r)}
                      >
                        <TrainFront className="w-4 h-4 shrink-0" strokeWidth={2} />
                        {busy ? 'Bajarilmoqda...' : 'Vagonlarni olib chiqish'}
                      </button>
                    ) : null}
                  </div>
                </OrderSheetTableFooter>
              );
            })() : canDispatchParty(partyViewArrival) ? (
              <OrderSheetTableFooter>
                <div className="order-sheet-footer-actions">
                  <button
                    type="button"
                    className="btn-primary order-sheet-approve-btn"
                    disabled={submitting}
                    onClick={() => {
                      setError('');
                      setDispatchConfirmTarget(partyViewArrival);
                    }}
                  >
                    <Send className="w-4 h-4" />
                    Tasdiqlash va ijroga jo‘natish
                  </button>
                </div>
              </OrderSheetTableFooter>
            ) : isRailway && getStage(partyViewArrival) === STAGES.RailwayInspected ? (
              <OrderSheetTableFooter>
                <div className="order-sheet-footer-actions">
                  <span className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                    <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    Vagonlar ro‘yxatga olindi · ICHDX smena boshlig‘i tasdiqlashi va ijroga yo‘naltirishi kutilmoqda
                  </span>
                </div>
              </OrderSheetTableFooter>
            ) : isRailway && getStage(partyViewArrival) === STAGES.KengsoyInspection ? (
              <OrderSheetTableFooter>
                <div className="order-sheet-footer-actions">
                  {renderRailwayActions(partyViewArrival)}
                </div>
              </OrderSheetTableFooter>
            ) : renderGateCheckDetailFooter(partyViewArrival)}

          </div>
        </section>

        <WagonEntryPermitView arrival={entryPermitTarget} onClose={closeEntryPermit} />
        {defectActDialog}
        <EditPartyWagonsDialog
          open={!!editPartyArrival}
          arrival={editPartyArrival}
          arrivals={arrivals}
          restrictToExisting={editPartyArrival ? isSecurityReturned(editPartyArrival) : false}
          onClose={() => setEditPartyArrival(null)}
          onSaved={() => load(true)}
        />
        <SecurityInspectionDialog
          open={!!securityTarget}
          arrival={securityTarget}
          onClose={() => setSecurityTarget(null)}
          onDone={() => { setSecurityTarget(null); markStageCompleted('entry-security'); load(true); }}
        />
        <ConfirmDialog
          open={!!permitConfirmTarget}
          title="Ruxsatnoma kelishuvi"
          message={
            permitConfirmTarget
              ? `"${permitConfirmTarget.arrivalNumber}" partiyasi (${permitConfirmTarget.wagonCount} ta vagon) uchun kelishishni tasdiqlaysizmi?`
              : ''
          }
          confirmLabel="Ro‘yxatga olindi"
          cancelLabel="Bekor qilish"
          loading={Boolean(permitConfirmTarget && stageUpdatingId === permitConfirmTarget.id)}
          onConfirm={() => {
            if (permitConfirmTarget) void handleEntryPermitApprove(permitConfirmTarget);
          }}
          onCancel={() => {
            if (stageUpdatingId) return;
            setPermitConfirmTarget(null);
          }}
        />
        <ConfirmDialog
          open={!!deleteId}
          title="Partiyani o'chirish"
          message={deleting ? `"${deleting.arrivalNumber}" partiyasi (${deleting.wagonCount} ta vagon) o'chirilsinmi?` : ''}
          confirmLabel="O'chirish"
          variant="danger"
          loading={deleteLoading}
          error={error || undefined}
          onConfirm={() => { void handleDelete(); }}
          onCancel={() => {
            if (deleteLoading) return;
            setDeleteId(null);
            setError('');
          }}
        />
        {railwayAdmitDialog}
        {dispatchConfirmDialog}
        {kengsoyExitDialog}
        {renderYukXatiPreviewModal()}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {fromQuery && (
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            <ProductDetailBackButton onClick={() => {
              const from = searchParams.get('from') || (location.state as any)?.from;
              if (from) {
                navigate(from);
              } else {
                setSearchParams(prev => {
                  const p = new URLSearchParams(prev);
                  p.delete('from');
                  p.delete('stage');
                  p.delete('stageState');
                  p.delete('stageAt');
                  p.delete('party');
                  p.delete('arrivalId');
                  return p;
                }, { replace: true });
              }
            }} />
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">
                {isRailway && railwayWork === 'toKengsoy' ? 'Kengsoygacha olib chiqish' : 'Vagonlarni kiritish'}
              </h2>
              <p className="marketing-order-page__subtitle">
                {isRailway && railwayWork === 'toKengsoy'
                  ? 'Temir yo‘l xizmati: Kengsoy stansiyasigacha jo‘natish'
                  : 'Vagonlarni qabul qilish va boshqarish'}
              </p>
            </div>
          </div>
        </div>
      )}
      {viewOnSite || viewDepartedToday ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100">
            {viewOnSite
              ? `Zavod hududidagi vagonlar · ${viewFilteredArrivals.length} ta partiya`
              : `Bugun chiqqan vagonlar · ${viewFilteredArrivals.length} ta partiya`}
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('view');
              setSearchParams(next);
            }}
          >
            Barcha partiyalar
          </button>
        </div>
      ) : null}

      {isRailway && !menuEntryLetters && !menuDefectArchive ? (
        <>
          <div className="thub reestr">
            <HubZoneTabs
              label="Temir yo‘l ishlari"
              columns={4}
              value={railwayWork}
              onChange={selectRailwayWork}
              items={RAILWAY_WORK.map(work => {
                const tone: HubZoneTone =
                  work.id === 'toSecurity'
                    ? 'sisterna'
                    : work.id === 'toEstakada'
                      ? 'closed'
                      : work.id === 'defectActs'
                        ? 'rose'
                        : 'container';
                return {
                  id: work.id,
                  label: work.title,
                  hint: work.hint,
                  icon: work.icon,
                  tone,
                  count: workCounts[work.id],
                  disabled: false,
                  title: work.hint,
                };
              })}
            />
          </div>
        </>
      ) : menuEntryLetters ? (
        <div className="thub reestr">
          <DocsHubToolbar
            search={hub.search}
            onSearchChange={hub.setSearch}
            searchPlaceholder="Partiya, vagon yoki kirish hujjati №…"
            preset={hub.preset}
            onPreset={hub.pickPreset}
            from={hub.from}
            to={hub.to}
            onFromChange={hub.onFromChange}
            onToChange={hub.onToChange}
            product={hub.product}
            productOptions={kiritishProductOptions}
            onProductChange={hub.setProduct}
            actions={
              <button
                type="button"
                className="btn-secondary !h-9 !py-0 !px-3.5 !text-xs !font-bold flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/30 shrink-0"
                onClick={() => exportKiritishExcel(filteredSent)}
                disabled={filteredSent.length === 0}
                title="Kiritish xizmat xatlarini Excel (.xlsx) fayliga yuklash"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Excel yuklash</span>
              </button>
            }
          />
          <div className="thub__board">
            {loading ? (
              <div className="thub-empty">Yuklanmoqda…</div>
            ) : entryLetterArrivals.length === 0 ? (
              <div className="thub-empty">
                <p className="thub-empty__title">Kiritish xizmat xati yo‘q</p>
                <p className="thub-empty__text">Partiya kiritilgach, xat shu yerda paydo bo‘ladi.</p>
              </div>
            ) : filteredSent.length === 0 ? (
              <div className="thub-empty">
                <p className="thub-empty__title">Mos partiya yo‘q</p>
                <p className="thub-empty__text">Qidiruv yoki davrni o‘zgartiring.</p>
              </div>
            ) : (
              renderPartyDocsTable(pagedSent.slice, 'sent', pagedSent.startIndex, true)
            )}
          </div>
          <DocsHubPagination
            total={filteredSent.length}
            page={pagedSent.page}
            pageSize={hub.pageSize}
            onPageChange={hub.setPage}
            onPageSizeChange={hub.setPageSize}
            unitLabel="kiritish xati"
          />
        </div>
      ) : menuDefectArchive ? (
        <div className="thub reestr">
          <DocsHubToolbar
            search={hub.search}
            onSearchChange={hub.setSearch}
            searchPlaceholder="Vagon, partiya yoki dalolatnoma №…"
            preset={hub.preset}
            onPreset={hub.pickPreset}
            from={hub.from}
            to={hub.to}
            onFromChange={hub.onFromChange}
            onToChange={hub.onToChange}
            product={hub.product}
            productOptions={defectProductOptions}
            onProductChange={hub.setProduct}
            actions={
              <button
                type="button"
                className="btn-secondary !h-9 !py-0 !px-3.5 !text-xs !font-bold flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/30 shrink-0"
                onClick={() => exportDefectActsExcel(visibleDefectRows)}
                disabled={visibleDefectRows.length === 0}
                title="Dalolatnomalarni Excel (.xlsx) fayliga yuklash"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Excel yuklash</span>
              </button>
            }
          />
          <div className="thub__board">
            {loading ? (
              <div className="thub-empty">Yuklanmoqda…</div>
            ) : visibleDefectRows.length === 0 ? (
              <div className="thub-empty">
                <FileCheck className="mx-auto mb-2 h-10 w-10 text-rose-300 dark:text-rose-500/70" strokeWidth={1.5} />
                <p className="thub-empty__title">Dalolatnoma yo‘q</p>
                <p className="thub-empty__text">Nomuvofiqlik aniqlangan vagonlar dalolatnomasi shu yerda paydo bo‘ladi.</p>
              </div>
            ) : (
              <div className="thub-table-wrap reestr-table-wrap">
                <table className="thub-table reestr-table docs-hub-table registry-archive-table defect-archive-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Vagon</th>
                      <th>Sana / vaqt</th>
                      <th>Vagon turi</th>
                      <th>Mahsulot</th>
                      <th>Nomuvofiqlik</th>
                      <th>Hujjat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDefects.slice.map((row, i) => {
                      const idx = pagedDefects.startIndex + i;
                      const kind = isWagonKind(row.unit.wagonType) ? WAGON_KIND_LABEL[row.unit.wagonType] : (row.unit.wagonType || '—');
                      const dateLabel = formatDateTimeDisplay(
                        row.unit.defectActUploadedAt || row.arrival.createdAt,
                      );
                      const productLabel = toLatinProductName(row.unit.productType?.trim() || row.arrival.productType?.trim()) || row.unit.productType?.trim() || row.arrival.productType?.trim() || '—';
                      return (
                        <tr key={row.unit.id}>
                          <td className="reestr-num">{idx + 1}</td>
                          <td className="whitespace-nowrap font-mono font-bold">{row.unit.wagonNumber}</td>
                          <td>{dateLabel}</td>
                          <td>{kind}</td>
                          <td>{productLabel}</td>
                          <td>{row.unit.loadingComment?.trim() || 'Nomuvofiqlik aniqlangan'}</td>
                          <td>
                            <DocumentChipButton
                              title={row.unit.defectActNumber || 'Dalolatnomani ko‘rish'}
                              onClick={() => openDefectAct(row.arrival, row.unit)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DocsHubPagination
            total={visibleDefectRows.length}
            page={pagedDefects.page}
            pageSize={hub.pageSize}
            onPageChange={hub.setPage}
            onPageSizeChange={hub.setPageSize}
            unitLabel="dalolatnoma"
          />
        </div>
      ) : canCreate && !menuGateCheck ? (
        <div className="thub reestr nhub nhub--sender">
          <HubZoneTabs
            label="ICHDX xabarnoma"
            columns={2}
            value={ichdxTab}
            onChange={tab => {
              setIchdxTab(tab);
              hub.setPage(1);
            }}
            items={[
              {
                id: 'pending' as const,
                label: 'Kutilmoqda',
                hint: 'Temir yo‘l kiritgan · yuborish kerak',
                icon: Hourglass,
                tone: 'sisterna',
                count: pendingRailwayIntakes.length,
              },
              {
                id: 'sent' as const,
                label: 'Yuborilgan',
                hint: 'Sexlarga yuborilgan partiyalar',
                icon: Send,
                tone: 'closed',
                count: processArrivals.length,
              },
            ]}
          />

          {user?.role === 'Admin' ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setIntakeOpen(true)}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Bo‘sh vagonni tanlash
              </button>
            </div>
          ) : null}

          <DocsHubToolbar
            search={hub.search}
            onSearchChange={hub.setSearch}
            searchPlaceholder="Partiya, vagon yoki kirish hujjati №…"
            preset={hub.preset}
            onPreset={hub.pickPreset}
            from={hub.from}
            to={hub.to}
            onFromChange={hub.onFromChange}
            onToChange={hub.onToChange}
            product={hub.product}
            productOptions={kiritishProductOptions}
            onProductChange={hub.setProduct}
            actions={
              <button
                type="button"
                className="btn-secondary !h-9 !py-0 !px-3.5 !text-xs !font-bold flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/30 shrink-0"
                onClick={() => exportKiritishExcel(ichdxTab === 'pending' ? filteredPending : filteredSent)}
                disabled={(ichdxTab === 'pending' ? filteredPending : filteredSent).length === 0}
                title="Kiritish xizmat xatlarini Excel (.xlsx) fayliga yuklash"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Excel yuklash</span>
              </button>
            }
          />
          <div className="thub__board">
            {loading ? (
              <div className="thub-empty">Yuklanmoqda…</div>
            ) : ichdxTab === 'pending' ? (
              pendingRailwayIntakes.length === 0 ? (
                <div className="thub-empty">
                  <p className="thub-empty__title">Kutilayotgan partiya yo‘q</p>
                  <p className="thub-empty__text">Temir yo‘l vagon kiritgach, shu yerda paydo bo‘ladi.</p>
                </div>
              ) : filteredPending.length === 0 ? (
                <div className="thub-empty">
                  <p className="thub-empty__title">Mos partiya yo‘q</p>
                  <p className="thub-empty__text">Qidiruv yoki davrni o‘zgartiring.</p>
                </div>
              ) : (
                renderRailwayStylePartyTable(filteredPending, 0, false, false)
              )
            ) : processArrivals.length === 0 ? (
              <div className="thub-empty">
                <p className="thub-empty__title">Yuborilgan xabarnoma yo‘q</p>
                <p className="thub-empty__text">Kutilmoqdadan partiya tanlab sexlarga yuboring.</p>
              </div>
            ) : filteredSent.length === 0 ? (
                <div className="thub-empty">
                  <p className="thub-empty__title">Mos partiya yo‘q</p>
                  <p className="thub-empty__text">Qidiruv yoki davrni o‘zgartiring.</p>
                </div>
              ) : (
                renderRailwayStylePartyTable(pagedSent.slice, pagedSent.startIndex, false, false)
              )}
          </div>
          {ichdxTab === 'sent' ? (
            <DocsHubPagination
              total={filteredSent.length}
              page={pagedSent.page}
              pageSize={hub.pageSize}
              onPageChange={hub.setPage}
              onPageSizeChange={hub.setPageSize}
              unitLabel="kiritish xati"
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {menuGateCheck ? null : (
            <DocsHubToolbar
              search={hub.search}
              onSearchChange={hub.setSearch}
              searchPlaceholder="Partiya, vagon yoki kirish hujjati №…"
              preset={hub.preset}
              onPreset={hub.pickPreset}
              from={hub.from}
              to={hub.to}
              onFromChange={hub.onFromChange}
              onToChange={hub.onToChange}
              product={hub.product}
              productOptions={kiritishProductOptions}
              onProductChange={hub.setProduct}
            />
          )}

          {loading ? (
            <div className="thub-empty">Yuklanmoqda…</div>
          ) : recipientList.length === 0 ? (
            <div className="thub-empty">
              <p className="thub-empty__title">
                {menuGateCheck ? 'Tekshiruvga partiya yo‘q' : (isPermit || isSecurity) ? 'Tekshirilgan kiritish xati yo‘q' : 'Hali xabarnoma kelmagan'}
              </p>
              <p className="thub-empty__text">
                {menuGateCheck
                  ? 'ICHDX smena boshlig‘i tasdiqlagach, partiya shu yerda ochiladi.'
                  : (isPermit || isSecurity)
                    ? 'Ruxsatnoma byurosi va Qo‘riqlash xizmati tekshirgach, xat shu yerga tushadi.'
                    : 'ICHDX xabarnoma yuborgach, partiya shu yerda ochiladi.'}
              </p>
            </div>
          ) : filteredInbox.length === 0 ? (
            <div className="thub-empty">
              <p className="thub-empty__title">Mos partiya yo‘q</p>
              <p className="thub-empty__text">Qidiruv yoki davrni o‘zgartiring.</p>
            </div>
          ) : menuGateCheck ? (
            renderRailwayStylePartyTable(filteredInbox, 0, true, false)
          ) : (
            renderPartyDocsTable(pagedInbox.slice, 'inbox', pagedInbox.startIndex)
          )}
          {menuGateCheck ? null : (
            <DocsHubPagination
              total={filteredInbox.length}
              page={pagedInbox.page}
              pageSize={hub.pageSize}
              onPageChange={hub.setPage}
              onPageSizeChange={hub.setPageSize}
              unitLabel="kiritish xati"
            />
          )}
        </div>
      )}

      {(isRailway || (isAdmin && railwayWork !== null)) && !menuEntryLetters && !menuDefectArchive ? (
      <section className="space-y-3">
        {railwayWork && railwayWork !== 'defectActs' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="admin-dash-section-title">
            {activeWork?.title ?? 'Vagonlar'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {railwayWork === 'toKengsoy' && availableKengsoyArrivals.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="kengsoy-party-filter" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                  Jarayon:
                </label>
                <select
                  id="kengsoy-party-filter"
                  value={selectedKengsoyArrivalId || ''}
                  onChange={e => setSelectedKengsoyArrivalId(e.target.value || null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Barcha jarayonlar ({availableKengsoyArrivals.length})</option>
                  {availableKengsoyArrivals.map(({ arrival: a, regCount, wagonCount }) => (
                    <option key={a.id} value={a.id}>
                      № {a.arrivalNumber} ({toLatinProductName(a.productType) || 'Yuk'}) — {regCount} ta yuk xati ({wagonCount} vagon)
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="admin-role-badge admin-role-badge--blue">
              {railwayWork === 'toKengsoy'
                ? `${kengsoyReady.length} ta yuk xati · ${totalWagons} vagon`
                : `${tableArrivals.length} ta · ${totalWagons} vagon`}
            </span>
          </div>
        </div>
        ) : null}

        {railwayWork === 'toKengsoy' && selectedKengsoyArrivalId ? (
          <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50/80 px-3.5 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            <div className="flex items-center gap-2 font-medium">
              <TrainFront className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>
                Tanlangan jarayon: <strong>№ {availableKengsoyArrivals.find(item => item.arrival.id.toLowerCase() === selectedKengsoyArrivalId.toLowerCase() || item.arrival.arrivalNumber.toLowerCase() === selectedKengsoyArrivalId.toLowerCase())?.arrival.arrivalNumber || selectedKengsoyArrivalId}</strong>
                {` (${kengsoyReady.length} ta yuk xati, ${totalWagons} vagon)`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedKengsoyArrivalId(null)}
              className="font-bold text-sky-700 hover:underline dark:text-sky-300"
            >
              Barcha jarayonlarni ko‘rsatish
            </button>
          </div>
        ) : null}

        {railwayWork === 'toKengsoy' ? (
          <div className="space-y-3">
            {loading ? (
              <div className="ui-card p-10 text-center text-sm text-gray-500 dark:text-slate-400">Yuklanmoqda...</div>
            ) : kengsoyReady.length === 0 ? (
              <div className="ui-card p-10 text-center space-y-2">
                <TrainFront className="w-10 h-10 mx-auto text-gray-300 dark:text-slate-600" strokeWidth={1.5} />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {selectedKengsoyArrivalId
                    ? 'Ushbu jarayon bo‘yicha Kengsoygacha tayyor yuk xati topilmadi'
                    : 'Vagonlarni olib chiqish uchun vagon yo‘q'}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedKengsoyArrivalId ? (
                    <button
                      type="button"
                      onClick={() => setSelectedKengsoyArrivalId(null)}
                      className="text-sky-600 hover:underline font-semibold"
                    >
                      Barcha jarayonlarni ko‘rsatish
                    </button>
                  ) : (
                    'Yuk xati kelishuvi yakunlangach shu yerda chiqadi'
                  )}
                </p>
              </div>
            ) : (
              <div className="thub-table-wrap reestr-table-wrap">
                <table className="thub-table reestr-table docs-hub-table registry-archive-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Yuk xati raqami</th>
                      <th>Jarayon (Hujjat raqami)</th>
                      <th>Sana / vaqt</th>
                      <th>Vagon soni</th>
                      <th>Mahsulot</th>
                      <th>Holat</th>
                      <th>Hujjat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kengsoyReady.map((r, idx) => {
                      const arrival = arrivals.find(a =>
                        a.id.toLowerCase() === (r.emptyWagonArrivalId || '').toLowerCase()
                        || (r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase() === a.id.toLowerCase())
                      );
                      const productLabel = toLatinProductName(arrival?.productType || r.productType) || arrival?.productType || r.productType || 'Suyultirilgan gaz';
                      const dateLabel = formatDateTimeDisplay(r.preparedAt || arrival?.createdAt);
                      const wagonCountLabel = `${r.wagonCount || r.orderDeductedWagons || arrival?.wagonCount || 0} ta`;

                      return (
                        <tr
                          key={r.id}
                          className="party-row-open-trigger cursor-pointer"
                          onClick={() => setViewedKengsoyRegistryId(r.id)}
                          title="Yuk xati tarkibini to‘liq ko‘rish"
                        >
                          <td className="reestr-num">{idx + 1}</td>
                          <td className="whitespace-nowrap font-mono font-bold text-center">
                            <div className="flex items-center justify-center gap-2 px-2">
                              <span className="font-mono font-bold text-sky-700 dark:text-sky-400">{r.registryNumber || '—'}</span>
                              <span className="party-row-open-indicator" aria-hidden="true">
                                <ChevronDown className="h-4 w-4 -rotate-90" strokeWidth={2.25} />
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap text-center">
                            {arrival ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedKengsoyArrivalId(arrival.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-xs font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 transition"
                                title="Faqat ushbu jarayondagi yuk xatlarini ko‘rish"
                              >
                                № {arrival.arrivalNumber}
                              </button>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap tabular-nums">{dateLabel}</td>
                          <td>{wagonCountLabel}</td>
                          <td>{productLabel}</td>
                          <td>
                            <b className="inline-flex max-w-full truncate rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-sm font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                              Chiqish rasmiylashtirilmoqda
                            </b>
                          </td>
                          <td onClick={event => event.stopPropagation()}>
                            {renderRegistryDocument(r)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : isRailway && railwayWork === 'defectActs' ? (
          <div className="space-y-3">
            {loading ? (
              <div className="ui-card p-10 text-center text-sm text-gray-500 dark:text-slate-400">Yuklanmoqda...</div>
            ) : visibleDefectRows.length === 0 ? (
              <div className="ui-card p-10 text-center space-y-3">
                <FileCheck className="mx-auto h-10 w-10 text-rose-300 dark:text-rose-500/70" strokeWidth={1.5} />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {menuDefectArchive ? 'Dalolatnoma yo‘q' : 'Dalolatnoma tuziladigan vagon yo‘q'}
                </p>
                <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {menuDefectArchive
                    ? 'QR kodli tayyor dalolatnoma hozircha yo‘q.'
                    : 'Nomuvofiqlik aniqlangan vagonlar shu yerda paydo bo‘ladi.'}
                </p>
              </div>
            ) : (
              <>
                {visibleDefectRows.length === 0 ? (
                  <div className="thub-empty">
                    <p className="thub-empty__title">Mos dalolatnoma yo‘q</p>
                    <p className="thub-empty__text">Qidiruv yoki davrni o‘zgartiring.</p>
                  </div>
                ) : (
                  <div className="thub reestr">
                    <div className="thub-table-wrap reestr-table-wrap">
                      <table className="thub-table reestr-table docs-hub-table registry-archive-table defect-archive-table">
                        <thead>
                          <tr>
                            <th>№</th>
                            <th>Hujjat raqami</th>
                            <th>Vagon</th>
                            <th>Sana / vaqt</th>
                            <th>Vagon turi</th>
                            <th>Mahsulot</th>
                            <th>Nomuvofiqlik</th>
                            <th>{menuDefectArchive ? 'Hujjat' : 'Amallar'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedDefects.slice.map((row, i) => {
                            const idx = pagedDefects.startIndex + i;
                            const kind = isWagonKind(row.unit.wagonType) ? WAGON_KIND_LABEL[row.unit.wagonType] : (row.unit.wagonType || '—');
                            const dateLabel = formatDateTimeDisplay(
                              row.unit.defectActUploadedAt || row.arrival.createdAt,
                            );
                            const actNo = row.unit.defectActNumber?.trim();
                            return (
                              <tr key={row.unit.id}>
                                <td className="reestr-num">{idx + 1}</td>
                                <td className="whitespace-nowrap font-mono font-bold text-sky-800 dark:text-sky-300">
                                  {actNo ? (
                                    <button
                                      type="button"
                                      onClick={() => openDefectAct(row.arrival, row.unit)}
                                      className="hover:underline inline-flex items-center gap-1.5 text-[13px]"
                                      title="Dalolatnomani ko‘rish"
                                    >
                                      <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                                      <span>№ {actNo}</span>
                                    </button>
                                  ) : '—'}
                                </td>
                                <td className="whitespace-nowrap font-mono font-bold">{row.unit.wagonNumber}</td>
                                <td>{dateLabel}</td>
                                <td>{kind}</td>
                                <td>{row.unit.productType?.trim() || row.arrival.productType?.trim() || '—'}</td>
                                <td>{row.unit.loadingComment?.trim() || 'Nomuvofiqlik aniqlangan'}</td>
                                <td>
                                  {menuDefectArchive ? (
                                    <DocumentChipButton
                                      title={row.unit.defectActNumber || 'Dalolatnomani ko‘rish'}
                                      onClick={() => openDefectAct(row.arrival, row.unit)}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="table-row-ctrl table-row-ctrl--primary"
                                      onClick={() => openDefectAct(row.arrival, row.unit)}
                                    >
                                      <FileCheck className="h-3.5 w-3.5" />
                                      Dalolatnoma tuzish
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <DocsHubPagination
                  total={visibleDefectRows.length}
                  page={pagedDefects.page}
                  pageSize={hub.pageSize}
                  onPageChange={hub.setPage}
                  onPageSizeChange={hub.setPageSize}
                  unitLabel="dalolatnoma"
                />
              </>
            )}
          </div>
        ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="ui-card p-10 text-center text-sm text-gray-500 dark:text-slate-400">Yuklanmoqda...</div>
          ) : tableArrivals.length === 0 ? (
            <div className="ui-card p-10 text-center space-y-3">
              {isRailway && railwayWork === 'toSecurity' ? (
                <ArrowDownToLine className="w-10 h-10 mx-auto text-sky-400 dark:text-sky-500" strokeWidth={1.5} />
              ) : (
                <Bell className="w-10 h-10 mx-auto text-gray-300 dark:text-slate-600" strokeWidth={1.5} />
              )}
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                {isRailway
                  ? railwayWork === 'toSecurity'
                    ? 'Vagonlarni kiritish uchun vagon yo‘q'
                    : railwayWork === 'toEstakada'
                      ? 'Estakadaga qo‘yish uchun vagon yo‘q'
                      : 'Hozircha vagon yo‘q — «Bo‘sh vagonni tanlash» bilan boshlang'
                  : "Hozircha xabarnoma yo'q"}
              </p>
              {isRailway && railwayWork === 'toSecurity' ? (
                <>
                  <p className="mx-auto max-w-xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Oldingi partiya Qo‘riqlash tomonidan tasdiqlanib zavod hududiga kiritilgan. Yangi bo‘sh vagon partiyasini shu yerdan boshlashingiz mumkin.
                  </p>
                  <button
                    type="button"
                    className="btn-primary mx-auto"
                    onClick={() => setIntakeOpen(true)}
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                    Yangi bo‘sh vagon partiyasini tanlash
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="railway-intake-table overflow-hidden rounded-lg border border-slate-300 bg-white text-[14px] shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
              {partyTableHeaderNoActions}
              {tableArrivals.map((item, arrivalIdx) => {
                const open = expandedArrivalId === item.id;
                const rows = rowsFromArrival(item);
                const byKind = groupRowsByKind(rows);
                const dateLabel = formatDateTimeDisplay(item.entryPermitShiftApprovedAt || item.entryPermitPermitApprovedAt || item.arrivalDate || item.createdAt);
                const stageLabel = partyDisplayStatus(item);

                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden border-b border-slate-200 transition last:border-b-0 dark:border-slate-700 ${
                      open
                        ? 'bg-sky-50/40 dark:bg-slate-900/45'
                        : 'bg-white dark:bg-slate-900'
                    } hover:bg-sky-50/45 dark:hover:bg-slate-800/70`}
                  >
                    <div className={`grid grid-cols-1 transition-colors ${partyIntakeGridColsNoActions} lg:items-stretch`}>
                      <button
                        type="button"
                        className="party-row-open-trigger contents text-left"
                        onClick={() => openPartyView(item.id)}
                        aria-haspopup="dialog"
                        title="Partiya tarkibini to‘liq ko‘rish"
                      >
                        <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">
                          {arrivalIdx + 1}
                        </span>
                        <div className="party-cell-with-indicator border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                          <span className="min-w-0 font-mono text-sm font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">{item.arrivalNumber}</span>
                          <span className="party-row-open-indicator" aria-hidden="true">
                            <ChevronDown className="h-4 w-4 -rotate-90" strokeWidth={2.25} />
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-sm tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {dateLabel}
                        </div>
                        <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">{partyWagonCountDisplay(item, rows)}</p>
                        </div>
                        <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          <PartyProductsSummary rows={rows} activeProduct={hub.product} />
                        </div>
                        <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          <PartyWagonKindsSummary rows={rows} />
                        </div>
                        <div className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                          <span className={`inline-flex rounded-lg border px-2 py-1 text-[14px] font-semibold whitespace-nowrap ${partyStatusClass(item, stageLabel)}`}>{stageLabel}</span>
                        </div>
                      </button>
                      <div className="flex min-w-0 items-center justify-center px-2 py-2" onClick={e => e.stopPropagation()}>
                        {renderPartyDocument(item)}
                      </div>
                    </div>

                    {false && open ? (
                      <div className="space-y-2.5 border-t border-sky-200/80 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/30">
                        {(() => {
                          const issue = latestIntakeReturnNote(item.notes);
                          if (!issue || getStage(item) !== STAGES.KengsoyInspection) return null;
                          const fromTare = !!latestTareIssueNote(item.notes);
                          return (
                            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" strokeWidth={2} />
                              <div className="min-w-0">
                                <p className="font-semibold text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                  {fromTare ? 'Taradan qaytarilgan' : 'Qo‘riqlashdan qaytarilgan'}
                                </p>
                                <p className="mt-0.5 text-sm leading-snug">{issue}</p>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-2 px-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-sky-500" strokeWidth={1.75} />
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Vagon turlari bo‘yicha
                          </p>
                          <span className="ml-auto text-[11px] tabular-nums text-slate-400">
                            Jami {rows.length} ta
                          </span>
                        </div>

                        {KIND_ORDER.map(kind => {
                          const kindRows = byKind.get(kind) ?? [];
                          if (kindRows.length === 0) return null;
                          const sectionKey = `${item.id}:${kind}`;
                          const collapsed = !!listCollapsed[sectionKey];
                          return (
                            <div
                              key={kind}
                              className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/45 shadow-sm dark:border-slate-700/90 dark:bg-slate-900/65 dark:shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
                            >
                              <button
                                type="button"
                                onClick={() => toggleListSection(sectionKey)}
                                className="flex w-full items-center gap-2.5 border-b border-transparent bg-gradient-to-r from-sky-100/90 via-blue-50/90 to-slate-50 px-3 py-2 text-left transition hover:from-sky-200/90 hover:via-sky-100 hover:to-blue-50 dark:border-slate-700/70 dark:from-slate-800 dark:via-slate-800/95 dark:to-slate-900 dark:hover:from-slate-700 dark:hover:via-slate-800 dark:hover:to-slate-800"
                              >
                                <div className="flex w-14 shrink-0 items-center justify-center">
                                  <WagonKindArt kind={kind} className="h-8 w-full" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                                    {WAGON_KIND_LABEL[kind]}
                                  </p>
                                  <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">{WAGON_KIND_SUBTITLE[kind]} · {kindRows.length} ta</p>
                                </div>
                                <ChevronDown
                                  className={`w-4 h-4 text-slate-400 transition ${collapsed ? '-rotate-90' : ''}`}
                                  strokeWidth={1.75}
                                />
                              </button>

                              {!collapsed ? (
                                kind === 'platform' ? (
                                  <div className="grid grid-cols-[repeat(auto-fill,minmax(265px,1fr))] gap-1.5 px-3 pb-2 pt-0.5">
                                    {kindRows.map((row, idx) => {
                                      const containers = parseContainers(row.cisternNumber);
                                      return (
                                        <div
                                          key={`${row.id || row.wagonNumber}-${idx}`}
                                          className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/60 dark:shadow-none dark:hover:border-slate-500 dark:hover:bg-slate-800"
                                        >
                                          <div className="flex items-center gap-2 border-b border-slate-100 pb-1 dark:border-slate-800">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-100 text-[9px] font-bold tabular-nums text-sky-700 dark:bg-slate-800 dark:text-slate-300">{idx + 1}</span>
                                            <span className="min-w-0 truncate text-[15px] font-bold tabular-nums tracking-wider text-slate-900 dark:text-slate-50">{row.wagonNumber}</span>
                                            <span className="ml-auto shrink-0"><OwnershipChip ownership={row.ownership} /></span>
                                          </div>
                                          <div className="mt-1 flex min-w-0 items-center gap-2">
                                            <div className="flex shrink-0 items-center"><LoadStateChip value={row.intakeLoadState} /></div>
                                            <div className="flex min-w-0 flex-1 items-start gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 dark:bg-slate-800/75">
                                            <Package className="h-3 w-3 shrink-0 text-violet-500 dark:text-slate-400" strokeWidth={2} />
                                            <p className="text-[11px] font-semibold leading-tight text-violet-700 dark:text-slate-200">{row.productType?.trim() || 'Tanlanmagan'}</p>
                                            </div>
                                          </div>
                                          {containers.length > 0 ? (
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                              <span className="mr-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Konteyner:</span>
                                              {containers.map(code => (
                                                <span
                                                  key={code}
                                                  className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-sky-800 ring-1 ring-inset ring-sky-200/80 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                                                >
                                                  {code}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="mt-2 text-[10px] text-slate-400 italic">
                                              Konteyner kiritilmagan
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-1.5 px-3 pb-2 pt-0.5">
                                    {kindRows.map((row, idx) => (
                                      <div
                                        key={`${row.id || row.wagonNumber}-${idx}`}
                                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800/60 dark:shadow-none dark:hover:border-slate-500 dark:hover:bg-slate-800"
                                      >
                                        <div className="flex items-center gap-2 border-b border-slate-100 pb-1 dark:border-slate-800">
                                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-100 text-[9px] font-bold tabular-nums text-sky-700 dark:bg-slate-800 dark:text-slate-300">{idx + 1}</span>
                                          <span className="min-w-0 truncate text-[15px] font-bold tabular-nums tracking-wider text-slate-900 dark:text-slate-50">{row.wagonNumber}</span>
                                          <span className="ml-auto shrink-0"><OwnershipChip ownership={row.ownership} /></span>
                                        </div>
                                        <div className="mt-1 flex min-w-0 items-center gap-2">
                                          <div className="flex shrink-0 items-center"><LoadStateChip value={row.intakeLoadState} /></div>
                                          <div className="flex min-w-0 flex-1 items-start gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 dark:bg-slate-800/75">
                                          <Package className="h-3 w-3 shrink-0 text-violet-500 dark:text-slate-400" strokeWidth={2} />
                                          <p className="text-[11px] font-semibold leading-tight text-violet-700 dark:text-slate-200" title={row.productType?.trim() || 'Tanlanmagan'}>
                                            {row.productType?.trim() || 'Tanlanmagan'}
                                          </p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              ) : null}
                            </div>
                          );
                        })}

                        {(byKind.get('unknown') ?? []).length > 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-950/30">
                            <p className="text-xs font-medium text-slate-500 mb-2">Turi noma’lum</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(byKind.get('unknown') ?? []).map(row => (
                                <span
                                  key={row.wagonNumber}
                                  className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[13px] font-medium tabular-nums dark:border-slate-600 dark:bg-slate-800"
                                >
                                  {row.wagonNumber}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
        )}
      </section>
      ) : null}


      <EmptyWagonIntakeDialog
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        onSaved={async () => { await load(true); }}
        arrivals={arrivals}
      />

      <EditPartyWagonsDialog
        open={!!editPartyArrival}
        arrival={editPartyArrival}
        arrivals={arrivals}
        restrictToExisting={editPartyArrival ? isSecurityReturned(editPartyArrival) : false}
        onClose={() => setEditPartyArrival(null)}
        onSaved={() => load(true)}
      />

      <SecurityInspectionDialog
        open={!!securityTarget}
        arrival={securityTarget}
        onClose={() => setSecurityTarget(null)}
        onDone={() => {
          if (securityTarget) setExpandedArrivalId(securityTarget.id);
          load(true);
        }}
      />

      <WagonEntryPermitView
        arrival={entryPermitTarget}
        onClose={closeEntryPermit}
      />

      {defectActDialog}

      {renderYukXatiPreviewModal()}

      {dispatchConfirmDialog}

      <ConfirmDialog
        open={!!permitConfirmTarget}
        title="Ruxsatnoma kelishuvi"
        message={
          permitConfirmTarget
            ? `"${permitConfirmTarget.arrivalNumber}" partiyasi (${permitConfirmTarget.wagonCount} ta vagon) uchun kelishishni tasdiqlaysizmi?`
            : ''
        }
        confirmLabel="Ro‘yxatga olindi"
        cancelLabel="Bekor qilish"
        loading={Boolean(permitConfirmTarget && stageUpdatingId === permitConfirmTarget.id)}
        onConfirm={() => {
          if (permitConfirmTarget) void handleEntryPermitApprove(permitConfirmTarget);
        }}
        onCancel={() => {
          if (stageUpdatingId) return;
          setPermitConfirmTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Partiyani o'chirish"
        message={deleting ? `"${deleting.arrivalNumber}" partiyasi (${deleting.wagonCount} ta vagon) o'chirilsinmi?` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        loading={deleteLoading}
        error={error || undefined}
        onConfirm={() => { void handleDelete(); }}
        onCancel={() => {
          if (deleteLoading) return;
          setDeleteId(null);
          setError('');
        }}
      />

      {kengsoyExitDialog}
      {railwayAdmitDialog}
    </div>
  );
}

export default EmptyWagonsPage;
