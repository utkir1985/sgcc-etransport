import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Paperclip, Trash2, Upload, X } from 'lucide-react';
import type { OrderAttachment } from '../types';

interface OrderAttachmentsModalProps {
  open: boolean;
  saving?: boolean;
  existingAttachments: OrderAttachment[];
  pendingFiles: File[];
  removingAttachmentId?: string | null;
  onClose: () => void;
  onPickFiles: (files: FileList | null) => void;
  onRemovePending: (index: number) => void;
  onRemoveExisting: (attachmentId: string) => void;
  /** Tasdiqlash jarayonidagi buyurtmada mavjud ilova o‘chirilmaydi — faqat yangisi qo‘shiladi. */
  canRemoveExisting?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrderAttachmentsModal({
  open,
  saving = false,
  existingAttachments,
  pendingFiles,
  removingAttachmentId = null,
  onClose,
  onPickFiles,
  onRemovePending,
  onRemoveExisting,
  canRemoveExisting = true,
}: OrderAttachmentsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const totalCount = existingAttachments.length + pendingFiles.length;

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (saving) return;
    onPickFiles(event.dataTransfer.files);
  };

  return createPortal(
    <div className="order-attach-modal-root" role="presentation">
      <button
        type="button"
        className="order-attach-modal-backdrop"
        aria-label="Yopish"
        disabled={saving}
        onClick={onClose}
      />
      <div
        className="order-attach-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-attach-modal-title"
      >
        <header className="order-attach-modal__head">
          <div className="order-attach-modal__icon">
            <Paperclip className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="order-attach-modal-title" className="order-attach-modal__title">
              Fayl biriktirish
            </h2>
            <p className="order-attach-modal__subtitle">
              Bir nechta fayl tanlash mumkin · PDF, Word, Excel, rasm yoki ZIP — har biri 20 MB gacha
            </p>
          </div>
          <button
            type="button"
            className="order-attach-modal__close"
            aria-label="Yopish"
            disabled={saving}
            onClick={onClose}
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="order-attach-modal__body">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv,.zip,.rar"
            onChange={e => {
              onPickFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className={`order-attach-dropzone${dragging ? ' order-attach-dropzone--active' : ''}`}
            disabled={saving}
            onClick={() => inputRef.current?.click()}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={handleDrop}
          >
            <span className="order-attach-dropzone__icon">
              <Upload className="w-6 h-6" strokeWidth={1.75} />
            </span>
            <span className="order-attach-dropzone__title">Fayllarni bu yerga tashlang</span>
            <span className="order-attach-dropzone__hint">yoki tanlash uchun bosing — bir yo‘la bir nechtasini</span>
          </button>

          {totalCount === 0 ? (
            <p className="order-attach-empty">Hali biriktirilgan fayl yo‘q</p>
          ) : (
            <ul className="order-attach-list">
              {existingAttachments.map(file => (
                <li key={file.id} className="order-attach-item">
                  <span className="order-attach-item__icon">
                    <FileText className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="order-attach-item__name truncate" title={file.fileName}>{file.fileName}</p>
                    <p className="order-attach-item__meta">{formatSize(file.sizeBytes)}</p>
                  </div>
                  {canRemoveExisting ? (
                    <button
                      type="button"
                      className="order-attach-item__remove"
                      disabled={saving || removingAttachmentId === file.id}
                      onClick={() => onRemoveExisting(file.id)}
                      aria-label="O‘chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </li>
              ))}
              {pendingFiles.map((file, idx) => (
                <li key={`${file.name}-${file.size}-${idx}`} className="order-attach-item order-attach-item--pending">
                  <span className="order-attach-item__icon order-attach-item__icon--pending">
                    <FileText className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="order-attach-item__name truncate" title={file.name}>{file.name}</p>
                    <p className="order-attach-item__meta">Yangi · {formatSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    className="order-attach-item__remove"
                    disabled={saving}
                    onClick={() => onRemovePending(idx)}
                    aria-label="Olib tashlash"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="order-attach-modal__foot">
          <span className="order-attach-modal__count">
            {totalCount > 0 ? `${totalCount} ta fayl` : 'Fayl tanlanmagan'}
          </span>
          <button type="button" className="btn-primary" disabled={saving} onClick={onClose}>
            Tayyor
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
