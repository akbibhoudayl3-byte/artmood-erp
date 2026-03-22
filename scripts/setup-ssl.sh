#!/bin/bash
# SSL Setup Script for erp.artmood.ma
# Run this directly on the EC2 server (63.33.212.105) as root
# Usage: sudo bash setup-ssl.sh

set -e

echo "=== 1. Verifying DNS ==="
if ! getent hosts erp.artmood.ma > /dev/null 2>&1; then
    echo "ERROR: erp.artmood.ma does not resolve. Set DNS A record to 63.33.212.105 first."
    exit 1
fi
echo "DNS OK: $(getent hosts erp.artmood.ma)"

echo ""
echo "=== 2. Checking ports 80/443 ==="
if ss -tlnp | grep -q ':80 '; then
    echo "Port 80: OK"
else
    echo "WARNING: Port 80 not listening yet (nginx will handle it)"
fi

echo ""
echo "=== 3. Installing certbot ==="
apt-get update -qq
apt-get install -y certbot python3-certbot-nginx

echo ""
echo "=== 4. Preparing nginx config for certbot ==="
# Certbot needs a basic server block to work with.
# Remove self-signed cert config temporarily so certbot can modify it.
cat > /etc/nginx/sites-available/artmood <<'NGINX'
server {
    listen 80;
    server_name erp.artmood.ma;

    location / {
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

# Ensure symlink exists
ln -sf /etc/nginx/sites-available/artmood /etc/nginx/sites-enabled/artmood

# Remove default if it conflicts
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "Nginx reloaded with HTTP-only config"

echo ""
echo "=== 5. Generating Let's Encrypt SSL certificate ==="
certbot --nginx -d erp.artmood.ma \
    --non-interactive \
    --agree-tos \
    -m contact@artmood.ma \
    --redirect

echo ""
echo "=== 6. Verifying ==="
nginx -t && systemctl reload nginx

echo ""
echo "=== 7. Testing ==="
echo "HTTP redirect test:"
curl -sI http://erp.artmood.ma | head -3
echo ""
echo "HTTPS test:"
curl -sI https://erp.artmood.ma | head -3

echo ""
echo "=== 8. Auto-renewal check ==="
certbot renew --dry-run

echo ""
echo "============================================"
echo "  SSL SETUP COMPLETE"
echo "  URL: https://erp.artmood.ma"
echo "  Certificate: Let's Encrypt (auto-renews)"
echo "============================================"
