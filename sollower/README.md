# Sollower — SocialFi on Solana

SocialFi platform with glassmorphism neon UI. Desktop (Facebook-like) + Mobile (Instagram-like). Payments exclusively in QHUBX SPL token, priced in USD and converted at real-time market rates via Jupiter.

## Architecture

```
sollower/
├── frontend/          # Vite + React
│   └── src/
│       ├── components/   # Post, PostCreator, UserProfile, ProductCard, etc.
│       └── services/     # dappService, tokenPriceService, etc.
└── backend/           # Node + Express (no DB — uses frontend localStorage)
    └── src/
        ├── controllers/
        ├── routes/
        ├── services/
        └── lib/
```

## Quick Start
cd backend
npm run dev

cd frontend
npm run dev

### 1. Configure environment
```bash
cp .env.example .env
# Edit .env and fill in:
#   TOKEN_MINT_ADDRESS  ← Your QHUBX token CA
#   PLATFORM_PRIVATE_KEY ← Platform hot wallet (holds ad reward escrow)
#   SELLER_WALLET_ADDRESS ← Receives publication fees
```

### 2. Local development
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

### 3. Production (Hetzner + Coolify)
```bash
# In Coolify, create a Docker Compose service pointing to your repo.
# Set all env vars from .env.example in Coolify's environment panel.
docker-compose up -d
```

## Token Payment Flow

All prices are displayed in **USD** and automatically converted to **QHUBX** at current market rate via Jupiter Price API:

| Action | Cost (USD) | Who pays |
|--------|-----------|----------|
| Publish Sale/Fund/Ad | $10 | Post creator |
| Ad reward budget | Custom (USD) | Advertiser |
| Viewer reward | Set per view | Platform → Viewer |

## Key Features

- 🎨 Glassmorphism neon UI — cyan/violet/purple palette from logo
- 📱 Responsive: Facebook-like on desktop, Instagram-like on mobile
- 💰 QHUBX-only payments (SPL token), priced in USD
- 📈 Live QHUBX + SOL price widget (Jupiter + CoinGecko)
- 🎁 Ad reward system — viewers earn QHUBX for watching ads
- 🛍️ Digital product sales with download links
- ❤️ Fundraising campaigns with progress bar
- 👤 Profiles with follow/unfollow
- 🖼️ Multi-image posts with gallery modal
