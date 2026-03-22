#!/bin/bash
# ArtMood Supabase Backup Script
# Run: bash scripts/backup-supabase.sh
# Cron: 0 3 * * * bash /home/user/artmood-erp/scripts/backup-supabase.sh >> /home/user/artmood-erp/logs/backup.log 2>&1
#
# Exports critical tables from Supabase to local JSON files.
# Requires: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local

set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$APP_DIR/.env.local" 2>/dev/null || { echo "[FAIL] Cannot load .env.local"; exit 1; }

BACKUP_DIR="$APP_DIR/backups/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$BACKUP_DIR"

SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
    echo "[FAIL] Missing SUPABASE_URL or SERVICE_ROLE_KEY"
    exit 1
fi

# Tables to back up (critical business data)
TABLES=(
    "profiles"
    "projects"
    "quotes"
    "quote_lines"
    "invoices"
    "invoice_lines"
    "payments"
    "ledger"
    "stock_items"
    "stock_movements"
    "production_orders"
    "leads"
    "audit_log"
)

echo "=== ArtMood Backup — $(date) ==="
echo "Backup dir: $BACKUP_DIR"

FAILED=0
for table in "${TABLES[@]}"; do
    HTTP_CODE=$(curl -s -o "$BACKUP_DIR/${table}.json" -w "%{http_code}" \
        "${SUPABASE_URL}/rest/v1/${table}?select=*&limit=50000" \
        -H "apikey: ${SERVICE_KEY}" \
        -H "Authorization: Bearer ${SERVICE_KEY}" \
        -H "Accept: application/json" \
        --max-time 30)

    if [ "$HTTP_CODE" = "200" ]; then
        ROWS=$(python3 -c "import json; print(len(json.load(open('$BACKUP_DIR/${table}.json'))))" 2>/dev/null || echo "?")
        echo "[OK] $table — $ROWS rows"
    else
        echo "[FAIL] $table — HTTP $HTTP_CODE"
        FAILED=$((FAILED + 1))
    fi
done

# Compress
ARCHIVE="$APP_DIR/backups/backup-$(date +%Y-%m-%d_%H%M).tar.gz"
tar -czf "$ARCHIVE" -C "$APP_DIR/backups" "$(basename "$BACKUP_DIR")"
rm -rf "$BACKUP_DIR"

echo ""
if [ $FAILED -eq 0 ]; then
    echo "[OK] Backup complete: $ARCHIVE"
else
    echo "[WARN] Backup completed with $FAILED failures: $ARCHIVE"
fi

# Keep only last 30 backups
ls -t "$APP_DIR/backups"/backup-*.tar.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
echo "[OK] Retention: keeping last 30 backups"
