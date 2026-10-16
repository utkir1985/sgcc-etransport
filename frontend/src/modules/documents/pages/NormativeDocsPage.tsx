import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  UploadCloud,
  Search,
  Download,
  Plus,
  FilePlus2,
  Pencil,
  Lock,
  Trash2,
  FileText,
  AlertCircle,
  X,
    FileCheck,
  Building2,
  TrainFront,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { OrderStatusCards, type OrderStatusCard } from '../../../shared/components/MarketingOrdersHome';
import { OrderSheetMenu, type OrderSheetMenuItem } from '../../../shared/components/OrderSheetMenu';
import { TablePagination } from '../../../shared/components/TablePagination';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DocumentChipButton } from '../../../shared/components/DocumentPackChip';
import { DocumentPrintButton } from '../../../shared/components/DocumentPrintButton';
import { PdfPagesViewer, printPdfUrl } from '../../../shared/components/PdfPagesViewer';
import type { NormativeDocument, CreateNormativeDocPayload } from '../../../shared/types';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import { DatePicker } from '../../../shared/components/DatePicker';
import {
  getLocalNormativeDocs,
  saveLocalNormativeDoc,
  updateLocalNormativeDoc,
  deleteLocalNormativeDoc,
  getLocalNormativeDocFile,
} from '../../../shared/utils/normativeDocsStorage';

// Kategoriya ma'lumotlari va ranglari
const CATEGORIES: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; color: string; badgeClass: string }[] = [
  {
    key: 'all',
    label: 'Barchasi',
    icon: BookOpen,
    color: 'slate',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  },
  {
    key: 'law',
    label: 'Qonun va qarorlar',
    icon: Building2,
    color: 'blue',
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  {
    key: 'railway',
    label: "O'ztemiryo'l qoidalari",
    icon: TrainFront,
    color: 'amber',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  {
    key: 'internal',
    label: 'Korxona yo‘riqnomalari',
    icon: ShieldCheck,
    color: 'emerald',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  {
    key: 'technical',
    label: 'Texnik reglamentlar',
    icon: Scale,
    color: 'purple',
    badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
];

function getCategoryInfo(catKey?: string) {
  const normKey = (catKey || '').toLowerCase();
  for (const c of CATEGORIES) {
    if (c.key !== 'all' && (normKey === c.key || normKey.includes(c.key) || normKey.includes(c.label.toLowerCase()))) {
      return c;
    }
  }
  return {
    key: 'other',
    label: catKey || 'Hujjat',
    icon: FileText,
    color: 'slate',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
}

function isPdfPreview(p: { mime: string; doc: NormativeDocument }) {
  return p.mime.includes('pdf') || /\.pdf$/i.test(p.doc.FileName || '');
}

const MISSING_FILE = 'Hujjat fayli tizimda topilmadi. Faylni qayta yuklang.';

function formatBytes(bytes: number | string): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (!b || isNaN(b) || b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function NormativeDocsPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<NormativeDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [editingDoc, setEditingDoc] = useState<NormativeDocument | null>(null);
  const { canNormativeRead, canNormativeCreate, canNormativeUpdate, canNormativeDelete } = useRbacPermission();

  // Delete modal
  const [docToDelete, setDocToDelete] = useState<NormativeDocument | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Upload form state
  const [formTitle, setFormTitle] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCategory, setFormCategory] = useState('law');
  const [formDescription, setFormDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. First get from reliable local persistent storage (instant response)
      const localDocs = await getLocalNormativeDocs();
      if (localDocs && localDocs.length > 0) {
        setDocuments(localDocs);
      }

      // 2. Try background sync from server if available (non-blocking)
      try {
        const serverDocs = await api.getNormativeDocuments();
        if (serverDocs && serverDocs.length > 0) {
          // Merge server docs with local docs (preserving newly uploaded local docs)
          const localMap = new Map(localDocs.map(d => [d.Id, d]));
          for (const sd of serverDocs) {
            localMap.set(sd.Id, sd);
          }
          const merged = Array.from(localMap.values());
          merged.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
          setDocuments(merged);
        }
      } catch (e) {
        // Server sidecar not reachable or offline - perfectly fine, local store used
      }
    } catch (err: any) {
      console.error('Fetch normative docs error:', err);
      setError(err.message || 'Hujjatlarni yuklashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Hujjat yuk xatlaridagidek shu sahifaning o‘zida (oyna ichida) ochiladi
  const [preview, setPreview] = useState<{ doc: NormativeDocument; url: string; mime: string; revoke: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<NormativeDocument | null>(null);

  const closePreview = useCallback(() => {
    setPreview(prev => {
      if (prev?.revoke) URL.revokeObjectURL(prev.url);
      return null;
    });
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    if (!preview && !previewLoading && !previewError) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [preview, previewLoading, previewError, closePreview]);

  const handleOpenPreview = async (doc: NormativeDocument) => {
    setPreviewError(null);
    setPreviewDoc(doc);
    const mimeOf = (fallback?: string) => doc.MimeType || fallback || 'application/pdf';
    if (
      !doc.LocalFile && (doc.Id.startsWith('seed-') ||
      (doc.FileName && [
        'SHGKM_jarayoni_tahrir_2.pdf', 'Temir_yol_transporti_qonuni_103.pdf',
        'SHGKM_ichki_transport_yoriqnomasi_312.pdf',
        'SUG_xavfsizlik_reglamenti_84.pdf',
        'Temir_yollarda_yuk_tashish_qoidalari_142.pdf',
        'Temir_yol_jarayoni_protsedura.pdf'
      ].includes(doc.FileName)))
    ) {
      setPreview(null);
      setPreviewLoading(true);
      try {
        const res = await fetch(`/normative-files/${encodeURIComponent(doc.FileName)}`);
        const blob = res.ok ? await res.blob() : null;
        // Fayl yo‘q bo‘lsa server sayt sahifasini (HTML) qaytaradi — uni hujjat sifatida ko‘rsatmaymiz
        if (!blob || blob.type.includes('text/html') || blob.size === 0) throw new Error(MISSING_FILE);
        setPreview({ doc, url: URL.createObjectURL(blob), mime: mimeOf(blob.type), revoke: true });
        return;
      } catch (err: any) {
        // Fallback: Agar serverdan yuklab bo'lmasa, lokal brauzer xotirasidan olishga urinish
        try {
          const { blob: localBlob } = await getLocalNormativeDocFile(doc.Id);
          setPreview({ doc, url: URL.createObjectURL(localBlob), mime: mimeOf(localBlob.type), revoke: true });
          return;
        } catch {
          setPreviewError(err?.message || MISSING_FILE);
        }
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    setPreview(null);
    setPreviewLoading(true);
    try {
      try {
        const { blob } = await getLocalNormativeDocFile(doc.Id);
        setPreview({ doc, url: URL.createObjectURL(blob), mime: mimeOf(blob.type), revoke: true });
      } catch {
        const { blob, url } = await api.fetchNormativeDocumentBlob(doc.Id);
        if (blob.type.includes('text/html') || blob.size === 0) {
          URL.revokeObjectURL(url);
          throw new Error(MISSING_FILE);
        }
        setPreview({ doc, url, mime: mimeOf(blob.type), revoke: true });
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'Hujjatni ochib bo‘lmadi');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle download
  const handleDownload = async (doc: NormativeDocument) => {
    try {
      // If it is a seed document with a static file, download directly
      if (!doc.LocalFile && (doc.Id.startsWith('seed-') || (doc.FileName && ['SHGKM_jarayoni_tahrir_2.pdf', 'Temir_yol_transporti_qonuni_103.pdf', 'SHGKM_ichki_transport_yoriqnomasi_312.pdf', 'SUG_xavfsizlik_reglamenti_84.pdf', 'Temir_yollarda_yuk_tashish_qoidalari_142.pdf', 'Temir_yol_jarayoni_protsedura.pdf'].includes(doc.FileName)))) {
        const res = await fetch(`/normative-files/${encodeURIComponent(doc.FileName)}`);
        const blob = res.ok ? await res.blob() : null;
        if (!blob || blob.type.includes('text/html') || blob.size === 0) throw new Error(MISSING_FILE);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.FileName || `${doc.Title}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // 1. Try local storage file
      try {
        const { blob, fileName } = await getLocalNormativeDocFile(doc.Id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.FileName || fileName || `${doc.Title}.pdf`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      } catch {
        // Fallback to API
      }

      await api.downloadNormativeDocument(doc.Id, doc.FileName || `${doc.Title}.pdf`);
    } catch (err: any) {
      alert(err.message || 'Yuklab olishda xatolik');
    }
  };

  // Handle delete
  const confirmDelete = async () => {
    if (!docToDelete) return;
    setDeleting(true);
    try {
      // Delete from local store
      await deleteLocalNormativeDoc(docToDelete.Id);

      // Also try delete from server (non-blocking)
      try {
        await api.deleteNormativeDocument(docToDelete.Id);
      } catch {}

      setDocuments(prev => prev.filter(d => d.Id !== docToDelete.Id));
      setDocToDelete(null);
    } catch (err: any) {
      alert(err.message || 'O‘chirishda xatolik yuz berdi');
    } finally {
      setDeleting(false);
    }
  };

  const resetUploadForm = () => {
    setFormTitle('');
    setFormNumber('');
    setFormDate('');
    setFormCategory('law');
    setFormDescription('');
    setSelectedFile(null);
    setUploadError(null);
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setEditingDoc(null);
    resetUploadForm();
  };

  const openCreateModal = () => {
    resetUploadForm();
    setEditingDoc(null);
    setUploadModalOpen(true);
  };

  const openEditModal = (doc: NormativeDocument) => {
    resetUploadForm();
    const num = (doc.DocumentNumber || '').trim();
    setFormTitle(doc.Title || '');
    setFormNumber(num.toLowerCase() === 'raqamsiz' ? '' : num);
    setFormDate(doc.DocumentDate ? doc.DocumentDate.slice(0, 10) : '');
    setFormCategory(getCategoryInfo(doc.Category).key === 'other' ? 'law' : getCategoryInfo(doc.Category).key);
    setFormDescription(doc.Description || '');
    setEditingDoc(doc);
    setUploadModalOpen(true);
  };

  // Handle upload submit
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setUploadError('Hujjat nomini kiriting');
      return;
    }
    if (!selectedFile && !editingDoc) {
      setUploadError('Faylni tanlang');
      return;
    }

    if (editingDoc) {
      setUploading(true);
      setUploadError(null);
      try {
        const updated: NormativeDocument = {
          ...editingDoc,
          Title: formTitle.trim(),
          DocumentNumber: formNumber.trim(),
          DocumentDate: formDate || undefined,
          Category: formCategory,
          Description: formDescription.trim() || undefined,
          UpdatedAt: new Date().toISOString(),
          ...(selectedFile ? {
            FileName: selectedFile.name,
            FileSize: selectedFile.size,
            MimeType: selectedFile.type || 'application/pdf',
            LocalFile: true,
          } : {}),
        };
        await updateLocalNormativeDoc(updated, selectedFile);
        setDocuments(prev => prev.map(d => (d.Id === updated.Id ? updated : d)));
        closeUploadModal();
      } catch (err: any) {
        setUploadError(err?.message || 'Hujjatni saqlashda xatolik yuz berdi');
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);

    try {
      // Generate unique ID
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `doc-${Date.now()}`;
      const nowIso = new Date().toISOString();

      // Agar hujjat raqami kiritilmagan bo'lsa (propustit qilingan bo'lsa) - bo'sh string saqlanadi
      const docNumberClean = formNumber.trim();

      const newDoc: NormativeDocument = {
        Id: newId,
        Title: formTitle.trim(),
        DocumentNumber: docNumberClean, // Bo'sh bo'lishi mumkin (propusk)
        DocumentDate: formDate || undefined,
        Category: formCategory,
        Description: formDescription.trim() || undefined,
        FileName: selectedFile.name,
        FileSize: selectedFile.size,
        MimeType: selectedFile.type || 'application/pdf',
        UploadedBy: user?.fullName || user?.username || 'Admin',
        CreatedAt: nowIso,
        UpdatedAt: nowIso,
      };

      // 1. Save directly into persistent browser storage with the full file Blob
      await saveLocalNormativeDoc(newDoc, selectedFile);

      // 2. Update UI immediately
      setDocuments(prev => [newDoc, ...prev]);

      // 3. Try to sync with server in background (graceful, non-blocking)
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.split(',')[1] || '');
          };
          reader.onerror = () => resolve('');
        });
        reader.readAsDataURL(selectedFile);
        const fileBase64 = await base64Promise;

        if (fileBase64) {
          const payload: CreateNormativeDocPayload = {
            title: newDoc.Title,
            documentNumber: newDoc.DocumentNumber,
            documentDate: newDoc.DocumentDate,
            category: newDoc.Category,
            description: newDoc.Description,
            fileName: newDoc.FileName,
            fileSize: selectedFile.size,
            mimeType: newDoc.MimeType,
            fileBase64,
            uploadedBy: newDoc.UploadedBy,
          };
          api.uploadNormativeDocument(payload).catch(() => {});
        }
      } catch {
        // Non-blocking sync error ignored
      }

      // Reset form
      setFormTitle('');
      setFormNumber('');
      setFormDate('');
      setFormCategory('law');
      setFormDescription('');
      setSelectedFile(null);
      closeUploadModal();
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Hujjatni saqlashda xatolik yuz berdi');
    } finally {
      setUploading(false);
    }
  };

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchCat =
        selectedCategory === 'all' ||
        (doc.Category && doc.Category.toLowerCase() === selectedCategory.toLowerCase());

      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        (doc.Title && doc.Title.toLowerCase().includes(q)) ||
        (doc.DocumentNumber && doc.DocumentNumber.toLowerCase().includes(q)) ||
        (!doc.DocumentNumber && (q === 'raqamsiz' || q === 'propusk' || q === "bo'sh")) ||
        (doc.Description && doc.Description.toLowerCase().includes(q)) ||
        (doc.UploadedBy && doc.UploadedBy.toLowerCase().includes(q)) ||
        (doc.FileName && doc.FileName.toLowerCase().includes(q));

      return matchCat && matchQuery;
    });
  }, [documents, selectedCategory, searchQuery]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length };
    for (const d of documents) {
      const c = (d.Category || '').toLowerCase();
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const statusCards: OrderStatusCard[] = [
    { id: 'law', label: 'Qonun va qarorlar', hint: 'Qonunlar, Prezident va Vazirlar Mahkamasi qarorlari', count: categoryCounts.law || 0, icon: Building2, tone: 'blue' },
    { id: 'railway', label: 'O‘ztemiryo‘l qoidalari', hint: 'Temir yo‘l me’yorlari va tartiblari', count: categoryCounts.railway || 0, icon: TrainFront, tone: 'amber' },
    { id: 'internal', label: 'Korxona yo‘riqnomalari', hint: 'SHGKM ichki yo‘riqnoma va tartiblari', count: categoryCounts.internal || 0, icon: ShieldCheck, tone: 'green' },
    { id: 'technical', label: 'Texnik reglamentlar', hint: 'GOST, standartlar va xavfsizlik qoidalari', count: categoryCounts.technical || 0, icon: Scale, tone: 'violet' },
  ];

  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageDocuments = filteredDocuments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const docMenuItems = (doc: NormativeDocument): OrderSheetMenuItem[] => [
    { key: 'edit', label: 'Tahrirlash', icon: Pencil, hidden: !canNormativeUpdate, onClick: () => openEditModal(doc) },
    { key: 'download', label: 'Yuklab olish', icon: Download, tone: 'emerald', onClick: () => { void handleDownload(doc); } },
    { key: 'delete', label: 'O‘chirish', icon: Trash2, variant: 'danger', hidden: !canNormativeDelete, onClick: () => setDocToDelete(doc) },
  ];

  if (!canNormativeRead) {
    return (
      <div className="docs-panel">
        <div className="thub-empty">
          <Lock className="mx-auto mb-2 h-8 w-8 text-slate-400" />
          <p className="thub-empty__title">Ruxsat yo‘q</p>
          <p className="thub-empty__text">Normativ hujjatlarni ko‘rish huquqi sizning rolingizga berilmagan. Administratorga murojaat qiling.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OrderStatusCards
        cards={statusCards}
        active={selectedCategory}
        onChange={id => { setSelectedCategory(prev => (prev === id ? 'all' : id)); setPage(1); }}
        className="order-status-cards--four"
        ariaLabel="Hujjat turi"
      />

      <div className="docs-panel">
        <div className="marketing-orders-toolbar docs-panel__toolbar ndocs-toolbar">
          <div className="marketing-orders-toolbar__filters">
            <label className="thub-search marketing-orders-search">
              <Search className="thub-search__ico" strokeWidth={1.75} aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Nomi, raqami yoki mazmuni…"
                autoComplete="off"
              />
              {searchQuery ? (
                <button type="button" className="thub-search__x" onClick={() => setSearchQuery('')} aria-label="Tozalash">
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </label>
            {selectedCategory !== 'all' ? (
              <button type="button" className="ndocs-filter-pill" onClick={() => setSelectedCategory('all')}>
                {getCategoryInfo(selectedCategory).label}
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="marketing-orders-toolbar__right">
            <div className="flex flex-nowrap items-center gap-2">
              {canNormativeCreate ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="btn-primary marketing-orders-home__create whitespace-nowrap"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                <span>Yangi<span className="marketing-orders-home__create-extra"> hujjat</span></span>
              </button>
              ) : null}
            </div>
          </div>
        </div>

        {loading && documents.length === 0 ? (
          <div className="thub-empty">
            <p className="thub-empty__title">Yuklanmoqda…</p>
            <p className="thub-empty__text">Normativ hujjatlar ro‘yxati olinmoqda.</p>
          </div>
        ) : error && documents.length === 0 ? (
          <div className="thub-empty">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-rose-500" />
            <p className="thub-empty__title">Xatolik yuz berdi</p>
            <p className="thub-empty__text">{error}</p>
            <button type="button" onClick={() => fetchDocs()} className="btn-secondary mx-auto mt-3">Qayta urinish</button>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="thub-empty">
            <p className="thub-empty__title">Hujjatlar topilmadi</p>
            <p className="thub-empty__text">
              {searchQuery
                ? `«${searchQuery}» bo‘yicha normativ hujjat topilmadi.`
                : 'Tanlangan turda hali normativ hujjat yo‘q.'}
            </p>
          </div>
        ) : (
          <>
              <div className="thub-table-wrap reestr-table-wrap">
                <table className="thub-table reestr-table ndocs-table w-full">
                  <thead>
                    <tr>
                      <th className="ndocs-th--center" data-fit="1">№</th>
                      <th className="ndocs-th--left ndocs-th--title">Hujjat nomi</th>
                      <th className="ndocs-th--left" data-fit="1">Turi</th>
                      <th className="ndocs-th--left" data-fit="1">Raqami</th>
                      <th className="ndocs-th--center" data-fit="1">Sanasi</th>
                      <th className="ndocs-th--right" data-fit="1">Hujjat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageDocuments.map((doc, idx) => {
                      const cat = getCategoryInfo(doc.Category);
                      const CatIcon = cat.icon;
                      const num = doc.DocumentNumber?.trim().replace(/^№\s*/, '');
                      return (
                        <tr key={doc.Id} className={`ndocs-tone--${cat.key}`}>
                          <td className="ndocs-td--center tabular-nums text-slate-500">{(currentPage - 1) * pageSize + idx + 1}</td>
                          <td>
                            <button type="button" className="ndocs-title" onClick={() => { void handleOpenPreview(doc); }} title={doc.Title}>
                              <span className="ndocs-title__icon"><CatIcon className="w-4 h-4" /></span>
                              <span className="min-w-0">
                                <strong>{doc.Title}</strong>
                                {doc.Description ? <small>{doc.Description}</small> : null}
                              </span>
                            </button>
                          </td>
                          <td><span className="ndocs-meta__cat">{cat.label}</span></td>
                          <td className="truncate">
                            {num && num.toLowerCase() !== 'raqamsiz'
                              ? <span className="ndocs-number">{num}</span>
                              : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="ndocs-td--center tabular-nums">{formatDate(doc.DocumentDate)}</td>
                          <td className="ndocs-td--right">
                            <div className="ndocs-row__actions">
                              <DocumentChipButton onClick={() => { void handleOpenPreview(doc); }} title="Hujjatni ochish" />
                              <OrderSheetMenu items={docMenuItems(doc)} compact />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            <TablePagination
              total={filteredDocuments.length}
              page={currentPage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              unitLabel="hujjat"
            />
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* PREVIEW MODAL (Brauzerda to'liq ko'rish) */}
      {/* ======================================================== */}
      {/* UPLOAD MODAL */}
      {/* ======================================================== */}
      {uploadModalOpen && (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={() => { if (!uploading) closeUploadModal(); }} />
          <div className="confirm-dialog admin-user-dialog users-dialog ndocs-dialog" role="dialog" aria-modal="true">
            <button type="button" className="confirm-dialog__close" aria-label="Yopish" onClick={closeUploadModal} disabled={uploading}>
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <div className="confirm-dialog__header">
              <div className="confirm-dialog__icon">
                {editingDoc ? <Pencil className="w-5 h-5" strokeWidth={1.75} /> : <FilePlus2 className="w-5 h-5" strokeWidth={1.75} />}
              </div>
              <div className="min-w-0">
                <h2 className="confirm-dialog__title">{editingDoc ? 'Hujjatni tahrirlash' : 'Yangi hujjat'}</h2>
                <p className="users-dialog__subtitle">
                  {editingDoc ? editingDoc.Title : 'Normativ hujjat ma’lumotlarini kiriting va faylini biriktiring'}
                </p>
              </div>
            </div>

            <form className="admin-user-form" onSubmit={handleUploadSubmit}>
              <div className="users-dialog__body">
                {uploadError ? (
                  <div className="ndocs-dialog__error" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                ) : null}

                <label className="admin-field">
                  <span><em>*</em> Hujjat nomi</span>
                  <div className="admin-field-control">
                    <input
                      required
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="Masalan: Temir yo‘llarda yuk tashish qoidalari"
                    />
                  </div>
                </label>

                <div className="admin-field">
                  <span>Turi</span>
                  <div className="ndocs-kind-grid" role="radiogroup" aria-label="Hujjat turi">
                    {CATEGORIES.filter(c => c.key !== 'all').map(cat => {
                      const Icon = cat.icon;
                      const active = formCategory === cat.key;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`ndocs-kind ndocs-tone--${cat.key}${active ? ' is-active' : ''}`}
                          onClick={() => setFormCategory(cat.key)}
                        >
                          <span className="ndocs-kind__icon"><Icon className="w-4 h-4" /></span>
                          <span className="ndocs-kind__label">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ndocs-dialog__row">
                  <label className="admin-field">
                    <span>Hujjat raqami</span>
                    <div className="admin-field-control">
                      <input
                        value={formNumber}
                        onChange={e => setFormNumber(e.target.value)}
                        placeholder="Masalan: 312/SH"
                      />
                    </div>
                    <small className="users-dialog__hint">Raqami bo‘lmasa, bo‘sh qoldiring</small>
                  </label>
                  <div className="admin-field">
                    <span>Qabul qilingan sana</span>
                    <DatePicker value={formDate} onChange={setFormDate} placeholder="Sanani tanlang" />
                  </div>
                </div>

                <label className="admin-field">
                  <span>Qisqacha tavsif</span>
                  <div className="admin-field-control ndocs-dialog__textarea">
                    <textarea
                      rows={3}
                      value={formDescription}
                      onChange={e => setFormDescription(e.target.value)}
                      placeholder="Hujjat kimga mo‘ljallangan, asosiy mazmuni…"
                    />
                  </div>
                </label>

                <div className="admin-field">
                  <span>{editingDoc ? 'Fayl' : <><em>*</em> Fayl</>}</span>
                  <input
                    type="file"
                    id="normative-file-input"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                  {selectedFile || editingDoc ? (
                    <div className="ndocs-file">
                      <span className="ndocs-file__icon"><FileCheck className="w-5 h-5" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="ndocs-file__name">{selectedFile ? selectedFile.name : editingDoc?.FileName}</p>
                        <p className="ndocs-file__meta">
                          {selectedFile ? formatBytes(selectedFile.size) : `${formatBytes(editingDoc?.FileSize ?? 0)} · joriy fayl`}
                        </p>
                      </div>
                      <label htmlFor="normative-file-input" className="ndocs-file__btn">
                        {selectedFile || editingDoc ? 'Almashtirish' : 'Tanlash'}
                      </label>
                      {selectedFile ? (
                        <button type="button" className="ndocs-file__remove" onClick={() => setSelectedFile(null)} aria-label="Faylni olib tashlash">
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <label
                      htmlFor="normative-file-input"
                      className="ndocs-drop"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) setSelectedFile(f);
                      }}
                    >
                      <UploadCloud className="ndocs-drop__icon" />
                      <strong>Faylni tanlang yoki shu yerga tashlang</strong>
                      <small>PDF, DOCX, XLSX yoki rasm · 50 MB gacha</small>
                    </label>
                  )}
                </div>
              </div>

              <div className="confirm-dialog__actions">
                <button type="button" className="btn-secondary confirm-dialog__btn" onClick={closeUploadModal} disabled={uploading}>
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-primary confirm-dialog__btn"
                  disabled={uploading || (!selectedFile && !editingDoc) || !formTitle.trim()}
                >
                  {uploading ? 'Saqlanmoqda…' : editingDoc ? 'Saqlash' : 'Qo‘shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview || previewLoading || previewError ? (
        <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Normativ hujjat">
          <div className="yx-preview-bar">
            <div className="min-w-0">
              <div className="yx-preview-bar__title truncate">{preview?.doc.Title || previewDoc?.Title || 'Normativ hujjat'}</div>
              {preview ? (
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {getCategoryInfo(preview.doc.Category).label}
                  {preview.doc.DocumentNumber?.trim() ? ` · № ${preview.doc.DocumentNumber.trim().replace(/^№\s*/, '')}` : ''}
                  {preview.doc.DocumentDate ? ` · ${formatDate(preview.doc.DocumentDate)}` : ''}
                </div>
              ) : null}
            </div>
            <div className="yx-preview-bar__actions">
              {preview && isPdfPreview(preview) ? (
                <DocumentPrintButton ready onPrint={() => printPdfUrl(preview.url)} />
              ) : preview ? (
                <button
                  type="button"
                  className="btn-primary !px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5"
                  onClick={() => { void handleDownload(preview.doc); }}
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Yuklab olish
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600"
                onClick={closePreview}
                aria-label="Yopish"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div
            className="yx-preview-scroll ndocs-preview-scroll"
            onClick={e => { if (!(e.target as HTMLElement).closest('.pdf-sheet, .ndocs-preview-msg, .ndocs-preview-image')) closePreview(); }}
          >
            {previewLoading ? (
              <div className="ndocs-preview-msg">Hujjat yuklanmoqda…</div>
            ) : previewError ? (
              <div className="ndocs-preview-msg ndocs-preview-msg--error">{previewError}</div>
            ) : preview && preview.mime.startsWith('image/') ? (
              <img src={preview.url} alt={preview.doc.Title} className="ndocs-preview-image" />
            ) : preview && isPdfPreview(preview) ? (
              <PdfPagesViewer url={preview.url} onError={setPreviewError} />
            ) : preview ? (
              <div className="ndocs-preview-msg">
                Bu turdagi faylni ({preview.doc.FileName}) brauzer ichida ko‘rsatib bo‘lmaydi.
                <button type="button" className="btn-primary mx-auto mt-3" onClick={() => { void handleDownload(preview.doc); }}>
                  <Download className="h-4 w-4" /> Yuklab olish
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={docToDelete !== null}
        title="Hujjatni o‘chirish"
        message={docToDelete ? <>«<strong>{docToDelete.Title}</strong>» hujjati butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.</> : ''}
        confirmLabel="Ha, o‘chirish"
        cancelLabel="Bekor qilish"
        variant="danger"
        loading={deleting}
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => { if (!deleting) setDocToDelete(null); }}
      />
    </div>
  );
}
