#!/bin/bash
# ============================================================
#  deploy.sh — Despliega QhuboX en el VPS
#  Ejecutar desde /var/www/qhubx/
# ============================================================
set -e

APP_DIR="/var/www/qhubx"
APP_NAME="qhubx-saignalx"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   QhuboX — Deploy sAIgnalX           ║"
echo "╚══════════════════════════════════════╝"
echo ""

cd "$APP_DIR"

# Verificar .env
if [ ! -f .env ]; then
    echo "❌ ERROR: No existe .env"
    echo "   Copia .env.example como .env y completa los valores:"
    echo "   cp .env.example .env && nano .env"
    exit 1
fi

# Verificar JWT_SECRET
JWT=$(grep "JWT_SECRET" .env | cut -d= -f2)
if [ "$JWT" = "GENERA_UN_SECRET_ALEATORIO_AQUI" ] || [ -z "$JWT" ]; then
    echo ""
    echo "⚠  Generando JWT_SECRET automáticamente..."
    SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    sed -i "s/GENERA_UN_SECRET_ALEATORIO_AQUI/$SECRET/" .env
    echo "✅ JWT_SECRET generado."
fi

# Instalar dependencias
echo ""
echo "[1/3] Instalando dependencias..."
npm install --production --silent

# Crear directorios necesarios
mkdir -p data logs public/sAIgnalX/premium

# Iniciar/reiniciar con PM2
echo ""
echo "[2/3] Iniciando con PM2..."

if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
    echo "✅ App reiniciada."
else
    pm2 start server/index.js \
        --name "$APP_NAME" \
        --max-memory-restart 512M \
        --log "$APP_DIR/logs/app.log" \
        --error "$APP_DIR/logs/error.log" \
        --time \
        --node-args="--max-old-space-size=512"
    pm2 save
    echo "✅ App iniciada."
fi

# Status
echo ""
echo "[3/3] Estado del servidor:"
pm2 status "$APP_NAME"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Deploy completado                                 ║"
echo "║                                                      ║"
echo "║  URLs:                                               ║"
echo "║  Landing   → https://qhubx.com/                     ║"
echo "║  sAIgnalX  → https://qhubx.com/sAIgnalX/            ║"
echo "║  Premium   → https://qhubx.com/sAIgnalX/premium/    ║"
echo "║                                                      ║"
echo "║  Logs: pm2 logs qhubx-saignalx                      ║"
echo "╚══════════════════════════════════════════════════════╝"
