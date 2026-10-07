#!/bin/bash
set -euo pipefail

TARGET="/var/www/e-transport"
SOURCE="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="${SUDO_USER:-logigateadm}"

echo "==> E-Transport o'rnatilmoqda: $SOURCE -> $TARGET"

mkdir -p "$TARGET"
rsync -a --delete \
  --exclude='install.sh' \
  "$SOURCE/" "$TARGET/"

chown -R "$USER_NAME:$USER_NAME" "$TARGET"

echo "==> Muvaffaqiyatli o'rnatildi: $TARGET"
echo ""
echo "Keyingi qadamlar:"
echo "  cd $TARGET"
echo "  cp .env.example .env"
echo "  docker compose up -d --build"
echo ""
echo "Tizimga kirish: http://localhost"
echo "Demo login: admin / Admin123!"
