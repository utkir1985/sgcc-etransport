# IT Helpdesk — Server Backup, Migration va Xavfsizlik Wiki

**Muhandis** | **Sana:** 16.07.2026 | **Versiya:** 4

> IT Helpdesk tizimining ma'lumotlar bazasi va fayllarini xavfsiz nusxalab olish bo'yicha to'liq qo'llanma

---

## 1-QISM — BACKUP OLISH (ASOSIY SERVERDA)

### 1. Serverga SSH orqali kiring

```bash
ssh ticketadm@172.16.90.46
```

### 2. Loyiha papkasiga kiring

```bash
cd /var/www/it-helpdesk-project
```

### 3. Docker konteyner ishlayaptimi tekshiring

> `db` konteyner **healthy** holatda bo'lishi kerak

```bash
docker compose ps
```

### 4. Container va papka fayllarini sinxronlashtiring

> ⚠️ Agar kodda o'zgartirishlar qilgan bo'lsangiz — backup olishdan **OLDIN** shu qadamni bajaring!

```bash
for f in $(find /var/www/it-helpdesk-project/frontend/src -name "*.tsx" -o -name "*.ts"); do
  hash1=$(md5sum "$f" | cut -d' ' -f1)
  container_path="/app/src${f#/var/www/it-helpdesk-project/frontend/src}"
  hash2=$(docker exec it-helpdesk-project-frontend-1 md5sum "$container_path" 2>/dev/null | cut -d' ' -f1)
  if [ "$hash1" != "$hash2" ]; then
    echo "Yangilanmoqda: $f"
    docker cp "it-helpdesk-project-frontend-1:$container_path" "$f"
  fi
done
echo "✅ Sinxronlash tugadi"
```

### 5. Backup oling

> Toshkent vaqti bilan papka yaratiladi, masalan: `full_backup_03.06.2026_1351`

```bash
DATE=$(TZ="Asia/Tashkent" date +%d.%m.%Y_%H%M)
BACKUP_DIR="/tmp/full_backup_$DATE"
mkdir -p $BACKUP_DIR

tar -czf $BACKUP_DIR/it-helpdesk-project.tar.gz /var/www/it-helpdesk-project
tar -czf $BACKUP_DIR/it_ticket_files.tar.gz /var/www/it_ticket
cp /etc/nginx/sites-available/it-ticket $BACKUP_DIR/nginx_it-ticket.conf

docker exec it-helpdesk-project-db-1 pg_dump -U it_user -F c it_ticket > $BACKUP_DIR/it_ticket_db.dump

echo "Papka: $BACKUP_DIR"
```

### 6. Backup to'liq ekanligini tekshiring

> 4 ta fayl ko'rinishi kerak. `it_ticket_db.dump` kamida 100KB bo'lsin

```bash
ls -lh $BACKUP_DIR
```

### 7. Windows kompyuterga yuklab oling (PowerShell)

> Bu buyruqni **Windows PowerShell** da ishlating (serverda emas)

```powershell
$DATE = Get-Date -Format "dd.MM.yyyy_HHmm"
$DEST = "$HOME\Desktop\IT_Backup\$DATE"
New-Item -ItemType Directory -Force -Path $DEST
scp -r ticketadm@172.16.90.46:/tmp/full_backup_*/ $DEST\
```

### 8. Serverdan vaqtinchalik fayllarni tozalang

> ⚠️ Avval kompyuteringizda fayllar borligini tekshiring!

```bash
rm -rf /tmp/full_backup_*/
rm -f /tmp/it_ticket_db.dump
```

---

## 2-QISM — ESKI/ISHLAYOTGAN SERVERNI TOZALASH (AGAR KERAK BO'LSA)

### 1. Yangi serverga kiring

```bash
ssh root@YANGI_SERVER_IP
```

### 2. Barcha Docker konteyner va volumelarni o'chiring

> ⚠️ Bu amal barcha ma'lumotlarni o'chiradi! Backup olgansiz deb ishonch hosil qiling.

```bash
cd /var/www/it-helpdesk-project
docker compose down -v
```

### 3. Loyiha papkalarini o'chiring

```bash
rm -rf /var/www/it-helpdesk-project
rm -rf /var/www/it_ticket
```

### 4. Hamma narsa tozalanganini tekshiring

> Faqat `html` papkasi ko'rinishi kerak

```bash
ls /var/www/
docker ps -a
```

---

## 3-QISM — YANGI SERVERGA TIKLASH

### 1. Kerakli dasturlarni tekshiring/o'rnating

> Agar Docker/Nginx allaqachon o'rnatilgan bo'lsa, bu qadamni o'tkazib yuborish mumkin:

```bash
docker --version
docker compose version
nginx -v

apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 nginx
systemctl enable docker && systemctl start docker
```

### 2. Backup fayllarni yangi serverga yuboring (PowerShell)

> Papka nomini o'zingizning backup papkangizga almashtiring

```powershell
scp $HOME\Desktop\IT_Backup\03.06.2026_1351\full_backup_*\it_ticket_db.dump ticketadm@YANGI_IP:/tmp/
scp $HOME\Desktop\IT_Backup\03.06.2026_1351\full_backup_*\it-helpdesk-project.tar.gz ticketadm@YANGI_IP:/tmp/
scp $HOME\Desktop\IT_Backup\03.06.2026_1351\full_backup_*\it_ticket_files.tar.gz ticketadm@YANGI_IP:/tmp/
```

### 3. Fayllarni joyiga chiqaring

```bash
mkdir -p /var/www && cd /tmp
tar -xzf it-helpdesk-project.tar.gz
tar -xzf it_ticket_files.tar.gz
cp -r /tmp/var/www/it-helpdesk-project /var/www/
cp -r /tmp/var/www/it_ticket /var/www/
rm -rf /tmp/var
ls /var/www/
```

### 4. docker-compose.yml ni yangi IP ga moslashtiring

> Avval `sed` bilan sozlang, keyin `nano` bilan IP larni o'zgartiring

```bash
sed -i "s/image: postgres:15/image: postgres:16/" /var/www/it-helpdesk-project/docker-compose.yml
sed -i "s/SEED_RESET_PASSWORDS=true/SEED_RESET_PASSWORDS=false/" /var/www/it-helpdesk-project/docker-compose.yml

nano /var/www/it-helpdesk-project/docker-compose.yml
```

### 5. Tekshiring

> Barcha qatorlarda yangi IP ko'rinishi kerak

```bash
grep -E "ALLOWED_HOSTS|CORS_ALLOWED|CSRF_TRUSTED|NEXT_PUBLIC_API" /var/www/it-helpdesk-project/docker-compose.yml
```

### 6. Dockerni build qilib ishga tushiring

> `--build` muhim! Frontend kodi to'g'ri build bo'lishi uchun

```bash
cd /var/www/it-helpdesk-project
docker compose up -d --build

docker compose ps -a
```

### 7. ⚠️ MUHIM — Database'ni tiklash

**Nima uchun kerak:** `docker compose up --build` bo'sh yangi PostgreSQL yaratadi va Django modellarining butun migration tarixini noldan qo'llashga urinadi. Loyihaning eski migratsiyalari orasida ziddiyatlar bo'lgani sababli (masalan `accounts.0018` migratsiyasi keyinroq qo'shilgan ustunni talab qilishi) bu jarayon muvaffaqiyatsiz tugaydi va backend `Exited (1)` holatida qoladi — bu esa "login/parol ishlamayapti" muammosining asosiy sababi.

**To'g'ri yechim:** avval bo'sh migratsiyalangan bazani o'chirib, undan keyin haqiqiy backup dumpni to'g'ridan-to'g'ri tiklash kerak.

### 8. Backend va unga bog'liq servislarni to'xtatish (DB ishlab tursin)

```bash
docker compose stop backend celery celery-beat telegram-bot
```

### 9. Bo'sh (noto'g'ri migratsiyalangan) bazani o'chirib, qayta yaratish

```bash
docker exec it-helpdesk-project-db-1 psql -U it_user -d postgres -c "DROP DATABASE it_ticket;"
docker exec it-helpdesk-project-db-1 psql -U it_user -d postgres -c "CREATE DATABASE it_ticket;"
```

### 10. Backup dumpni konteyner ichiga ko'chirib, tiklash

> `role "postgres" does not exist` turidagi ogohlantirishlar (bir necha dona) — zararsiz, e'tiborsiz qoldirish mumkin. Bular dumpdagi eski `postgres` roliga tegishli `OWNER TO` buyruqlari, bizning muhitda jadvallar `it_user` egaligida qoladi.

```bash
docker cp /tmp/it_ticket_db.dump it-helpdesk-project-db-1:/tmp/it_ticket_db.dump
docker exec it-helpdesk-project-db-1 pg_restore -U it_user -d it_ticket /tmp/it_ticket_db.dump
```

### 11. Ma'lumotlar to'g'ri tiklanganini tekshirish

```bash
docker exec it-helpdesk-project-db-1 psql -U it_user -d it_ticket -c "\dt" | wc -l
docker exec it-helpdesk-project-db-1 psql -U it_user -d it_ticket -c "SELECT count(*) FROM accounts_customuser;"
```

### 12. Backendni qayta ishga tushirish

> Backend holati `Up` bo'lishi kerak (avvalgi holatdagi kabi "Exited (1)" emas).

```bash
docker compose up -d backend celery celery-beat telegram-bot
docker compose ps -a
```

### 13. Loglarni tekshirish

> Muvaffaqiyatli ishga tushish uchun quyidagilar ko'rinishi kerak:
> ```
> No migrations to apply.
> ...
> Starting gunicorn ...
> Listening at: http://0.0.0.0:8000
> Booting worker with pid: ...
> ```

```bash
docker logs it-helpdesk-project-backend-1 --tail 30
```

### 14. Nginx sozlash

```bash
cat > /etc/nginx/sites-available/it-ticket << 'EOF'
server {
    listen 80;
    server_name YANGI_IP;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /admin/ {
        proxy_pass http://127.0.0.1:8000/admin/;
        proxy_set_header Host $host;
    }
    location /django-admin/ {
        proxy_pass http://127.0.0.1:8000/django-admin/;
        proxy_set_header Host $host;
    }
    location /static/ { alias /var/www/it-helpdesk-project/backend/staticfiles/; }
    location /media/ { alias /var/www/it_ticket/media/; }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/it-ticket /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

### 15. Foydalanuvchi parolini tiklash (faqat zarur bo'lsa)

```bash
docker exec -it it-helpdesk-project-backend-1 python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(username='USERNAME')
u.set_password('YangiParol123')
u.save()
print('Tayyor')
"
```

### 16. Brauzerda tekshiring

| Sahifa | Manzil |
|---|---|
| Frontend (foydalanuvchilar) | `http://YANGI_IP/login` |
| Admin paneli | `http://YANGI_IP/admin` |
