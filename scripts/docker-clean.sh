#!/usr/bin/env bash
# ==============================================================================
# E-Transport Docker Auto-Cleaner Script
# Automates Docker builder cache and dangling image cleanup to prevent disk bloat
# ==============================================================================

set -eo pipefail

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting automated Docker cleanup..."

# 1. Clean BuildKit cache older than 48 hours
if docker builder prune -a -f --filter "until=48h" >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Docker builder cache pruned successfully."
else
    # Fallback to general prune
    docker builder prune -a -f >/dev/null 2>&1 || true
fi

# 2. Prune dangling and intermediate images
docker image prune -f >/dev/null 2>&1 || true

# 3. Prune stopped containers (if any exist)
docker container prune -f >/dev/null 2>&1 || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Docker automated cleanup completed."
