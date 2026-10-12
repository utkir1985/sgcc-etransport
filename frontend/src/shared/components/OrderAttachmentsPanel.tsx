import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Loader2,
  Paperclip,
  ExternalLink,
  X,
  Eye,
  FileText,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import type { OrderAttachment } from '../types';
import { api } from '../services/api';

interface OrderAttachmentsPanelProps {
  orderId: string;
  attachments?: OrderAttachment[] | null;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(fileName: string, contentType?: string): 'pdf' | 'image' | 'other' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf' || contentType === 'application/pdf') return 'pdf';
  if (
    ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ||
    (contentType && contentType.startsWith('image/'))
  ) {
    return 'image';
  }
  return 'other';
}

export function OrderAttachmentsPanel({
  orderId,
  attachments,
}: OrderAttachmentsPanelProps) {
  const files = attachments ?? [];
  const [open, setOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Modal preview state
  const [previewFile, setPreviewFile] = useState<OrderAttachment | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Dropdown outside click / escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Load preview blob when previewFile changes
  useEffect(() => {
    if (!previewFile) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPreviewBlob(null);
      setPreviewError(null);
      return;
    }

    let isCancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);

    api.getOrderAttachmentBlob(
      orderId,
      previewFile.id,
      previewFile.fileName,
      previewFile.contentType
    )
      .then(blob => {
        if (isCancelled) return;
        setPreviewBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(err => {
        if (isCancelled) return;
        console.error('Failed to load preview blob:', err);
        setPreviewError(err instanceof Error ? err.message : 'Faylni yuklab bo‘lmadi');
      })
      .finally(() => {
        if (!isCancelled) setLoadingPreview(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [orderId, previewFile]);

  // Escape key for modal
  useEffect(() => {
    if (!previewFile) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePreview();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewFile]);

  if (files.length === 0) return null;

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewBlob(null);
    setPreviewFile(null);
    setPreviewError(null);
  };

  const handleDownload = async (file: OrderAttachment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setDownloadingId(file.id);
      await api.downloadOrderAttachment(orderId, file.id, file.fileName, file.contentType);
      setOpen(false);
    } catch (err) {
      console.error('Attachment download failed:', err);
      window.alert(
        'Ilovani yuklab olishda xatolik yuz berdi: ' +
          (err instanceof Error ? err.message : 'Noma’lum xatolik')
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadActivePreview = () => {
    if (!previewFile) return;
    if (previewBlob) {
      api.triggerBlobDownload(previewBlob, previewFile.fileName);
    } else {
      void handleDownload(previewFile);
    }
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const handleTriggerClick = () => {
    if (files.length === 1) {
      setPreviewFile(files[0]);
    } else {
      setOpen(v => !v);
    }
  };

  const openPreviewForFile = (file: OrderAttachment) => {
    setPreviewFile(file);
    setOpen(false);
  };

  const activeFileType = previewFile
    ? getFileType(previewFile.fileName, previewFile.contentType)
    : 'other';

  return (
    <>
      <div className="order-sheet-annex-chip" ref={rootRef}>
        <button
          type="button"
          className={`order-sheet-annex-chip__trigger${open ? ' order-sheet-annex-chip__trigger--open' : ''}`}
          aria-expanded={open}
          aria-haspopup={files.length > 1 ? 'menu' : undefined}
          title={
            files.length === 1
              ? `Ilovani ko‘rish / yuklab olish: ${files[0].fileName}`
              : `${files.length} ta ilova`
          }
          onClick={handleTriggerClick}
        >
          {files.length === 1 ? (
            <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          ) : (
            <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          <span>Ilova</span>
          <span className="order-sheet-annex-chip__count">{files.length}</span>
        </button>

        {open && files.length > 1 && (
          <ul className="order-sheet-annex-chip__menu" role="menu">
            {files.map(file => {
              const fileType = getFileType(file.fileName, file.contentType);
              return (
                <li key={file.id} role="none">
                  <div
                    role="menuitem"
                    className="order-sheet-annex-chip__item flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer"
                    onClick={() => openPreviewForFile(file)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {fileType === 'pdf' ? (
                        <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                      ) : fileType === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : (
                        <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1 text-left">
                        <p className="order-sheet-annex-chip__name truncate text-xs font-semibold" title={file.fileName}>
                          {file.fileName}
                        </p>
                        <p className="order-sheet-annex-chip__meta text-[11px] text-slate-400">
                          {formatAttachmentSize(file.sizeBytes)}
                          {file.uploadedBy ? ` · ${file.uploadedBy}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition"
                        title="Ko‘rish"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPreviewForFile(file);
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition"
                        title="Yuklab olish"
                        disabled={downloadingId === file.id}
                        onClick={(e) => void handleDownload(file, e)}
                      >
                        {downloadingId === file.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal Preview */}
      {previewFile &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 md:p-6"
            onClick={closePreview}
          >
            <div
              className="relative flex flex-col w-full max-w-5xl h-[88vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeFileType === 'pdf' ? (
                    <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                  ) : activeFileType === 'image' ? (
                    <ImageIcon className="w-5 h-5 text-blue-500 shrink-0" />
                  ) : (
                    <Paperclip className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h3
                      className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate max-w-sm md:max-w-lg"
                      title={previewFile.fileName}
                    >
                      {previewFile.fileName}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatAttachmentSize(previewFile.sizeBytes)}
                      {previewFile.uploadedBy ? ` · ${previewFile.uploadedBy}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* File switcher if multiple files */}
                  {files.length > 1 && (
                    <select
                      className="text-xs font-medium py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none max-w-[12rem] truncate"
                      value={previewFile.id}
                      onChange={e => {
                        const target = files.find(f => f.id === e.target.value);
                        if (target) setPreviewFile(target);
                      }}
                    >
                      {files.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.fileName}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Yangi tabda ochish */}
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={handleOpenInNewTab}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition"
                      title="Brauzerning yangi ilovasida ochish"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Yangi oynada</span>
                    </button>
                  )}

                  {/* Yuklab olish */}
                  <button
                    type="button"
                    onClick={handleDownloadActivePreview}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
                    title="Faylni yuklab olish"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Yuklab olish</span>
                  </button>

                  {/* Yopish */}
                  <button
                    type="button"
                    onClick={closePreview}
                    className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition ml-1"
                    title="Yopish (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
                {loadingPreview ? (
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-9 h-9 animate-spin text-blue-600" />
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Ilova yuklanmoqda...
                    </p>
                  </div>
                ) : previewError ? (
                  <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-sm">
                    <AlertCircle className="w-10 h-10 text-rose-500" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {previewError}
                    </p>
                    <button
                      type="button"
                      onClick={handleDownloadActivePreview}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow transition mt-1"
                    >
                      <Download className="w-4 h-4" />
                      <span>Yuklab olish</span>
                    </button>
                  </div>
                ) : previewUrl ? (
                  activeFileType === 'pdf' ? (
                    <iframe
                      src={`${previewUrl}#toolbar=1`}
                      className="w-full h-full border-0 bg-slate-100 dark:bg-slate-950"
                      title={previewFile.fileName}
                    />
                  ) : activeFileType === 'image' ? (
                    <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
                      <img
                        src={previewUrl}
                        alt={previewFile.fileName}
                        className="max-h-full max-w-full object-contain rounded-lg shadow-lg border border-slate-200/50 dark:border-slate-800"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-sm">
                      <Paperclip className="w-12 h-12 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {previewFile.fileName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Bu fayl turini brauzerda to‘g‘ridan-to‘g‘ri ko‘rib bo‘lmaydi. Qurilmangizga yuklab olib ochishingiz mumkin.
                      </p>
                      <button
                        type="button"
                        onClick={handleDownloadActivePreview}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow transition mt-1"
                      >
                        <Download className="w-4 h-4" />
                        <span>Yuklab olish</span>
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
