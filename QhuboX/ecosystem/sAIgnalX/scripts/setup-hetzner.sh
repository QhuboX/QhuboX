#!/bin/bash
# ============================================================
#  setup-hetzner.sh — QhuboX Ecosystem · VPS Ubuntu 22/24
#  Ejecutar como root: bash setup-hetzner.sh
# ============================================================
set -e

DOMAIN="qhubx.com"
APP_USER="qhubx"
NODE_VERSION="20"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   QhuboX — Hetzner Server Setup      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Sistema base ─────────────────────────────────────────
echo "[1/8] Actualizando sistema..."
apt update -qq && apt upgrade -y -qq
apt install -y -qq curl wget git ufw nginx certbot python3-certbot-nginx \
    build-essential sqlite3 unzip

# ── 2. Node.js via nvm (como root, global) ──────────────────
echo "[2/8] Instalando Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y -qq nodejs
node -v && npm -v

# ── 3. PM2 global ───────────────────────────────────────────
echo "[3/8] Instalando PM2..."
npm install -g pm2 --silent
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# ── 4. Usuario de app (no-root) ─────────────────────────────
echo "[4/8] Creando usuario $APP_USER..."
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
fi

# ── 5. Estructura de carpetas ────────────────────────────────
echo "[5/8] Creando estructura de directorios..."
mkdir -p /var/www/qhubx/{server,public/{sAIgnalX/premium,app2,app3},scripts,logs,data}
chown -R "$APP_USER":"$APP_USER" /var/www/qhubx

# ── 6. Firewall ──────────────────────────────────────────────
echo "[6/8] Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 7. Nginx config ──────────────────────────────────────────
echo "[7/8] Configurando Nginx..."

cat > /etc/nginx/sites-available/qhubx << 'NGINXCONF'
# ── QhuboX Main Ecosystem ────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name qhubx.com www.qhubx.com;

    # Fuerza HTTPS (Certbot actualizará esto con SSL)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name qhubx.com www.qhubx.com;

    # SSL — Certbot los llenará automáticamente
    # ssl_certificate /etc/letsencrypt/live/qhubx.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/qhubx.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com fonts.gstatic.com; font-src 'self' fonts.gstatic.com; img-src 'self' data:; connect-src 'self' wss: https:; frame-src https://s.tradingview.com;" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # ── Landing principal ──────────────────────────────────
    location = / {
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

    # ── sAIgnalX App ───────────────────────────────────────
    location /sAIgnalX/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # WebSocket para Binance streams
        proxy_read_timeout 86400;
    }

    # ── sAIgnalX Premium (ruta protegida por JWT) ──────────
    # El backend verifica el token ANTES de servir el HTML
    location /sAIgnalX/premium/ {
        proxy_pass http://127.0.0.1:3001/premium/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # ── App 2 (placeholder) ────────────────────────────────
    location /app2/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── App 3 (placeholder) ────────────────────────────────
    location /app3/ {
        proxy_pass http://127.0.0.1:3003/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Bloquear acceso directo a archivos .js del premium ─
    location ~* ^/sAIgnalX/premium/.*\.(js|json)$ {
        deny all;
        return 403;
    }

    # Cache estático
    location ~* \.(ico|css|js|gif|jpeg|jpg|png|svg|woff2|woff|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}
NGINXCONF

ln -sf /etc/nginx/sites-available/qhubx /etc/nginx/sites-enabled/qhubx
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 8. SSL con Certbot ───────────────────────────────────────
echo "[8/8] SSL — Certbot..."
echo ""
echo "⚠  ANTES de continuar, asegúrate de que el DNS de qhubx.com"
echo "   apunte a la IP de este servidor."
echo ""
read -p "¿El DNS ya está configurado? (s/n): " dns_ready

if [ "$dns_ready" = "s" ] || [ "$dns_ready" = "S" ]; then
    certbot --nginx -d qhubx.com -d www.qhubx.com --non-interactive \
        --agree-tos --email admin@qhubx.com --redirect
    echo "✅ SSL activado."
else
    echo "⏩ Saltando SSL por ahora. Ejecuta cuando el DNS esté listo:"
    echo "   certbot --nginx -d qhubx.com -d www.qhubx.com"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ Servidor configurado correctamente    ║"
echo "║                                          ║"
echo "║  Próximo paso:                           ║"
echo "║  cd /var/www/qhubx && bash deploy.sh     ║"
echo "╚══════════════════════════════════════════╝"
