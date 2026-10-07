# 1C Korxona Integratsiyasi

E-Transport tizimi korxonadagi **1C Korxona 8.3** dasturi bilan ikki tomonlama avtomatik integratsiya qilingan.

---

## 🔄 Sinxronizatsiya Xizmati (`OneCEmptyWagonSyncService`)

Ushbu fon xizmati har 1-5 daqiqada 1C bazasidan so‘nggi ma’lumotlarni tortib oladi:

1. **Kirib kelgan bo‘sh vagonlar:**
   - 1C dagi kirish qaydnomalari bo‘yicha vagon raqami, kirish vaqti (`DatetimeIn`) va mahsulot turi import qilinadi.
2. **Tarozi va Og‘irlik ma’lumotlari:**
   - Tara va brutto tortish vaqtlari, netto og‘irliklar 1C dagi tarozi ma'lumotlaridan yangilanadi.
3. **Chiqish vaqti (`DatetimeOut`):**
   - Vagon brutto tortilgach, 1C da qayd etilgan chiqish vaqti `ScaleExitedAt` maydoniga tushadi.

---

## ⚠️ Muhim jihat: Vagonlarni 1-bosqichga sakrab o‘tishidan himoya qilish
Vagonlar korxona hududiga qayta-qayta kelib ketadi. Yangi partiya tuzilayotganda, tizim vagonning avvalgi (tarixdagi) chiqib ketgan yozuvlarini hozirgi faol partiya bilan adashtirmaslik uchun kirish sanasi va faol partiya holatini (`Stage != Exited`) qat’iy tekshiradi.

---

## 🔗 Bog‘liq Hujjatlar
- [[03-Backend/Backend-Strukturasi|Backend Strukturasi]]
- [[02-Modullar/05-Tarozibon|Tarozibon Moduli]]
