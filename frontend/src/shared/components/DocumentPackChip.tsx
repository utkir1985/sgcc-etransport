import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Paperclip } from 'lucide-react';
import type { PartyDocument } from '../utils/partyDocuments';

interface DocumentPackChipProps {
  documents: PartyDocument[];
  onOpen: (doc: PartyDocument) => void;
  emptyLabel?: string;
}

const KIND_META: Record<PartyDocument['kind'], string> = {
  'yuk-xati': 'QR kodli asosiy hujjat',
  'yuk-ilova': 'Vagonlar ro‘yxati',
  kiritish: 'QR kodli kirish xati',
  dalolatnoma: 'QR kodli dalolatnoma',
};

const MENU_WIDTH = 288;

function menuPosition(trigger: HTMLElement, itemCount: number) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(MENU_WIDTH, Math.max(224, window.innerWidth - 16));
  const height = Math.min(itemCount * 52 + 8, window.innerHeight - 16);
  let left = rect.right - width;
  if (left < 8) left = 8;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 6);
  }
  return { top, left, width };
}

/** Yuk xati, kiritish xati, dalolatnoma va ilovalar — bitta ochiladigan to‘plam. */
export function DocumentPackChip({
  documents,
  onOpen,
  emptyLabel = '—',
}: DocumentPackChipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: MENU_WIDTH });

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setCoords(menuPosition(trigger, documents.length));
  }, [documents.length]);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open, placeMenu]);

  const openDoc = (doc: PartyDocument) => {
    setOpen(false);
    onOpen(doc);
  };

  if (documents.length === 0) {
    return <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{emptyLabel}</span>;
  }

  return (
    <div className="order-sheet-annex-chip">
      <button
        ref={triggerRef}
        type="button"
        className={`order-sheet-annex-chip__trigger${open ? ' order-sheet-annex-chip__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={event => {
          event.stopPropagation();
          if (documents.length === 1) {
            openDoc(documents[0]);
            return;
          }
          setOpen(v => !v);
        }}
      >
        <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span>Hujjat</span>
        <span className="order-sheet-annex-chip__count">{documents.length}</span>
      </button>

      {open && documents.length > 1
        ? createPortal(
            <ul
              ref={menuRef}
              className="order-sheet-annex-chip__menu order-sheet-annex-chip__menu--portal"
              role="menu"
              style={{ top: coords.top, left: coords.left, width: coords.width }}
            >
              {documents.map(doc => (
                <li key={doc.key} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="order-sheet-annex-chip__item"
                    onClick={event => {
                      event.stopPropagation();
                      openDoc(doc);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="order-sheet-annex-chip__name truncate">{doc.label}</p>
                      <p className="order-sheet-annex-chip__meta truncate">
                        {doc.meta ? `${doc.meta} · ` : ''}
                        {KIND_META[doc.kind]}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Sahifa o‘z hujjatini ochadi (yuk xati / kiritish xati / dalolatnoma). */
export function DocumentChipButton({
  onClick,
  title,
}: {
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="order-sheet-annex-chip__trigger"
      title={title}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span>Hujjat</span>
    </button>
  );
}
