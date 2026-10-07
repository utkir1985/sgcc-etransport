# Yuklash va Transport Logistikasi Tizimi (E-Transport)

Temir yo'l orqali mahsulotlarni yuklab jo'natish jarayonini avtomatlashtiruvchi MVP tizim.

## Texnologiyalar

| Qatlam | Texnologiya |
|--------|-------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Backend | ASP.NET Core 9, EF Core, JWT |
| Ma'lumotlar bazasi | PostgreSQL 16 |
| Kesh | Redis 7 |
| Fayl saqlash | MinIO |
| Proxy | Nginx |
| Konteynerlar | Docker Compose |

## Tez boshlash

```bash
cd /var/www/e-transport
cp .env.example .env
docker compose up -d --build
```

Tizim: **http://localhost** (Nginx orqali)

## Demo foydalanuvchilar

| Login | Parol | Rol |
|-------|-------|-----|
| admin | Admin123! | Administrator |
| marketing | Marketing123! | Marketing |
| ichdx_boshliq | IchdxBoss123! | ICHDX boshlig‘i |
| ichdx | Ichdx123! | ICHDX smena boshlig‘i |
| buxgalter | Bux123! | Buxgalteriya |
| temiryol | Rail123! | Temir yo'l sexi |
| ombor | Warehouse123! | TM va XA smena muxandisi |
| tarozi | Scale123! | Tarozi operatori |
| ruxsatnoma | Permit123! | Ruxsatnoma byurosi |
| qoriqlash | Security123! | Qo'riqlash xizmati |
| iqtisodchi | Economist123! | ICHDX iqtisodchisi |
| rahbar | Mgmt123! | Rahbariyat |

## Xususiyatlar (MVP)

- Login paneli JWT autentifikatsiya bilan
- Tungi / kunduzgi rejim (dark/light mode)
- Profil navbar o'ng tomonda
- Rolga qarab sidebar menyu
- Oylik buyurtmalar (Marketing)
- Kunlik rejalar va tasdiqlash zanjiri (ICHDX → Marketing → Buxgalteriya)
- Yuk jo'natmalari workflow holati
- Docker Compose bilan to'liq infratuzilma

## Servislar

| Servis | Port |
|--------|------|
| Nginx (asosiy) | 80 |
| Frontend | 5173 |
| API | 8080 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO | 9000 / 9001 |

## Keyingi bosqichlar

- 1C Buxgalteriya, e-gaz, e-nakl, Didox integratsiyalari
- SignalR real-time yangilanishlar
- UNG Tarozi va ANPR integratsiyasi
- Flutter mobil ilova (operatorlar uchun)
- Prometheus + Grafana monitoring
# UI birxilligi qoidasi

Yangi panel va sahifalarda mavjud umumiy UI komponentlari qayta ishlatilishi shart. Holat/bosqich kartalari uchun `frontend/src/shared/components/HubZoneTabs.tsx`, jadval uchun `thub-table reestr-table`, asosiy amallar uchun esa mavjud `btn-primary` va `btn-secondary` andozalari ishlatiladi. Sahifa ichida shu elementlarning yangi, alohida Tailwind nusxasini yaratishdan oldin `frontend/src/shared/components` va `frontend/src/index.css` dagi umumiy andozalar tekshiriladi. Buyurtmalar paneli tizimning asosiy vizual andozasi hisoblanadi.
