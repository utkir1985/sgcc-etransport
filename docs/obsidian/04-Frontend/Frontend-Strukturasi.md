# Frontend Strukturasi

Frontend ilovasi **React 19**, **TypeScript** va **Vite 6** asosida yaratilgan zamonaviy SPA (Single Page Application).

---

## 📁 Jildlar Strukturasi

```
frontend/src/
├── app/
│   ├── main.tsx             # Kirish nuqtasi va React DOM render
│   ├── App.tsx              # Asosiy router va kontekstlar
│   └── routes.tsx           # URL marshrutlari
├── modules/                 # Biznes sohalar bo'yicha sahifalar
│   ├── auth/                # Login va parolni tiklash
│   ├── marketing/           # Buyurtmalar boshqaruvi
│   ├── dispatching/         # Kengsoy qabul, bo'sh vagonlar
│   ├── railway/             # Temir yo'l ko'rigi, dalolatnomalar
│   ├── warehouse/           # Estakada quyish va plombalash
│   ├── gate-scales/         # Tarozi sahifalari
│   ├── documents/           # Yuk xatlari (RegistryPage)
│   ├── dashboard/           # Boshqaruv paneli va vagonlar monitoringi
│   └── admin/               # Foydalanuvchilar, RBAC, raqamlash qoidalari
└── shared/                  # Umumiy resurslar
    ├── components/          # DocumentPrintButton, WagonEntryPermitView, DefectActView...
    ├── services/            # Axios API mijozi (api.ts)
    ├── utils/               # yukXatiPrint, documentPrintGuard, real-time sync
    └── types/               # TypeScript umumiy interfeyslari
```

---

## ⚡ Asosiy Imkoniyatlar
1. **Real-time Sync:**
   - Foydalanuvchi sahifani qo‘lda yangilamasdan, boshqa xodim vagonni tasdiqlashi bilan ekranda o‘zgarishlar darhol aks etadi (`subscribeOrdersChanged`).
2. **Kengaytirilgan Role-Based Navigation:**
   - Har bir xodim tizimga kirganda o‘z lavozimiga mos menyular va ruxsat berilgan tugmalarnigina ko‘radi.
3. **Tematik Dizayn (Dark/Light mode):**
   - Premium dizayn, yuqori kontrast va korporativ ko‘k/kulrang palitra.

---

## 🔗 Bog‘liq Hujjatlar
- [[04-Frontend/Chop-Etish-va-PDF-Tizimi|Chop Etish Tizimi]]
- [[00-Asosiy/Arxitektura|Arxitektura]]
