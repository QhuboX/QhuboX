/**
 * server/middleware/auth.js
 * Verifica JWT antes de servir cualquier recurso premium
 */

'use strict';

const jwt     = require('jsonwebtoken');
const { queries } = require('../db/database');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

/* ── Middleware: requiere JWT válido ───────────────────────── */
function requirePremium(req, res, next) {
    // Token puede venir en cookie, header Authorization, o query param
    const token =
        req.cookies?.saignalx_token ||
        req.headers?.authorization?.replace('Bearer ', '') ||
        req.query?.token;

    if (!token) {
        // Sin token → redirigir al login de la app free
        return res.redirect('/sAIgnalX/?auth=required');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Verificar que la suscripción sigue activa en DB
        const active = queries.isSubActive.get(decoded.wallet);
        if (!active) {
            res.clearCookie('saignalx_token');
            return res.redirect('/sAIgnalX/?auth=expired');
        }

        req.user = decoded;
        next();

    } catch (e) {
        res.clearCookie('saignalx_token');
        return res.redirect('/sAIgnalX/?auth=invalid');
    }
}

/* ── Middleware: verifica JWT vía API (para fetch) ─────────── */
function requirePremiumApi(req, res, next) {
    const token =
        req.cookies?.saignalx_token ||
        req.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const active  = queries.isSubActive.get(decoded.wallet);
        if (!active) {
            return res.status(403).json({ ok: false, error: 'Suscripción expirada' });
        }
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ ok: false, error: 'Token inválido' });
    }
}

/* ── Generar JWT para una wallet con suscripción activa ─────── */
function generateToken(wallet, endTs) {
    return jwt.sign(
        { wallet, endTs, iat: Math.floor(Date.now() / 1000) },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
}

module.exports = { requirePremium, requirePremiumApi, generateToken };
