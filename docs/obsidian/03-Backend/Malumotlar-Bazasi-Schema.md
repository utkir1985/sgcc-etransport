# Ma'lumotlar Bazasi (PostgreSQL)

`E-Transport` ma'lumotlar bazasi **PostgreSQL 16** da joylashgan.

---

## 🗄️ Asosiy Jadvallar

### 1. `EmptyWagonArrivals` (Kirish partiyalari)
Kengsoydan kelgan bo‘sh vagonlar partiyasining umumiy hujjati.
- `Id` (UUID, PK)
- `ArrivalNumber` (string) — `IB-MMYY-xxx` formati.
- `ArrivalDate` (timestamp)
- `WagonCount` (int)
- `ProductType` (string)
- `Stage` (string) — `KengsoyInspection`, `SecurityInspection`, `ReadyForEstakada`, `TareWeighing`, `SealInstallation`, `Exited`.
- `EntryPermitNumber` (string) — `ENP-MMYY-xxx`.
- `EntryPermitShiftApprovedAt`, `EntryPermitPermitApprovedAt`, `EntryPermitSecurityApprovedAt` (timestamps).

### 2. `EmptyWagonUnits` (Har bir alohida vagon)
Partiya ichidagi har bir vagonning alohida texnik va jarayon yozuvi.
- `Id` (UUID, PK)
- `EmptyWagonArrivalId` (UUID, FK ➔ `EmptyWagonArrivals`)
- `WagonNumber` (string, 8 xonali vagon raqami)
- `WagonType` (string) — `sisterna`, `closed`, `platform`.
- `Ownership` (string) — `majmua` (ShGKM o‘z vagoni) yoki `tashqi`.
- `Status` (string) — `AwaitingTare`, `Tared`, `Estakada`, `Loading`, `Loaded`, `GrossWeighed`, `SealPending`, `Sealed`, `Returned`.
- `TareWeight`, `GrossWeight` (string/decimal) — tarozi og‘irliklari.
- `SealNumber` (string) — plomba raqami.
- `LoadingBatchNumber` (string) — chiqish guruhi kodi (`OB-MMYY-xxx`).
- `ScaleExitedAt` (timestamp) — tarozidan chiqish vaqti.
- `DefectActNumber`, `DefectActType` — dalolatnoma ma’lumotlari.

### 3. `LoadingRegistries` (Yuk xatlari / Reyestrlar)
Chiqish uchun tuzilgan rasmiy Yuk Xati hujjati.
- `Id` (UUID, PK)
- `RegistryNumber` (string) — `WB-MMYY-xxx` formati.
- `EmptyWagonArrivalId` (UUID, FK)
- `WagonCount` (int)
- `WagonRoutesJson` (JSON) — qaysi vagon qaysi buyurtma va stansiyaga biriktirilgani.
- `IsApprovedByRailway`, `IsApprovedByWarehouse`, `IsApprovedByScale`, `IsApprovedByEconomist`, `IsApprovedByPermit`, `IsApprovedBySecurity` (booleans).
- `HandoverToMachinistAt`, `ExitedToKengsoyAt` (timestamps).

### 4. `MonthlyOrders` va `MonthlyOrderLines`
Marketing buyurtmalari va stansiyalar bo‘yicha limitlar.
- `OrderNumber` (string) — masalan `PE-0926-001`.
- `Contractor` (string) — xaridor nomi.
- `WagonCount`, `TonCount` — buyurtma hajmi.
- `FulfilledWagonCount`, `FulfilledNetWeight` — bajarilgan hajm.

---

## 🔗 Bog‘liq Hujjatlar
- [[03-Backend/Backend-Strukturasi|Backend Strukturasi]]
- [[03-Backend/Hujjat-Raqamlash-Tizimi|Hujjat Raqamlash Tizimi]]
