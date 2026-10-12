import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  UploadCloud,
  Search,
  Eye,
  Download,
  Trash2,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
    FileCheck,
  Building2,
  TrainFront,
  ShieldCheck,
  Scale,
  LayoutGrid,
  List,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

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

  return (
    <div className="min-h-full space-y-6 p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto transition-colors">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                Normativ hujjatlar
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                {documents.length} ta hujjat
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Qonunlar, O‘zbekiston temir yo‘llari me’yorlari, ichki yo‘riqnomalar va texnik standartlar bazasi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchDocs()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Yangilash</span>
          </button>

          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 stroke-[2.5]" />
            <span>Yangi hujjat yuklash</span>
          </button>
        </div>
      </div>

      {/* Category Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {CATEGORIES.filter(c => c.key !== 'all').map(cat => {
          const count = categoryCounts[cat.key] || 0;
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(isSelected ? 'all' : cat.key)}
              className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group ${
                isSelected
                  ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.badgeClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {count}
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {cat.label}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isSelected ? "Faol filtr (bekor qilish uchun bosing)" : "Filtrlash uchun bosing"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search and Category Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          {CATEGORIES.map(cat => {
            const isSelected = selectedCategory === cat.key;
            const count = categoryCounts[cat.key] || 0;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/70'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-xs px-1.5 py-0.2 rounded-full font-mono font-medium ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Layout toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nomi, raqami yoki mazmuni..."
              className="w-full pl-9 pr-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Karta ko‘rinishi"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Jadval ko‘rinishi"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading && documents.length === 0 ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            Normativ hujjatlar yuklanmoqda...
          </p>
        </div>
      ) : error && documents.length === 0 ? (
        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
          <h3 className="text-base font-bold text-rose-800 dark:text-rose-200">Xatolik yuz berdi</h3>
          <p className="text-sm text-rose-600 dark:text-rose-300 mt-1">{error}</p>
          <button
            onClick={() => fetchDocs()}
            className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 shadow-sm"
          >
            Qayta urinish
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 mb-3">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Hujjatlar topilmadi</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
            {searchQuery
              ? `"${searchQuery}" bo'yicha hech qanday normativ hujjat topilmadi.`
              : "Tanlangan toifada hali normativ hujjatlar mavjud emas."}
          </p>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Birinchi hujjatni yuklash</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocuments.map(doc => {
            const cat = getCategoryInfo(doc.Category);
            const CatIcon = cat.icon;
            return (
              <div
                key={doc.Id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group hover:border-blue-400/70 dark:hover:border-blue-700"
              >
                <div className="p-5">
                  {/* Top line: Category and Document Number */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cat.badgeClass}`}
                    >
                      <CatIcon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </span>

                    {/* Hujjat raqami bo'lsa ko'rsatiladi, bo'lmasa "Raqamsiz" belgisi chiqadi */}
                    {doc.DocumentNumber && doc.DocumentNumber.trim() ? (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {doc.DocumentNumber}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100/70 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700">
                        Raqamsiz
                      </span>
                    )}
                  </div>

                  {/* Document Title */}
                  <h3
                    onClick={() => handleOpenPreview(doc)}
                    className="text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                    title={doc.Title}
                  >
                    {doc.Title}
                  </h3>

                  {/* Description */}
                  {doc.Description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {doc.Description}
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span title="Hujjat sanasi">{formatDate(doc.DocumentDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end truncate">
                      <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatBytes(doc.FileSize)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[130px]">
                    {doc.UploadedBy || 'Admin'}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Preview Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(doc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-300 transition-colors"
                      title="Hujjatni brauzerda ko‘rish"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ko‘rish</span>
                    </button>

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 transition-colors"
                      title="Faylni yuklab olish"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Yuklab olish</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setDocToDelete(doc)}
                      className="p-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer"
                      title="O‘chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[2]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Hujjat raqami & Sanasi</th>
                  <th className="px-5 py-3.5">Hujjat nomi va mazmuni</th>
                  <th className="px-5 py-3.5">Kategoriya</th>
                  <th className="px-5 py-3.5">Hajmi</th>
                  <th className="px-5 py-3.5">Mas'ul</th>
                  <th className="px-5 py-3.5 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDocuments.map(doc => {
                  const cat = getCategoryInfo(doc.Category);
                  const CatIcon = cat.icon;
                  return (
                    <tr
                      key={doc.Id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        {doc.DocumentNumber && doc.DocumentNumber.trim() ? (
                          <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                            {doc.DocumentNumber}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 font-medium">
                            Raqamsiz
                          </div>
                        )}
                        <div className="text-xs text-slate-400 mt-0.5">
                          {formatDate(doc.DocumentDate)}
                        </div>
                      </td>

                      <td className="px-5 py-4 max-w-md">
                        <div
                          onClick={() => handleOpenPreview(doc)}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer line-clamp-1"
                        >
                          {doc.Title}
                        </div>
                        {doc.Description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                            {doc.Description}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cat.badgeClass}`}
                        >
                          <CatIcon className="w-3.5 h-3.5" />
                          <span>{cat.label}</span>
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-300">
                        {formatBytes(doc.FileSize)}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {doc.UploadedBy || 'Admin'}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(doc)}
                            className="p-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 transition-colors"
                            title="Ko‘rish"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors"
                            title="Yuklab olish"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDocToDelete(doc)}
                            className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 transition-colors"
                            title="O‘chirish"
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
      )}

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

      {/* ======================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ======================================================== */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Hujjatni o‘chirmoqchimisiz?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              «<b className="text-slate-800 dark:text-slate-200">{docToDelete.Title}</b>» hujjati butunlay o‘chiriladi.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDocToDelete(null)}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-md shadow-rose-500/25 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>O‘chirilmoqda...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Ha, o‘chirilsin</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
