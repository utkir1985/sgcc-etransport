/**
 * Chop etish about:blank iframe orqali.
 * Brauzer headerida http://IP/registry o‘rniga URL chiqmasin.
 *
 * Yuk xati — A4 landscape; xizmat xati — A4 portrait.
 */
import { hasPendingApprovalQr } from './documentPrintGuard';

export type YukXatiPrintOptions = {
  /** Default: landscape for Yuk xati, portrait for xizmat xati. */
  orientation?: 'landscape' | 'portrait';
};

export function printYukXati(registryId: string, options?: YukXatiPrintOptions) {
  const root = document.querySelector<HTMLElement>(`.yuk-xati[data-registry-id="${registryId}"]`);
  if (!root) return;
  if (hasPendingApprovalQr(root)) return;

  const orientation = options?.orientation
    ?? (root.classList.contains('yuk-xati--landscape') ? 'landscape' : 'portrait');
  const isPortrait = orientation === 'portrait';
  const pageWidth = isPortrait ? '210mm' : '297mm';
  const pageHeight = isPortrait ? '297mm' : '210mm';

  document.body.click();

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', root.classList.contains('entry-permit-document') ? 'Xizmat xati' : 'Yuk xati');
  iframe.setAttribute('aria-hidden', 'true');
  // 0×0 bo‘lsa ba’zi brauzerlar bo‘sh chop etadi — ekrandan tashqarida, lekin o‘lchamli
  iframe.style.cssText =
    `position:fixed;left:0;top:0;width:${pageWidth};height:${pageHeight};border:0;opacity:0;pointer-events:none;z-index:-1`;
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(el => el.outerHTML)
    .join('\n');

  const clone = root.cloneNode(true) as HTMLElement;
  clone.classList.add('yuk-xati--print-target');

  idoc.open();
  idoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title></title>
${styles}
<style>
  @page { size: A4 ${orientation}; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    height: auto !important;
    overflow: visible !important;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .yuk-xati--print-target {
    display: block !important;
    position: static !important;
    width: 100% !important;
    min-width: 0 !important;
    background: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
  }
  .yx2-page {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
    padding: 6mm 5mm !important;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .yx2-page:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  .yxn-page {
    display: flex !important;
    flex-direction: column !important;
    box-sizing: border-box !important;
    width: ${pageWidth} !important;
    max-width: ${pageWidth} !important;
    min-height: 0 !important;
    height: ${isPortrait ? '296mm' : '209mm'} !important;
    max-height: ${isPortrait ? '296mm' : '209mm'} !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: ${isPortrait ? '8mm 10mm 6mm' : '3.5mm 7mm 2.5mm'} !important;
    border: none !important;
    box-shadow: none !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
    page-break-after: always !important;
    break-after: page !important;
  }
  .yuk-xati--print-target .yxn-page,
  .entry-permit-document.yuk-xati--print-target .yxn-page {
    width: ${pageWidth} !important;
    max-width: ${pageWidth} !important;
    min-height: 0 !important;
    height: ${isPortrait ? '296mm' : '209mm'} !important;
    max-height: ${isPortrait ? '296mm' : '209mm'} !important;
    overflow: hidden !important;
    padding: ${isPortrait ? '8mm 10mm 6mm' : '3.5mm 7mm 2.5mm'} !important;
    border: none !important;
  }
  .yxn-page:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  .yxn-head-qr {
    width: 52px !important;
    height: 52px !important;
  }
  .yxn-head-qr .approval-qr,
  .yxn-head-qr canvas,
  .yxn-head-qr img,
  .yxn-head-qr svg {
    width: 48px !important;
    height: 48px !important;
    max-width: 48px !important;
    max-height: 48px !important;
  }
  .yxn-wagons td,
  .yxn-shipment td,
  .yxn-shipment th {
    height: auto !important;
    padding: 2px 4px !important;
  }
  .yxn-signatures {
    flex: none !important;
    margin-top: 3mm !important;
    gap: 4px 8px !important;
  }
  .yxn-sign {
    min-height: 0 !important;
    padding: 3px 8px !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .yxn-sign__qr {
    width: 44px !important;
    height: 44px !important;
    overflow: visible !important;
    flex: none !important;
  }
  .yxn-sign__qr .approval-qr,
  .yxn-sign__qr canvas,
  .yxn-sign__qr img,
  .yxn-sign__qr svg {
    width: 40px !important;
    height: 40px !important;
    max-width: 40px !important;
    max-height: 40px !important;
  }
  .yxn-footer {
    margin-top: auto !important;
    margin-bottom: 0 !important;
    padding-top: 2px !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
  }
  .yxn-parties,
  .yxn-cargo-summary,
  .yxn-shipment,
  .yxn-wagons {
    width: 100% !important;
    min-width: 0 !important;
    border-collapse: collapse !important;
  }
  .yxn-page table,
  .yxn-page table * {
    font-family: "Times New Roman", Times, serif !important;
  }
  .yxn-parties th, .yxn-parties td,
  .yxn-cargo-summary th, .yxn-cargo-summary td,
  .yxn-shipment th, .yxn-shipment td,
  .yxn-wagons th, .yxn-wagons td {
    border: 1px solid #111827 !important;
    background: #fff !important;
  }
  .yxn-wagons tr {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  @media print {
    /* Asosiy CSS dagi body * { visibility:hidden } ni bekor qilish */
    html, body, body * {
      visibility: visible !important;
    }
    body > *:not(.yuk-xati--print-target) {
      display: none !important;
    }
  }
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`);
  idoc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iwin.removeEventListener('afterprint', cleanup);
    iframe.remove();
  };

  const runPrint = () => {
    iwin.addEventListener('afterprint', cleanup);
    try {
      iwin.focus();
      iwin.print();
    } catch {
      cleanup();
      return;
    }
    window.setTimeout(cleanup, 2500);
  };

  const links = Array.from(idoc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  const waitStyles = links.length
    ? Promise.all(
        links.map(
          link =>
            new Promise<void>(resolve => {
              if (link.sheet) {
                resolve();
                return;
              }
              link.addEventListener('load', () => resolve(), { once: true });
              link.addEventListener('error', () => resolve(), { once: true });
              window.setTimeout(() => resolve(), 800);
            }),
        ),
      )
    : Promise.resolve();

  void waitStyles.then(() => {
    window.setTimeout(runPrint, 200);
  });
}
