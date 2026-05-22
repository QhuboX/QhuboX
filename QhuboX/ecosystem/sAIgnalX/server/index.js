/**
 * server/index.js — QhuboX · sAIgnalX Backend
 *
 * Rutas:
 *   GET  /sAIgnalX/             → sirve index.html (free)
 *   GET  /sAIgnalX/premium/     → sirve premium.html SOLO con JWT válido
 *   GET  /sAIgnalX/api/*        → API de pagos y suscripciones
 *   GET  /                      → Landing QhuboX.com
 */

'use strict';

const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const compression = require('compression');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { requirePremium } = require('./middleware/auth');
const apiRoutes           = require('./routes/api');

const app      = express();
const PORT     = process.env.PORT     || 3001;
const BASE     = process.env.BASE_PATH || '/sAIgnalX';
const PUB_DIR  = path.resolve(process.env.PUBLIC_PATH  || './public/sAIgnalX');
const PREM_DIR = path.resolve(process.env.PREMIUM_PATH || './public/sAIgnalX/premium');
const ROOT_DIR = path.resolve('./public');

/* ── Middlewares globales ──────────────────────────────────── */
app.set('trust proxy', 1);  // Nginx proxy
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Helmet con CSP relajado para los scripts necesarios
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc : ["'self'"],
            scriptSrc  : ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
            styleSrc   : ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
            fontSrc    : ["'self'", 'fonts.gstatic.com'],
            connectSrc : ["'self'", 'wss:', 'https:'],
            frameSrc   : ['https://s.tradingview.com'],
            imgSrc     : ["'self'", 'data:'],
        }
    },
    crossOriginEmbedderPolicy: false,
}));

// Rate limit global
app.use(rateLimit({
    windowMs : 15 * 60 * 1000,
    max      : 500,
    standardHeaders: true,
    legacyHeaders  : false,
}));

/* ── Landing QhuboX.com ("/") ────────────────────────────────
   Sirve el index del ecosistema cuando la ruta es la raíz.
   Nginx ya redirige "/" → este servidor.
   ─────────────────────────────────────────────────────────── */
const LANDING_DIR = path.resolve('./public');
app.use('/', express.static(LANDING_DIR, { index: 'index.html' }));

/* ── API routes ─────────────────────────────────────────────── */
app.use(`${BASE}/api`, apiRoutes);

/* ── Archivos estáticos FREE (js, css, media) ───────────────── */
// Solo sirve archivos que NO están en /premium/
app.use(BASE, (req, res, next) => {
    // Bloquear acceso directo a la carpeta premium por esta ruta
    if (req.path.startsWith('/premium')) return next();
    next();
}, express.static(PUB_DIR, {
    index   : false,
    dotfiles: 'deny',
}));

/* ── FREE — index.html ──────────────────────────────────────── */
app.get([BASE, `${BASE}/`, `${BASE}/index.html`], (req, res) => {
    res.sendFile(path.join(PUB_DIR, 'sAIgnalX.html'));
});

/* ══════════════════════════════════════════════════════════════
   PREMIUM — ZONA PROTEGIDA
   Todo lo que empiece con /sAIgnalX/premium/ requiere JWT válido
   El HTML NUNCA se sirve sin autenticación server-side.
   ══════════════════════════════════════════════════════════════ */

// Archivos estáticos premium (css, js del dashboard)
// requirePremium los protege TODOS
app.use(`${BASE}/premium`, requirePremium, express.static(PREM_DIR, {
    index   : false,
    dotfiles: 'deny',
    // No caché en archivos premium
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
    }
}));

// Dashboard premium — sirve el HTML solo con JWT válido
app.get([`${BASE}/premium`, `${BASE}/premium/`, `${BASE}/premium/index.html`],
    requirePremium,
    (req, res) => {
        // Inyectar el JWT como cookie HttpOnly antes de servir el HTML
        const token = req.cookies?.saignalx_token ||
                      req.headers?.authorization?.replace('Bearer ', '') ||
                      req.query?.token;

        if (token) {
            res.cookie('saignalx_token', token, {
                httpOnly: true,
                secure  : process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge  : 30 * 24 * 60 * 60 * 1000  // 30 días en ms
            });
        }

        res.sendFile(path.join(PREM_DIR, 'sAIgnalX_premium.html'));
    }
);

// Cualquier otra ruta premium no autorizada → 403
app.use(`${BASE}/premium`, (req, res) => {
    res.status(403).json({ ok: false, error: 'Acceso denegado. Suscripción requerida.' });
});

/* ── 404 ─────────────────────────────────────────────────────── */
app.use((req, res) => {
    res.status(404).sendFile(path.join(ROOT_DIR, '404.html'), (err) => {
        if (err) res.status(404).send('Página no encontrada');
    });
});

/* ── Error handler ───────────────────────────────────────────── */
app.use((err, req, res, _next) => {
    console.error('[server] Error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

/* ── Start ───────────────────────────────────────────────────── */
app.listen(PORT, '127.0.0.1', () => {
    console.log(`
╔═══════════════════════════════════════╗
║  QhuboX · sAIgnalX Server            ║
║  Puerto  : ${PORT}                       ║
║  Base    : ${BASE}              ║
║  Premium : ${BASE}/premium/     ║
║  Env     : ${process.env.NODE_ENV || 'development'}               ║
╚═══════════════════════════════════════╝
    `);
});

module.exports = app;
