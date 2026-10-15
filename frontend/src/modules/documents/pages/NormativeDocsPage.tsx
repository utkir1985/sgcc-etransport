import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  UploadCloud,
  Search,
  Download,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  LayoutGrid,
  List,
  CalendarDays,
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
import type { NormativeDocument, CreateNormativeDocPayload } from '../../../shared/types';
import { useAuth } from '../../../shared/contexts/AuthContext';
import {
  getLocalNormativeDocs,
  saveLocalNormativeDoc,
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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try { return localStorage.getItem('ndocs-view') === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
  });
  const changeViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    try { localStorage.setItem('ndocs-view', mode); } catch { /* ixtiyoriy */ }
  };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);

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

  // Open document directly in a new browser tab/window (fast, full Chrome PDF reader)
  const handleOpenPreview = async (doc: NormativeDocument) => {
    // 1. If it is a seed document with a static file, open directly
    if (
      doc.Id.startsWith('seed-') ||
      (doc.FileName && [
        'SHGKM_jarayoni_tahrir_2.pdf', 'Temir_yol_transporti_qonuni_103.pdf',
        'SHGKM_ichki_transport_yoriqnomasi_312.pdf',
        'SUG_xavfsizlik_reglamenti_84.pdf',
        'Temir_yollarda_yuk_tashish_qoidalari_142.pdf'
      ].includes(doc.FileName))
    ) {
      window.open(`/normative-files/${doc.FileName}`, '_blank');
      return;
    }

    // 2. Try get file from local storage (IndexedDB)
    try {
      const { blob } = await getLocalNormativeDocFile(doc.Id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // 3. Fallback to API
      try {
        const { url } = await api.fetchNormativeDocumentBlob(doc.Id);
        window.open(url, '_blank');
      } catch {
        window.open(api.getNormativeDocViewUrl(doc.Id), '_blank');
      }
    }
  };

  // Handle download
  const handleDownload = async (doc: NormativeDocument) => {
    try {
      // If it is a seed document with a static file, download directly
      if (doc.Id.startsWith('seed-') || (doc.FileName && ['SHGKM_jarayoni_tahrir_2.pdf', 'Temir_yol_transporti_qonuni_103.pdf', 'SHGKM_ichki_transport_yoriqnomasi_312.pdf', 'SUG_xavfsizlik_reglamenti_84.pdf', 'Temir_yollarda_yuk_tashish_qoidalari_142.pdf'].includes(doc.FileName))) {
        const a = document.createElement('a');
        a.href = `/normative-files/${doc.FileName}`;
        a.download = doc.FileName || `${doc.Title}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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

  // Handle upload submit
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setUploadError('Hujjat nomini kiriting');
      return;
    }
    if (!selectedFile) {
      setUploadError('Faylni tanlang');
      return;
    }

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
      setUploadModalOpen(false);
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
    { key: 'download', label: 'Yuklab olish', icon: Download, tone: 'emerald', onClick: () => { void handleDownload(doc); } },
    { key: 'delete', label: 'O‘chirish', icon: Trash2, variant: 'danger', onClick: () => setDocToDelete(doc) },
  ];

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
              <div className="order-kind-toggle ndocs-view-toggle" role="radiogroup" aria-label="Ko‘rinish">
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewMode === 'list'}
                  className={`order-kind-toggle__btn${viewMode === 'list' ? ' is-active' : ''}`}
                  onClick={() => changeViewMode('list')}
                  title="Ro‘yxat"
                >
                  <List className="order-kind-toggle__icon" aria-hidden />
                  <span className="ndocs-view-toggle__label">Ro‘yxat</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewMode === 'grid'}
                  className={`order-kind-toggle__btn${viewMode === 'grid' ? ' is-active' : ''}`}
                  onClick={() => changeViewMode('grid')}
                  title="Kartochka"
                >
                  <LayoutGrid className="order-kind-toggle__icon" aria-hidden />
                  <span className="ndocs-view-toggle__label">Kartochka</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="btn-primary marketing-orders-home__create whitespace-nowrap"
              >
                <UploadCloud className="w-4 h-4" strokeWidth={2} />
                <span>Hujjat<span className="marketing-orders-home__create-extra"> yuklash</span></span>
              </button>
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
            {viewMode === 'list' ? (
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
            ) : (
              <div className="ndocs-grid" role="list">
                {pageDocuments.map(doc => {
                  const cat = getCategoryInfo(doc.Category);
                  const CatIcon = cat.icon;
                  return (
                    <article key={doc.Id} className={`ndocs-card ndocs-tone--${cat.key}`} role="listitem">
                      <div className="ndocs-card__head">
                        <span className="ndocs-card__icon"><CatIcon className="w-5 h-5" /></span>
                        <div className="ndocs-card__kind">
                          <span className="ndocs-card__cat">{cat.label}</span>
                          <span className="ndocs-card__num">
                            {(() => { const num = doc.DocumentNumber?.trim().replace(/^№\s*/, ''); return num && num.toLowerCase() !== 'raqamsiz' ? `№ ${num}` : 'Raqamsiz'; })()}
                          </span>
                        </div>
                        <OrderSheetMenu items={docMenuItems(doc)} compact />
                      </div>
                      <button type="button" className="ndocs-card__title" onClick={() => { void handleOpenPreview(doc); }}>
                        {doc.Title}
                      </button>
                      {doc.Description ? <p className="ndocs-card__desc">{doc.Description}</p> : null}
                      <div className="ndocs-card__foot">
                        <span className="ndocs-meta__item"><CalendarDays className="w-3.5 h-3.5" />{formatDate(doc.DocumentDate)}</span>
                        <DocumentChipButton onClick={() => { void handleOpenPreview(doc); }} title="Hujjatni ochish" />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Yangi normativ hujjat yuklash
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    PDF, Word, Excel yoki boshqa normativ hujjat faylini tizimga kiriting
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Hujjat nomi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Masalan: Temir yo‘llarda yuk tashish qoidalari..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Number and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Hujjat raqami
                    </label>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      (Ixtiyoriy / Propusk)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={formNumber}
                    onChange={e => setFormNumber(e.target.value)}
                    placeholder="Bilmasangiz, bo‘sh qoldiring"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Qaror/qonun raqami noma'lum bo'lsa, kiritmasdan o'tishingiz mumkin
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Qabul qilingan sana
                    </label>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      (Ixtiyoriy)
                    </span>
                  </div>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Bo‘lim / Kategoriya
                </label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="law">Qonun va qarorlar</option>
                  <option value="railway">O‘ztemiryo‘l qoidalari</option>
                  <option value="internal">Korxona yo‘riqnomalari (SHGKM)</option>
                  <option value="technical">Texnik reglamentlar (GOST / Standartlar)</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Qisqacha tavsif / Izoh
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Hujjat kimga mo'ljallangan, asosiy mazmuni..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* File Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Faylni yuklash <span className="text-rose-500">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-5 text-center hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-slate-50/50 dark:bg-slate-800/40">
                  <input
                    type="file"
                    id="normative-file-input"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2.5 truncate">
                        <FileCheck className="w-6 h-6 text-emerald-600 shrink-0" />
                        <div className="text-left truncate">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatBytes(selectedFile.size)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="normative-file-input"
                      className="cursor-pointer block text-slate-500 dark:text-slate-400"
                    >
                      <UploadCloud className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Faylni tanlash uchun bosing yoki shu yerga tashlang
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        PDF, DOCX, XLSX, rasm formatlari (50 MB gacha)
                      </p>
                    </label>
                  )}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || !formTitle.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/25 transition-all disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Yuklanmoqda...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Yuklash va saqlash</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
