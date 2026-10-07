# 11 Bosqichli Vagon Aylanish Jarayoni

E-Transport tizimi ShGKM hududiga kirib kelgan bo‘sh vagonlarning to‘liq hayotiy siklini **11 ta qat’iy bosqich** asosida boshqaradi:

```mermaid
flowchart TD
    B1[1. Kengsoyda qabul qilish & Xizmat xati] --> B2[2. Ruxsatnoma va Qo'riqlash kelishuvi]
    B2 --> B3[3. Zavodga kiritish & Texnik ko'rik]
    B3 --> B4[4. Tara (bo'sh) tortish]
    B4 --> B5[5. Estakadaga qo'yish]
    B5 --> B6[6. Mahsulot yuklash]
    B6 --> B7[7. Brutto tortish]
    B7 --> B8[8. Plombalash & UNG tasdig'i]
    B8 --> B9[9. Chiqish partiyasini jamlash]
    B9 --> B10[10. Yuk xati tuzish & 6 tomonlama imzo]
    B10 --> B11[11. Kengsoy stansiyasiga olib chiqish]
```

---

## 📌 Bosqichlar Tafsiloti

### 1-bosqich: Kengsoyda ro‘yxatga olish va Kiritish xizmat xati tuzish
- **Ijrochi:** Temir yo‘l operatori (Stansiya).
- **Vazifa:** Kengsoydan kelgan vagonlar raqamini, turini kiritadi. Partiya kodi (`IB-MMYY-001`) va Xizmat xati raqami (`ENP-MMYY-001`) shakllanadi.
- **Natija:** Bosh direktor nomidan shtamp bosish uchun ICHDX smena boshlig‘iga yuboriladi.

### 2-bosqich: ICHDX smena boshlig‘i va Ruxsatnoma byurosi kelishuvi
- **Ijrochi:** ICHDX smena boshlig‘i ➔ Ruxsatnoma byurosi.
- **Vazifa:** 
  1. ICHDX smena boshlig‘i tasdiqlaydi (QR kodli Bosh direktor shtampi hosil bo‘ladi).
  2. Ruxsatnoma byurosi xodimi tekshirib ruxsat beradi.
- **Chop etish:** Hujjat Ruxsatnoma byurosi tomonidan tasdiqlanib, Qo‘riqlash (NO‘J)ga yetib borgan zahoti **chop etish (PDF)** tugmasi faollashadi.

### 3-bosqich: Qo‘riqlash ko‘rigi va Zavod hududiga kiritish
- **Ijrochi:** Qo‘riqlash xizmati (NO‘J xodimi).
- **Vazifa:** Zavod darvozasida (KPP) vagonlarni amalda ko‘rib, xizmat xatiga o‘zining elektron QR imzosini qo‘yadi va zavodga kiritadi.
- **Temir yo‘l texnik ko‘rigi:** Agar vagon nosoz bo‘lsa, shu yerda [[01-Biznes-Jarayonlar/Nomuvofiqlik-va-Dalolatnomalar|Dalolatnoma (DFA)]] rasmiylashtiriladi.

### 4-bosqich: Bo‘sh vagonlarni tarozi (Tara)da tortish
- **Ijrochi:** Tarozibon.
- **Vazifa:** Bo‘sh vagon temir yo‘l tarozisiga qo‘yilib, tara og‘irligi o‘lchanadi (yoki 1C orqali avtomatik import qilinadi).

### 5-bosqich: Estakadaga qo‘yish
- **Ijrochi:** Temir yo‘l manyovr brigadasi ➔ TM va XA.
- **Vazifa:** Vagonlar mahsulot turiga qarab quyish-yuklash estakadalariga (gaz, kondensat, polietilen, oltingugurt) joylashtiriladi.

### 6-bosqich: Mahsulot yuklash (quyish)
- **Ijrochi:** TM va XA sexi smena muhandisi / operatori.
- **Vazifa:** Vagonlar guruhga olinadi (`OB-MMYY-001` partiyasi bilan) va yuklash boshlanadi. Yuklash tugagach, "Yuklash yakunlandi" belgilanadi.

### 7-bosqich: Brutto og‘irligini tortish
- **Ijrochi:** Tarozibon.
- **Vazifa:** Yuklangan vagon taroziga chiqadi, brutto og‘irligi qayd etiladi. Tizim avtomatik ravishda `Netto = Brutto - Tara` formula bo‘yicha sof yukni hisoblaydi.

### 8-bosqich: Plombalash va 3 tomonlama tasdiq
- **Ijrochi:** TM va XA (Plombalovchi) ➔ Tarozibon ➔ Qo‘riqlash xizmati ➔ Iqtisodchi.
- **Vazifa:** Sisterna/vagonlarga raqamli plomba (muhr) o‘rnatiladi. UNG tarozi dasturiga kiritiladi. Har uchala xizmat plomba to‘g‘riligini tasdiqlaydi (`Status = Sealed`).

### 9-bosqich: Chiqish partiyasini jamlash
- **Tizim harakati:** Barcha plombalangan (`Sealed`) vagonlar bitta yaxlit chiqish tarkibiga birlashadi (`OB-MMYY-xxx`).

### 10-bosqich: Yuk xati (Waybill / Reyestr) shakllantirish
- **Ijrochi:** Iqtisodchi (Logistika bo‘limi).
- **Vazifa:** Chiqish partiyasidagi vagonlar tasdiqlangan Marketing buyurtmasiga biriktiriladi. Yuk xati shakllantiriladi va 6 tomonlama kelishuvga yuboriladi:
  1. Temir yo‘l vakili
  2. Ombor (TM va XA)
  3. Tarozibon
  4. Iqtisodchi
  5. Ruxsatnoma byurosi
  6. Qo‘riqlash xizmati (NO‘J)

### 11-bosqich: Kengsoy stansiyasiga olib chiqish
- **Ijrochi:** Temir yo‘l mashinisti / operatori.
- **Vazifa:** Barcha imzolar to‘liq yig‘ilgach, poyezd Kengsoy tutashuv stansiyasiga olib chiqiladi va partiya yopiladi (`Stage = Exited`).

---

## 🔗 Bog‘liq Hujjatlar
- [[01-Biznes-Jarayonlar/Hujjatlar-va-QR-Imzolar|Hujjatlar va QR Imzolar]]
- [[01-Biznes-Jarayonlar/Nomuvofiqlik-va-Dalolatnomalar|Nomuvofiqlik Dalolatnomalari]]
