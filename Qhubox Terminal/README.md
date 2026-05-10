# ⚡ QhuboX Terminal

**Real-time Solana SPL Token Trading Terminal**

Built with Next.js 14, Socket.IO, Jupiter Aggregator v6, and DexScreener API.



```bash
cd backend
npm run dev

```bash

cd frontend

npm run dev






















## 🚀 Setup

### 1. Backend

```bash
cd backend
npm install
node server.js
# Runs on port 4002
```

### 2. Frontend

```bash
cd frontend
npm install

# Copy env file and configure
cp .env.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_BACKEND_URL=http://localhost:4002
#   NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com

npm run dev
# Runs on http://localhost:3001
```

---

## 💼 Wallet Support

The terminal auto-detects installed wallets:
- **Phantom** (recommended)
- **Solflare**
- **Backpack**
- **Glow**
- **Coin98**
- **OKX Wallet**

---

## 🔄 Trading Flow

1. Connect wallet (real Solana mainnet)
2. Select a token from the list (NEW / HOT / GRAD)
3. Enter amount + slippage
4. Click BUY or SELL → quote fetched live from **Jupiter Aggregator v6**
5. Approve in wallet → transaction sent to Solana mainnet
6. Balance auto-refreshes after each trade

---

## 📊 Data Sources

| Feature | Source |
|---|---|
| Token lists | DexScreener API (free) |
| Live chart | DexScreener embed |
| New tokens | Pump.fun WebSocket + PumpPortal |
| Swap routing | Jupiter Aggregator v6 |
| Price data | DexScreener pairs API |
| Wallet RPC | Configurable (Helius recommended) |

---

## ⚠️ Production Notes

- Use a **paid RPC** (Helius, QuickNode, Triton) for reliability
- Deploy backend to Railway, Render, or VPS
- Deploy frontend to Vercel (set env vars in dashboard)
- DYOR — this is not financial advice
