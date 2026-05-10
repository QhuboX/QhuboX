# QhronoX Protocol

> **"Where time becomes value."**

Real yield ecosystem participation on Solana. Stake QHUBX tokens and earn 70% of all 3% transfer fees collected across every transaction.

---

## Architecture

```
qhronox-protocol/
├── programs/staking/src/lib.rs   ← Anchor smart contract (Rust)
├── scripts/
│   ├── create-token.ts           ← Token-2022 mint with 3% transfer fee
│   ├── initialize-pool.ts        ← One-time pool setup after deploy
│   └── harvest-fees.ts           ← Cron: collect & distribute fees
├── tests/staking.test.ts         ← Anchor test suite
├── app/                          ← Next.js 15 frontend
│   ├── src/app/                  ← Pages + layout
│   ├── src/components/
│   │   ├── ui/                   ← Header, TickerBar, KPIGrid, RewardHourglass
│   │   ├── staking/              ← StakingPanel, TransactionHistory
│   │   ├── vault/                ← QvaultX (user fund view)
│   │   ├── governance/           ← GovernancePanel
│   │   └── access/               ← PremiumAccess (gated tools)
│   ├── src/hooks/
│   │   ├── useStaking.ts         ← Main Anchor client hook
│   │   └── useTransactionHistory.ts ← Helius tx history
│   └── src/lib/
│       ├── wallet-provider.tsx   ← Phantom, Solflare, Backpack, Ledger
│       └── format.ts             ← Number/date formatters
└── Anchor.toml
```

---

## Token Economics

| Allocation | Share | Description |
|---|---|---|
| Staker rewards | 70% | Distributed proportional to weighted stake |
| Treasury | 20% | Ops, marketing, exchange listings |
| Burn | 10% | Deflationary pressure |

**Transfer fee:** 3% on every buy/sell (Token-2022 native — exchanges cannot bypass it)

---

## Lock Tiers

| Tier | Lock | Multiplier | Effect |
|---|---|---|---|
| Flexible | None | 1x | Withdraw anytime |
| 3 months | 90 days | 1.5x | 50% more pool weight |
| 1 year VIP | 365 days | 3x | 3x pool weight — max yield |

---

## Deployment Guide

### 1. Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1 && avm use 0.30.1

# Install Node deps
npm install
cd app && npm install
```

### 2. Create the Token-2022 Mint

```bash
# Devnet first
npm run create-token -- --cluster devnet

# Output: deployment.json with mint address
```

### 3. Build & Deploy Anchor Program

```bash
anchor build
anchor deploy --provider.cluster devnet

# Copy IDL to app
cp target/idl/qhronox_staking.json app/src/lib/qhronox_staking.json
```

### 4. Initialize Pool

```bash
npm run init-pool
# Updates deployment.json with pool + vault addresses
```

### 5. Configure Environment

```bash
cd app
cp .env.local.example .env.local
# Fill in addresses from deployment.json + your Helius API key
```

### 6. Run Frontend


wsl
cd ~/qhronox-protocol/app
npm run dev



```bash
cd app
npm run dev        
npm run build      
npm run start      
```

### 7. Set Up Fee Harvester (Cron)

```bash
# Add to crontab — runs every hour
0 * * * * cd /path/to/qhronox-protocol && npm run harvest >> /var/log/harvest.log 2>&1
```

---

## Security Checklist

- [ ] Get Anchor program audited before mainnet (recommended: OtterSec, Sec3, MadShield)
- [ ] Use a multisig (Squads v4) as the `authority` and `feeWithdrawAuthority`
- [ ] Store deployer keypair in hardware wallet (Ledger)
- [ ] Set `HELIUS_RPC_URL` as server-side only env (not `NEXT_PUBLIC_`)
- [ ] Enable Cloudflare proxy in front of Vercel
- [ ] Rotate Helius API key quarterly

---

## Estimated Costs (Mainnet)

| Item | Cost |
|---|---|
| Token-2022 mint creation | ~0.5 SOL |
| Anchor program deploy | ~2 SOL |
| Pool initialization | ~0.1 SOL |
| Helius Growth plan | $49/month |
| Vercel Pro | $20/month |
| Audit (recommended) | $2,000–$5,000 |

---

## License

MIT — QhronoX Protocol 2026
