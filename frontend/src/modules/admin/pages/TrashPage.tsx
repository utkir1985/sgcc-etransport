import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Trash2,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  FileText,
  TrainFront,
  Train,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Archive,
  Info,
  HardDrive,
  Building2,
  X,
  ChevronDown,
  Paperclip,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { TablePagination } from '../../../shared/components/TablePagination';
import { ProductOrderDocument } from '../../../shared/components/ProductOrderDocument';
import { WagonEntryPermitView } from '../../../shared/components/WagonEntryPermitView';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { toLatinProductName } from '../../../shared/utils/cyrillicToLatin';
import type { TrashItem, TrashStats, MonthlyOrder, EmptyWagonArrival } from '../../../shared/types';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return dateStr;
  }
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Barcha toifalar' },
  { value: 'order', label: 'Buyurtmalar' },
  { value: 'arrival', label: 'Kiritish xizmat xati' },
  { value: 'attachment', label: 'Dalolatnomalar' },
  { value: 'registry', label: 'Yuk xatlari' },
];

function parseOrderFromTrash(item: TrashItem): MonthlyOrder | null {
  let p: any = null;
  if (item.payloadJson) {
    try {
      p = JSON.parse(item.payloadJson);
    } catch {
      p = null;
    }
  }

  const orderData = p?.Order || p || {};
  const linesData = p?.Lines || [];
  const attachmentsData = p?.Attachments || [];
  const parsedInfo = extractItemInfo(item);

  const parsedLines = linesData.length > 0 ? linesData.map((l: any, i: number) => ({
    id: l.Id || l.id || String(i),
    monthlyOrderId: l.MonthlyOrderId || l.monthlyOrderId || item.entityId,
    sortOrder: l.SortOrder || l.sortOrder || i + 1,
    contractor: l.Contractor || l.contractor || 'Xaridor',
    wagonCount: l.WagonCount ?? l.wagonCount ?? 10,
    tonCount: l.TonCount ?? l.tonCount ?? 600,
    quantityUnit: l.QuantityUnit || l.quantityUnit || 'tn',
    destinationStation: l.DestinationStation || l.destinationStation || '—',
    accountingStatus: l.AccountingStatus || l.accountingStatus || 'Approved',
  })) : [
    {
      id: '1',
      monthlyOrderId: item.entityId,
      sortOrder: 1,
      contractor: '«Maxam-Chirchiq» AJ',
      wagonCount: 10,
      tonCount: 600,
      quantityUnit: 'tn',
      destinationStation: 'Chirchiq (721200)',
      accountingStatus: 'Approved',
    }
  ];

  const totalWagons = parsedLines.reduce((s: number, l: any) => s + (l.wagonCount || 0), 0);
  const totalTons = parsedLines.reduce((s: number, l: any) => s + (l.tonCount || 0), 0);

  return {
    id: orderData.Id || item.entityId,
    orderNumber: orderData.OrderNumber || item.relatedNumber || parsedInfo.docNumber || '001',
    year: orderData.Year || new Date(item.deletedAt).getFullYear(),
    month: orderData.Month || (new Date(item.deletedAt).getMonth() + 1),
    logisticsType: orderData.LogisticsType || 'Railway',
    contractNumber: orderData.ContractNumber || '',
    productType: orderData.ProductType || parsedInfo.productName || 'Barcha turdagi oltingugurt',
    deadline: orderData.Deadline || item.expiresAt,
    status: orderData.Status || 'SubmittedToDispatch',
    createdBy: orderData.MarketingApproverName || item.deletedByName || 'Tizim Administratori',
    createdAt: orderData.CreatedAt || item.deletedAt,
    submittedAt: orderData.SubmittedAt || null,
    approvedAt: orderData.ApprovedAt || null,
    accountingApproverName: orderData.AccountingApproverName || '',
    marketingApprovedAt: orderData.MarketingApprovedAt || orderData.CreatedAt || item.deletedAt,
    marketingApproverName: orderData.MarketingApproverName || item.deletedByName || 'Tizim Administratori',
    submittedToDispatchAt: orderData.SubmittedToDispatchAt || null,
    dispatchApprovedAt: orderData.DispatchApprovedAt || null,
    dispatchApproverName: orderData.DispatchApproverName || '',
    deputyApprovedAt: orderData.DeputyApprovedAt || null,
    deputyApproverName: orderData.DeputyApproverName || '',
    qrGlobalId: orderData.QrGlobalId || item.relatedNumber || item.entityId,
    qrVerificationUrl: orderData.QrVerificationUrl || `https://qrlink.sgcc.uz/verify/${item.relatedNumber || item.entityId}`,
    lines: parsedLines,
    totalWagons,
    totalTons,
    attachments: attachmentsData,
  } as MonthlyOrder;
}

function parseArrivalFromTrash(item: TrashItem): EmptyWagonArrival | null {
  let p: any = null;
  if (item.payloadJson) {
    try {
      p = JSON.parse(item.payloadJson);
    } catch {
      p = null;
    }
  }

  const arrival = p || {};
  return {
    id: arrival.Id || arrival.id || item.entityId,
    arrivalNumber: arrival.ArrivalNumber || arrival.arrivalNumber || item.relatedNumber,
    entryPermitNumber: arrival.EntryPermitNumber || arrival.entryPermitNumber || item.relatedNumber,
    entryPermitShiftApprovedAt: arrival.EntryPermitShiftApprovedAt || arrival.entryPermitShiftApprovedAt || item.deletedAt,
    entryPermitShiftApproverName: arrival.EntryPermitShiftApproverName || arrival.entryPermitShiftApproverName || item.deletedByName,
    wagons: arrival.Units || arrival.wagons || [],
    ...arrival,
  } as any as EmptyWagonArrival;
}

function extractAttachmentsFromTrash(item: TrashItem): Array<{ fileName: string; objectKey?: string }> {
  const list: Array<{ fileName: string; objectKey?: string }> = [];
  if (item.payloadJson) {
    try {
      const p = JSON.parse(item.payloadJson);
      const atts = p.Attachments || p.attachments || p.Order?.Attachments || p.Order?.attachments;
      if (Array.isArray(atts) && atts.length > 0) {
        atts.forEach((a: any) => {
          list.push({
            fileName: a.FileName || a.fileName || 'Ilova.pdf',
            objectKey: a.ObjectKey || a.objectKey,
          });
        });
      }
    } catch {}
  }
  if (list.length === 0 && item.fileName && item.hasFile) {
    list.push({
      fileName: item.fileName,
      objectKey: (item as any).objectKey,
    });
  }
  return list;
}

function getDaysLeftInfo(expiresAtUtc?: string): { text: string; urgent: boolean; expired: boolean; days: number } {
  if (!expiresAtUtc) return { text: '30 kun', urgent: false, expired: false, days: 30 };
  const expiry = new Date(expiresAtUtc).getTime();
  const now = Date.now();
  const diffMs = expiry - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return { text: 'Muddati tugagan', urgent: true, expired: true, days: 0 };
  }
  if (diffDays <= 5) {
    return { text: `${diffDays} kun qoldi`, urgent: true, expired: false, days: diffDays };
  }
  return { text: `${diffDays} kun qoldi`, urgent: false, expired: false, days: diffDays };
}

function getCategoryIcon(category: string, entityType: string) {
  const cat = category.toLowerCase();
  const ent = entityType.toLowerCase();
  if (cat === 'file' || ent.includes('attachment') || ent.includes('file')) {
    return <FileText className="w-4 h-4 text-blue-500" />;
  }
  if (cat === 'wagon' || ent.includes('unit') || ent.includes('wagon')) {
    return <TrainFront className="w-4 h-4 text-amber-500" />;
  }
  if (cat === 'arrival' || ent.includes('arrival')) {
    return <Train className="w-4 h-4 text-emerald-500" />;
  }
  return <Archive className="w-4 h-4 text-purple-500" />;
}

function getCategoryBadge(category: string) {
  switch (category.toLowerCase()) {
    case 'file':
    case 'attachment':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-normal bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
          <FileText className="w-3 h-3" /> Fayl
        </span>
      );
    case 'wagon':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-normal bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          <TrainFront className="w-3 h-3" /> Vagon
        </span>
      );
    case 'arrival':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-normal bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          <Train className="w-3 h-3" /> Partiya
        </span>
      );
    case 'order':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-normal bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
          <Archive className="w-3 h-3" /> Buyurtma
        </span>
      );
    case 'registry':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-normal bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
          <FileText className="w-3 h-3" /> Yuk xati
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-normal bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <Archive className="w-3 h-3" /> {category}
        </span>
      );
  }
}

function extractItemInfo(item: TrashItem) {
  let docNumber = item.relatedNumber?.trim() || '';
  let productName = '';
  const cleanTitle = (item.title || '').replace(/#/g, '№ ').replace(/№\s*№/g, '№').trim();
  const description = (item.deleteReason?.trim() || cleanTitle).replace(/ochirildi/gi, 'o‘chirildi');

  // Vagonlar uchun vagon raqamini ustuvor qilish
  if (item.category === 'wagon' || item.entityType === 'EmptyWagonUnit' || cleanTitle.toLowerCase().includes('vagon')) {
    const vagonMatch = cleanTitle.match(/№\s*([0-9A-Za-z_-]+)/);
    if (vagonMatch) {
      docNumber = vagonMatch[1];
    }
    if (item.relatedNumber) {
      productName = `Partiya: ${item.relatedNumber}`;
    }
  } else if (cleanTitle.includes(' — ')) {
    const parts = cleanTitle.split(' — ');
    if (!docNumber) {
      const match = parts[0].match(/№\s*([^\s]+)/);
      if (match) docNumber = match[1];
    }
    productName = parts.slice(1).join(' — ').trim();
  } else if (cleanTitle.includes('(') && cleanTitle.includes(')')) {
    const matchNumber = cleanTitle.match(/№\s*([^\s(]+)/);
    if (!docNumber && matchNumber) docNumber = matchNumber[1];
    const matchProduct = cleanTitle.match(/\(([^)]+)\)/);
    if (matchProduct) productName = matchProduct[1].trim();
  }

  if (!docNumber) {
    const numMatch = cleanTitle.match(/№\s*([^\s]+)/);
    if (numMatch) docNumber = numMatch[1];
    else if (item.fileName) docNumber = item.fileName;
    else docNumber = cleanTitle;
  }

  if (!productName && item.category === 'order' && item.deleteReason?.includes(', ')) {
    const parts = item.deleteReason.split(', ');
    productName = parts[parts.length - 1].replace(/\)$/, '').trim();
  }

  if (productName) {
    productName = toLatinProductName(productName) || productName;
  }

  return {
    docNumber: docNumber.replace(/^[#№\s]+/, '').trim() || '—',
    productName: productName || '—',
    description: description || cleanTitle,
  };
}

interface DepartmentInfo {
  departmentName: string;
  fullName?: string;
  badgeClass: string;
}

function getDepartmentInfo(item: TrashItem): DepartmentInfo {
  const cat = (item.category || '').toLowerCase();
  const entity = (item.entityType || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  const reason = (item.deleteReason || '').toLowerCase();

  // 1. Buyurtmalar (MS va MX)
  if (cat === 'order' || entity.includes('order')) {
    return {
      departmentName: 'MS va MX',
      fullName: 'Mahsulotlarni sotish va marketing xizmati',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
    };
  }

  // 2. Kiritish partiyasi (ICHDX)
  if (cat === 'arrival' || entity.includes('arrival')) {
    return {
      departmentName: 'ICHDX',
      fullName: 'Ishlab chiqarish va dispetcherlik xizmati',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
    };
  }

  // 3. Vagonlar (bo'sh vagon birligi)
  if (cat === 'wagon' || entity.includes('wagon')) {
    if (reason.includes('tarozi') || title.includes('tara') || reason.includes('tara')) {
      return {
        departmentName: 'Tarozi xizmati',
        fullName: 'Tarozi va og‘irlikni nazorat qilish xizmati',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
      };
    }
    return {
      departmentName: 'TY sexi',
      fullName: 'Temir yo‘l sexi / Dispetcherlik',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
    };
  }

  // 4. Yuk xatlari (LoadingRegistry)
  if (cat === 'registry' || entity.includes('registry')) {
    return {
      departmentName: 'Iqtisodiyot',
      fullName: 'Hujjatlar va yuk xatlari hisobi',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
    };
  }

  // 5. Ilova va fayllar (attachment)
  if (cat === 'attachment' || entity.includes('attachment')) {
    return {
      departmentName: 'Hujjatlar',
      fullName: 'Elektron hujjat aylanishi',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
    };
  }

  return {
    departmentName: 'Tizim ma’muriyati',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  };
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [stats, setStats] = useState<TrashStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [category, setCategory] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modals state
  const [itemToRestore, setItemToRestore] = useState<TrashItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const [emptyModalOpen, setEmptyModalOpen] = useState(false);
  const [emptyExpiredOnly, setEmptyExpiredOnly] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Hujjatni ko'rish (Preview) holati
  const [previewOrder, setPreviewOrder] = useState<{ order: MonthlyOrder; item: TrashItem } | null>(null);
  const [previewArrival, setPreviewArrival] = useState<{ arrival: EmptyWagonArrival; item: TrashItem } | null>(null);

  const handleDownloadAttachment = async (item: TrashItem, att: { fileName: string; objectKey?: string }) => {
    try {
      await api.downloadTrashFile(item.id, att.fileName || 'ilova', att.objectKey);
    } catch {
      setNotification({ type: 'error', message: 'Ilova faylini yuklab olishda xatolik yuz berdi' });
    }
  };

  // Dropdown menyu holati (2-rasmdagi andoza)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!categoryMenuRef.current?.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [categoryMenuOpen]);

  // Load items
  const loadTrash = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTrashItems({
        category: category !== 'all' ? category : undefined,
        page,
        pageSize,
      });

      if (res.success && res.data) {
        setItems(res.data.items);
        setTotalCount(res.data.totalItems);
        setStats(res.data.stats);
      } else {
        setError('Ma’lumotlarni yuklab bo‘lmadi');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  }, [category, page, pageSize]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  // Clear notification after 4 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Actions
  const handleRestore = async () => {
    if (!itemToRestore) return;
    setActionLoading(true);
    try {
      const res = await api.restoreTrashItem(itemToRestore.id);
      if (res.success) {
        setNotification({
          type: 'success',
          message: res.message || `"${itemToRestore.title}" muvaffaqiyatli tiklandi`,
        });
        setItemToRestore(null);
        await loadTrash();
      } else {
        setNotification({ type: 'error', message: res.message || 'Tiklashda xatolik yuz berdi' });
      }
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Tiklashda xatolik' });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete) return;
    setActionLoading(true);
    try {
      const res = await api.permanentDeleteTrashItem(itemToDelete.id);
      if (res.success) {
        setNotification({
          type: 'success',
          message: res.message || `"${itemToDelete.title}" butunlay o‘chirildi`,
        });
        setItemToDelete(null);
        await loadTrash();
      } else {
        setNotification({ type: 'error', message: res.message || 'O‘chirishda xatolik yuz berdi' });
      }
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'O‘chirishda xatolik' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    setActionLoading(true);
    try {
      const res = await api.emptyTrash(emptyExpiredOnly);
      if (res.success) {
        const count = res.data?.count ?? 0;
        setNotification({
          type: 'success',
          message: emptyExpiredOnly
            ? `${count} ta muddati o‘tgan element tozalandi`
            : `Korzina butunlay tozalandi (${count} ta element o‘chirildi)`,
        });
        setEmptyModalOpen(false);
        await loadTrash();
      } else {
        setNotification({ type: 'error', message: res.message || 'Tozalashda xatolik yuz berdi' });
      }
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Tozalashda xatolik' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (item: TrashItem) => {
    try {
      await api.downloadTrashFile(item.id, item.fileName || item.title);
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Yuklab olishda xatolik' });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 ${
            notification.type === 'success'
              ? 'bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : notification.type === 'error'
              ? 'bg-rose-50/95 dark:bg-rose-950/90 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-blue-50/95 dark:bg-blue-950/90 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200'
          }`}
        >
          {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
          {notification.type === 'error' && <XCircle className="w-5 h-5 text-rose-500 shrink-0" />}
          {notification.type === 'info' && <Info className="w-5 h-5 text-blue-500 shrink-0" />}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white dark:bg-[#161c2b] rounded-2xl border-2 border-slate-300/80 dark:border-slate-700 shadow-xl ring-1 ring-slate-900/5 overflow-hidden">
        {/* Table Controls Header: Chapda Dropdown filtr, O'ngda Amallar */}
        <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* CHAP TOMON: Standart Toifalar Dropdown Filtri (2-rasmdagi andoza) */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="marketing-product-filter-anchor" ref={categoryMenuRef}>
              <span
                className="marketing-product-filter marketing-product-filter--sizer text-[14px]"
                aria-hidden="true"
              >
                <span className="marketing-product-filter__text">Kiritish xizmat xati</span>
                <ChevronDown className="marketing-product-filter__chevron w-4 h-4" strokeWidth={1.75} />
              </span>
              <button
                type="button"
                className={`marketing-product-filter marketing-product-filter--trigger text-[14px] cursor-pointer${
                  categoryMenuOpen ? ' marketing-product-filter--open' : ''
                }${category !== 'all' ? ' marketing-product-filter--active' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={categoryMenuOpen}
                onClick={() => setCategoryMenuOpen(o => !o)}
              >
                <span className="marketing-product-filter__text">
                  {CATEGORY_OPTIONS.find(o => o.value === category)?.label || 'Barcha toifalar'}
                </span>
                <ChevronDown className="marketing-product-filter__chevron w-4 h-4" strokeWidth={1.75} />
              </button>

              {categoryMenuOpen && (
                <ul className="marketing-product-filter__menu shadow-xl" role="listbox">
                  {CATEGORY_OPTIONS.map(opt => (
                    <li key={opt.value} role="option" aria-selected={category === opt.value}>
                      <button
                        type="button"
                        className={`marketing-product-filter__item text-[14px] cursor-pointer${
                          category === opt.value ? ' marketing-product-filter__item--active font-semibold' : ''
                        }`}
                        onClick={() => {
                          setCategory(opt.value);
                          setPage(1);
                          setCategoryMenuOpen(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {category !== 'all' && (
              <button
                type="button"
                onClick={() => { setCategory('all'); setPage(1); }}
                className="inline-flex items-center gap-1 h-10 px-3 rounded-xl text-[14px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors shrink-0"
                title="Filtrni tozalash"
              >
                <span>Tozalash</span>
                <X className="w-4 h-4 text-blue-500" />
              </button>
            )}
          </div>

          {/* O‘NG TOMON: Amallar (Muddati o‘tganlarni tozalash, Korzinani tozalash) */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => {
                setEmptyExpiredOnly(true);
                setEmptyModalOpen(true);
              }}
              className="inline-flex items-center gap-2 h-10 px-4 text-[14px] font-semibold rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200/80 dark:border-amber-800/80 shadow-xs transition-colors cursor-pointer"
            >
              <Clock className="w-4 h-4 text-amber-500" />
              Muddati o‘tganlarni tozalash
            </button>

            <button
              type="button"
              onClick={() => {
                setEmptyExpiredOnly(false);
                setEmptyModalOpen(true);
              }}
              className="inline-flex items-center gap-2 h-10 px-4 text-[14px] font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-xs cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Korzinani tozalash
            </button>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              O‘chirilgan ma’lumotlar yuklanmoqda...
            </p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
            <button
              type="button"
              onClick={loadTrash}
              className="mt-3 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Qayta urinish
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Trash2 className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Korzinada hech qanday ma’lumot yo‘q
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              Foydalanuvchilar tomonidan o‘chirilgan ilovalar, bo‘sh vagonlar va partiyalar shu yerda 30 kun davomida saqlanadi.
            </p>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden shadow-xs bg-white dark:bg-[#161c2b]">
              <div className="thub-table-wrap reestr-table-wrap overflow-x-auto">
                <table className="thub-table reestr-table docs-hub-table w-full">
                  <thead>
                    <tr>
                      <th className="w-12 text-center align-middle">№</th>
                      <th className="text-center align-middle" style={{ minWidth: '150px' }}>Hujjat / Vagon №</th>
                      <th className="text-center align-middle" style={{ minWidth: '110px' }}>Kategoriya</th>
                      <th className="text-center align-middle" style={{ minWidth: '160px' }}>Mahsulot</th>
                      <th className="text-center align-middle" style={{ minWidth: '180px' }}>Bo‘lim</th>
                      <th className="text-center align-middle" style={{ minWidth: '180px' }}>O‘chirgan shaxs</th>
                      <th className="text-center align-middle whitespace-nowrap" style={{ minWidth: '160px' }}>O‘chirilgan sana</th>
                      <th className="text-center align-middle" style={{ minWidth: '130px' }}>Saqlanish muddati</th>
                      <th className="text-center align-middle" style={{ minWidth: '170px' }}>Hujjatlar</th>
                      <th className="text-center align-middle" style={{ minWidth: '130px' }}>Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const daysInfo = getDaysLeftInfo(item.expiresAt);
                      const parsed = extractItemInfo(item);
                      const dept = getDepartmentInfo(item);
                      const rowNum = (page - 1) * pageSize + index + 1;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group text-center"
                        >
                          {/* № */}
                          <td className="thub-mono reestr-num text-center align-middle text-xs font-mono text-slate-500 font-normal">
                            {rowNum}
                          </td>

                          {/* Hujjat / Vagon raqami */}
                          <td className="text-center align-middle whitespace-nowrap font-mono font-normal text-slate-800 dark:text-slate-200">
                            <div className="inline-flex items-center justify-center gap-2">
                              <span className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                                {getCategoryIcon(item.category, item.entityType)}
                              </span>
                              <span className="text-sm">{parsed.docNumber.replace(/^#/, '')}</span>
                            </div>
                          </td>

                          {/* Kategoriya */}
                          <td className="text-center align-middle whitespace-nowrap">
                            <div className="flex items-center justify-center">
                              {getCategoryBadge(item.category)}
                            </div>
                          </td>

                          {/* Mahsulot nomi */}
                          <td className="text-center align-middle max-w-[15rem] text-sm font-normal text-slate-700 dark:text-slate-300">
                            {parsed.productName}
                          </td>

                          {/* Bo‘lim nomi */}
                          <td className="text-center align-middle whitespace-nowrap px-3 py-2.5">
                            <div className="flex items-center justify-center">
                              <span
                                title={dept.fullName || dept.departmentName}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-normal border shadow-2xs cursor-default ${dept.badgeClass}`}
                              >
                                <Building2 className="w-3.5 h-3.5 shrink-0" />
                                {dept.departmentName}
                              </span>
                            </div>
                          </td>

                          {/* O‘chirgan shaxs */}
                          <td className="text-center align-middle whitespace-nowrap text-xs px-3">
                            <span className="font-normal text-slate-700 dark:text-slate-300 text-xs">
                              {item.deletedByName || 'Noma’lum'}
                            </span>
                          </td>

                          {/* O‘chirilgan sana (bir qatorda va markazda!) */}
                          <td className="text-center align-middle whitespace-nowrap text-xs font-mono font-normal text-slate-700 dark:text-slate-300 tabular-nums px-3">
                            {formatDate(item.deletedAt)} {formatTime(item.deletedAt)}
                          </td>

                          {/* Saqlanish muddati */}
                          <td className="text-center align-middle whitespace-nowrap text-xs">
                            <div className="flex items-center justify-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-normal ${
                                  daysInfo.expired
                                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                                    : daysInfo.urgent
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {daysInfo.text}
                              </span>
                            </div>
                          </td>

                          {/* Hujjatlar va ilovalar */}
                          <td className="text-center align-middle whitespace-nowrap px-2">
                            {(() => {
                              const hasOrder = item.category === 'order' || item.entityType === 'MonthlyOrder';
                              const hasArrival = item.category === 'arrival' || item.entityType === 'EmptyWagonArrival';
                              const attachments = extractAttachmentsFromTrash(item);
                              const isDirectFile = item.hasFile || item.category === 'attachment' || Boolean(item.fileName);

                              return (
                                <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                                  {/* Asosiy Buyurtma Hujjati */}
                                  {hasOrder && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const ord = parseOrderFromTrash(item);
                                        if (ord) setPreviewOrder({ order: ord, item });
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 transition-colors shadow-2xs cursor-pointer"
                                      title="O‘chirilgan buyurtma varaqasini QR kodlari bilan ko‘rish"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                      <span>Hujjat</span>
                                    </button>
                                  )}

                                  {/* Asosiy Kiritish Xizmat Xati Hujjati */}
                                  {hasArrival && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const arr = parseArrivalFromTrash(item);
                                        if (arr) setPreviewArrival({ arrival: arr, item });
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-800 transition-colors shadow-2xs cursor-pointer"
                                      title="Kiritish xizmat xatini QR kodlari bilan ko‘rish"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                      <span>Hujjat</span>
                                    </button>
                                  )}

                                  {/* Biriktirilgan Ilova(lar) */}
                                  {attachments.map((att, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => handleDownloadAttachment(item, att)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 transition-colors shadow-2xs cursor-pointer"
                                      title={`Biriktirilgan ilovani yuklab olish: ${att.fileName}`}
                                    >
                                      <Paperclip className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      <span>{attachments.length > 1 ? `Ilova ${idx + 1}` : 'Ilova'}</span>
                                    </button>
                                  ))}

                                  {/* Alohida o'chirilgan fayl / attachment */}
                                  {isDirectFile && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownload(item)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 transition-colors shadow-2xs cursor-pointer"
                                      title="Ilova faylini yuklab olish"
                                    >
                                      <Paperclip className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                      <span className="max-w-[110px] truncate">{item.fileName || 'Ilova fayli'}</span>
                                    </button>
                                  )}

                                  {!hasOrder && !hasArrival && !isDirectFile && attachments.length === 0 && (
                                    <span className="text-xs text-slate-400 font-normal">—</span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Action Buttons */}
                          <td className="text-center align-middle whitespace-nowrap">
                            <div className="inline-flex items-center justify-center gap-1.5">
                              {item.hasFile && (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(item)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                                  title="Faylni yuklab olish / Ko‘rish"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setItemToRestore(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/80 transition-colors shadow-2xs"
                                title="Asl joyiga qayta tiklash"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Tiklash</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setItemToDelete(item)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                title="Butunlay o‘chirish"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Pagination Footer */}
        {items.length > 0 && (
          <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-700">
            <TablePagination
              total={totalCount}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              unitLabel="o‘chirilgan element"
            />
          </div>
        )}
      </div>

      {/* MODAL: Restore Confirmation */}
      {itemToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#161c2b] rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Obyektni qayta tiklash
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ushbu ma’lumot o‘zining asl jarayoniga qaytariladi
                </p>
              </div>
            </div>

            {(() => {
              const info = extractItemInfo(itemToRestore);
              const cleanNum = (itemToRestore.relatedNumber || info.docNumber || '').replace(/^[#№\s]+/, '');
              const itemType = itemToRestore.category === 'order' ? 'Buyurtma' : itemToRestore.category === 'arrival' ? 'Xizmat xati' : 'Hujjat';
              return (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {itemType} {cleanNum ? `№ ${cleanNum}` : ''}
                    </span>
                    {info.productName && info.productName !== '—' && (
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        — {info.productName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    O‘chirgan: {itemToRestore.deletedByName || 'Tizim Administratori'} · {formatDate(itemToRestore.deletedAt)} {formatTime(itemToRestore.deletedAt)}
                  </p>
                </div>
              );
            })()}

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Haqiqatan ham ushbu ma’lumotni korzinadan chiqarib, o‘zining asl holatiga tiklamoqchimisiz?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setItemToRestore(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Ha, tiklash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Permanent Delete Confirmation */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#161c2b] rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Butunlay o‘chirish
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  Bu amalni ortga qaytarib bo‘lmaydi!
                </p>
              </div>
            </div>

            {(() => {
              const info = extractItemInfo(itemToDelete);
              const cleanNum = (itemToDelete.relatedNumber || info.docNumber || '').replace(/^[#№\s]+/, '');
              const itemType = itemToDelete.category === 'order' ? 'Buyurtma' : itemToDelete.category === 'arrival' ? 'Xizmat xati' : 'Hujjat';
              return (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {itemType} {cleanNum ? `№ ${cleanNum}` : ''}
                    </span>
                    {info.productName && info.productName !== '—' && (
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        — {info.productName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    O‘chirgan: {itemToDelete.deletedByName || 'Tizim Administratori'} · {formatDate(itemToDelete.deletedAt)} {formatTime(itemToDelete.deletedAt)}
                  </p>
                  {itemToDelete.hasFile && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 pt-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      Fayl server xotirasidan (disk/MinIO) butunlay o‘chiriladi
                    </p>
                  )}
                </div>
              );
            })()}

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Ushbu elementni bazadan va server diskidan butunlay yo‘q qilishni tasdiqlaysizmi?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-xs disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Butunlay o‘chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ConfirmDialog: Empty Trash Confirmation */}
      <ConfirmDialog
        open={emptyModalOpen}
        title={emptyExpiredOnly ? "Muddati o‘tganlarni tozalash" : "Korzinani tozalash"}
        message={
          emptyExpiredOnly
            ? `Saqlash muddati (30 kun) tugagan barcha ma’lumotlar va biriktirilgan fayllar butunlay o‘chiriladi${stats?.expiringSoonCount ? ` (taxminan ${stats.expiringSoonCount} ta)` : ''}. Ushbu amalni tasdiqlaysizmi?`
            : `Diqqat! Korzinadagi barcha ${stats?.totalCount ? `${stats.totalCount} ta ` : ''}o‘chirilgan ma’lumotlar va fayllar butunlay yo‘q qilinadi. Ularni keyinchalik tiklab bo‘lmaydi. Butunlay tozalashni tasdiqlaysizmi?`
        }
        confirmLabel={emptyExpiredOnly ? "Ha, tozalansin" : "Ha, korzinani tozalash"}
        cancelLabel="Bekor qilish"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleEmptyTrash}
        onCancel={() => setEmptyModalOpen(false)}
      />
      {/* MODAL: Preview Order Document */}
      {previewOrder && (() => {
        const orderAttachments = extractAttachmentsFromTrash(previewOrder.item);
        return (
          <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Buyurtma hujjati">
            <div className="yx-preview-bar">
              <div>
                <div className="yx-preview-bar__title">
                  Buyurtma — {previewOrder.order.orderNumber}
                </div>
                <div className="mt-0.5 text-xs text-slate-400 flex items-center gap-2">
                  <span>{previewOrder.order.productType}</span>
                  <span>·</span>
                  <span>{previewOrder.order.totalWagons || 0} vagon ({previewOrder.order.totalTons || 0} tn)</span>
                </div>
              </div>

              <div className="yx-preview-bar__actions">
                {orderAttachments.length > 0 && orderAttachments.map((att, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleDownloadAttachment(previewOrder.item, att)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-600 transition-colors cursor-pointer"
                    title={`Biriktirilgan ilovani yuklab olish: ${att.fileName}`}
                  >
                    <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{orderAttachments.length > 1 ? `Ilova ${idx + 1}` : 'Ilova'}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-600 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Chop etish</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600 hover:!bg-slate-700 cursor-pointer"
                  onClick={() => setPreviewOrder(null)}
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
                setPreviewOrder(null);
              }}
            >
              <ProductOrderDocument order={previewOrder.order} preview />
            </div>
          </div>
        );
      })()}

      {/* MODAL: Preview Arrival Document */}
      {previewArrival && (
        <WagonEntryPermitView
          arrival={previewArrival.arrival}
          onClose={() => setPreviewArrival(null)}
        />
      )}
    </div>
  );
}
