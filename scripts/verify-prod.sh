#!/bin/bash
# ArtMood Production Verification Script
# Run: bash scripts/verify-prod.sh
# Or:  npm run verify:prod

set -e

RED='[0;31m'
GREEN='[0;32m'
YELLOW='[1;33m'
NC='[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo "=== ArtMood Production Verification ==="
echo ""

# 1. Check env vars
echo "-- 1. Environment Variables --"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$APP_DIR/.env.local" 2>/dev/null || source /home/ubuntu/artmood/.env.local 2>/dev/null || true

[ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && fail "NEXT_PUBLIC_SUPABASE_URL is not set"
[[ "$NEXT_PUBLIC_SUPABASE_URL" == https://* ]] || fail "NEXT_PUBLIC_SUPABASE_URL must start with https://"
[[ "$NEXT_PUBLIC_SUPABASE_URL" == *".supabase.co" ]] || fail "NEXT_PUBLIC_SUPABASE_URL must end with .supabase.co"
[ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && fail "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"
[[ "$NEXT_PUBLIC_SUPABASE_ANON_KEY" == eyJ* ]] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY does not look like a JWT"
ok "NEXT_PUBLIC_SUPABASE_URL = $NEXT_PUBLIC_SUPABASE_URL"
ok "NEXT_PUBLIC_SUPABASE_ANON_KEY = ${NEXT_PUBLIC_SUPABASE_ANON_KEY:0:20}..."

# Extract hostname from URL
SUPABASE_HOST=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed 's|https://||' | cut -d'/' -f1)

echo ""
echo "-- 2. DNS Resolution --"
if nslookup "$SUPABASE_HOST" >/dev/null 2>&1; then
  IP=$(dig "$SUPABASE_HOST" +short | head -1)
  ok "DNS resolved: $SUPABASE_HOST -> $IP"
else
  fail "DNS resolution failed for: $SUPABASE_HOST"
fi

echo ""
echo "-- 3. Supabase Connectivity --"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health" 2>&1)
if [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "200" ]; then
  ok "Supabase auth endpoint reachable (HTTP $HTTP_STATUS)"
else
  fail "Supabase auth endpoint returned unexpected status: HTTP $HTTP_STATUS"
fi

echo ""
echo "-- 4. Supabase Proxy (via Next.js rewrite) --"
PROXY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:3000/supabase-proxy/auth/v1/health" 2>&1)
if [ "$PROXY_STATUS" = "401" ] || [ "$PROXY_STATUS" = "200" ]; then
  ok "Proxy route /supabase-proxy/* -> Supabase reachable (HTTP $PROXY_STATUS)"
else
  warn "Proxy route returned HTTP $PROXY_STATUS (server might be starting)"
fi

echo ""
echo "-- 5. PM2 Process State --"
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=[p for p in json.load(sys.stdin) if p['name']=='artmood']; print(procs[0]['pm2_env']['status'] if procs else 'not found')" 2>/dev/null)
if [ "$PM2_STATUS" = "online" ]; then
  RESTARTS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=[p for p in json.load(sys.stdin) if p['name']=='artmood']; print(procs[0]['pm2_env']['restart_time'] if procs else '?')" 2>/dev/null)
  ok "PM2 artmood: online (restarts: $RESTARTS)"
else
  fail "PM2 artmood: $PM2_STATUS"
fi

echo ""
echo "-- 6. Login Page Loads --"
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:3000/auth/login")
[ "$LOGIN_STATUS" = "200" ] && ok "Login page: HTTP 200" || fail "Login page: HTTP $LOGIN_STATUS"

echo ""
echo "========================================"
echo -e "${GREEN}All checks passed. Production is healthy.${NC}"
