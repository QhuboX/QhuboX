/**
 * server/routes/api.js
 * Endpoints del sistema de pagos y suscripciones
 *
 *  POST /sAIgnalX/api/prices          → precios SOL + QHUBX en tiempo real
 *  POST /sAIgnalX/api/verify-payment  → verifica TX on-chain y activa sub
 *  GET  /sAIgnalX/api/subscription    → estado de suscripción de una wallet
 *  POST /sAIgnalX/api/auth            → emite JWT si la sub está activa
 */

'use strict';

const router     = require('express').Router();
const rateLimit  = require('express-rate-limit');
const { queries }          = require('../db/database');
const { fetchLivePrices, calcRequiredQhubx, verifyPaymentTx, waitForConfirmation } = require('../solana/verifier');
const { generateToken }    = require('../middleware/auth');
require('dotenv').config();

const SUB_DURATION_MS = parseInt(process.env.SUB_DURATION_DAYS || 30) * 86400 * 1000;

/* ── Rate limiters ─────────────────────────────────────────── */
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 10,
    message: { ok: false, error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }
});

const priceLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minuto
    max: 30
});

/* ── GET /prices ────────────────────────────────────────────── */
router.get('/prices', priceLimiter, async (req, res) => {
    try {
        const priceData = await calcRequiredQhubx();
        if (!priceData) {
            return res.json({ ok: false, error: 'No se pudo obtener precio de QHUBX' });
        }
        res.json({
            ok: true,
            solPrice    : priceData.solPrice,
            qhubxPrice  : priceData.qhubxPrice,
            priceUsd    : parseFloat(process.env.PRICE_USD || 25),
            requiredQhubx: priceData.required,
            receiverWallet: process.env.RECEIVER_WALLET,
            mintAddress   : process.env.QHUBX_MINT_ADDRESS
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ── POST /verify-payment ───────────────────────────────────── */
router.post('/verify-payment', paymentLimiter, async (req, res) => {
    const { txSignature, wallet } = req.body;

    if (!txSignature || !wallet) {
        return res.status(400).json({ ok: false, error: 'Faltan campos: txSignature, wallet' });
    }

    // Verificar que la TX no fue procesada antes
    const existing = queries.getTxBySignature.get(txSignature);
    if (existing?.confirmed) {
        return res.status(409).json({ ok: false, error: 'Esta transacción ya fue procesada' });
    }

    // Registrar intento de pago
    queries.insertPayment.run({
        wallet,
        tx_signature : txSignature,
        amount_qhubx : 0,
        price_usd    : parseFloat(process.env.PRICE_USD || 25),
        qhubx_price  : 0
    });

    // Esperar confirmación on-chain (polling 60s max)
    const confirmed = await waitForConfirmation(txSignature, 30);
    if (!confirmed) {
        return res.status(422).json({ ok: false, error: 'TX no confirmada en Solana. Intenta en unos minutos.' });
    }

    // Verificar monto y destino
    const result = await verifyPaymentTx(txSignature, wallet);
    if (!result.ok) {
        return res.status(422).json({ ok: false, error: result.error });
    }

    // Marcar pago confirmado
    queries.confirmPayment.run(txSignature);

    // Activar/renovar suscripción
    const now      = Date.now();
    const startTs  = Math.floor(now / 1000);
    const endTs    = Math.floor((now + SUB_DURATION_MS) / 1000);

    queries.upsertSub.run({
        wallet,
        tx_signature : txSignature,
        amount_qhubx : result.amount,
        price_usd    : parseFloat(process.env.PRICE_USD || 25),
        start_ts     : startTs,
        end_ts       : endTs
    });

    // Emitir JWT
    const token = generateToken(wallet, endTs);

    res.json({
        ok        : true,
        token,
        endTs,
        daysLeft  : Math.ceil((endTs - startTs) / 86400),
        message   : 'Suscripción activada. Bienvenido a Premium.'
    });
});

/* ── GET /subscription ──────────────────────────────────────── */
router.get('/subscription', async (req, res) => {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ ok: false, error: 'Falta wallet' });

    const sub = queries.getSubByWallet.get(wallet);
    if (!sub) return res.json({ ok: true, active: false });

    const now     = Math.floor(Date.now() / 1000);
    const active  = sub.end_ts > now;
    const daysLeft = Math.max(0, Math.ceil((sub.end_ts - now) / 86400));

    res.json({ ok: true, active, daysLeft, endTs: sub.end_ts, renewedCount: sub.renewed_count });
});

/* ── POST /auth ─────────────────────────────────────────────── */
// El frontend llama esto al conectar wallet para obtener JWT si tiene sub activa
router.post('/auth', paymentLimiter, async (req, res) => {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ ok: false, error: 'Falta wallet' });

    const sub = queries.getSubByWallet.get(wallet);
    if (!sub) return res.json({ ok: false, active: false });

    const now    = Math.floor(Date.now() / 1000);
    const active = sub.end_ts > now;
    if (!active) return res.json({ ok: false, active: false, expired: true });

    const token    = generateToken(wallet, sub.end_ts);
    const daysLeft = Math.ceil((sub.end_ts - now) / 86400);

    res.json({ ok: true, active: true, token, daysLeft, endTs: sub.end_ts });
});

module.exports = router;
