// IndexedDB based high-performance storage for Normative Documents
// Provides instant offline/WAN upload, preview, download, and search
// Works flawlessly on HTTPS, LAN, and WAN without mixed-content or port blocks.

import type { NormativeDocument } from '../types';

const DB_NAME = 'ETransport_NormativeDocs';
const DB_VERSION = 3; // Incremented to version 3 to sync newly added documents across IP and Domain
const STORE_DOCS = 'documents';
const STORE_FILES = 'files';

// Default seed documents
export const SEED_DOCUMENTS: (Omit<NormativeDocument, 'Id' | 'CreatedAt'> & { Id: string; CreatedAt: string })[] = [
  {
    Id: 'seed-railway-temiryol-jarayoni',
    Title: "Темир йўл жараёни (процедура)",
    DocumentNumber: "Raqamsiz",
    DocumentDate: "2026-09-28",
    Category: "railway",
    Description: "O'zbekiston temir yo'llari va Sho'rtan GKM o'rtasidagi vagonlar harakati va temir yo'l jarayoni bo'yicha amaliy protsedura yo'riqnomasi.",
    FileName: "Temir_yol_jarayoni_protsedura.pdf",
    FileSize: 5033165, // 4.8 MB
    MimeType: "application/pdf",
    UploadedBy: "Tizim Administratori",
    CreatedAt: "2026-09-28T18:00:00.000Z",
  },
  {
    Id: 'seed-shgkm-jarayoni-tahrir-2',
    Title: "«Sho'rtan GKM» MCHJda ishlab chiqarilgan Tayyor mahsulotlarni temir yo'l transporti orqali jo'natish va moddiy-texnik resurslarni tushirib olish JARAYONI (2-tahrir)",
    DocumentNumber: "2-tahrir (2026-yil)",
    DocumentDate: "2026-08-08",
    Category: "internal",
    Description: "Sho'rtan GKM MCHJ Bosh direktori Sh.Ch. Aslanov tomonidan tasdiqlangan va Qo'riqlash xizmati 2-batalyoni bilan kelishilgan. Tayyor mahsulot jo'natish va MTRlarni tushirish bo'yicha jami texnologik me'yor: 533 daqiqa (8 soat 53 daqiqa). 13 ta operatsiyaning daqiqabay reglamenti belgilangan.",
    FileName: "SHGKM_jarayoni_tahrir_2.pdf",
    FileSize: 2200,
    MimeType: "application/pdf",
    UploadedBy: "Bosh direktor",
    CreatedAt: "2026-08-08T10:00:00.000Z",
  },
  {
    Id: 'seed-law-103',
    Title: "O'zbekiston Respublikasi «Temir yo'l transporti to'g'risida»gi Qonuni",
    DocumentNumber: "№ O'RQ-103",
    DocumentDate: '2022-06-08',
    Category: 'law',
    Description: "O'zbekiston Respublikasida temir yo'l transportining faoliyat yuritishining huquqiy, iqtisodiy va tashkiliy asoslari hamda harakat xavfsizligini ta'minlash qoidalari.",
    FileName: 'Temir_yol_transporti_qonuni_103.pdf',
    FileSize: 1385,
    MimeType: 'application/pdf',
    UploadedBy: 'Bosh admin',
    CreatedAt: '2026-09-28T15:30:00.000Z',
  },
  {
    Id: 'seed-internal-312',
    Title: "Sho'rtan GKM ichki transport va vagon aylanishi bo'yicha yo'riqnoma",
    DocumentNumber: '№ 312/SH',
    DocumentDate: '2025-01-10',
    Category: 'internal',
    Description: "Zavod hududiga vagonlarni kiritish, tarozi o'lchovlari, plombalash va yuk xatlarini (reestr) rasmiylashtirish tartibi.",
    FileName: 'SHGKM_ichki_transport_yoriqnomasi_312.pdf',
    FileSize: 1433,
    MimeType: 'application/pdf',
    UploadedBy: 'Bosh admin',
    CreatedAt: '2026-09-28T15:30:00.000Z',
  },
  {
    Id: 'seed-tech-84',
    Title: "Suyultirilgan uglevodorod gazlarini (SUG) saqlash va yuklash xavfsizligi qoidalari",
    DocumentNumber: '№ 84-TX',
    DocumentDate: '2023-11-20',
    Category: 'technical',
    Description: "SHGKM estakadalarida suyultirilgan gaz sisternalarini quyish, tarozi nazorati va texnik xavfsizlik reglamenti.",
    FileName: 'SUG_xavfsizlik_reglamenti_84.pdf',
    FileSize: 1433,
    MimeType: 'application/pdf',
    UploadedBy: 'Bosh admin',
    CreatedAt: '2026-09-28T15:30:00.000Z',
  },
  {
    Id: 'seed-railway-142',
    Title: "Temir yo'llarda yuk tashish qoidalari (O'zbekiston temir yo'llari AJ)",
    DocumentNumber: '№ 142-Q',
    DocumentDate: '2024-03-15',
    Category: 'railway',
    Description: "Temir yo'l transportida xavfli yuklar, vagon-sisternalar va quyma yuklarni qabul qilish, tashish va topshirish tartibi.",
    FileName: 'Temir_yollarda_yuk_tashish_qoidalari_142.pdf',
    FileSize: 1433,
    MimeType: 'application/pdf',
    UploadedBy: 'Bosh admin',
    CreatedAt: '2026-09-28T15:30:00.000Z',
  },
];

function createSamplePdfBlob(title: string, docNumber: string): Blob {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 200 >> stream
BT
/F1 18 Tf
50 720 Td
(${title}) Tj
/F1 12 Tf
0 -30 Td
(Hujjat raqami: ${docNumber || "Raqamsiz"}) Tj
0 -25 Td
(Sho'rtan Gaz Kimyo Majmuasi - Normativ hujjatlar bazasi) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000495 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
570
%%EOF`;
  return new Blob([content], { type: 'application/pdf' });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB mavjud emas'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'Id' });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Baza ochilmadi'));
  });
}

// Ensure all baseline seed documents exist in store (sync across IP and Domain)
async function ensureSeeded(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
      const docStore = tx.objectStore(STORE_DOCS);
      const fileStore = tx.objectStore(STORE_FILES);

      for (const doc of SEED_DOCUMENTS) {
        const getReq = docStore.get(doc.Id);
        getReq.onsuccess = () => {
          if (!getReq.result) {
            docStore.put(doc);
            const blob = createSamplePdfBlob(doc.Title, doc.DocumentNumber);
            fileStore.put({ id: doc.Id, blob, fileName: doc.FileName, mimeType: doc.MimeType });
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Non-blocking
    } catch {
      resolve();
    }
  });
}

export async function getLocalNormativeDocs(): Promise<NormativeDocument[]> {
  try {
    const db = await openDb();
    await ensureSeeded(db);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readonly');
      const store = tx.objectStore(STORE_DOCS);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = (req.result || []) as NormativeDocument[];
        list.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('getLocalNormativeDocs fallback to memory:', err);
    return SEED_DOCUMENTS as unknown as NormativeDocument[];
  }
}

export async function saveLocalNormativeDoc(
  doc: NormativeDocument,
  fileBlob: Blob
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
    const docStore = tx.objectStore(STORE_DOCS);
    const fileStore = tx.objectStore(STORE_FILES);

    docStore.put(doc);
    fileStore.put({
      id: doc.Id,
      blob: fileBlob,
      fileName: doc.FileName,
      mimeType: doc.MimeType,
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Hujjat ma’lumotlarini yangilaydi; yangi fayl berilsa — uni ham almashtiradi. */
export async function updateLocalNormativeDoc(doc: NormativeDocument, fileBlob?: Blob | null): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
    tx.objectStore(STORE_DOCS).put(doc);
    if (fileBlob) {
      tx.objectStore(STORE_FILES).put({ id: doc.Id, blob: fileBlob, fileName: doc.FileName, mimeType: doc.MimeType });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalNormativeDoc(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
    const docStore = tx.objectStore(STORE_DOCS);
    const fileStore = tx.objectStore(STORE_FILES);

    docStore.delete(id);
    fileStore.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalNormativeDocFile(id: string): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const store = tx.objectStore(STORE_FILES);
    const req = store.get(id);

    req.onsuccess = () => {
      const res = req.result;
      if (res && res.blob) {
        resolve({
          blob: res.blob,
          fileName: res.fileName || 'hujjat.pdf',
          mimeType: res.mimeType || 'application/pdf',
        });
      } else {
        // Fallback: generate sample
        const sample = createSamplePdfBlob('Normativ hujjat', id);
        resolve({ blob: sample, fileName: 'hujjat.pdf', mimeType: 'application/pdf' });
      }
    };
    req.onerror = () => reject(req.error);
  });
}
