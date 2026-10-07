#!/bin/bash
# ============================================================
# E-Transport — To'liq Deploy Skripti
# Ishlatish: bash /var/www/e-transport/deploy.sh
# ============================================================
set -euo pipefail

PROJ="/var/www/e-transport"
FRONTEND="$PROJ/frontend"

# Node path topish
NODE_PATHS=(
  "/home/etransportadm/.antigravity-ide-server/bin/2.5.5-ecfbad74d93962fc8ca485d93ab9b4f3d4cb6cf8/node"
  "/usr/local/bin/node"
  "/usr/bin/node"
)
NODE=""
for n in "${NODE_PATHS[@]}"; do
  if [ -n "$n" ] && [ -x "$n" ]; then
    NODE="$n"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo "Node topilmadi!"
  exit 1
fi

echo ""
echo "=============================================="
echo "   E-Transport Deploy"
echo "   Node: $NODE ($($NODE --version))"
echo "=============================================="
echo ""

# 1. Frontend build
echo "1/3 — Frontend build..."
cd "$FRONTEND"
"$NODE" node_modules/.bin/vite build
echo "OK: Frontend build yakunlandi"
echo ""

# 2. Docker konteyner restart
echo "2/3 — Docker build va restart..."
cd "$PROJ"

DOCKER_CMD=""
if sudo -n docker info >/dev/null 2>&1; then
  DOCKER_CMD="sudo docker"
elif docker info >/dev/null 2>&1; then
  DOCKER_CMD="docker"
fi

if [ -n "$DOCKER_CMD" ]; then
  $DOCKER_CMD compose build api && echo "OK: API build yakunlandi"
  # "up -d" (shunchaki "restart" emas) — docker-compose.yml'dagi o'zgarishlar
  # (resurs chegarasi, health-check, restart siyosati) ham har deployda qo'llanadi.
  $DOCKER_CMD compose up -d api && echo "OK: etransport-api restarted"
  $DOCKER_CMD compose up -d frontend && echo "OK: etransport-frontend restarted" || echo "WARN: frontend restart xatoligi"
  $DOCKER_CMD compose up -d nginx && echo "OK: etransport-nginx restarted" || echo "WARN: nginx restart xatoligi"
  echo ""
  echo "Konteyner holati:"
  $DOCKER_CMD ps --format "  {{.Names}}: {{.Status}}" | grep etransport || true
else
  echo ""
  echo "MUHIM: Docker topilmadi. Quyidagini qo'lda bajaring:"
  echo "  sudo docker restart etransport-frontend etransport-nginx"
fi

echo ""
echo "=============================================="
echo "  TAYYOR! Brauzerda CTRL+SHIFT+R bosing"
echo "=============================================="
