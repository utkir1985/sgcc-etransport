#!/usr/bin/env bash
set -e

# ==============================================================================
# E-Transport Tizimini To'liq Backup Qilish Skripti
# ==============================================================================

DATE=$(TZ="Asia/Tashkent" date +%d.%m.%Y_%H%M)
BACKUP_DIR="/tmp/etransport_backup_$DATE"
mkdir -p "$BACKUP_DIR"

echo "=================================================="
echo "🚀 E-Transport to'liq backup jarayoni boshlandi"
echo "Papka: $BACKUP_DIR"
echo "=================================================="

# 1. Loyiha kodlari
echo "1/4. Loyiha manba kodlari arxivlanmoqda..."
tar --exclude='node_modules' --exclude='dist' --exclude='.git' -czf "$BACKUP_DIR/etransport-project.tar.gz" -C /var/www e-transport

# 2. Uploads fayllar
echo "2/4. Yuklangan fayllar (uploads) olinmoqda..."
docker cp etransport-api:/var/etransport/uploads "$BACKUP_DIR/uploads_tmp"
tar -czf "$BACKUP_DIR/etransport_uploads.tar.gz" -C "$BACKUP_DIR" uploads_tmp
rm -rf "$BACKUP_DIR/uploads_tmp"

# 3. PostgreSQL ma'lumotlar bazasi
echo "3/4. PostgreSQL ma'lumotlar bazasi dump qilinmoqda..."
docker exec etransport-postgres pg_dump -U etransport -F c -b -v -f /tmp/etransport_db.dump etransport
docker cp etransport-postgres:/tmp/etransport_db.dump "$BACKUP_DIR/etransport_db.dump"
docker exec etransport-postgres rm -f /tmp/etransport_db.dump

# 4. Konfiguratsiya
echo "4/4. Konfiguratsiya fayllari nusxalanmoqda..."
cp /var/www/e-transport/.env "$BACKUP_DIR/etransport_env.backup"
cp /var/www/e-transport/nginx/nginx.conf "$BACKUP_DIR/nginx_conf.backup"

echo "=================================================="
echo "✅ Barcha nusxalar muvaffaqiyatli saqlandi!"
echo "Fayllar ro'yxati:"
ls -lh "$BACKUP_DIR"
echo "=================================================="
echo "Kompyuteringizga yuklab olish uchun PowerShell buyrug'i:"
echo "scp -r logigateadm@172.16.90.62:$BACKUP_DIR/ \$HOME\\Desktop\\"
echo "=================================================="
