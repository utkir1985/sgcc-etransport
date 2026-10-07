# Hujjat Raqamlash Tizimi

Tizimda barcha rasmiy hujjatlar va partiyalar `IDocumentNumberingService` yordamida yagona qoidalar asosida raqamlanadi.

---

## 📐 Standart Qoidalar Jadvali

| Hujjat turi (`DocumentType`) | Prefiks | Format | Uzunlik | Davriylik | Namuna |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **InboundBatch** | `IB` | MMYY | 3 xona | Har oy | `IB-0926-001` |
| **OutboundBatch** | `OB` | MMYY | 3 xona | Har oy | `OB-0926-001` |
| **EntryPermit** | `ENP`| MMYY | 3 xona | Har oy | `ENP-0926-001` |
| **DefectAct** | `DFA`| MMYY | 3 xona | Har oy | `DFA-0926-001` |
| **Waybill** | `WB` | MMYY | 3 xona | Har oy | `WB-0926-001` |
| **Order_PE** | `PE` | MMYY | 3 xona | Har oy | `PE-0926-001` |
| **Order_LPG** | `LPG`| MMYY | 3 xona | Har oy | `LPG-0926-001` |
| **Order_COND** | `COND`| MMYY | 3 xona | Har oy | `COND-0926-001` |
| **Order_SULF** | `SULF`| MMYY | 3 xona | Har oy | `SULF-0926-001` |

---

## ⚙️ Ishlash Mantiqi
1. **Oylik Qayta Boshlanish (Monthly Reset):**
   - Masalan: `0926` = 2026-yil sentyabr oyi (`MM` = 09, `YY` = 26).
   - Har yangi oy boshlanganda sanash `001` dan qayta boshlanadi.
2. **Keyingi raqamni topish:**
   - Servis bazadagi mavjud prefiks va davr bilan boshlanadigan yozuvlarni qidiradi.
   - Eng yuqori sonni olib, unga `+1` qo‘shadi va belgilangan xonalar soni bo‘yicha formatlaydi (masalan: `D3` ➔ `002`).

---

## 🔗 Bog‘liq Hujjatlar
- [[03-Backend/Backend-Strukturasi|Backend Strukturasi]]
- [[00-Asosiy/Lugat-va-Terminlar|Lug‘at va Terminlar]]
