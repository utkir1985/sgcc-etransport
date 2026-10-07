#!/usr/bin/env bash
# ==============================================================================
# E-Transport — Maxfiy kalitlarni (JWT, Postgres, MinIO) xavfsiz almashtirish
#
# Nima uchun kerak: .env faylidagi JWT_SECRET, POSTGRES_PASSWORD,
# MINIO_ROOT_USER/PASSWORD hozircha reponing OCHIQ (hammaga ma'lum) default
# qiymatlari bilan bir xil edi — bu real xavfsizlik teshigi. Bu skript
# har birini tasodifiy, kuchli qiymatga almashtiradi va DB/MinIO tomonini
# ham SINXRON yangilaydi (faqat .env'ni o'zgartirish YETARLI EMAS — Postgres
# eski parolni bilmay qoladi va API ulanolmay qoladi, shuning uchun ALTER
# USER ham shu yerda bajariladi).
#
# TALAB: docker buyruqlariga ruxsat (docker guruhida bo'lish yoki sudo).
# Ishlatish: sudo bash /var/www/e-transport/scripts/rotate-secrets.sh
#
# DIQQAT: JWT_SECRET almashgach, hozir tizimga kirgan BARCHA foydalanuvchilar
# avtomatik chiqib ketadi (qayta login qilishlari kerak bo'ladi). Buni ish
# vaqti tugagandan keyin yoki ogohlantirib bajaring.
# ==============================================================================
set -euo pipefail

PROJ="/var/www/e-transport"
ENV_FILE="$PROJ/.env"
cd "$PROJ"

if ! docker info >/dev/null 2>&1; then
  echo "XATO: docker buyruqlariga ruxsat yo'q. 'sudo bash $0' bilan ishga tushiring." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "XATO: $ENV_FILE topilmadi." >&2
  exit 1
fi

# --- 0. Joriy qiymatlarni o'qib olamiz (ALTER USER uchun eski parol kerak) ---
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
OLD_PG_PASSWORD="${POSTGRES_PASSWORD:-etransport_secret}"
PG_USER="${POSTGRES_USER:-etransport}"
PG_DB="${POSTGRES_DB:-etransport}"

# --- 1. Zaxira ---
BACKUP="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
echo "Zaxira saqlandi: $BACKUP"

# --- 2. Yangi kuchli qiymatlar ---
NEW_JWT_SECRET=$(openssl rand -hex 48)
NEW_PG_PASSWORD=$(openssl rand -hex 24)
NEW_MINIO_USER="etr_$(openssl rand -hex 6)"
NEW_MINIO_PASSWORD=$(openssl rand -hex 24)

# --- 3. .env faylini yangilaymiz ---
python3 - "$ENV_FILE" "$NEW_JWT_SECRET" "$NEW_PG_PASSWORD" "$NEW_MINIO_USER" "$NEW_MINIO_PASSWORD" <<'PYEOF'
import sys
path, jwt, pg, mu, mp = sys.argv[1:6]
with open(path) as f:
    lines = f.readlines()
out = []
for line in lines:
    if line.startswith("JWT_SECRET="):
        out.append(f"JWT_SECRET={jwt}\n")
    elif line.startswith("POSTGRES_PASSWORD="):
        out.append(f"POSTGRES_PASSWORD={pg}\n")
    elif line.startswith("MINIO_ROOT_USER="):
        out.append(f"MINIO_ROOT_USER={mu}\n")
    elif line.startswith("MINIO_ROOT_PASSWORD="):
        out.append(f"MINIO_ROOT_PASSWORD={mp}\n")
    else:
        out.append(line)
with open(path, "w") as f:
    f.writelines(out)
PYEOF
echo "OK: .env yangilandi (JWT_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_USER/PASSWORD)"

# --- 4. Postgres'ning HAQIQIY parolini ham yangilaymiz (eski parol bilan ulanib) ---
docker exec -e PGPASSWORD="$OLD_PG_PASSWORD" etransport-postgres \
  psql -U "$PG_USER" -d "$PG_DB" -c "ALTER USER \"$PG_USER\" WITH PASSWORD '$NEW_PG_PASSWORD';"
echo "OK: Postgres foydalanuvchi paroli DB darajasida ham yangilandi"

# --- 5. Xizmatlarni yangi .env bilan qayta ko'taramiz ---
# MinIO root user/parolni konteyner qayta ishga tushganda o'zi env'dan qayta o'qiydi.
docker compose up -d postgres redis minio
sleep 5
docker compose up -d api
sleep 3
docker compose up -d frontend nginx

echo ""
echo "=============================================="
echo " TAYYOR: JWT_SECRET, POSTGRES_PASSWORD,"
echo " MINIO_ROOT_USER/PASSWORD yangilandi."
echo " Eski qiymatlar: $BACKUP ichida (parol tiklash kerak bo'lsa)."
echo " Barcha foydalanuvchi qayta login qilishi kerak bo'ladi."
echo "=============================================="
echo ""
echo "Tekshiring: docker compose ps   (hammasi 'healthy' bo'lishi kerak)"
echo "Tekshiring: saytga kirib, login qiling."
