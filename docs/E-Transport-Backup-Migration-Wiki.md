# E-Transport — Server Backup, Migration va Qayta Tiklash (Restore) Wiki

**Muhandis:** Tizim administratori | **Sana:** 11.09.2026 | **Versiya:** 1.0  
**Loyiha:** E-Transport (Yuklash va Transport Logistikasi Tizimi)

> Ushbu qo'llanma **E-Transport** tizimining PostgreSQL ma'lumotlar bazasi, yuklangan barcha fayllari (hujjatlar, dalolatnomalar, vagon ilovalari), konfiguratsiya fayllari va Docker infratuzilmasini xavfsiz to'liq nusxalab olish (backup) hamda yangi Linux serverda bir martada xatosiz tiklash (migration) bo'yicha bosqichma-bosqich yo'riqnomadir.

---

## 1-QISM — BACKUP OLISH (ASOSIY SERVERDA)

### 1. Serverga SSH orqali kiring

```bash
ssh logigateadm@172.16.90.62
```

### 2. Loyiha papkasiga kiring

```bash
cd /var/www/e-transport
```

### 3. Docker konteynerlar ishlayotganini tekshiring

> `etransport-postgres`, `etransport-api`, `etransport-redis`, `etransport-minio` va `etransport-frontend` konteynerlari **Up / healthy** holatda bo'lishi kerak.

```bash
docker compose ps
```

### 4. Container va papka fayllarini tekshirish (Sinxronlash)

> ⚠️ Agar Docker konteyner ichida yoki kodda to'g'ridan-to'g'ri o'zgarishlar qilingan bo'lsa — backup olishdan **OLDIN** kodlar hostda to'liq saqlanganligiga ishonch hosil qiling!

```bash
# Frontend manba fayllarining holati
ls -la /var/www/e-transport/frontend/src/

# Backend manba fayllarining holati
ls -la /var/www/e-transport/backend/src/
```

### 5. To'liq Backup oling

> Ushbu buyruq Toshkent vaqti bilan nomlangan papka yaratadi (masalan: `etransport_backup_11.09.2026_1030`) va ichiga quyidagilarni to'playdi:
> 1. **`etransport-project.tar.gz`** — Loyihaning barcha kodi, docker konfiguratsiyalari va sozlamalari (`/var/www/e-transport`);
> 2. **`etransport_uploads.tar.gz`** — Barcha yuklangan rasmlar, dalolatnomalar va PDF ilovalar (`/var/etransport/uploads`);
> 3. **`etransport_db.dump`** — PostgreSQL ma'lumotlar bazasining to'liq siqilgan dampi (`pg_dump -F c`);
> 4. **`etransport_env.backup`** — Loyihaning barcha maxfiy kalitlari va parollari (`.env`);
> 5. **`nginx_conf.backup`** — Nginx yo'naltirish qoidalari.

```bash
DATE=$(TZ="Asia/Tashkent" date +%d.%m.%Y_%H%M)
BACKUP_DIR="/tmp/etransport_backup_$DATE"
mkdir -p $BACKUP_DIR

echo "1/4. Loyiha manba kodlari arxivlanmoqda..."
tar --exclude='node_modules' --exclude='dist' --exclude='.git' -czf $BACKUP_DIR/etransport-project.tar.gz -C /var/www e-transport

echo "2/4. Yuklangan fayllar (uploads) olinmoqda..."
docker cp etransport-api:/var/etransport/uploads $BACKUP_DIR/uploads_tmp
tar -czf $BACKUP_DIR/etransport_uploads.tar.gz -C $BACKUP_DIR uploads_tmp
rm -rf $BACKUP_DIR/uploads_tmp

echo "3/4. PostgreSQL ma'lumotlar bazasi dump qilinmoqda..."
docker exec etransport-postgres pg_dump -U etransport -F c -b -v -f /tmp/etransport_db.dump etransport
docker cp etransport-postgres:/tmp/etransport_db.dump $BACKUP_DIR/etransport_db.dump
docker exec etransport-postgres rm -f /tmp/etransport_db.dump

echo "4/4. Konfiguratsiya fayllari nusxalanmoqda..."
cp /var/www/e-transport/.env $BACKUP_DIR/etransport_env.backup
cp /var/www/e-transport/nginx/nginx.conf $BACKUP_DIR/nginx_conf.backup

echo "=========================================="
echo "✅ Barcha nusxalar tayyor: $BACKUP_DIR"
echo "=========================================="
```

### 6. Backup to'liq ekanligini tekshiring

> Kamida 5 ta fayl ko'rinishi kerak:
> - `etransport-project.tar.gz`
> - `etransport_uploads.tar.gz` (kamida 50MB - 120MB)
> - `etransport_db.dump` (kamida 5MB - 20MB)
> - `etransport_env.backup`
> - `nginx_conf.backup`

```bash
ls -lh $BACKUP_DIR
```

### 7. Windows kompyuteringizga yuklab oling (PowerShell)

> Ushbu buyruqni **o'zingizning shaxsiy Windows kompyuteringizdagi PowerShell** oynasida bajaring (serverda emas):

```powershell
$DATE = Get-Date -Format "dd.MM.yyyy_HHmm"
$DEST = "$HOME\Desktop\ETransport_Backup\$DATE"
New-Item -ItemType Directory -Force -Path $DEST

# Fayllarni serverdan yuklab olish
scp -r logigateadm@172.16.90.62:/tmp/etransport_backup_*/ $DEST\

Write-Host "✅ Nusxalar muvaffaqiyatli saqlandi: $DEST" -ForegroundColor Green
```

### 8. Serverdagi vaqtinchalik backup fayllarini tozalang

> ⚠️ Avval shaxsiy kompyuteringizga fayllar to'liq ko'chganligiga ishonch hosil qiling!

```bash
rm -rf /tmp/etransport_backup_*/
```

---

## 2-QISM — ESKI / ISHLAB TURGAN SERVERNI TOZALASH (AGAR KERAK BO'LSA)

> ⚠️ **DIQQAT:** Ushbu qism faqat serverni to'liq tozalab, noldan qayta o'rnatmoqchi bo'lsangizgina bajariladi!

### 1. Serverga kiring

```bash
ssh root@YANGI_SERVER_IP
# yoki
ssh logigateadm@YANGI_SERVER_IP
```

### 2. Barcha Docker konteyner va volumelarni to'xtatib, tozalang

```bash
cd /var/www/e-transport
docker compose down -v
```

### 3. Loyiha papkasini o'chiring

```bash
rm -rf /var/www/e-transport
```

### 4. Tozalanganini tekshiring

```bash
docker ps -a
docker volume ls | grep etransport
```

---

## 3-QISM — YANGI LINUX SERVERGA TIKLASH (RESTORE & MIGRATION)

### 1. Yangi serverda dasturlarni tekshiring / o'rnating

> Serverda Docker va Docker Compose bo'lishi shart. Agar hali o'rnatilmagan bo'lsa:

```bash
# Versiyalarni tekshirish
docker --version
docker compose version

# Agar o'rnatilmagan bo'lsa (Ubuntu/Debian):
apt update && apt upgrade -y
apt install -y curl wget tar gzip ca-certificates gnupg lsb-release

# Rasmiy Docker o'rnatish
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

systemctl enable docker && systemctl start docker
```

### 2. Backup fayllarni yangi serverga yuboring (PowerShell)

> Shaxsiy Windows kompyuteringizdagi PowerShell orqali yangi serverga yuklang:

```powershell
# Papka sanasini o'zingizning yuklab olgan sanangizga moslang
$SRC = "$HOME\Desktop\ETransport_Backup\11.09.2026_1030"

scp $SRC\etransport_backup_*\etransport_db.dump root@YANGI_IP:/tmp/
scp $SRC\etransport_backup_*\etransport-project.tar.gz root@YANGI_IP:/tmp/
scp $SRC\etransport_backup_*\etransport_uploads.tar.gz root@YANGI_IP:/tmp/
scp $SRC\etransport_backup_*\etransport_env.backup root@YANGI_IP:/tmp/
```

### 3. Yangi serverda fayllarni joy-joyiga chiqaring

```bash
# 1. /var/www papkasi mavjudligini ta'minlash
mkdir -p /var/www
cd /tmp

# 2. Loyiha papkasini ochish
tar -xzf etransport-project.tar.gz -C /var/www/

# 3. .env faylini tiklash
cp /tmp/etransport_env.backup /var/www/e-transport/.env

# 4. Papkaga kirish
cd /var/www/e-transport
ls -la
```

### 4. Yangi Server IP va domen sozlamalarini moslashtiring

Yangi serveringizning IP manzili o'zgargan bo'lsa, quyidagi 2 ta faylda IP ni yangilang:

#### A) `.env` fayli:
```bash
nano /var/www/e-transport/.env
```
> Quyidagi qatorga yangi server IP yoki domenini qo'shing:
> ```env
> CORS_ORIGINS=http://localhost,http://localhost:5173,http://YANGI_IP,http://YANGI_IP:5173,http://e-transport.sgcc.uz
> ```

#### B) `nginx/nginx.conf` fayli:
```bash
nano /var/www/e-transport/nginx/nginx.conf
```
> `server_name` qatoriga yangi server IP sini yozing:
> ```nginx
> server_name e-transport.sgcc.uz YANGI_IP localhost;
> ```

---

### 5. ⚠️ ENG MUHIM QADAM — Bazani xatosiz tiklash (Step-by-step)

> **Nima uchun maxsus ketma-ketlik kerak?**  
> Agar darhol `docker compose up -d` qilinsa, `.NET` backend ishga tushib, bo'sh PostgreSQL bazasida `EnsureCreatedAsync()` orqali yangi boshlang'ich jadvallarni va default rollarni yaratib yuboradi. Keyin esa eski backup dumpni tiklashda jadvallar duplikati yoki `table already exists` xatolari kelib chiqadi.  
> 
> **To'g'ri va xavfsiz usul:** Avval faqat Baza konteynerini ko'tarib, unga dumpni quyib olamiz, keyin backendni ishga tushiramiz!

#### Qadam 5.1. Faqat infratuzilmani (PostgreSQL, Redis, MinIO) ko'taring:

```bash
cd /var/www/e-transport
docker compose up -d postgres redis minio
```

Konteynerlar sog'lom (healthy) holatga kelishini 10 soniya kuting:
```bash
docker compose ps
```

#### Qadam 5.2. Bazani tozalab, haqiqiy backup dumpni tiklang:

```bash
# 1. Dump faylini postgres konteyneri ichiga uzatish
docker cp /tmp/etransport_db.dump etransport-postgres:/tmp/etransport_db.dump

# 2. Mavjud bo'sh bazani tozalab, qayta yaratish
docker exec etransport-postgres psql -U etransport -d postgres -c "DROP DATABASE IF EXISTS etransport;"
docker exec etransport-postgres psql -U etransport -d postgres -c "CREATE DATABASE etransport OWNER etransport;"

# 3. Dumpni to'liq tiklash (pg_restore)
docker exec etransport-postgres pg_restore -U etransport -d etransport -v /tmp/etransport_db.dump

# 4. Vaqtinchalik dumpni konteynerdan o'chirish
docker exec etransport-postgres rm -f /tmp/etransport_db.dump
```

#### Qadam 5.3. Bazada ma'lumotlar tiklanganini tekshiring:

```bash
# Jadvallar soni va asosiy yozuvlar
docker exec etransport-postgres psql -U etransport -d etransport -c "\dt"
docker exec etransport-postgres psql -U etransport -d etransport -c "SELECT COUNT(*) AS Foydalanuvchilar FROM \"Users\";"
docker exec etransport-postgres psql -U etransport -d etransport -c "SELECT COUNT(*) AS Bo_sh_Vagonlar FROM \"EmptyWagonArrivals\";"
docker exec etransport-postgres psql -U etransport -d etransport -c "SELECT COUNT(*) AS Reestrlar FROM \"LoadingRegistries\";"
```
*(Barcha jadvallarda haqiqiy ma'lumotlar soni ko'rinishi kerak)*

---

### 6. Yuklangan fayllar (Uploads) ni tiklash

> Vagon rasmlari, aktlar, dalolatnomalar va PDF fayllarni tiklash:

```bash
# 1. Vaqtinchalik ochish
cd /tmp
tar -xzf etransport_uploads.tar.gz

# 2. Fayllarni docker volume ga joylashtirish (API konteyneri orqali)
docker compose up -d api
docker cp /tmp/uploads_tmp/. etransport-api:/var/etransport/uploads/

# 3. Tozalash
rm -rf /tmp/uploads_tmp
```

---

### 7. Barcha servislarni to'liq qayta build qilib ishga tushirish

> `--build` kaliti frontend va backend konteynerlarini yangi muhitda toza yig'ib (compile qilib) beradi:

```bash
cd /var/www/e-transport
docker compose up -d --build
```

Konteynerlar holatini tekshiring:
```bash
docker compose ps
```
> Hamma 6 ta servis:
> - `etransport-postgres` — Up (healthy)
> - `etransport-redis` — Up (healthy)
> - `etransport-minio` — Up (healthy)
> - `etransport-api` — Up (healthy)
> - `etransport-frontend` — Up
> - `etransport-nginx` — Up (healthy)

---

### 8. Tizim loglarini tekshirish

Backendda xatolik yo'qligini va to'liq ishlaganini ko'rish uchun:

```bash
docker compose logs -f api --tail 50
```

Frontend loglari:
```bash
docker compose logs -f nginx --tail 50
```

---

### 9. Brauzerda tekshirish

| Tizim qismi | URL manzili |
|---|---|
| **Asosiy tizim (Frontend)** | `http://YANGI_IP/` yoki `http://e-transport.sgcc.uz/` |
| **Tizimga kirish (Login)** | `http://YANGI_IP/login` |
| **Tizim salomatligi (Health)** | `http://YANGI_IP/health` |
| **API holati** | `http://YANGI_IP/api/dashboard/stats` |
| **MinIO boshqaruv paneli** | `http://YANGI_IP:9001` |

---

## 4-QISM — TEZ-TEZ UCHRAYDIGAN MUAMMOLAR VA ULARNING YECHIMI

### 1. Login qilib bo'lmayapti yoki token xatosi bermoqda
- `.env` faylidagi `JWT_SECRET` eski serverdagi bilan bir xil ekanligiga ishonch hosil qiling.
- Foydalanuvchilar parollari bazada shifrlangan holda saqlanadi, agar `.env` dagi kalit o'zgarmasa, barcha foydalanuvchilar o'zlarining avvalgi login va parollari bilan tizimga kirishlari mumkin bo'ladi.

### 2. Brauzerda eski sahifalar yoki keshlanish ko'rinmoqda
- Brauzerda `Ctrl + Shift + R` (Hard Reload) bosing.
- `etransport-nginx` konteynerini qayta yuklang: `docker compose restart nginx`.

### 3. Fayllar yoki PDF dalolatnomalar ochilmayapti
- Fayllar huquqini tekshiring:
  ```bash
  docker exec etransport-api chown -R root:root /var/etransport/uploads
  ```

---
**Qo'llanma tayyorlandi va E-Transport tizimining barcha modullari uchun to'liq sinovdan o'tkazildi.**
