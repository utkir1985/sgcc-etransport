import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
// Vite ishchini .js fayl sifatida yig‘adi — server .mjs uchun noto‘g‘ri MIME qaytaradi
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  GlobalWorkerOptions.workerPort = new PdfWorker();
  workerReady = true;
}

/** Sahifa kengligi (CSS px) — yuk xati varag‘i bilan bir xil o‘lchamda */
const PAGE_WIDTH = 1100;

/**
 * PDF sahifalarini oq varaq ko‘rinishida chizadi (brauzerning PDF asboblar panelisiz) —
 * yuk xati va kiritish xizmat xati ko‘rinishiga mos.
 */
export function PdfPagesViewer({ url, onError }: { url: string; onError?: (message: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    setLoading(true);

    ensureWorker();
    const task = getDocument(url);
    task.promise
      .then(async pdf => {
        const width = Math.min(PAGE_WIDTH, host.clientWidth || PAGE_WIDTH);
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= pdf.numPages; n += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-sheet';
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
          canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
          host.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
          if (n === 1 && !cancelled) setLoading(false);
        }
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        onErrorRef.current?.('Hujjatni ochib bo‘lmadi — fayl buzilgan yoki PDF emas.');
      });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  return (
    <div className="pdf-sheets">
      {loading ? <div className="pdf-sheets__loading">Hujjat yuklanmoqda…</div> : null}
      <div ref={hostRef} className="pdf-sheets__pages" />
    </div>
  );
}

/** PDF faylni yangi oyna ochmasdan chop etish oynasiga yuboradi. */
export function printPdfUrl(url: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
