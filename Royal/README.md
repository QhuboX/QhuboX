# SoluckU Casino — Admin Setup Guide

## ─────────────────────────────────────
## 1. INSTALL DEPENDENCIES
## ─────────────────────────────────────

```bash
npm install
```

## ─────────────────────────────────────
## 2. GENERATE OR IMPORT CASINO WALLET
## ─────────────────────────────────────

### Option A — Generate a fresh keypair:
```bash
node generateKey.js
```
This prints the public key and secret key. Convert to JSON format and save as `casino-keypair.json`:
```json
{ "secretKey": [109, 137, 114, ...] }
```

### Option B — Import existing keypair from base58:
Edit `generar-wallet.js`, paste your base58 private key, then:
```bash
node generar-wallet.js
```

> ⚠️ NEVER commit casino-keypair.json to git. Add it to .gitignore.
> In production use environment variables or a secrets manager.

---

## ─────────────────────────────────────
## 3. CONFIGURE ADMIN VALUES
## ─────────────────────────────────────

Open `server.js` and edit the `CONFIG` block at the top:

| Field | Description |
|-------|-------------|
| `NETWORK` | `'devnet'` for testing, `'mainnet-beta'` for live |
| `QHUBX_MINT_ADDRESS` | SPL mint address of your QHUBX token |
| `QHUBX_DECIMALS` | Token decimals (usually 6 or 9) |
| `QHUBX_AIRDROP_AMOUNT` | How many QHUBX to give on airdrop prize |
| `JACKPOT_SOL_AMOUNT` | SOL amount for the jackpot prize |
| `JACKPOT_THRESHOLD_SOL` | Volume (SOL) that must accumulate before jackpot unlocks |
| `PRIZE_POOL_PCT` | Fraction of each loss that funds the prize pool (0.5 = 50%) |
| `WEIGHTS` | Probability weights for each slot (must sum to 100) |

Open `script.js` and edit the `CASINO_CONFIG` block:

| Field | Description |
|-------|-------------|
| `SERVER_URL` | URL of your running backend (e.g. `https://casino.yourdomain.com`) |
| `QHUBX_MINT_ADDRESS` | Same SPL mint as above |
| `NETWORK` | Must match server.js |

---

## ─────────────────────────────────────
## 4. FUND THE CASINO WALLET
## ─────────────────────────────────────

Before going live you MUST fund the casino wallet with enough SOL (and QHUBX tokens)
to cover potential prize payouts.

Recommended minimum:
- SOL: at least 10 SOL reserve
- QHUBX: enough tokens for expected airdrops (`QHUBX_AIRDROP_AMOUNT × expected_daily_players`)

The casino wallet also needs a small SOL balance to pay transaction fees even for QHUBX payouts.

---

## ─────────────────────────────────────
## 5. START THE SERVER
## ─────────────────────────────────────

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server starts on port 3000 (configurable via `PORT` environment variable).

---

## ─────────────────────────────────────
## 6. DEPLOY FRONTEND
## ─────────────────────────────────────

The frontend consists of:
- `SoluckU.html`  — main page
- `SoluckU.css`   — styles
- `script.js`     — game logic

Serve them from any static host (Vercel, Netlify, Cloudflare Pages, nginx, etc.).

Make sure `CASINO_CONFIG.SERVER_URL` in `script.js` points to your live backend.

Required asset folders (you provide the actual files):
```
assets/
  images/
    fondo-casino.png   (background image)
    6.png              (SOL/token logo)
    61.png             (roulette image — legacy, now replaced by CSS drum)
    icono_x.svg        (X/Twitter icon)
    icono_link.svg     (link icon)
    logo.svg           (copyright logo)
```

---

## ─────────────────────────────────────
## 7. API ENDPOINTS
## ─────────────────────────────────────

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status check |
| GET | `/casino-info` | Wallet, balances, prize pool, jackpot status |
| GET | `/stats` | Live prize pool + jackpot progress |
| GET | `/history` | Last 20 public game results |
| POST | `/request-game` | Start a game session (returns nonce + casino wallet) |
| POST | `/process-bet` | Confirm on-chain payment, resolve result, send payout |

---

## ─────────────────────────────────────
## 8. SLOT MACHINE CONFIGURATION
## ─────────────────────────────────────

The roulette has 8 physical slots:
```
Slot 0: ×0 (BURN)      → player loses bet
Slot 1: ×1 (RETRY)     → bet refunded, secondary spin with no retry
Slot 2: ×2 (DOUBLE)    → player wins 2× from prize pool
Slot 3: ×0 (BURN)      → player loses bet
Slot 4: ×1 (RETRY)     → same as slot 1
Slot 5: QHUBX AIRDROP  → QHUBX_AIRDROP_AMOUNT tokens sent
Slot 6: ×0 (BURN)      → player loses bet
Slot 7: 1 SOL JACKPOT  → JACKPOT_SOL_AMOUNT sent (only when threshold met)
```

Prize pool mechanics:
- 50% of every LOSING bet is added to the prize pool
- The ×2 prize is funded from the prize pool
- If the pool is insufficient for a ×2 payout, the entire bet stays in the pool
- The jackpot only pays out once the volume threshold is reached

---

## ─────────────────────────────────────
## 9. SECURITY NOTES
## ─────────────────────────────────────

- All game results are determined SERVER-SIDE before the transaction is sent
- The nonce system prevents replay attacks (each session is single-use)
- Processed signatures are tracked in memory to prevent double-processing
- Rate limiting (30 req/min per IP) is applied on game endpoints
- For production: add a database for persistent signature tracking across restarts
- Consider adding SSL, nginx reverse proxy, and DDoS protection for live deployment

---

## ─────────────────────────────────────
## 10. PERSISTENT STATE
## ─────────────────────────────────────

`casino-state.json` is automatically created and maintained:
- `prizePool` — current prize pool in lamports
- `totalVolume` — cumulative betting volume
- `lastJackpotVolume` — volume at last jackpot payout (for threshold tracking)
- `totalGames` — total games played

Back this file up regularly in production.
