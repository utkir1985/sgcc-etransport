# 06. Iqtisodchi va Hujjatlar Moduli

Iqtisodchi (Logistika bo‘limi) yuklangan va plombalangan vagonlarni chiqish partiyalariga jamlaydi, rasmiy Yuk Xatini (Waybill) tuzadi va shartnoma limitlarini nazorat qiladi.

---

## 🎯 Asosiy Vazifalar
1. **Chiqish Partiyalari Jamg‘armasi (Outbound Pool):**
   - Plombalangan (`Sealed`) barcha sog‘lom vagonlar avtomatik ravishda bitta chiqish tarkibiga birlashadi (`OB-MMYY-001`).
2. **Buyurtmaga Biriktirish va Limitlar Nazorati:**
   - Har bir vagon uchun tegishli kontragent, stansiya va shartnoma buyurtmasi tanlanadi.
   - Tizim buyurtmadagi qoldiq vagon/tonna limitini tekshiradi (ortiqcha yuklash taqiqlanadi).
3. **Yuk Xati (Waybill — WB) Tuzish:**
   - Yuk xati raqami shakllanadi: `WB-MMYY-xxx`.
   - 6 tomonlama elektron imzolash jarayoni boshlanadi.
4. **1C va E-Nakl ga Yuborish:**
   - Hujjat to‘liq imzolangach, 1C tizimi va e-nakl bazasiga integratsiya qilinadi.

---

## 🔗 Bog‘liq Hujjatlar
- [[01-Biznes-Jarayonlar/Hujjatlar-va-QR-Imzolar|Hujjatlar va QR Imzolar]]
- [[02-Modullar/01-Marketing|Marketing Moduli]]
- [[04-Frontend/Chop-Etish-va-PDF-Tizimi|Chop etish tizimi]]
