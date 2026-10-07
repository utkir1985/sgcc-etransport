import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Paperclip } from 'lucide-react';
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

/** Sana yonidagi ixcham ilovalar — bosilganda to'g'ridan-to'g'ri yuklab oladi. */
export function OrderAttachmentsPanel({
  orderId,
  attachments,
}: OrderAttachmentsPanelProps) {
  const files = attachments ?? [];
  const [open, setOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  if (files.length === 0) return null;

  const handleDownload = async (file: OrderAttachment) => {
    try {
      setDownloadingId(file.id);
      await api.downloadOrderAttachment(orderId, file.id, file.fileName, file.contentType);
      setOpen(false);
    } catch (err) {
      console.error('Attachment download failed:', err);
      window.alert('Ilovani yuklab olishda xatolik yuz berdi: ' + (err instanceof Error ? err.message : 'Noma’lum xatolik'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleTriggerClick = () => {
    if (files.length === 1) {
      void handleDownload(files[0]);
    } else {
      setOpen(v => !v);
    }
  };

  const isSingleDownloading = files.length === 1 && downloadingId === files[0].id;

  return (
    <div className="order-sheet-annex-chip" ref={rootRef}>
      <button
        type="button"
        className={`order-sheet-annex-chip__trigger${open ? ' order-sheet-annex-chip__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup={files.length > 1 ? 'menu' : undefined}
        title={files.length === 1 ? `Ilovani yuklab olish: ${files[0].fileName}` : `${files.length} ta ilova`}
        onClick={handleTriggerClick}
        disabled={isSingleDownloading}
      >
        {isSingleDownloading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
        ) : files.length === 1 ? (
          <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        ) : (
          <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
        )}
        <span>Ilova</span>
        <span className="order-sheet-annex-chip__count">{files.length}</span>
      </button>

      {open && files.length > 1 && (
        <ul className="order-sheet-annex-chip__menu" role="menu">
          {files.map(file => (
            <li key={file.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="order-sheet-annex-chip__item"
                disabled={downloadingId === file.id}
                onClick={() => {
                  void handleDownload(file);
                }}
              >
                <div className="min-w-0 flex-1 text-left">
                  <p className="order-sheet-annex-chip__name truncate" title={file.fileName}>
                    {file.fileName}
                  </p>
                  <p className="order-sheet-annex-chip__meta">
                    {formatAttachmentSize(file.sizeBytes)}
                    {file.uploadedBy ? ` · ${file.uploadedBy}` : ''}
                  </p>
                </div>
                {downloadingId === file.id ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-600" />
                ) : (
                  <Download className="w-3.5 h-3.5 shrink-0 opacity-60 hover:opacity-100" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
