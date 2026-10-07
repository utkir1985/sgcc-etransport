import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface MarketingOrderModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

export function MarketingOrderModal({
  open,
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  wide = true,
  footer,
  children,
}: MarketingOrderModalProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, closeDisabled, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="marketing-order-modal-root" role="presentation">
      <button
        type="button"
        className="marketing-order-modal-backdrop"
        aria-label="Yopish"
        disabled={closeDisabled}
        onClick={onClose}
      />
      <div
        className={`marketing-order-modal${wide ? ' marketing-order-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-order-modal-title"
      >
        <header className="marketing-order-modal__head">
          <div className="marketing-order-modal__intro min-w-0">
            <h2 id="marketing-order-modal-title" className="marketing-order-modal__title">
              {title}
            </h2>
            {subtitle ? <p className="marketing-order-modal__subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="marketing-order-modal__close"
            aria-label="Yopish"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </header>
        <div className="marketing-order-modal__body">{children}</div>
        {footer ? <footer className="marketing-order-modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
