import { hasPendingApprovalQr } from './documentPrintGuard';

/** Dalolatnoma — A4 landscape, docs/*.pdf andozasi. */
export function printDefectAct(documentId: string) {
  const root = document.querySelector<HTMLElement>(`.defect-act-document[data-defect-act-id="${documentId}"]`);
  if (!root) return;
  if (hasPendingApprovalQr(root)) return;

  document.body.click();

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Dalolatnoma');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:297mm;height:210mm;border:0;opacity:0;pointer-events:none;z-index:-1';
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
  clone.removeAttribute('aria-hidden');

  idoc.open();
  idoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title></title>
${styles}
<style>
  @page { size: A4 landscape; margin: 0; }
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
  .defect-act-document.yuk-xati--print-target {
    display: block !important;
    position: static !important;
    width: 297mm !important;
    min-width: 0 !important;
    background: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
  }
  .defect-act-document.yuk-xati--print-target .yxn-page {
    width: 297mm !important;
    min-height: 210mm !important;
    height: 210mm !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
    padding: 10mm 15mm 10mm !important;
  }
  .defect-act-document,
  .defect-act-document * {
    font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
  }
  @media print {
    html, body, body * { visibility: visible !important; }
    body > *:not(.yuk-xati--print-target) { display: none !important; }
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
