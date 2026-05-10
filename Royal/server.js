'use strict';

// ╔══════════════════════════════════════════════════════════════════════╗
// ║          SOLUCKU CASINO — PRODUCTION SERVER v3.0                    ║
// ║          Adaptive RTP · Dynamic Phase Engine · Provably Fair        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ─── ADMIN CONFIGURATION ──────────────────────────────────────────────────
const CONFIG = {
    PORT:    process.env.PORT || 3000,
    NETWORK: process.env.NETWORK || 'mainnet-beta',

    QHUBX_MINT_ADDRESS:   process.env.QHUBX_MINT || 'EYoU9RwrdUhDSGRvTLynji3GEx8uSfHkBMVpDtoPpump',
    QHUBX_DECIMALS:       6,
    QHUBX_AIRDROP_AMOUNT: 1000,
    QHUBX_SOL_RATE:       0.001,

    MIN_BET_SOL:   0.03,
    MAX_BET_SOL:   10,
    MIN_BET_QHUBX: 100,
    MAX_BET_QHUBX: 1_000_000,

    JACKPOT_SOL_AMOUNT:    1,
    JACKPOT_THRESHOLD_SOL: 5,

    // % of each LOSING bet added to the prize pool
    POOL_CONTRIBUTION_LOSS: 0.30,

    // Phase thresholds (SOL in prize pool)
    PHASE_ACCUMULATE_UNTIL: 5,
    PHASE_GENEROUS_FROM:    20,

    // ── WEIGHTS BY PHASE ─────────────────────────────────────────────────
    // Phase 1 = Accumulate (pool thin)  → casino plays conservative
    // Phase 2 = Stable (default)        → balanced sustainable operation
    // Phase 3 = Generous (pool surplus) → flush excess, drive volume
    WEIGHTS: {
        lose:    { p1: 55, p2: 45, p3: 38 },
        retry:   { p1: 25, p2: 25, p3: 22 },
        double:  { p1: 12, p2: 18, p3: 25 },
        airdrop: { p1:  5, p2:  7, p3: 10 },
        jackpot: { p1:  3, p2:  5, p3:  5 },
    },
};

// ─────────────────────────────────────────────────────────────────────────
const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const fetch     = require('node-fetch');

const {
    Connection, clusterApiUrl, Keypair,
    LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey,
} = require('@solana/web3.js');

const {
    getOrCreateAssociatedTokenAccount,
    createTransferInstruction,
} = require('@solana/spl-token');

// ─── EXPRESS ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('.'));

const limiter = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'Rate limit.' } });
app.use('/request-game', limiter);
app.use('/process-bet',  limiter);

let PRICE_CACHE = { ts: 0, data: { sol:null, solChange:null, btc:null, eth:null, qhubx:null } };
async function getMarketPrices() {
    const now = Date.now();
    if (now - PRICE_CACHE.ts < 30_000 && PRICE_CACHE.data.sol != null) return PRICE_CACHE.data;

    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
        if (!res.ok) throw new Error(`Coingecko responded ${res.status}`);
        const json = await res.json();
        const sol = json.solana?.usd ?? null;
        const solChange = json.solana?.usd_24h_change ?? null;
        const btc = json.bitcoin?.usd ?? null;
        const eth = json.ethereum?.usd ?? null;
        const qhubx = sol != null ? sol * CONFIG.QHUBX_SOL_RATE : null;

        PRICE_CACHE = { ts: now, data: { sol, solChange, btc, eth, qhubx } };
    } catch (err) {
        console.error('Price fetch failed:', err.message || err);
    }

    return PRICE_CACHE.data;
}

// ─── CASINO WALLET ────────────────────────────────────────────────────────
let casinoKeypair;
try {
    const raw = JSON.parse(fs.readFileSync('casino-keypair.json', 'utf8'));
    casinoKeypair = Keypair.fromSecretKey(Uint8Array.from(raw.secretKey));
    console.log('Casino wallet:', casinoKeypair.publicKey.toBase58());
} catch (e) { console.error('casino-keypair.json missing:', e.message); process.exit(1); }

const casinoWallet = casinoKeypair.publicKey;
const RPC = CONFIG.NETWORK === 'mainnet-beta' ? clusterApiUrl('mainnet-beta') : clusterApiUrl('devnet');
const connection = new Connection(RPC, { commitment: 'confirmed', confirmTransactionInitialTimeout: 90_000 });

// ─── PERSISTENT STATE ─────────────────────────────────────────────────────
const STATE_FILE = 'casino-state.json';
let S = { prizePool: 0, casinoRetained: 0, totalVolume: 0, totalGames: 0,
          lastJackpotVolume: 0, phase: 1, sessionWins: 0, sessionLosses: 0 };

function loadState() {
    try { Object.assign(S, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch {}
}
function saveState() { S.phase = currentPhase(); fs.writeFileSync(STATE_FILE, JSON.stringify(S, null, 2)); }
loadState();

const pendingGames        = new Map();
const processedSignatures = new Set();
const recentFeed          = [];

setInterval(() => {
    const cut = Date.now() - 600_000;
    for (const [n, g] of pendingGames) if (g.ts < cut) pendingGames.delete(n);
}, 60_000);

// ─── PHASE ENGINE ─────────────────────────────────────────────────────────
function currentPhase() {
    const sol = S.prizePool / LAMPORTS_PER_SOL;
    if (sol < CONFIG.PHASE_ACCUMULATE_UNTIL) return 1;
    if (sol > CONFIG.PHASE_GENEROUS_FROM)    return 3;
    return 2;
}

function getWeights() {
    const key = `p${currentPhase()}`;
    const w = {};
    for (const [type, phases] of Object.entries(CONFIG.WEIGHTS)) w[type] = phases[key];
    return w;
}

function totalWeight(w) { return Object.values(w).reduce((a, b) => a + b, 0); }

function computeHouseEdge(w) {
    const total = totalWeight(w);
    const P = t => (w[t] || 0) / total;
    const jackDiluted = 1 / ((CONFIG.JACKPOT_THRESHOLD_SOL / 0.1));
    return Math.max(P('lose') - P('double') * 2 - P('airdrop') * 0.3 - P('jackpot') * jackDiluted, 0);
}

// ─── ROULETTE SLOTS ───────────────────────────────────────────────────────
const ROULETTE_SLOTS = [
    { id: 0, type: 'lose',    label: '×0',    emoji: '💀', color: '#ff2244' },
    { id: 1, type: 'retry',   label: '×1',    emoji: '🔄', color: '#f5c842' },
    { id: 2, type: 'double',  label: '×2',    emoji: '💚', color: '#00e676' },
    { id: 3, type: 'lose',    label: '×0',    emoji: '💀', color: '#ff2244' },
    { id: 4, type: 'retry',   label: '×1',    emoji: '🔄', color: '#f5c842' },
    { id: 5, type: 'airdrop', label: 'QHUBX', emoji: '🎁', color: '#bf00ff' },
    { id: 6, type: 'lose',    label: '×0',    emoji: '💀', color: '#ff2244' },
    { id: 7, type: 'jackpot', label: '1 SOL', emoji: '💎', color: '#f5c842' },
];

// ─── ROLL ENGINE ──────────────────────────────────────────────────────────
function rollWithWeights(w) {
    const jackpotReady = (S.totalVolume - S.lastJackpotVolume) >= CONFIG.JACKPOT_THRESHOLD_SOL * LAMPORTS_PER_SOL;
    const poolSol      = S.prizePool / LAMPORTS_PER_SOL;
    const eff = { ...w };

    if (!jackpotReady)   { eff.lose = (eff.lose||0) + (eff.jackpot||0); eff.jackpot = 0; }
    if (poolSol < 0.1)   { eff.lose = (eff.lose||0) + (eff.double||0);  eff.double  = 0; }

    const total = totalWeight(eff);
    let r = Math.random() * total;
    for (const [type, wt] of Object.entries(eff)) {
        r -= wt;
        if (r <= 0) return ROULETTE_SLOTS.find(s => s.type === type) || ROULETTE_SLOTS[0];
    }
    return ROULETTE_SLOTS[0];
}

function rollRetry(w) {
    let result; let i = 0;
    do { result = rollWithWeights(w); i++; } while (result.type === 'retry' && i < 10);
    return result;
}

// ─── PAYOUT HELPERS ───────────────────────────────────────────────────────
async function sendSOL(toAddress, lamports) {
    const to = new PublicKey(toAddress);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: casinoWallet })
        .add(SystemProgram.transfer({ fromPubkey: casinoWallet, toPubkey: to, lamports: BigInt(Math.floor(lamports)) }));
    tx.sign(casinoKeypair);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    return sig;
}

async function sendQHUBX(toAddress, amount) {
    if (CONFIG.QHUBX_MINT_ADDRESS === 'REPLACE_WITH_QHUBX_SPL_MINT_ADDRESS')
        throw new Error('QHUBX mint not configured.');
    const mint      = new PublicKey(CONFIG.QHUBX_MINT_ADDRESS);
    const to        = new PublicKey(toAddress);
    const rawAmount = BigInt(Math.round(amount * Math.pow(10, CONFIG.QHUBX_DECIMALS)));
    const casinoATA = await getOrCreateAssociatedTokenAccount(connection, casinoKeypair, mint, casinoWallet);
    const playerATA = await getOrCreateAssociatedTokenAccount(connection, casinoKeypair, mint, to);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: casinoWallet })
        .add(createTransferInstruction(casinoATA.address, playerATA.address, casinoWallet, rawAmount));
    tx.sign(casinoKeypair);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    return sig;
}

// ─── GAME RESULT PROCESSOR ────────────────────────────────────────────────
async function processResult(result, betLamports, playerAddress, weights) {
    let payout      = { signature: null, amount: 0, token: null };
    let retryResult = null;
    let retryPayout = null;
    const betSOL    = betLamports / LAMPORTS_PER_SOL;

    switch (result.type) {

        case 'lose': {
            const contrib = Math.floor(betLamports * CONFIG.POOL_CONTRIBUTION_LOSS);
            S.prizePool      += contrib;
            S.casinoRetained += betLamports - contrib;
            S.sessionLosses  += 1;
            console.log(`[LOSE] +${betSOL.toFixed(4)} SOL | pool=${(S.prizePool/LAMPORTS_PER_SOL).toFixed(4)}`);
            break;
        }

        case 'retry': {
            const refundSig = await sendSOL(playerAddress, betLamports);
            payout = { signature: refundSig, amount: betSOL, token: 'SOL' };
            retryResult = rollRetry(weights);
            const rr = await processResult(retryResult, betLamports, playerAddress, weights);
            retryPayout = rr.payout;
            console.log(`[RETRY] → ${retryResult.type}`);
            break;
        }

        case 'double': {
            const prize = betLamports * 2;
            if (S.prizePool >= prize) {
                const sig = await sendSOL(playerAddress, prize);
                payout = { signature: sig, amount: betSOL * 2, token: 'SOL' };
                S.prizePool   -= prize;
                S.sessionWins += 1;
                console.log(`[DOUBLE] +${(betSOL*2).toFixed(4)} SOL → ${playerAddress.slice(0,8)}`);
            } else {
                // Pool insufficient — silently convert to lose
                console.warn(`[DOUBLE_BLOCKED] pool too thin (${(S.prizePool/LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
                return processResult(ROULETTE_SLOTS.find(s => s.type === 'lose'), betLamports, playerAddress, weights);
            }
            break;
        }

        case 'airdrop': {
            try {
                const sig = await sendQHUBX(playerAddress, CONFIG.QHUBX_AIRDROP_AMOUNT);
                payout = { signature: sig, amount: CONFIG.QHUBX_AIRDROP_AMOUNT, token: 'QHUBX' };
                const contrib = Math.floor(betLamports * 0.20);
                S.prizePool      += contrib;
                S.casinoRetained += betLamports - contrib;
                S.sessionWins    += 1;
                console.log(`[AIRDROP] ${CONFIG.QHUBX_AIRDROP_AMOUNT} QHUBX → ${playerAddress.slice(0,8)}`);
            } catch (e) {
                console.error('[AIRDROP_FAIL]', e.message);
                return processResult(ROULETTE_SLOTS.find(s => s.type === 'retry'), betLamports, playerAddress, weights);
            }
            break;
        }

        case 'jackpot': {
            const ready = (S.totalVolume - S.lastJackpotVolume) >= CONFIG.JACKPOT_THRESHOLD_SOL * LAMPORTS_PER_SOL;
            if (ready && S.prizePool >= CONFIG.JACKPOT_SOL_AMOUNT * LAMPORTS_PER_SOL) {
                const sig = await sendSOL(playerAddress, CONFIG.JACKPOT_SOL_AMOUNT * LAMPORTS_PER_SOL);
                payout = { signature: sig, amount: CONFIG.JACKPOT_SOL_AMOUNT, token: 'SOL' };
                S.prizePool         -= CONFIG.JACKPOT_SOL_AMOUNT * LAMPORTS_PER_SOL;
                S.lastJackpotVolume  = S.totalVolume;
                S.sessionWins       += 1;
                console.log(`[JACKPOT] 💎 1 SOL → ${playerAddress.slice(0,8)}`);
            } else {
                return processResult(ROULETTE_SLOTS.find(s => s.type === 'retry'), betLamports, playerAddress, weights);
            }
            break;
        }
    }

    return { payout, retryResult, retryPayout };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function jackpotProgress() {
    const earned = S.totalVolume - S.lastJackpotVolume;
    const needed = CONFIG.JACKPOT_THRESHOLD_SOL * LAMPORTS_PER_SOL;
    return Math.min((earned / needed) * 100, 100);
}

function addFeed(e) { recentFeed.unshift(e); if (recentFeed.length > 50) recentFeed.pop(); }

function casinoStats() {
    const w = getWeights();
    const he = computeHouseEdge(w);
    return {
        phase:            currentPhase(),
        houseEdge:        (he * 100).toFixed(2),
        rtp:              (100 - he * 100).toFixed(2),
        prizePool:        S.prizePool / LAMPORTS_PER_SOL,
        casinoRetained:   S.casinoRetained / LAMPORTS_PER_SOL,
        totalVolume:      S.totalVolume / LAMPORTS_PER_SOL,
        totalGames:       S.totalGames,
        jackpotProgress:  jackpotProgress(),
        jackpotAvailable: jackpotProgress() >= 100,
        sessionWinRate:   (S.sessionWins + S.sessionLosses > 0)
            ? ((S.sessionWins / (S.sessionWins + S.sessionLosses)) * 100).toFixed(1)
            : '0',
    };
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────
app.get('/api/prices', async (_, res) => {
    try {
        const prices = await getMarketPrices();
        if (!prices || (prices.sol == null && prices.btc == null && prices.eth == null && prices.qhubx == null)) {
            throw new Error('Price data unavailable');
        }
        return res.json(prices);
    } catch (err) {
        return res.status(502).json({ error: 'Unable to fetch prices.' });
    }
});

app.get('/health', (_, res) => res.json({ status: 'online', network: CONFIG.NETWORK }));

app.get('/casino-info', async (_, res) => {
    try {
        const solBalance = await connection.getBalance(casinoWallet);
        res.json({
            casinoWallet: casinoWallet.toBase58(),
            casinoSOLBalance: solBalance / LAMPORTS_PER_SOL,
            tokens: {
                SOL:   { symbol: 'SOL',   decimals: 9,                     minBet: CONFIG.MIN_BET_SOL,   maxBet: CONFIG.MAX_BET_SOL   },
                QHUBX: { symbol: 'QHUBX', decimals: CONFIG.QHUBX_DECIMALS,  mint: CONFIG.QHUBX_MINT_ADDRESS, minBet: CONFIG.MIN_BET_QHUBX, maxBet: CONFIG.MAX_BET_QHUBX },
            },
            slots: ROULETTE_SLOTS,
            ...casinoStats(),
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/stats',   (_, res) => res.json(casinoStats()));
app.get('/history', (_, res) => res.json(recentFeed.slice(0, 20)));

// ─── STEP 1: REQUEST GAME ─────────────────────────────────────────────────
app.post('/request-game', (req, res) => {
    const { wallet, token, amount } = req.body;
    if (!wallet || !token || !amount) return res.status(400).json({ error: 'wallet, token, amount required.' });
    if (!['SOL','QHUBX'].includes(token)) return res.status(400).json({ error: 'Invalid token.' });
    const bet = parseFloat(amount);
    if (isNaN(bet) || bet <= 0) return res.status(400).json({ error: 'Invalid amount.' });
    if (token === 'SOL'   && (bet < CONFIG.MIN_BET_SOL   || bet > CONFIG.MAX_BET_SOL))
        return res.status(400).json({ error: `SOL bet must be ${CONFIG.MIN_BET_SOL}–${CONFIG.MAX_BET_SOL}` });
    if (token === 'QHUBX' && (bet < CONFIG.MIN_BET_QHUBX || bet > CONFIG.MAX_BET_QHUBX))
        return res.status(400).json({ error: `QHUBX bet must be ${CONFIG.MIN_BET_QHUBX}–${CONFIG.MAX_BET_QHUBX}` });

    const weights    = getWeights();
    const primary    = rollWithWeights(weights);
    const retryBaked = primary.type === 'retry' ? rollRetry(weights) : null;
    const nonce      = crypto.randomBytes(16).toString('hex');

    pendingGames.set(nonce, { wallet, token, amount: bet, primary, retryBaked, weights, ts: Date.now(), used: false });
    console.log(`[REQ] ${wallet.slice(0,8)} | ${bet} ${token} | phase=${currentPhase()} | ${primary.label}`);

    res.json({ nonce, casinoWallet: casinoWallet.toBase58(), expiresIn: 600,
               phase: currentPhase(), jackpotReady: jackpotProgress() >= 100 });
});

// ─── STEP 2: PROCESS BET ──────────────────────────────────────────────────
app.post('/process-bet', async (req, res) => {
    const { signature, nonce } = req.body;
    if (!signature || !nonce) return res.status(400).json({ error: 'signature and nonce required.' });
    if (processedSignatures.has(signature)) return res.status(400).json({ error: 'Already processed.' });

    const game = pendingGames.get(nonce);
    if (!game || game.used) return res.status(400).json({ error: 'Invalid or expired nonce.' });

    try {
        // Wait for on-chain confirmation
        let confirmed = false;
        for (let i = 0; i < 15; i++) {
            const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
            if (value && !value.err && ['confirmed','finalized'].includes(value.confirmationStatus)) { confirmed = true; break; }
            await new Promise(r => setTimeout(r, 2500));
        }
        if (!confirmed) return res.status(400).json({ error: 'Transaction not confirmed on-chain.' });

        const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!tx || tx.meta?.err) return res.status(400).json({ error: 'Transaction invalid or reverted.' });

        // Verify amount received
        let betLamports = 0;
        if (game.token === 'SOL') {
            const keys = tx.transaction.message.accountKeys;
            const cIdx = keys.findIndex(k => (k.pubkey?.toBase58?.() ?? k.toString()) === casinoWallet.toBase58());
            if (cIdx < 0) return res.status(400).json({ error: 'Casino wallet not in tx.' });
            const received = (tx.meta.postBalances[cIdx]||0) - (tx.meta.preBalances[cIdx]||0);
            if (received <= 0) return res.status(400).json({ error: 'No SOL received.' });
            const expected = Math.round(game.amount * LAMPORTS_PER_SOL);
            if (Math.abs(received - expected) > Math.round(0.002 * LAMPORTS_PER_SOL))
                return res.status(400).json({ error: `Amount mismatch: got ${received/LAMPORTS_PER_SOL} expected ${game.amount}` });
            betLamports = received;
        }
        if (game.token === 'QHUBX') {
            const post = tx.meta?.postTokenBalances || [];
            const pre  = tx.meta?.preTokenBalances  || [];
            const pe   = post.find(b => b.owner === casinoWallet.toBase58() && b.mint === CONFIG.QHUBX_MINT_ADDRESS);
            const pr   = pre.find(b  => b.owner === casinoWallet.toBase58() && b.mint === CONFIG.QHUBX_MINT_ADDRESS);
            const recv = (parseFloat(pe?.uiTokenAmount?.uiAmount)||0) - (parseFloat(pr?.uiTokenAmount?.uiAmount)||0);
            if (recv <= 0) return res.status(400).json({ error: 'No QHUBX received.' });
            betLamports = Math.round(game.amount * CONFIG.QHUBX_SOL_RATE * LAMPORTS_PER_SOL);
        }

        // Lock
        game.used = true;
        processedSignatures.add(signature);
        S.totalVolume += betLamports;
        S.totalGames  += 1;

        // Execute
        const { payout, retryResult, retryPayout } = await processResult(game.primary, betLamports, game.wallet, game.weights);

        saveState();
        pendingGames.delete(nonce);

        const finalResult = (game.primary.type === 'retry' && retryResult) ? retryResult : game.primary;
        addFeed({ wallet: `${game.wallet.slice(0,4)}…${game.wallet.slice(-4)}`, token: game.token, bet: game.amount,
                  result: finalResult.label, resultType: finalResult.type, time: new Date().toISOString() });

        const stats = casinoStats();
        console.log(`[DONE] ${finalResult.label} | pool=${stats.prizePool.toFixed(4)} SOL | phase=${stats.phase} | HE=${stats.houseEdge}%`);

        res.json({
            result:      { label: game.primary.label, type: game.primary.type, slotId: game.primary.id },
            payout,
            retryResult: retryResult ? { label: retryResult.label, type: retryResult.type, slotId: retryResult.id } : null,
            retryPayout,
            prizePool:       stats.prizePool,
            jackpotProgress: stats.jackpotProgress,
            jackpotAvailable:stats.jackpotAvailable,
            phase:           stats.phase,
            houseEdge:       stats.houseEdge,
        });

    } catch (err) {
        console.error('[ERROR]', err.message);
        res.status(500).json({ error: 'Internal server error.', detail: err.message });
    }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────
app.get('/admin/stats', (_, res) => {
    const w = getWeights();
    res.json({
        ...casinoStats(), weights: w,
        houseEdgePct: (computeHouseEdge(w)*100).toFixed(3),
        pendingGames: pendingGames.size, processedTxs: processedSignatures.size,
        config: { JACKPOT_THRESHOLD_SOL: CONFIG.JACKPOT_THRESHOLD_SOL, JACKPOT_SOL_AMOUNT: CONFIG.JACKPOT_SOL_AMOUNT,
                  PHASE_ACCUMULATE_UNTIL: CONFIG.PHASE_ACCUMULATE_UNTIL, PHASE_GENEROUS_FROM: CONFIG.PHASE_GENEROUS_FROM,
                  POOL_CONTRIBUTION_LOSS: CONFIG.POOL_CONTRIBUTION_LOSS },
    });
});

// ─── START ────────────────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
    const w = getWeights(); const he = computeHouseEdge(w);
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║       🎰  SoluckU Casino — Server v3.0  🎰         ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`  Network:        ${CONFIG.NETWORK}`);
    console.log(`  Casino Wallet:  ${casinoWallet.toBase58()}`);
    console.log(`  Phase:          ${currentPhase()} (pool=${(S.prizePool/LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
    console.log(`  House Edge:     ${(he*100).toFixed(2)}%  |  RTP: ${(100-he*100).toFixed(2)}%`);
    console.log(`  Pool contrib:   ${(CONFIG.POOL_CONTRIBUTION_LOSS*100).toFixed(0)}% of losses`);
    console.log(`  Jackpot:        ${CONFIG.JACKPOT_SOL_AMOUNT} SOL / ${CONFIG.JACKPOT_THRESHOLD_SOL} SOL volume threshold`);
    console.log('════════════════════════════════════════════════════\n');
});