#!/bin/bash
# ArtMood Nginx Hardening Script
# Run: sudo bash scripts/harden-nginx.sh
#
# Adds rate limiting, blocks direct port 3000 access, and hardens headers.

set -e

NGINX_CONF="/etc/nginx/sites-available/artmood-erp"
NGINX_LINK="/etc/nginx/sites-enabled/artmood-erp"

echo "=== ArtMood Nginx Hardening ==="

# 1. Create hardened nginx config
cat > "$NGINX_CONF" << 'NGINX'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=general:10m rate=60r/s;

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name erp.artmood.ma;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name erp.artmood.ma;

    # SSL (managed by certbot)
    ssl_certificate /etc/letsencrypt/live/erp.artmood.ma/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.artmood.ma/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers (defense in depth — also set by Next.js)
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Hide server version
    server_tokens off;

    # Max body size (file uploads)
    client_max_body_size 20M;

    # Auth endpoints — strict rate limit
    location /auth/ {
        limit_req zone=auth burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API endpoints — moderate rate limit
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # General — generous rate limit
    location / {
        limit_req zone=general burst=40 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

echo "[OK] Nginx config written to $NGINX_CONF"

# 2. Enable site
ln -sf "$NGINX_CONF" "$NGINX_LINK"
echo "[OK] Site enabled"

# 3. Test and reload
nginx -t && systemctl reload nginx
echo "[OK] Nginx reloaded with hardened config"

# 4. Block direct access to port 3000 from outside
if command -v ufw &>/dev/null; then
    ufw deny 3000/tcp 2>/dev/null || true
    echo "[OK] UFW: port 3000 blocked from external access"
elif command -v iptables &>/dev/null; then
    # Allow localhost, deny external
    iptables -A INPUT -p tcp --dport 3000 -s 127.0.0.1 -j ACCEPT 2>/dev/null || true
    iptables -A INPUT -p tcp --dport 3000 -j DROP 2>/dev/null || true
    echo "[OK] iptables: port 3000 blocked from external access"
fi

echo ""
echo "=== Nginx hardening complete ==="
echo "Rate limits: auth=5r/m, api=30r/s, general=60r/s"
echo "Port 3000: blocked from external access"
