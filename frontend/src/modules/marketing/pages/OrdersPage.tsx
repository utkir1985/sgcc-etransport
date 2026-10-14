import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Clock3, FileDown, History, MessageSquareText, Paperclip, Pencil, PencilLine, Plus, Save, Send, CheckCircle2, Trash2 } from 'lucide-react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import { api } from '../../../shared/services/api';
import { MonthlyOrder, MonthlyOrderLineInput, Contractor, CatalogProduct, OrderAttachment } from '../../../shared/types';
import {
  entriesFromProductNames,
  getProductLabel,
  getTableConfig,
  getTableHeaders,
  isWagonPlanOrder,
  RAILWAY_PRODUCT_TYPE_WIDTH_LABEL,
} from '../../../shared/constants/productTypes';
import {
  logisticsFromRoute,
  LOGISTICS_LABELS,
  LOGISTICS_TYPES,
  type LogisticsType,
} from '../../../shared/constants/logisticsTypes';
import { formatOrderPeriod, MONTH_NAMES_UZ } from '../utils/orderTable';
import { OrderPeriodPicker } from '../../../shared/components/OrderPeriodPicker';
import { ContractorSelect } from '../../../shared/components/ContractorSelect';
import { StationSelect } from '../../../shared/components/StationSelect';
import { OrderQtyNumberInput } from '../../../shared/components/OrderQtyNumberInput';
import {
  getDeletedContractorIds,
  getStoredContractors,
  isRogueContractor,
  saveStoredContractors,
} from '../../../shared/constants/railwayContractors';
import { notifyOrdersChanged, subscribeOrdersChanged, startAutoRefresh } from '../../../shared/utils/realtimeSync';
import { ORDER_QUANTITY_UNITS } from '../../../shared/constants/orderQuantityUnits';
import { calcTonsFromUnits } from '../../../shared/constants/orderTons';
import { isLineEditable } from '../../../shared/constants/lineAccountingStatuses';
import {
  lineTonCount,
  summarizeOrderQuantities,
} from '../../../shared/utils/orderQuantity';
import { OrderSheetView } from '../../../shared/components/OrderSheetView';
import { OrderAccountingSheet } from '../../../shared/components/OrderAccountingSheet';
import { OrderFulfillmentStatus } from '../../../shared/components/OrderFulfillmentStatus';
import { OrderSheetMenu, type OrderSheetMenuItem } from '../../../shared/components/OrderSheetMenu';
import { OrderAttachmentsModal } from '../../../shared/components/OrderAttachmentsModal';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { downloadOrderPdf } from '../../../shared/utils/orderSheetPrint';
import { isProductOrderPrintReady } from '../../../shared/components/ProductOrderDocument';
import { PRINT_LOCKED_TITLE } from '../../../shared/utils/documentPrintGuard';
import { MarketingOrdersHome } from '../../../shared/components/MarketingOrdersHome';
import { ProductTypeFilter } from '../../../shared/components/ProductTypeFilter';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { OrderList } from '../../../shared/components/OrderListRow';
import { ORDER_STATUS_LABELS } from '../../../shared/constants/orderStatuses';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { FileSpreadsheet } from 'lucide-react';
import { filterAgreedOrderLines } from '../../../shared/utils/orderApprovals';
import { listMarketingOrdersForPeriod } from '../../../shared/utils/marketingOrderSelection';
import { OrderFilterPlaceholder } from '../../../shared/components/OrderFilterPlaceholder';
import { isOrderFaol, isOrderTasdiqlanayotgan, isOrderYakunlangan } from '../../../shared/utils/dashboardOverview';
import { parseOrderListView, type OrderListView } from '../../../shared/utils/menuNav';
import { defaultYearMonthFromRange, formatDateTimeDisplay, formatDateUz, formatPeriodRangeLabel, matchesPeriodRange } from '../../../shared/utils/dates';
import { DatePicker } from '../../../shared/components/DatePicker';

const EMPTY_LINE = (): MonthlyOrderLineInput => ({
  sortOrder: 0,
  contractor: '',
  wagonCount: 0,
  tonCount: 0,
  quantityUnit: ORDER_QUANTITY_UNITS.Wagon,
  wagonNumbers: '',
  destinationStation: '',
  contractNumber: '',
  productGrade: '',
});

function reindexLines(lines: MonthlyOrderLineInput[]): MonthlyOrderLineInput[] {
  return lines.map((l, i) => ({ ...l, sortOrder: i + 1 }));
}

function getOrderSheetHeaderClass(header: string): string | undefined {
  if (header === 'Yuklash oxirgi sanasi') return 'order-sheet-date-col';
  if (header === 'Shartnoma raqami') return 'order-sheet-contract-col';
  if (header === 'Markasi') return 'order-sheet-grade-col';
  return undefined;
}

function defaultOrderDeadline(year: number, month: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const SHGKM_POLYETHYLENE_GRADES = [
  'B-Y250',
  'F-Y346',
  'F-0120',
  'F-0220',
  'F-0320',
  'I-0760',
  'I-1561',
  'J-2210',
  'P-Y342',
  'P-Y456',
  'FS-500',
] as const;

function validateOrderDraft(
  header: { orderNumber: string; contractNumber: string; productType: string },
  lines: MonthlyOrderLineInput[],
  lineFilter?: (line: MonthlyOrderLineInput) => boolean,
): string | null {
  const isBlankOrder = /zaxira|bo['‘ʼ`]?sh|favqulodda/i.test(header.contractNumber);
  // Zaxira (bo‘sh) buyurtmaga raqamni tizim o‘zi beradi
  if (!isBlankOrder && !header.orderNumber.trim()) return 'Buyurtma raqamini kiriting';
  if (!header.productType.trim()) return 'Mahsulot turini tanlang';

  const targetLines = lineFilter ? lines.filter(lineFilter) : lines;
  if (targetLines.length === 0) return 'Kamida bitta qator qo\'shing';

  for (let i = 0; i < targetLines.length; i += 1) {
    const line = targetLines[i];
    const rowNumber = lines.indexOf(line) + 1;
    if (!line.contractor?.trim()) return `${rowNumber}-qator: korxonani tanlang`;

    // Tonna majburiy (oddiy buyurtmada > 0 shart, bo'sh/zaxirada 0 bo'lishi mumkin)
    if (!isBlankOrder && (!line.tonCount || line.tonCount <= 0)) {
      return `${rowNumber}-qator: mahsulot og‘irligi (tonna) kiritilishi shart (0 dan katta bo‘lishi kerak)`;
    }

    // Shartnoma majburiy (eski buyurtmada sarlavhadagisi yetarli, zaxirada shart emas).
    if (!isBlankOrder && !header.contractNumber.trim() && !line.contractNumber?.trim()) {
      return `${rowNumber}-qator: shartnoma raqamini kiriting`;
    }

    // Marka, stansiya va yuklash muddati — ixtiyoriy.
    // Stansiya ko‘rsatilmasa, u yuk xati tuzilganda tanlanadi.
  }

  return null;
}

function MarketingOrdersPanel({
  logisticsType,
  canCreate,
  canUpdate,
  canDelete,
  canApproveDeputy,
  canApproveDispatch,
  canReviewAccounting,
  currentUserName: _currentUserName,
  onToolbarChange,
  hubMode,
  defaultListView = 'all',
}: {
  logisticsType: LogisticsType;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApproveDeputy: boolean;
  canApproveDispatch: boolean;
  canReviewAccounting: boolean;
  currentUserName?: string;
  onToolbarChange?: (toolbar: ReactNode) => void;
  hubMode: boolean;
  defaultListView?: OrderListView;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const role = user?.role;
  const listView: OrderListView = parseOrderListView(searchParams.get('view')) ?? defaultListView;
  const now = new Date();
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [filterProductType, setFilterProductType] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editComment, setEditComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MonthlyOrder | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const editFormRef = useRef<HTMLFormElement>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const ignoreOpenQuery = useRef(false);
  const [editHistory, setEditHistory] = useState<Array<{
    id: string;
    editorName: string;
    comment: string;
    changes: string[];
    createdAt: string;
  }>>([]);

  const [header, setHeader] = useState({
    orderNumber: '',
    contractNumber: '',
    productType: '',
    productGrade: '',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    deadline: '',
  });
  const [lines, setLines] = useState<MonthlyOrderLineInput[]>([EMPTY_LINE()]);
  const [contractors, setContractors] = useState<Contractor[]>(() => getStoredContractors());
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<OrderAttachment[]>([]);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);

  // Forma har doim yangi tartibda: vagon soni o‘rnida «Markasi», shartnoma har qatorda.
  const tableHeaders = getTableHeaders(logisticsType, false);
  const tableConfig = getTableConfig(logisticsType);

  const productEntries = useMemo(
    () => {
      const activeProducts = catalogProducts.filter(p => p.isActive);
      const filtered = activeProducts.filter(p => {
        const isCondensate = p.name.toLowerCase().includes('kondensat');
        if (role === 'DispatchSupervisor') return isCondensate;
        if (role === 'Marketing') return !isCondensate;
        return true;
      });
      return entriesFromProductNames(filtered.map(p => p.name));
    },
    [catalogProducts, role],
  );

  const loadCatalogProducts = () => {
    api.getProducts(logisticsType)
      .then(res => setCatalogProducts(res.data ?? []))
      .catch(() => setCatalogProducts([]));
  };

  const loadContractors = () => {
    const deleted = getDeletedContractorIds();
    api.getContractors(logisticsType)
      .then(res => {
        const apiList = (res.data ?? []).filter(
          c => !deleted.includes(c.id) && !deleted.includes(c.name) && !isRogueContractor(c.name),
        );
        const stored = getStoredContractors();
        const merged = [...stored];
        for (const a of apiList) {
          if (!merged.some(m => m.id === a.id || m.name.toLowerCase() === a.name.toLowerCase())) {
            merged.push(a);
          }
        }
        setContractors(merged);
        saveStoredContractors(merged);
      })
      .catch(() => {
        setContractors(getStoredContractors());
      });
  };

  const filtersInitialized = useRef(false);

  const segmentCounts = useMemo(() => {
    let faol = 0;
    let tasdiq = 0;
    let yakun = 0;
    for (const o of orders) {
      if (isOrderFaol(o.status)) faol += 1;
      else if (isOrderTasdiqlanayotgan(o.status)) tasdiq += 1;
      else if (isOrderYakunlangan(o.status)) yakun += 1;
    }
    return { all: orders.length, faol, tasdiq, yakun } as Record<OrderListView, number>;
  }, [orders]);

  const matchingOrders = useMemo(() => {
    const hasViewFilter = Boolean(searchParams.get('view'));
    if (!hubMode && !hasViewFilter) {
      return listMarketingOrdersForPeriod(orders, periodFrom, periodTo, filterProductType);
    }

    const q = searchQuery.trim().toLowerCase();
    let list = orders.filter(o => {
      if (listView === 'all') return true;
      if (listView === 'faol') return isOrderFaol(o.status);
      if (listView === 'tasdiq') return isOrderTasdiqlanayotgan(o.status);
      return isOrderYakunlangan(o.status);
    });

    if (filterProductType) {
      list = list.filter(o => o.productType === filterProductType);
    }

    if (listView === 'yakun' || periodFrom || periodTo) {
      list = list.filter(o => matchesPeriodRange(o.year, o.month, periodFrom, periodTo));
    }

    if (q) {
      list = list.filter(o => {
        const contractors = (o.lines ?? [])
          .map(l => (l.contractor || '').trim())
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const hay = [
          o.orderNumber,
          o.contractNumber,
          o.productType,
          o.productGrade,
          contractors,
          formatOrderPeriod(o.year, o.month),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    if (listView === 'yakun') {
      return [...list].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        if (a.month !== b.month) return b.month - a.month;
        return b.createdAt.localeCompare(a.createdAt);
      });
    }

    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [orders, periodFrom, periodTo, filterProductType, hubMode, listView, searchQuery]);

  const listViewTitle =
    listView === 'all' ? 'Barcha buyurtmalar'
      : listView === 'faol' ? 'Tasdiqlangan buyurtmalar'
      : listView === 'tasdiq' ? 'Jarayondagi buyurtmalar'
        : 'Yakunlangan buyurtmalar';

  const setListView = (view: OrderListView) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', view);
    setSearchParams(next, { replace: true });
    setSearchQuery('');
  };

  const editingOrder = useMemo(() => {
    if (editingOrderId) {
      return orders.find(order => order.id === editingOrderId) ?? null;
    }
    return null;
  }, [editingOrderId, orders]);

  const viewOrder = useMemo(() => {
    if (!viewOrderId || editMode) return null;
    return orders.find(order => order.id === viewOrderId) ?? null;
  }, [viewOrderId, orders, editMode]);


  const quantityTotals = useMemo(() => summarizeOrderQuantities(lines), [lines]);

  const canEditOrderEntity = (order: MonthlyOrder) =>
    canUpdate
    && order.status !== 'Completed'
    && order.status !== 'Cancelled';

  /** Ruxsat bo'lsa — yakunlanmagan buyurtmalarni o'chirish (shu jumladan Tasdiqlangan) */
  const canDeleteOrderEntity = (order: MonthlyOrder) =>
    canDelete
    && order.status !== 'Completed'
    && order.status !== 'Cancelled';

  const canCreateOrder = canCreate && !editMode && !viewOrderId && productEntries.length > 0;

  const getDisplayOrder = (order: MonthlyOrder): MonthlyOrder => {
    if (order.status === 'ReadyForDispatch'
      || order.status === 'PendingDeputyDirector'
      || order.status === 'PendingDispatching'
      || order.status === 'Active') {
      return filterAgreedOrderLines(order);
    }
    return order;
  };

  const load = (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    return api.getOrders(logisticsType)
      .then(res => {
        if (res.data) {
          setOrders(res.data.map(o => ({ ...o, attachments: o.attachments ?? [] })));
          if (!filtersInitialized.current) {
            filtersInitialized.current = true;
          }
        }
      })
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  };

  useEffect(() => {
    setFilterProductType('');
    setEditMode(false);
    setIsNew(false);
    setEditingOrderId(null);
    setViewOrderId(null);
    setSaveError('');
    filtersInitialized.current = false;
  }, [logisticsType]);

  useEffect(() => {
    load();
    loadCatalogProducts();
    loadContractors();

    const unsubscribe = subscribeOrdersChanged(() => {
      load({ silent: true });
      loadContractors();
    });
    const stopPoll = startAutoRefresh(() => {
      load({ silent: true });
    }, 30000);

    return () => {
      unsubscribe();
      stopPoll();
    };
  }, [logisticsType]);

  useEffect(() => {
    if (editMode) loadContractors();
  }, [editMode]);

  const startBlankEmergencyOrder = () => {
    setSaveError('');
    setViewOrderId(null);
    setIsNew(true);
    setEditMode(true);
    setEditingOrderId(null);
    setPendingFiles([]);
    setExistingAttachments([]);
    setAttachmentsModalOpen(false);
    setEditComment('');
    const period = defaultYearMonthFromRange(periodFrom, periodTo);
    const orderStamp = `${period.year}-${String(period.month).padStart(2, '0')}`;
    setHeader({
      orderNumber: '',
      contractNumber: `ZAXIRA-${orderStamp}`,
      productType: filterProductType || productEntries[0]?.productType || '',
      productGrade: '',
      year: period.year,
      month: period.month,
      deadline: defaultOrderDeadline(period.year, period.month),
    });
    setLines([{
      sortOrder: 1,
      contractor: 'Hududgazta\'minot AJ (Zaxira)',
      wagonCount: 0,
      tonCount: 0,
      wagonNumbers: '',
      destinationStation: 'Kengsoy',
      lastLoadingDate: null,
      quantityUnit: 'ton',
    }]);
  };

  const startNew = () => {
    setSaveError('');
    setViewOrderId(null);
    setIsNew(true);
    setEditMode(true);
    setEditingOrderId(null);
    setPendingFiles([]);
    setExistingAttachments([]);
    setAttachmentsModalOpen(false);
    setEditComment('');
    const period = defaultYearMonthFromRange(periodFrom, periodTo);
    setHeader({
      orderNumber: '',
      contractNumber: '',
      productType: filterProductType || productEntries[0]?.productType || '',
      productGrade: '',
      year: period.year,
      month: period.month,
      deadline: defaultOrderDeadline(period.year, period.month),
    });
    setLines([EMPTY_LINE()]);
  };

  const startEditOrder = (order: MonthlyOrder) => {
    setSaveError('');
    setViewOrderId(null);
    setEditingOrderId(order.id);
    setIsNew(false);
    setEditMode(true);
    setPendingFiles([]);
    setExistingAttachments(order.attachments ?? []);
    setAttachmentsModalOpen(false);
    setEditComment('');
    // Eski (vagon rejali) buyurtmada shartnoma va marka sarlavhada qoladi;
    // yangi buyurtmada ular qatorlardan olinadi, shuning uchun sarlavha bo‘sh yuboriladi.
    const legacyHeader = isWagonPlanOrder(order.lines) || /zaxira/i.test(order.contractNumber || '');
    setHeader({
      orderNumber: order.orderNumber,
      contractNumber: legacyHeader ? order.contractNumber : '',
      productType: order.productType,
      productGrade: legacyHeader ? (order.productGrade || '') : '',
      year: order.year,
      month: order.month,
      deadline: order.deadline.slice(0, 10),
    });
    setLines(order.lines.map(l => ({
      id: l.id,
      sortOrder: l.sortOrder,
      contractor: l.contractor,
      wagonCount: l.wagonCount,
      tonCount: l.tonCount ?? 0,
      quantityUnit: l.quantityUnit || ORDER_QUANTITY_UNITS.Wagon,
      wagonNumbers: l.wagonNumbers,
      destinationStation: l.destinationStation,
      lastLoadingDate: l.lastLoadingDate?.slice(0, 10) ?? null,
      contractNumber: l.contractNumber ?? '',
      productGrade: l.productGrade ?? '',
    })));
  };

  const cancelEdit = () => {
    setSaveError('');
    setEditMode(false);
    setIsNew(false);
    setEditingOrderId(null);
    setPendingFiles([]);
    setExistingAttachments([]);
    setAttachmentsModalOpen(false);
    setEditComment('');
  };

  const loadEditHistory = (orderId: string) => {
    api.getOrderEditHistory(orderId).then(res => {
      setEditHistory((res.data ?? []).map(item => {
        try {
          const parsed = JSON.parse(item.details) as { comment?: string; changes?: string[] };
          return {
            ...item,
            comment: parsed.comment || item.details,
            changes: Array.isArray(parsed.changes) ? parsed.changes : [],
          };
        } catch {
          return { ...item, comment: item.details, changes: [] };
        }
      }));
    }).catch(() => setEditHistory([]));
  };

  const openOrderView = (order: MonthlyOrder) => {
    ignoreOpenQuery.current = false;
    setViewOrderId(order.id);
    loadEditHistory(order.id);
  };

  const closeOrderView = () => {
    ignoreOpenQuery.current = true;
    setViewOrderId(null);
    setEditHistory([]);
    const next = new URLSearchParams(searchParams);
    if (next.has('open')) {
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  };

  // Dashboard / deep-link: ?open=<orderId>#order-fulfillment
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) {
      ignoreOpenQuery.current = false;
      return;
    }
    if (ignoreOpenQuery.current) return;
    if (orders.length === 0) return;
    const order = orders.find(o => o.id === openId);
    if (!order) return;
    if (viewOrderId !== openId) {
      openOrderView(order);
    }
  }, [searchParams, orders, viewOrderId]);

  useEffect(() => {
    if (!viewOrderId) return;
    if (window.location.hash !== '#order-fulfillment') return;
    const timer = window.setTimeout(() => {
      document.getElementById('order-fulfillment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [viewOrderId, editHistory.length]);

  const isReturnedEdit = !isNew && editingOrder?.status === 'ReturnedToMarketing';

  const isLineEditableInForm = (line: MonthlyOrderLineInput) => {
    if (isReturnedEdit) {
      const meta = editingOrder?.lines.find(item => item.id === line.id);
      return isLineEditable(meta?.accountingStatus);
    }
    return true;
  };

  const buildOrderPayload = () => ({
    orderNumber: header.orderNumber.trim(),
    contractNumber: header.contractNumber.trim(),
    productType: header.productType,
    productGrade: (header.productGrade || '').trim(),
    deadline: header.deadline.trim() || defaultOrderDeadline(header.year, header.month),
    lines: reindexLines(lines).map(line => ({
      ...line,
      contractor: line.contractor.trim(),
      destinationStation: line.destinationStation.trim(),
      wagonNumbers: line.wagonNumbers?.trim() ?? '',
      lastLoadingDate: line.lastLoadingDate || null,
      contractNumber: line.contractNumber?.trim() ?? '',
      productGrade: line.productGrade?.trim() ?? '',
      id: line.id,
    })),
  });

  const persistOrder = async (): Promise<string | null> => {
    const payload = buildOrderPayload();
    if (isNew) {
      const res = await api.createOrder({
        ...payload,
        logisticsType: logisticsType,
        year: header.year,
        month: header.month,
      });
      return res.data?.id ?? null;
    }
    if (editingOrder) {
      await api.updateOrder(editingOrder.id, { ...payload, editComment: editComment.trim() });
      return editingOrder.id;
    }
    return null;
  };

  const notifyOrdersUpdated = () => {
    notifyOrdersChanged();
  };

  const handleSave = async () => {
    if (!isNew && !editComment.trim()) {
      setSaveError('Tahrirlash sababini izohda yozing');
      return;
    }
    const validationError = validateOrderDraft(
      header,
      lines,
      isReturnedEdit ? isLineEditableInForm : undefined,
    );
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    if (existingAttachments.length + pendingFiles.length === 0) {
      setSaveError('Ilova biriktirish majburiy — kamida bitta fayl qo‘shing');
      setAttachmentsModalOpen(true);
      return;
    }

    setSaveError('');
    setSaving(true);
    try {
      const savedId = await persistOrder();
      if (savedId && pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          await api.uploadOrderAttachment(savedId, file);
        }
      }
      setPendingFiles([]);
      setExistingAttachments([]);
      setEditMode(false);
      setIsNew(false);
      setEditingOrderId(null);
      notifyOrdersUpdated();
      await load();
      if (savedId) {
        setViewOrderId(savedId);
        loadEditHistory(savedId);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const onPickAttachmentFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const next = Array.from(fileList);
    setPendingFiles(prev => [...prev, ...next]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = async (attachmentId: string) => {
    if (!editingOrderId) return;
    setRemovingAttachmentId(attachmentId);
    try {
      await api.deleteOrderAttachment(editingOrderId, attachmentId);
      setExistingAttachments(prev => prev.filter(a => a.id !== attachmentId));
      setOrders(prev => prev.map(o =>
        o.id === editingOrderId
          ? { ...o, attachments: (o.attachments ?? []).filter(a => a.id !== attachmentId) }
          : o,
      ));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ilovani o‘chirib bo‘lmadi');
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  const submitForApproval = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (!(order.attachments?.length)) {
      startEditOrder(order);
      setSaveError('Ilova biriktirish majburiy — kamida bitta fayl qo‘shing');
      setAttachmentsModalOpen(true);
      return;
    }
    setSaveError('');
    setSubmitting(true);
    try {
      await api.submitOrderForApproval(orderId);
      notifyOrdersUpdated();
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Yuborishda xatolik');
    } finally {
      setSubmitting(false);
    }
  };

  const resubmitRejected = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (!(order.attachments?.length)) {
      startEditOrder(order);
      setSaveError('Ilova biriktirish majburiy — kamida bitta fayl qo‘shing');
      setAttachmentsModalOpen(true);
      return;
    }
    setSaveError('');
    setSubmitting(true);
    try {
      await api.resubmitRejectedOrder(orderId);
      notifyOrdersUpdated();
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Yuborishda xatolik');
    } finally {
      setSubmitting(false);
    }
  };

  const approveDeputy = async (orderId: string) => {
    setApprovingId(orderId);
    setSaveError('');
    try {
      await api.approveOrderDeputy(orderId);
      setApproveConfirmOpen(false);
      notifyOrdersUpdated();
      load({ silent: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Tasdiqlashda xatolik');
    } finally {
      setApprovingId(null);
    }
  };

  const approveDispatch = async (orderId: string) => {
    setApprovingId(orderId);
    setSaveError('');
    try {
      await api.approveOrderDispatch(orderId);
      setApproveConfirmOpen(false);
      notifyOrdersUpdated();
      load({ silent: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Qabul qilishda xatolik');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeleteOrder = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const deletedId = deleteTarget.id;
      await api.deleteOrder(deletedId);
      setDeleteTarget(null);
      if (viewOrderId === deletedId) setViewOrderId(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Buyurtmani o\'chirib bo\'lmadi');
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (order: MonthlyOrder) => {
    setDeleteError('');
    setDeleteTarget(order);
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError('');
  };

  const buildOrderMenuItems = (order: MonthlyOrder): OrderSheetMenuItem[] => {
    const items: OrderSheetMenuItem[] = [];

    if (canEditOrderEntity(order)) {
      items.push({
        key: 'edit',
        label: 'Tahrirlash',
        icon: Pencil,
        onClick: () => startEditOrder(order),
      });
    }

    if (canDeleteOrderEntity(order)) {
      items.push({
        key: 'delete',
        label: 'O\'chirish',
        icon: Trash2,
        variant: 'danger',
        disabled: deleting,
        onClick: () => openDeleteDialog(order),
      });
    }

    items.push({
      key: 'pdf',
      label: 'PDF yuklash',
      icon: FileDown,
      disabled: !isProductOrderPrintReady(order),
      title: isProductOrderPrintReady(order) ? 'PDF yuklash' : PRINT_LOCKED_TITLE,
      onClick: () => downloadOrderPdf(order.id),
    });

    return items;
  };

  const renderSignatureFooterActions = (order: MonthlyOrder) => {
    if (canApproveDeputy && order.status === 'PendingDeputyDirector') {
      return (
        <div className="order-sheet-footer-actions">
          <button
            type="button"
            onClick={() => setApproveConfirmOpen(true)}
            disabled={approvingId === order.id}
            className="btn-primary order-sheet-approve-btn"
          >
            {approvingId === order.id ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {approvingId === order.id
              ? 'Tasdiqlanmoqda...'
              : 'Buyurtmani tasdiqlash va ijro uchun yuborish'}
          </button>
        </div>
      );
    }

    if (canApproveDispatch && order.status === 'PendingDispatching') {
      return (
        <div className="order-sheet-footer-actions">
          <button
            type="button"
            onClick={() => setApproveConfirmOpen(true)}
            disabled={approvingId === order.id}
            className="btn-primary order-sheet-approve-btn"
          >
            <CheckCircle2 className="w-4 h-4" />
            {approvingId === order.id ? 'Qabul qilinmoqda...' : 'Ijroga qabul qilish'}
          </button>
        </div>
      );
    }

    if (!canCreate && !canUpdate) return null;

    const isCondensate = order.productType.toLowerCase().includes('kondensat');

    return (
      <div className="order-sheet-footer-actions">
        {order.status === 'Draft' && (
          <button
            type="button"
            onClick={() => submitForApproval(order.id)}
            disabled={submitting}
            className="btn-primary order-sheet-submit-btn"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Yuborilmoqda...' : isCondensate ? 'Direktor o‘rinbosari tasdig‘iga yuborish' : 'Buxgalteriya bilan kelishish'}
          </button>
        )}
        {order.status === 'ReturnedToMarketing' && (
          <button
            type="button"
            onClick={() => resubmitRejected(order.id)}
            disabled={submitting}
            className="btn-primary order-sheet-submit-btn"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Yuborilmoqda...' : isCondensate ? 'Direktor o‘rinbosari tasdig‘iga qayta yuborish' : 'Qayta buxgalteriya kelishuviga yuborish'}
          </button>
        )}
        {order.status === 'PendingAccounting' && (
          <span className="order-sheet-pending-note">Buxgalteriya kelishuvi kutilmoqda</span>
        )}
        {order.status === 'PendingDispatching' && (
          <span className="order-sheet-pending-note">ICHDX ijroga qabulini kutmoqda</span>
        )}
        {order.status === 'ReadyForDispatch' && (
          <span className="order-sheet-pending-note">Bosh direktor o‘rinbosari tasdig‘iga o‘tkazilmoqda…</span>
        )}
        {order.status === 'PendingDeputyDirector' && (
          <span className="order-sheet-pending-note">Bosh direktor o‘rinbosari tasdig‘i kutilmoqda</span>
        )}
      </div>
    );
  };

  const renderOrderSheet = (order: MonthlyOrder) => {
    if (canReviewAccounting && order.status === 'PendingAccounting') {
      return (
        <OrderAccountingSheet
          key={order.id}
          order={order}
          logisticsType={logisticsType}
          menuItems={buildOrderMenuItems(order)}
          onFinalizeReview={async selections => {
            await api.finalizeAccountingReview(order.id, selections);
            notifyOrdersUpdated();
            await load({ silent: true });
          }}
        />
      );
    }

    return (
      <OrderSheetView
        key={order.id}
        order={getDisplayOrder(order)}
        signatureOrder={order}
        logisticsType={logisticsType}
        menuItems={buildOrderMenuItems(order)}
        signatureFooterActions={renderSignatureFooterActions(order)}
      />
    );
  };

  /** Ro'yxatdagi buyurtmalar satrlar darajasida Excelga chiqadi. */
  const exportOrdersExcel = (sectionOrders: MonthlyOrder[]) => {
    exportSheet(`buyurtmalar_${logisticsType}_${todayStamp()}.xlsx`, 'Buyurtmalar', [
      ['Buyurtma raqami', 'Shartnoma', 'Mahsulot', 'Markasi', 'Yil', 'Oy', 'Holat',
       'Kontragent', 'Jo‘natish stansiyasi', 'Reja, vagon', 'Reja, tonna',
       'Bajarilgan, vagon', 'Bajarilgan, tonna'],
      ...sectionOrders.flatMap(order => {
        const status = ORDER_STATUS_LABELS[order.status] || order.status;
        const prodName = order.productGrade ? `${order.productType} (${order.productGrade})` : order.productType || '—';
        const lines = order.lines ?? [];
        if (lines.length === 0) {
          return [[order.orderNumber, order.contractNumber || '—', prodName, order.productGrade || '—',
                   order.year, order.month, status, '—', '—', order.totalWagons ?? 0,
                   order.totalTons ?? 0, 0, 0]];
        }
        return lines.map(line => [
          order.orderNumber,
          line.contractNumber || order.contractNumber || '—',
          prodName,
          line.productGrade || '—',
          order.year,
          order.month,
          status,
          line.contractor || '—',
          line.destinationStation || '—',
          line.wagonCount ?? 0,
          line.tonCount ?? 0,
          line.fulfilledWagonCount ?? 0,
          line.fulfilledNetWeight ?? 0,
        ]);
      }),
    ]);
  };

  const excelAction = (
    <button
      type="button"
      className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
      onClick={() => exportOrdersExcel(matchingOrders)}
      disabled={matchingOrders.length === 0}
      title="Ro‘yxatdagi buyurtmalarni Excel fayliga yuklash"
    >
      <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      <span>Excel yuklash</span>
    </button>
  );

  const renderOrderList = (sectionOrders: MonthlyOrder[]) => (
    <>
      <OrderList
        orders={sectionOrders}
        logisticsType={logisticsType}
        activeOrderId={viewOrderId}
        onSelect={openOrderView}
      />
    </>
  );

  const addLine = () => setLines(prev => reindexLines([...prev, EMPTY_LINE()]));
  const removeLine = (index: number) => setLines(prev => reindexLines(prev.filter((_, i) => i !== index)));
  const updateLine = (index: number, patch: Partial<MonthlyOrderLineInput>) => {
    setLines(prev => reindexLines(prev.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.contractor !== undefined && patch.contractor !== l.contractor) {
        next.destinationStation = '';
      }
      if (patch.wagonCount !== undefined && patch.tonCount === undefined) {
        next.tonCount = calcTonsFromUnits(next.wagonCount, header.productType, logisticsType);
        next.quantityUnit = ORDER_QUANTITY_UNITS.Wagon;
      }
      return next;
    })));
  };

  const renderPeriodPicker = () => (
    <OrderPeriodPicker
      variant="embedded"
      from={periodFrom}
      to={periodTo}
      disabled={editMode}
      onFromChange={setPeriodFrom}
      onToChange={setPeriodTo}
    />
  );

  useEffect(() => {
    onToolbarChange?.(null);
    return () => onToolbarChange?.(null);
  }, [onToolbarChange]);

  const editForm = (
    <form ref={editFormRef} noValidate onSubmit={e => e.preventDefault()} className="space-y-4">
      <div className="order-sheet-card order-sheet-card--edit-form">
        <div className="order-sheet-meta order-sheet-meta--edit">
          <div className="marketing-order-edit-toolbar">
            <ProductTypeFilter
              value={header.productType}
              options={productEntries.map(entry => ({
                value: entry.productType,
                label: entry.title,
              }))}
              onChange={next => {
                setHeader(h => ({ ...h, productType: next }));
                setLines(prev => prev.map(line => {
                  if (line.wagonCount > 0) {
                    return {
                      ...line,
                      tonCount: calcTonsFromUnits(line.wagonCount, next, logisticsType),
                    };
                  }
                  return line;
                }));
              }}
              disabled={!isNew && (editingOrder?.status === 'Active' || Boolean(editingOrder?.approvedAt))}
              allowEmpty={false}
              emptyLabel="Mahsulotni tanlang"
              widthLabel={RAILWAY_PRODUCT_TYPE_WIDTH_LABEL}
              className="marketing-order-product-picker"
            />

            <label className="marketing-order-contract-field">
              <span className="marketing-order-contract-field__label">
                Buyurtma raqami {!/zaxira/i.test(header.contractNumber) && <span className="text-rose-500 font-bold">*</span>}
              </span>
              <input
                value={header.orderNumber}
                onChange={e => setHeader(h => ({ ...h, orderNumber: e.target.value }))}
                className="marketing-order-contract-field__input"
                placeholder={/zaxira/i.test(header.contractNumber) ? 'Avtomatik beriladi' : 'Buyurtma raqami'}
                maxLength={50}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="marketing-order-edit-aside">
            <button
              type="button"
              className={`order-sheet-annex-chip__trigger${
                existingAttachments.length + pendingFiles.length === 0
                  ? ' order-sheet-annex-chip__trigger--required'
                  : ''
              }`}
              disabled={saving}
              onClick={() => setAttachmentsModalOpen(true)}
            >
              <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>
                Ilova <span className="text-rose-500">*</span>
              </span>
              {(existingAttachments.length + pendingFiles.length) > 0 && (
                <span className="order-sheet-annex-chip__count">
                  {existingAttachments.length + pendingFiles.length}
                </span>
              )}
            </button>
            <OrderSheetMenu
              items={[
                {
                  key: 'edit',
                  label: 'Tahrirlash',
                  icon: Pencil,
                  onClick: () => {
                    editFormRef.current?.querySelector<HTMLInputElement>('input')?.focus();
                  },
                },
                {
                  key: 'delete',
                  label: "O'chirish",
                  icon: Trash2,
                  variant: 'danger',
                  disabled: saving || deleting,
                  onClick: () => {
                    if (editingOrder) {
                      openDeleteDialog(editingOrder);
                    } else {
                      cancelEdit();
                    }
                  },
                },
              ]}
            />
          </div>
        </div>
        {isReturnedEdit && (
          <p className="order-sheet-draft-note order-sheet-draft-note--below">
            Faqat qaytarilgan kontragentlar tahrirlanadi
          </p>
        )}
        <datalist id="shgkm-polyethylene-grades">
          {SHGKM_POLYETHYLENE_GRADES.map(grade => (
            <option key={grade} value={grade} />
          ))}
        </datalist>
        <div className="order-sheet-body">
        <div className="order-sheet-table-box">
        <div className="order-sheet-scroll">
          <table className="order-sheet-table order-sheet-table--edit">
            <thead>
              <tr>
                {tableHeaders.map(h => (
                  <th key={h} className={getOrderSheetHeaderClass(h)}>
                    {h}
                    {h === 'Shartnoma raqami' && !/zaxira/i.test(header.contractNumber) && <span className="text-rose-500"> *</span>}
                  </th>
                ))}
                <th className="order-sheet-center order-sheet-deadline-col">Yuklash oxirgi sanasi</th>
                {lines.length > 1 && <th className="order-sheet-actions-col" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const editable = isLineEditableInForm(line);
                return (
                <tr key={line.id ?? idx} className={!editable ? 'order-sheet-row--locked' : undefined}>
                  <td className="order-sheet-num">{idx + 1}</td>
                  <td className="order-sheet-contractor">
                    {editable ? (
                      <ContractorSelect
                        required
                        value={line.contractor}
                        onChange={contractor => updateLine(idx, { contractor })}
                        contractors={contractors}
                        logisticsType={logisticsType}
                        onContractorsChange={loadContractors}
                      />
                    ) : (
                      <span>{line.contractor}</span>
                    )}
                  </td>
                  <td className="order-sheet-center order-sheet-grade-col">
                    {editable ? (
                      <input
                        list="shgkm-polyethylene-grades"
                        value={line.productGrade ?? ''}
                        onChange={e => updateLine(idx, { productGrade: e.target.value })}
                        className="order-sheet-input order-sheet-input--sm"
                        placeholder="Ixtiyoriy"
                        maxLength={100}
                        aria-label="Markasi"
                        autoComplete="off"
                      />
                    ) : (
                      line.productGrade || '—'
                    )}
                  </td>
                  <td className="order-sheet-center order-sheet-qty-col">
                    {editable ? (
                      <OrderQtyNumberInput
                        required
                        value={line.tonCount ?? 0}
                        allowDecimal={true}
                        onChange={tonCount => updateLine(idx, { tonCount })}
                        ariaLabel={tableConfig.tonLabel}
                      />
                    ) : (
                      lineTonCount(line)
                    )}
                  </td>
                  <td className="order-sheet-contract order-sheet-center">
                    {editable ? (
                      <input
                        value={line.contractNumber ?? ''}
                        onChange={e => updateLine(idx, { contractNumber: e.target.value })}
                        className="order-sheet-input order-sheet-input--sm"
                        placeholder="Shartnoma raqami"
                        required={!header.contractNumber.trim()}
                        maxLength={100}
                        aria-label="Shartnoma raqami"
                        autoComplete="off"
                      />
                    ) : (
                      line.contractNumber || '—'
                    )}
                  </td>
                  <td className="order-sheet-destination">
                    {editable ? (
                      <StationSelect
                        value={line.destinationStation}
                        onChange={destinationStation => updateLine(idx, { destinationStation })}
                        contractorName={line.contractor}
                        logisticsType={logisticsType}
                      />
                    ) : (
                      line.destinationStation || '—'
                    )}
                  </td>
                  {(() => {
                    const lineDeadline = line.lastLoadingDate?.slice(0, 10) || '';
                    const isOverdue = lineDeadline ? new Date(lineDeadline).getTime() < new Date().setHours(0, 0, 0, 0) : false;
                    return (
                      <td className="order-sheet-center px-2 py-1">
                        {editable ? (
                          <div className="flex flex-col items-stretch gap-1 min-w-[9.5rem]">
                            <DatePicker
                              variant="compact"
                              value={lineDeadline}
                              onChange={value => updateLine(idx, { lastLoadingDate: value || null })}
                              placeholder="Sanani tanlang"
                            />
                            {isOverdue && (
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                Muddat o‘tgan
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-center">
                            <span className="text-xs font-semibold tabular-nums">{lineDeadline ? formatDateUz(lineDeadline) : '—'}</span>
                            {isOverdue && (
                              <span className="block text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                Muddat o‘tgan
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })()}
                  {lines.length > 1 && (
                    <td className="order-sheet-actions-col">
                      {editable && (
                        <button type="button" onClick={() => removeLine(idx)} className="order-sheet-remove" aria-label="Qatorni o'chirish">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total" />
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{quantityTotals.tonTotal}</td>
                <td colSpan={lines.length > 1 ? 4 : 3} />
              </tr>
            </tbody>
          </table>
        </div>
        </div>
        </div>
      </div>
    </form>
  );

  return (
    <>
      {loading ? (
        <div className="py-12 text-center text-gray-400 dark:text-slate-500">Yuklanmoqda...</div>
      ) : productEntries.length === 0 ? (
        <div className="ui-card p-8 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Mahsulotlar yo&apos;q</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Admin Ma&apos;lumotnomalar → Mahsulotlar bo&apos;limidan qo&apos;shiladi.
          </p>
        </div>
      ) : editMode ? (
        <div className="marketing-order-page space-y-4">
          <div className="marketing-order-page__bar ui-card">
            <div className="marketing-order-page__bar-main">
              <ProductDetailBackButton localOnly onClick={cancelEdit} />
              <div className="min-w-0">
                <h2 className="marketing-order-page__title">
                  {isNew ? 'Yangi buyurtma' : 'Buyurtmani tahrirlash'}
                </h2>
                <p className="marketing-order-page__subtitle">
                  {isNew
                    ? `${header.year}-yil ${MONTH_NAMES_UZ[header.month - 1] || ''} oyi buyurtmasi — Mahsulotni tanlang va korxonalar bo‘yicha og‘irlikni kiriting`
                    : `${editingOrder?.year || header.year}-yil ${MONTH_NAMES_UZ[(editingOrder?.month || header.month) - 1] || ''} oyi buyurtmasi · ${editingOrder?.orderNumber || header.productType}`}
                </p>
              </div>
            </div>
          </div>
          {editForm}
          {!isNew ? (
            <label className="ui-card block p-4">
              <span className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Tahrirlash izohi <span className="text-rose-500">*</span>
              </span>
              <textarea
                className="security-issue-note"
                rows={3}
                value={editComment}
                onChange={event => setEditComment(event.target.value)}
                placeholder="Nima sababdan va qaysi ma’lumotlar o‘zgartirilayotganini yozing"
              />
            </label>
          ) : null}
          <div className="marketing-order-edit-actions">
            {saveError && (
              <p className="order-save-error marketing-order-edit-actions__error" role="alert">{saveError}</p>
            )}
            <div className="marketing-order-edit-actions__row marketing-order-edit-actions__row--end">
              {!isReturnedEdit && (
                <button type="button" onClick={addLine} disabled={saving} className="btn-secondary">
                  <Plus className="w-4 h-4" /> Qator qo&apos;shish
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >
                <Save className="w-4 h-4" /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      ) : viewOrder ? (
        <div className="marketing-order-page space-y-4">
          <div className="marketing-order-page__bar ui-card">
            <div className="marketing-order-page__bar-main">
              <ProductDetailBackButton onClick={closeOrderView} />
              <div className="min-w-0">
                <h2 className="marketing-order-page__title">
                  {getProductLabel(viewOrder.productType, logisticsType)}
                </h2>
                <p className="marketing-order-page__subtitle">{viewOrder.orderNumber}</p>
              </div>
            </div>
          </div>
          {saveError ? (
            <p className="order-save-error" role="alert">{saveError}</p>
          ) : null}
          {renderOrderSheet(viewOrder)}
          {(() => {
            const showFulfillment =
              viewOrder.status === 'Active' || viewOrder.status === 'Completed';
            const showHistory = editHistory.length > 0;
            if (!showFulfillment && !showHistory) return null;
            return (
              <div className="order-detail-split">
                {showHistory ? (
                  <section className="order-edit-history" aria-label="Tahrirlash tarixi">
                    <header className="order-edit-history__head">
                      <span className="order-edit-history__head-icon"><History strokeWidth={1.8} /></span>
                      <div>
                        <h3>Tahrirlash tarixi</h3>
                        <p>Buyurtmaga kiritilgan o‘zgarishlar va izohlar</p>
                      </div>
                      <span className="order-edit-history__count">{editHistory.length} ta o‘zgarish</span>
                    </header>
                    <div className="order-edit-history__timeline">
                      {editHistory.map((item, itemIndex) => (
                        <article key={item.id} className="order-edit-history__entry">
                          <div className="order-edit-history__rail" aria-hidden>
                            <span>{item.editorName.trim().charAt(0).toUpperCase() || 'U'}</span>
                            {itemIndex < editHistory.length - 1 ? <i /> : null}
                          </div>
                          <div className="order-edit-history__card">
                            <div className="order-edit-history__meta">
                              <div className="order-edit-history__author">
                                <strong>{item.editorName}</strong>
                                <span><PencilLine strokeWidth={1.8} /> Buyurtmani tahrirladi</span>
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
                                {item.changes.map((change, index) => (
                                  <span key={index}>{change}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                {showFulfillment ? <OrderFulfillmentStatus order={viewOrder} /> : null}
              </div>
            );
          })()}
        </div>
      ) : (hubMode || Boolean(searchParams.get('view'))) ? (
        <MarketingOrdersHome
          title={LOGISTICS_LABELS[logisticsType]}
          panelTitle="Buyurtmalar"
          productEntries={productEntries}
          filterProductType={filterProductType}
          onFilterProductChange={setFilterProductType}
          periodControl={renderPeriodPicker()}
          showPeriod
          listView={listView}
          onListViewChange={setListView}
          segmentCounts={segmentCounts}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          resultCount={matchingOrders.length}
          canCreate={canCreateOrder}
          onCreate={startNew}
          toolbarActions={
            <div className="flex items-center gap-2">
              {canCreateOrder && (
                <button
                  type="button"
                  onClick={startBlankEmergencyOrder}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5 border-dashed border-amber-400/80 hover:bg-amber-500/10"
                  title="Oy boshi yoki favqulodda vaziyatlar uchun zaxira buyurtma shabloni"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  <span>Bo‘sh buyurtma</span>
                </button>
              )}
              {excelAction}
            </div>
          }
        >
          {matchingOrders.length === 0 ? (
            <div className="thub-empty">
              <p className="thub-empty__title">
                {listView === 'yakun'
                  ? (filterProductType
                    ? `${formatPeriodRangeLabel(periodFrom, periodTo)} · ${getProductLabel(filterProductType, logisticsType)}`
                    : formatPeriodRangeLabel(periodFrom, periodTo))
                  : listViewTitle}
              </p>
              <p className="thub-empty__text">
                {searchQuery.trim()
                  ? 'Qidiruv bo‘yicha buyurtma topilmadi.'
                  : listView === 'all'
                    ? 'Hozircha buyurtma yo‘q.'
                    : listView === 'faol'
                      ? 'Hozir tasdiqlangan buyurtma yo‘q.'
                    : listView === 'tasdiq'
                      ? 'Jarayonda buyurtma yo‘q.'
                      : filterProductType
                        ? 'Bu mahsulot / davr uchun yakunlangan buyurtma yo‘q.'
                        : 'Bu davrda yakunlangan buyurtma yo‘q.'}
              </p>
            </div>
          ) : (
            renderOrderList(matchingOrders)
          )}
        </MarketingOrdersHome>
      ) : (
        <MarketingOrdersHome
          title={LOGISTICS_LABELS[logisticsType]}
          hideHeader
          productEntries={productEntries}
          filterProductType={filterProductType}
          onFilterProductChange={setFilterProductType}
          periodControl={renderPeriodPicker()}
          canCreate={canCreateOrder}
          onCreate={startNew}
          toolbarActions={
            <div className="flex items-center gap-2">
              {canCreateOrder && (
                <button
                  type="button"
                  onClick={startBlankEmergencyOrder}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5 border-dashed border-amber-400/80 hover:bg-amber-500/10"
                  title="Oy boshi yoki favqulodda vaziyatlar uchun zaxira buyurtma shabloni"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  <span>Bo‘sh buyurtma</span>
                </button>
              )}
              {excelAction}
            </div>
          }
        >
          {matchingOrders.length === 0 ? (
            <OrderFilterPlaceholder
              periodFrom={periodFrom}
              periodTo={periodTo}
              filterProductType={filterProductType}
              mode={filterProductType ? 'product' : 'period'}
            />
          ) : (
            renderOrderList(matchingOrders)
          )}
        </MarketingOrdersHome>
      )}

      <OrderAttachmentsModal
        open={attachmentsModalOpen}
        saving={saving || removingAttachmentId !== null}
        existingAttachments={existingAttachments}
        pendingFiles={pendingFiles}
        removingAttachmentId={removingAttachmentId}
        onClose={() => setAttachmentsModalOpen(false)}
        onPickFiles={onPickAttachmentFiles}
        onRemovePending={removePendingFile}
        onRemoveExisting={(id) => { void removeExistingAttachment(id); }}
      />

      <ConfirmDialog
        open={
          approveConfirmOpen
          && !!viewOrder
          && (
            (viewOrder.status === 'PendingDeputyDirector' && canApproveDeputy)
            || (viewOrder.status === 'PendingDispatching' && canApproveDispatch)
          )
        }
        title={
          viewOrder?.status === 'PendingDispatching'
            ? 'Buyurtmani ijroga qabul qilish'
            : 'Buyurtmani tasdiqlash'
        }
        message={
          viewOrder?.status === 'PendingDispatching'
            ? `${viewOrder.orderNumber} buyurtmasini ICHDX smena boshlig‘i sifatida ijroga qabul qilasizmi?`
            : viewOrder
              ? `${viewOrder.orderNumber} buyurtmasini tasdiqlab, ijro uchun yuborasizmi?`
              : ''
        }
        confirmLabel={viewOrder?.status === 'PendingDispatching' ? 'Ha, qabul qilaman' : 'Ha, tasdiqlayman'}
        cancelLabel="Bekor qilish"
        loading={approvingId === viewOrder?.id}
        onConfirm={() => {
          if (!viewOrder) return;
          if (viewOrder.status === 'PendingDispatching') void approveDispatch(viewOrder.id);
          else void approveDeputy(viewOrder.id);
        }}
        onCancel={() => {
          if (approvingId) return;
          setApproveConfirmOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Buyurtmani o'chirish"
        message={
          deleteTarget
            ? `${deleteTarget.orderNumber} buyurtmasini o'chirishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi.`
            : ''
        }
        confirmLabel="O'chirish"
        cancelLabel="Bekor qilish"
        variant="danger"
        loading={deleting}
        error={deleteError}
        onConfirm={() => { void handleDeleteOrder(); }}
        onCancel={closeDeleteDialog}
      />
    </>
  );
}

export default function OrdersPage() {
  const { logisticsRoute } = useParams<{ logisticsRoute: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isMarketing = user?.role === 'Marketing';
  const isAdmin = user?.role === 'Admin';
  const { canCreateOrder, canUpdateOrder, canDeleteOrder } = useRbacPermission();
  const hasOrdersAccess = canCreateOrder || canUpdateOrder || canDeleteOrder;
  const isMarketingOrAdmin = isMarketing || isAdmin || hasOrdersAccess;
  const isChainApprover = user?.role === 'Accounting'
    || user?.role === 'DeputyDirector'
    || user?.role === 'DispatchSupervisor';
  const activeTab = logisticsFromRoute(logisticsRoute);
  const [ordersToolbar, setOrdersToolbar] = useState<ReactNode>(null);

  if (!isMarketingOrAdmin && logisticsRoute === 'road') {
    return <Navigate to="/orders/railway" replace />;
  }

  if (logisticsRoute !== 'railway' && logisticsRoute !== 'road') {
    return <Navigate to="/orders/railway" replace />;
  }

  return (
    <div>
      {ordersToolbar && (
        <div className="mb-6">{ordersToolbar}</div>
      )}

      <MarketingOrdersPanel
        key={`${activeTab}-${isMarketingOrAdmin ? 'mkt' : 'hub'}`}
        logisticsType={isMarketingOrAdmin ? activeTab : LOGISTICS_TYPES.Railway}
        canCreate={canCreateOrder}
        canUpdate={canUpdateOrder}
        canDelete={canDeleteOrder}
        canApproveDeputy={user?.role === 'DeputyDirector' || isAdmin}
        canApproveDispatch={user?.role === 'DispatchSupervisor' || isAdmin}
        canReviewAccounting={user?.role === 'Accounting' || isAdmin}
        currentUserName={user?.fullName}
        onToolbarChange={setOrdersToolbar}
        hubMode={!isMarketingOrAdmin || Boolean(searchParams.get('view'))}
        defaultListView={isChainApprover ? 'tasdiq' : 'all'}
      />
    </div>
  );
}
