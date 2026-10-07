#!/usr/bin/env bash
set -e

TIMESTAMP=$(TZ="Asia/Tashkent" date +%Y%m%d_%H%M%S)
BACKUP_ROOT="/home/etransportadm/backups"
BACKUP_NAME="etransport_full_backup_${TIMESTAMP}"
BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_NAME}"

mkdir -p "${BACKUP_DIR}/configs"

echo "=== 1/6. PostgreSQL ma'lumotlar bazasi zaxiralanmoqda ==="
docker exec etransport-postgres pg_dump -U etransport -F c -b etransport > "${BACKUP_DIR}/etransport_db.dump"
docker exec etransport-postgres pg_dump -U etransport --clean --if-exists etransport | gzip -9 > "${BACKUP_DIR}/etransport_db.sql.gz"

echo "=== 2/6. Yuklangan fayllar (uploads) va DataProtection kalitlari olinmoqda ==="
docker cp etransport-api:/var/etransport/uploads "${BACKUP_DIR}/uploads_raw"
tar -czf "${BACKUP_DIR}/etransport_uploads.tar.gz" -C "${BACKUP_DIR}" uploads_raw
rm -rf "${BACKUP_DIR}/uploads_raw"

docker cp etransport-api:/var/etransport/dp-keys "${BACKUP_DIR}/dp_keys_raw"
tar -czf "${BACKUP_DIR}/etransport_dp_keys.tar.gz" -C "${BACKUP_DIR}" dp_keys_raw
rm -rf "${BACKUP_DIR}/dp_keys_raw"

echo "=== 3/6. Redis ma'lumotlari zaxiralanmoqda ==="
docker exec etransport-redis redis-cli save || true
docker cp etransport-redis:/data/dump.rdb "${BACKUP_DIR}/etransport_redis.rdb" 2>/dev/null || true

echo "=== 4/6. Konfiguratsiya fayllari nusxalanmoqda ==="
cp /var/www/e-transport/.env "${BACKUP_DIR}/configs/.env"
cp /var/www/e-transport/docker-compose.yml "${BACKUP_DIR}/configs/docker-compose.yml"
cp /var/www/e-transport/nginx/nginx.conf "${BACKUP_DIR}/configs/nginx.conf"

echo "=== 5/6. Loyiha manba kodi (source code) arxivlanmoqda ==="
tar --exclude='node_modules' \
    --exclude='backend/**/bin' \
    --exclude='backend/**/obj' \
    --exclude='*.pyc' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='scratch' \
    -czf "${BACKUP_DIR}/etransport_source_code.tar.gz" \
    -C /var/www e-transport

echo "=== 6/6. Qayta tiklash qo'llanmasi yaratilmoqda ==="
cat << 'EOF' > "${BACKUP_DIR}/README_RESTORE.md"
# E-Transport Tizimini Zaxiradan Qayta Tiklash Qo'llanmasi

Ushbu arxiv E-Transport tizimining to'liq nusxasini o'z ichiga oladi:
1. `etransport_db.dump` - PostgreSQL to'liq binary backup (pg_restore uchun).
2. `etransport_db.sql.gz` - PostgreSQL SQL matnli backup (gunzip / psql uchun).
3. `etransport_uploads.tar.gz` - Barcha yuklangan hujjatlar, dalolatnomalar, muhr rasmlari (/var/etransport/uploads).
4. `etransport_dp_keys.tar.gz` - ASP.NET Core DataProtection kalitlari (/var/etransport/dp-keys).
5. `etransport_redis.rdb` - Redis kesh va navbatlar nusxasi.
6. `etransport_source_code.tar.gz` - Backend, Frontend, Nginx, skriptlar to'liq manba kodi.
7. `configs/` - .env, docker-compose.yml, nginx.conf konfiguratsiyalari.

## Qayta tiklash bosqichlari:

1. Loyiha kodlarini ochish:
   tar -xzf etransport_source_code.tar.gz -C /var/www/

2. Konfiguratsiya fayllarini joylashtirish:
   cp configs/.env /var/www/e-transport/.env
   cp configs/docker-compose.yml /var/www/e-transport/docker-compose.yml
   cp configs/nginx.conf /var/www/e-transport/nginx/nginx.conf

3. Konteynerlarni ko'tarish:
   cd /var/www/e-transport
   docker compose up -d

4. Ma'lumotlar bazasini tiklash:
   docker exec -i etransport-postgres pg_restore -U etransport -d etransport --clean --if-exists < etransport_db.dump
   (yoki: gunzip -c etransport_db.sql.gz | docker exec -i etransport-postgres psql -U etransport -d etransport)

5. Uploads fayllarini tiklash:
   tar -xzf etransport_uploads.tar.gz
   docker cp uploads_raw/. etransport-api:/var/etransport/uploads/
   rm -rf uploads_raw

6. Servislarni qayta yurgizish:
   docker compose restart
EOF

echo "=== Yagona to'liq arxiv fayli yaratilmoqda ==="
tar -czf "${BACKUP_ROOT}/${BACKUP_NAME}.tar.gz" -C "${BACKUP_ROOT}" "${BACKUP_NAME}"

chown -R etransportadm:etransportadm "${BACKUP_ROOT}"

echo "=================================================="
echo "SUCCESS"
echo "BACKUP_DIR=${BACKUP_DIR}"
echo "ARCHIVE_FILE=${BACKUP_ROOT}/${BACKUP_NAME}.tar.gz"
echo "=================================================="
