# Chop Etish va PDF Tizimi

E-Transport tizimida hujjatlarni qog‘ozga chop etish va PDF qilish maxsus izolyatsiyalangan brauzer texnologiyasi asosida amalga oshiriladi.

---

## 🖨️ Chop Etish Arxitekturasi (`about:blank iframe`)

Hujjatlarni chop etishda brauzerning standart `window.print()` chaqirig‘idan to‘g‘ridan-to‘g‘ri foydalanilmaydi. Buning o‘rniga [yukXatiPrint.ts](file:///var/www/e-transport/frontend/src/shared/utils/yukXatiPrint.ts) moduli orqali maxsus yashirin `iframe` yaratiladi:

1. **URL sarlavhasi tozaligi:** Brauzer sahifaning tepasida `http://IP/...` yoki URL ko‘rsatmasligi uchun `iframe` orqali sof HTML yuklanadi.
2. **Qat’iy A4 o‘lchamlari:**
   - **Yuk xati:** `@page { size: A4 landscape; margin: 0; }` (297mm × 210mm).
   - **Xizmat xati & Dalolatnoma:** `@page { size: A4 portrait; margin: 0; }` (210mm × 297mm).

---

## 🛡️ Chop Etish Himoyasi (`documentPrintGuard`)

Hujjatning to‘liq imzolanmasdan chiqib ketishini oldini olish uchun [documentPrintGuard.ts](file:///var/www/e-transport/frontend/src/shared/utils/documentPrintGuard.ts) mexanizmi ishlaydi:

- **Yuk Xati (Waybill):** Agar 6 ta imzodan bittasi ham bo‘lmasa (`.yxn-sign:not(.is-approved)`), tugma `disabled` bo‘ladi va chop etish bloklanadi.
- **Xizmat Xati (Entry Permit):** Smena boshlig‘i va Ruxsatnoma byurosi tasdiqlab, hujjat **Qo‘riqlash xizmati (NO‘J)** ga yetib kelgan zahoti chop etishga ruxsat beriladi (darvozada qog‘oz tekshiruvi uchun).

---

## 🔘 `DocumentPrintButton` Komponenti
Tugma holati avtomatik ravishda `ready` propsiga qarab o‘zgaradi:
- `ready === true` ➔ Faol ko‘k rangli «Chop etish / PDF» tugmasi.
- `ready === false` ➔ Nofaol kulrang tugma, kursor olib borilganda qaysi imzo kutilayotgani ko‘rinadi.

---

## 🔗 Bog‘liq Hujjatlar
- [[01-Biznes-Jarayonlar/Hujjatlar-va-QR-Imzolar|Hujjatlar va QR Imzolar]]
- [[04-Frontend/Frontend-Strukturasi|Frontend Strukturasi]]
