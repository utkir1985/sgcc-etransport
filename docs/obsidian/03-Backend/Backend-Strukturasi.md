# Backend Strukturasi

Backend **ASP.NET Core 9** asosidagi **Modulli Monolit (Modular Monolith)** tamoyilida qurilgan. Har bir biznes soha alohida C# loyiha (Class Library) ko‘rinishida ajratilgan.

---

## 🏗️ Loyihalar (Projects) Ierarxiyasi

```
backend/src/
├── ETransport.Api/                # Asosiy Web API host (Program.cs, Swagger, Middleware)
├── ETransport.Core/               # Domen qatlami (Entities, DTOs, Enums, Interfeyslar)
├── ETransport.Infrastructure/     # Infratuzilma (EF Core DbContext, Redis, MinIO, Integratsiyalar)
└── Modules/
    ├── ETransport.Modules.Marketing/      # Buyurtmalar, kontragentlar, rejalar
    ├── ETransport.Modules.Dispatching/    # Kengsoy qabul, bo'sh vagonlar partiyasi
    ├── ETransport.Modules.Railway/        # Texnik ko'rik, dalolatnomalar
    ├── ETransport.Modules.Warehouse/      # Estakada, yuklash guruhlari, plombalash
    ├── ETransport.Modules.GateScales/     # Tara va brutto tortish tarozi API
    ├── ETransport.Modules.Documents/      # Yuk xatlari, 6 tomonlama kelishuv
    ├── ETransport.Modules.Accounting/     # Buxgalteriya va hisob-kitoblar
    └── ETransport.Modules.Dashboard/      # Statistika va monitoring ma'lumotlari
```

---

## 🔑 Asosiy Servislar va Interfeyslar
- `IDocumentNumberingService` — hujjatlar uchun `IB`, `OB`, `ENP`, `DFA`, `WB` formatidagi raqamlarni generatsiya qiladi.
- `IOneCEmptyWagonSyncService` — 1C Korxona bilan bo‘sh va yuklangan vagonlarni muntazam sinxronizatsiya qiladi.
- `IAuditService` — barcha muhim foydalanuvchi harakatlarini `AuditLogs` jadvaliga yozadi.
- `IFileStorageService` — MinIO orqali PDF va dalolatnoma suratlarini saqlaydi.

---

## 🔗 Bog‘liq Hujjatlar
- [[03-Backend/Malumotlar-Bazasi-Schema|Ma'lumotlar Bazasi]]
- [[03-Backend/Hujjat-Raqamlash-Tizimi|Hujjat Raqamlash Tizimi]]
