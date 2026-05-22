/**
 * server/db/database.js
 * SQLite — tablas para sAIgnalX subscriptions + payments
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/saignalx.db';

// Asegurar que el directorio existe
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Optimizaciones SQLite para producción
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -32000');  // 32MB cache
db.pragma('foreign_keys = ON');

// ── Schema ───────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet        TEXT    NOT NULL UNIQUE,
        tx_signature  TEXT    NOT NULL,
        amount_qhubx  REAL    NOT NULL,
        price_usd     REAL    NOT NULL DEFAULT 25,
        start_ts      INTEGER NOT NULL,
        end_ts        INTEGER NOT NULL,
        renewed_count INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS payments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet        TEXT    NOT NULL,
        tx_signature  TEXT    NOT NULL UNIQUE,
        amount_qhubx  REAL    NOT NULL,
        price_usd     REAL    NOT NULL,
        qhubx_price   REAL    NOT NULL,
        confirmed     INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS access_tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet     TEXT    NOT NULL,
        token_hash TEXT    NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_sub_wallet   ON subscriptions(wallet);
    CREATE INDEX IF NOT EXISTS idx_pay_wallet   ON payments(wallet);
    CREATE INDEX IF NOT EXISTS idx_pay_tx       ON payments(tx_signature);
    CREATE INDEX IF NOT EXISTS idx_tok_wallet   ON access_tokens(wallet);
`);

/* ── Queries preparadas ───────────────────────────────────── */

const queries = {

    // Subscriptions
    getSubByWallet: db.prepare(
        'SELECT * FROM subscriptions WHERE wallet = ?'
    ),
    upsertSub: db.prepare(`
        INSERT INTO subscriptions (wallet, tx_signature, amount_qhubx, price_usd, start_ts, end_ts, renewed_count)
        VALUES (@wallet, @tx_signature, @amount_qhubx, @price_usd, @start_ts, @end_ts, 0)
        ON CONFLICT(wallet) DO UPDATE SET
            tx_signature  = excluded.tx_signature,
            amount_qhubx  = excluded.amount_qhubx,
            start_ts      = excluded.start_ts,
            end_ts        = excluded.end_ts,
            renewed_count = renewed_count + 1,
            updated_at    = unixepoch()
    `),
    isSubActive: db.prepare(
        'SELECT 1 FROM subscriptions WHERE wallet = ? AND end_ts > unixepoch()'
    ),
    getExpiringSoon: db.prepare(
        'SELECT * FROM subscriptions WHERE end_ts > unixepoch() AND end_ts < (unixepoch() + ?)'
    ),

    // Payments
    insertPayment: db.prepare(`
        INSERT OR IGNORE INTO payments (wallet, tx_signature, amount_qhubx, price_usd, qhubx_price)
        VALUES (@wallet, @tx_signature, @amount_qhubx, @price_usd, @qhubx_price)
    `),
    confirmPayment: db.prepare(
        'UPDATE payments SET confirmed = 1 WHERE tx_signature = ?'
    ),
    getTxBySignature: db.prepare(
        'SELECT * FROM payments WHERE tx_signature = ?'
    ),

    // Access tokens
    insertToken: db.prepare(`
        INSERT INTO access_tokens (wallet, token_hash, expires_at)
        VALUES (@wallet, @token_hash, @expires_at)
    `),
    cleanExpiredTokens: db.prepare(
        'DELETE FROM access_tokens WHERE expires_at < unixepoch()'
    ),
};

// Limpiar tokens expirados cada hora
setInterval(() => {
    queries.cleanExpiredTokens.run();
}, 3600 * 1000);

module.exports = { db, queries };
