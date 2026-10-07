#!/usr/bin/env bash
# ==============================================================================
# E-Transport Health Watchdog
# Docker'ning o'zi konteyner CHIQIB KETSA ("restart: unless-stopped" orqali)
# avtomatik qayta ishga tushiradi. Lekin konteyner ISHLAB TURGAN, biroq javob
# bermayotgan ("unhealthy") holatni Docker o'zi tuzatmaydi — shu skript aynan
# shu bo'shliqni yopadi: har safar ishga tushganda barcha xizmatlarning
# sog'ligini tekshiradi va "unhealthy"/"to'xtagan" bo'lsa qayta ishga tushiradi.
#
# Ishlatish: cron orqali har 2 daqiqada (pastdagi "O'rnatish" bo'limiga qarang).
# ==============================================================================

set -uo pipefail

LOG_DIR="/var/www/e-transport/scripts"
LOG_FILE="$LOG_DIR/health-watchdog.log"
CONTAINERS=(etransport-postgres etransport-redis etransport-minio etransport-api etransport-frontend etransport-nginx)
MAX_LOG_LINES=2000

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Ensure rollback service is running
python3 /home/etransportadm/start_rollback_service.py >/dev/null 2>&1 || true


# Docker'ga umuman ulanib bo'lmasa (masalan huquq yo'q yoki daemon hali
# ko'tarilmagan), jim tugatamiz — cron'ni xato bilan to'ldirmaymiz.
if ! docker info >/dev/null 2>&1; then
    exit 0
fi

restarted_any=false

for name in "${CONTAINERS[@]}"; do
    if ! docker inspect "$name" >/dev/null 2>&1; then
        # Konteyner umuman mavjud emas (masalan hali birinchi marta
        # "docker compose up" qilinmagan) — watchdog vazifasi emas.
        continue
    fi

    status=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo "unknown")
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo "unknown")

    if [ "$status" != "running" ]; then
        log "OGOHLANTIRISH: $name holati '$status' (running emas) — qayta ishga tushirilmoqda."
        docker start "$name" >>"$LOG_FILE" 2>&1
        restarted_any=true
    elif [ "$health" = "unhealthy" ]; then
        log "OGOHLANTIRISH: $name 'unhealthy' — qayta ishga tushirilmoqda."
        docker restart "$name" >>"$LOG_FILE" 2>&1
        restarted_any=true
    fi
done

if [ "$restarted_any" = true ]; then
    log "Tekshiruv yakunlandi — bitta yoki bir nechta xizmat qayta ishga tushirildi."
fi

# Log faylini cheksiz o'smasligi uchun oxirgi $MAX_LOG_LINES qatorga qisqartiramiz.
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
