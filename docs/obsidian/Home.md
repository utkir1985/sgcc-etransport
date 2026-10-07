# 🚂 E-Transport — Tizim Bilimlar Bazasi (Obsidian Vault)

Xush kelibsiz! Ushbu bilimlar bazasi **E-Transport** (Shurtan Gaz Kimyo Majmuasi — ShGKM temir yo‘l logistika va yuk tashish axborot tizimi)ning barcha me’moriy, biznes va dasturiy qismlarini jamlagan.

Obsidian orqali fayllar orasida `[[havolalar]]` orqali tezkor harakatlanishingiz mumkin.

---

## 🗺️ Asosiy Xarita (Map of Content)

### 📌 1. Asosiy tushunchalar
- [[00-Asosiy/Loyiha-Haqida|Loyiha haqida va Maqsad]] — ShGKM logistika konteksti va tizim vazifalari
- [[00-Asosiy/Arxitektura|Umumiy Texnologik Arxitektura]] — Backend, Frontend, DB, Nginx, Docker staki
- [[00-Asosiy/Lugat-va-Terminlar|Lug‘at va Qisqartmalar]] — IB, OB, ENP, DFA, WB, UNG, Estakada terminlari

### 🔄 2. Biznes Jarayonlar
- [[01-Biznes-Jarayonlar/11-Bosqichli-Vagon-Jarayoni|11 Bosqichli Vagon Aylanish Jarayoni]] — Kengsoydan kirib, yuklanib, Kengsoyga chiqib ketishgacha bo‘lgan to‘liq zanjir
- [[01-Biznes-Jarayonlar/Hujjatlar-va-QR-Imzolar|Hujjatlar, Ruxsatnomalar va QR Imzolar]] — Xizmat xati, Yuk xati va 6 tomonlama kelishuv
- [[01-Biznes-Jarayonlar/Nomuvofiqlik-va-Dalolatnomalar|Nomuvofiqlik va Dalolatnomalar (Defect Acts)]] — Nosoz yoki mahsulotsiz vagonlar tartibi

### 🧩 3. Funksional Modullar
- [[02-Modullar/01-Marketing|01. Marketing]] — Oylik shartnomalar, buyurtmalar, limitlar va to‘lovlar nazorati
- [[02-Modullar/02-Kengsoy-va-Dispetcherlik|02. Kengsoy va Dispetcherlik]] — Bo‘sh vagonlarni qabul qilish, ro‘yxatga olish (`IB-...`)
- [[02-Modullar/03-Temir-Yol|03. Temir yo‘l xizmati]] — Vagon texnik ko‘rigi, dalolatnomalar rasmiylashtirish
- [[02-Modullar/04-Estakada-va-Ombor|04. TM va XA (Estakada / Ombor)]] — Vagonlarni guruhlab yuklash, plombalash (`OB-...`)
- [[02-Modullar/05-Tarozibon|05. Tarozibon]] — Tara va brutto tortish, UNG tarozi integratsiyasi
- [[02-Modullar/06-Iqtisodchi-va-Hujjatlar|06. Iqtisodchi va Yuk Xatlari]] — Chiqish partiyalarini jamlash, yuk xati shakllantirish
- [[02-Modullar/07-Boshqaruv-Paneli-va-Monitoring|07. Boshqaruv paneli va Monitoring]] — Majmuadagi vagonlar statusi, KPI, audit

### ⚙️ 4. Backend va Ma’lumotlar Bazasi
- [[03-Backend/Backend-Strukturasi|Backend Strukturasi]] — .NET 9 modulli monolit arxitekturasi
- [[03-Backend/Malumotlar-Bazasi-Schema|Ma'lumotlar Bazasi (PostgreSQL)]] — Jadvallar, bog‘lanishlar va modellar
- [[03-Backend/Hujjat-Raqamlash-Tizimi|Hujjat Raqamlash Xizmati]] — `DocumentNumberingService` qoidalari

### 💻 5. Frontend
- [[04-Frontend/Frontend-Strukturasi|Frontend Strukturasi]] — React + Vite + TypeScript arxitekturasi
- [[04-Frontend/Chop-Etish-va-PDF-Tizimi|Chop Etish va PDF Mexanizmi]] — A4 landscape/portrait, print-guard va iframe render

### 🔌 6. Integratsiyalar va DevOps
- [[05-Integratsiyalar-va-DevOps/1C-Sinxronizatsiya|1C Korxona Integratsiyasi]] — Avtomatik sinxronizatsiya va vagon holatlari
- [[05-Integratsiyalar-va-DevOps/Docker-va-Server-Sozlamalari|Docker va Server Sozlamalari]] — Nginx, konteynerlar, backup va deploy

---

## 💡 Qanday kengaytirish mumkin?
Har bir yangi funksionallik qo‘shilganda:
1. Kerakli modul papkasida tegishli `.md` faylni oching yoki yangilang.
2. Ichki bog‘lanishlar uchun `[[fayl_nomi]]` sintaksisidan foydalaning.
3. Yangi API yoki jadval kiritilsa, [[03-Backend/Malumotlar-Bazasi-Schema]] ga qo‘shing.
