#!/bin/bash
# Pull latest backup from server to local machine
# Run from: C:\Users\Houdayl\Desktop\artmood\
# Usage: bash scripts/pull_backup.sh

KEY="/tmp/new_server_key.pem"
SERVER="ubuntu@63.33.212.105"
REMOTE_DIR="/home/ubuntu/backups"
LOCAL_DIR="$(dirname "$0")/../backups"

mkdir -p "$LOCAL_DIR"

echo "[$(date)] Pulling latest backup from server..."
LATEST=$(ssh -i "$KEY" "$SERVER" "ls -t ${REMOTE_DIR}/artmood_*.json.gz 2>/dev/null | head -1")

if [ -z "$LATEST" ]; then
  echo "ERROR: No backup files found on server"
  exit 1
fi

FILENAME=$(basename "$LATEST")
scp -i "$KEY" "${SERVER}:${LATEST}" "${LOCAL_DIR}/${FILENAME}"

if [ $? -eq 0 ]; then
  SIZE=$(ls -lh "${LOCAL_DIR}/${FILENAME}" | awk '{print $5}')
  echo "[$(date)] Downloaded: ${LOCAL_DIR}/${FILENAME} (${SIZE})"
  echo "Total local backups: $(ls ${LOCAL_DIR}/artmood_*.json.gz 2>/dev/null | wc -l)"
else
  echo "[$(date)] DOWNLOAD FAILED"
  exit 1
fi
