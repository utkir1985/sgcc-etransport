import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Tasdiqlash',
  cancelLabel = 'Bekor qilish',
  variant = 'default',
  loading = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-dialog-root" role="presentation">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Yopish"
        disabled={loading}
        onClick={onCancel}
      />
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <button
          type="button"
          className="confirm-dialog__close"
          aria-label="Yopish"
          disabled={loading}
          onClick={onCancel}
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <div className="confirm-dialog__header">
          <div className={`confirm-dialog__icon${variant === 'danger' ? ' confirm-dialog__icon--danger' : ''}`}>
            <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <h2 id="confirm-dialog-title" className="confirm-dialog__title">{title}</h2>
        </div>

        <div id="confirm-dialog-message" className="confirm-dialog__message whitespace-pre-line">{message}</div>

        {error && <p className="confirm-dialog__error">{error}</p>}

        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="btn-secondary confirm-dialog__btn"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog__btn confirm-dialog__btn--confirm${
              variant === 'danger' ? ' confirm-dialog__btn--danger' : ' btn-primary'
            }`}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? 'Kutilmoqda...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
