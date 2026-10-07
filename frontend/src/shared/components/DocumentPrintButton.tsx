import { Printer } from 'lucide-react';
import { PRINT_LOCKED_TITLE } from '../utils/documentPrintGuard';

type Props = {
  ready: boolean;
  onPrint: () => void;
  title?: string;
  lockedTitle?: string;
};

export function DocumentPrintButton({ ready, onPrint, title, lockedTitle }: Props) {
  return (
    <button
      type="button"
      className="btn-primary !px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5"
      disabled={!ready}
      title={ready ? (title || 'Chop etish / PDF') : (lockedTitle || PRINT_LOCKED_TITLE)}
      onClick={() => {
        if (!ready) return;
        onPrint();
      }}
    >
      <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
      Chop etish / PDF
    </button>
  );
}
