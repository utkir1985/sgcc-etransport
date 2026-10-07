# Hujjatlar, Ruxsatnomalar va QR Imzolar

E-Transport tizimida qog‘ozbozlik va soxtalashtirishni oldini olish maqsadida har bir rasmiy hujjat **kriptografik QR-kod** va vaqt tamg‘asi bilan himoyalangan.

---

## 📄 Asosiy Hujjat Turlari

### 1. Kiritish Xizmat Xati (Entry Permit — ENP)
- **Format:** A4 Portrait (025-Ф6 standarti).
- **Qachon tuziladi:** Bo‘sh vagonlar Kengsoydan zavodga kirishidan oldin.
- **Tarkibi:**
  - Yuqori o‘ng tomonda: **Bosh direktor elektron shtampi** (ICHDX smena boshlig‘i tasdiqlagan vaqt va QR kod bilan).
  - Yuqori chap tomonda: **Hujjat global QR-verifikatsiya kodi** (`https://qrlink.sgcc.uz/verify/...`).
  - Vagonlar jadvali: №, Vagon raqami, Vagon turi, Yuk nomi.
  - Imzolar:
    1. Temir yo‘l operatori (Yaratildi)
    2. Ruxsatnoma byurosi xodimi (Ruxsat etildi)
    3. Qo‘riqlash xizmati (NO‘J) xodimi (Ruxsat etildi)
- **Chop etish sharti:** Hujjat Ruxsatnoma byurosi va Smena boshlig‘i tomonidan tasdiqlanib, Qo‘riqlashga yetib kelgan zahoti chop etilishi mumkin.

---

### 2. Yuk Xati va Ilovasi (Waybill & Annex — WB)
- **Format:** A4 Landscape (asosiy yuk xati) va A4 Landscape/Portrait (ilovasi).
- **Qachon tuziladi:** Vagonlar yuklanib, brutto tortilib, plombalangandan keyin.
- **6 Tomonlama Tasdiq Zanjiri:**
  1. **Temir yo‘l vakili** — vagonlarning texnik sozligi va jo‘nashga tayyorligini tasdiqlaydi.
  2. **Ombor (TM va XA) vakili** — mahsulot to‘liq quyilgani/ortilganini tasdiqlaydi.
  3. **Tarozi xodimi** — tarozi tortuv va plomba raqamlarini tasdiqlaydi.
  4. **Iqtisodchi (Marketing/Logistika)** — buyurtmaga biriktiruv va hisob-kitobni tasdiqlaydi.
  5. **Ruxsatnoma byurosi** — mahsulotli vagonlarning chiqishiga ruxsat beradi.
  6. **Qo‘riqlash xizmati (NO‘J)** — darvozadan chiqish ruxsatnomasi va plombalar butunligini tasdiqlaydi.
- **Chop etish sharti:** Barcha 6 ta imzo to‘liq qo‘yilgandagina (`DocumentPrintButton` faollashadi). Bitta imzo yetishmasa ham, kulrang "QR" holatida chop etish bloklanadi.

---

### 3. Nomuvofiqlik Dalolatnomasi (Defect Act — DFA)
- **Format:** A4 Portrait.
- **Qachon tuziladi:** Vagon kirib kelganda yoki yuklash jarayonida nuqson aniqlanganda.
- **Tarkibi:** Vagon raqami, nuqson turi, aniqlangan sana, fotosuratlar va komissiya a’zolari imzosi.

---

## 🔒 QR-Kod Verifikatsiya Tizimi
Har bir QR kod o‘z ichiga quyidagi ma’lumotlarni oladi:
```json
{
  "docNumber": "WB-0926-001",
  "docType": "Waybill",
  "signerRole": "Qo'riqlash xizmati xodimi",
  "signerName": "E. Berdiyev",
  "status": "Ruxsat etildi",
  "timestamp": "2026-09-08 10:15:32",
  "verificationUrl": "https://qrlink.sgcc.uz/verify/E-TR-..."
}
```

QR-kod skaner qilinganda tizim bazasi bilan solishtirilib, hujjatning haqiqiyligi va kim tomonidan qachon imzolangani ko‘rsatiladi.

---

## 🔗 Bog‘liq Hujjatlar
- [[04-Frontend/Chop-Etish-va-PDF-Tizimi|Chop etish va PDF Mexanizmi]]
- [[01-Biznes-Jarayonlar/11-Bosqichli-Vagon-Jarayoni|11 Bosqichli Jarayon]]
