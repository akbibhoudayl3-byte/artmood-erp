#!/bin/bash
# ArtMood Auto-Backup: GitHub + Remote Server
# Usage: bash scripts/backup.sh

set -e

PROJECT_DIR="C:/Users/Houdayl/Desktop/artmood"
SSH_KEY="C:/Users/Houdayl/Desktop/artmood-key.pem"
REMOTE_USER="ubuntu"
REMOTE_HOST="63.33.212.105"
REMOTE_PATH="/home/ubuntu/artmood/"

cd "$PROJECT_DIR"

# ── 1. Git: commit & push to GitHub ──────────────────────────────────
echo "=== [1/2] GitHub Backup ==="

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "No changes to commit."
else
  git add -A
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  git commit -m "auto-backup: $TIMESTAMP"
  echo "Committed at $TIMESTAMP"
fi

git push origin master
echo "Pushed to GitHub."

# ── 2. Sync to remote server via git pull ─────────────────────────────
echo "=== [2/2] Server Backup ==="

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" bash -s <<'REMOTE'
  cd /home/ubuntu/artmood

  # Pull latest from GitHub
  git pull origin master --ff-only 2>&1 || {
    echo "Git pull failed — trying reset"
    git fetch origin master
    git reset --hard origin/master
  }

  # Install any new deps
  npm install --omit=dev 2>&1 | tail -3

  # Restart app
  pm2 restart artmood 2>/dev/null || pm2 start npm --name artmood -- run dev
  echo "Server updated and restarted."
REMOTE

echo "=== Backup complete ==="
