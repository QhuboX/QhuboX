/**
 * ══════════════════════════════════════════════════════════════
 *  sAIgnalX — PREMIUM PAYMENT SYSTEM v3.0
 *  ─────────────────────────────────────────────────────────────
 *  CONFIG: Set the two constants below and deploy. Done.
 *
 *  FLOW:
 *    1. User connects wallet (Phantom / Solflare / any ≠ Backpack)
 *    2. System detects QHUBX balance automatically
 *    3. User clicks "Get Premium" → system requests tx authorization
 *    4. On-chain verification → 30-day sub stored by wallet address
 *    5. Header shows countdown badge 5 days before expiry
 *    6. On expiry → Premium blocked until renewal
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURE THESE TWO VALUES ─────────────────────────────────
const QHUBX_MINT     = 'YOUR_QHUBX_SPL_TOKEN_MINT_HERE';   // SPL token mint address
const RECEIVER_WALLET = 'YOUR_RECEIVER_SOLANA_WALLET_HERE'; // Your payment wallet
// ──────────────────────────────────────────────────────────────

const PREMIUM_PRICE_USD  = 25;
const SUB_DAYS           = 30;
const WARNING_DAYS_BEFORE = 5;
const BLOCKED_WALLETS_KEY = 'saignalx_subscriptions'; // localStorage key

// Solana RPC (replace with paid RPC for production: Helius, QuickNode, etc.)
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
const APP = {
    wallet:         null,   // connected public key string
    walletProvider: null,   // raw provider object
    solPrice:       null,
    qhubxPrice:     null,
    qhubxBalance:   null,
    qhubxAmount:    null,   // amount required for $25
    quoteExpiry:    null,
    _countdownTimer: null,
    _expiryTimer:    null,
    _priceInterval:  null,
};

/* ══════════════════════════════════════════════════════════════
   SUBSCRIPTION STORAGE
   Keyed by wallet address → { expiry: timestamp }
══════════════════════════════════════════════════════════════ */
function getSubs() {
    try { return JSON.parse(localStorage.getItem(BLOCKED_WALLETS_KEY) || '{}'); }
    catch { return {}; }
}
function saveSub(wallet, expiryTs) {
    const subs = getSubs();
    subs[wallet] = { expiry: expiryTs, activatedAt: Date.now() };
    localStorage.setItem(BLOCKED_WALLETS_KEY, JSON.stringify(subs));
}
function getSubForWallet(wallet) {
    if (!wallet) return null;
    return getSubs()[wallet] || null;
}
function isSubActive(wallet) {
    const sub = getSubForWallet(wallet);
    return sub && Date.now() < sub.expiry;
}
function daysRemaining(wallet) {
    const sub = getSubForWallet(wallet);
    if (!sub) return 0;
    const ms = sub.expiry - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/* ══════════════════════════════════════════════════════════════
   WALLET DETECTION — supports Phantom, Solflare, Glow, Slope, etc.
   Explicitly BLOCKS Backpack
══════════════════════════════════════════════════════════════ */
function detectWalletProviders() {
    const providers = [];

    // Phantom
    if (window.solana?.isPhantom && !window.solana?.isBackpack) {
        providers.push({ name: 'Phantom', icon: '👻', provider: window.solana });
    }
    // Solflare
    if (window.solflare?.isSolflare) {
        providers.push({ name: 'Solflare', icon: '🔆', provider: window.solflare });
    }
    // Glow
    if (window.glow) {
        providers.push({ name: 'Glow', icon: '✨', provider: window.glow.solana });
    }
    // Slope
    if (window.Slope) {
        const s = new window.Slope();
        providers.push({ name: 'Slope', icon: '📐', provider: s });
    }
    // Coin98
    if (window.coin98?.sol) {
        providers.push({ name: 'Coin98', icon: '🪙', provider: window.coin98.sol });
    }
    // Generic Solana standard wallet (catches others, not Backpack)
    if (window.solana && !window.solana?.isPhantom && !window.solana?.isBackpack) {
        providers.push({ name: 'Wallet', icon: '💼', provider: window.solana });
    }

    return providers;
}

async function connectWallet(provider, providerName) {
    try {
        let resp;
        if (typeof provider.connect === 'function') {
            resp = await provider.connect();
        } else {
            throw new Error('Provider has no connect method');
        }
        const pubkey = resp?.publicKey?.toString()
                    || provider.publicKey?.toString();
        if (!pubkey) throw new Error('No public key returned');
        APP.wallet         = pubkey;
        APP.walletProvider = provider;
        onWalletConnected(providerName);
    } catch (err) {
        console.error('Wallet connect error:', err);
        setModalStatus('error', `❌ Could not connect ${providerName}: ${err.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════
   ON WALLET CONNECTED
══════════════════════════════════════════════════════════════ */
async function onWalletConnected(providerName) {
    updateNavWalletUI();
    closeWalletSelectModal();

    // Check if already premium
    if (isSubActive(APP.wallet)) {
        applyPremiumUI();
        startExpiryWatcher();
        return;
    }

    // Fetch QHUBX balance
    APP.qhubxBalance = await fetchQhubxBalance(APP.wallet);
    updatePremiumModal();
}

/* ══════════════════════════════════════════════════════════════
   FETCH QHUBX BALANCE for connected wallet
══════════════════════════════════════════════════════════════ */
async function fetchQhubxBalance(walletAddress) {
    try {
        const body = {
            jsonrpc: '2.0', id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
                walletAddress,
                { mint: QHUBX_MINT },
                { encoding: 'jsonParsed' }
            ]
        };
        const res  = await fetch(SOLANA_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        const accounts = data?.result?.value ?? [];
        if (!accounts.length) return 0;
        const amount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
        return parseFloat(amount);
    } catch { return 0; }
}

/* ══════════════════════════════════════════════════════════════
   FETCH PRICES  (SOL + QHUBX)
══════════════════════════════════════════════════════════════ */
async function fetchPrices() {
    // SOL
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { cache: 'no-store' });
        const d = await r.json();
        APP.solPrice = d?.solana?.usd ?? null;
    } catch { APP.solPrice = null; }

    // QHUBX via DexScreener
    try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${QHUBX_MINT}`, { cache: 'no-store' });
        const d = await r.json();
        const pair = d?.pairs?.[0];
        APP.qhubxPrice = pair ? parseFloat(pair.priceUsd) : null;
    } catch { APP.qhubxPrice = null; }

    if (APP.qhubxPrice && APP.qhubxPrice > 0) {
        APP.qhubxAmount = PREMIUM_PRICE_USD / APP.qhubxPrice;
    }

    updatePriceUI();
}

function updatePriceUI() {
    const solEl   = document.getElementById('modalSolPrice');
    const qEl     = document.getElementById('modalQhubxPrice');
    const amtEl   = document.getElementById('qhubxAmountRequired');
    const balEl   = document.getElementById('qhubxBalanceDisplay');

    if (solEl) solEl.textContent   = APP.solPrice   ? `$${APP.solPrice.toFixed(2)}`    : '—';
    if (qEl)   qEl.textContent     = APP.qhubxPrice ? `$${APP.qhubxPrice.toFixed(8)}`  : '—';
    if (amtEl) amtEl.textContent   = APP.qhubxAmount ? `${APP.qhubxAmount.toFixed(2)} QHUBX` : '…';

    if (balEl && APP.qhubxBalance !== null) {
        const enough = APP.qhubxAmount && APP.qhubxBalance >= APP.qhubxAmount * 0.98;
        balEl.textContent = `${APP.qhubxBalance.toFixed(2)} QHUBX`;
        balEl.style.color = enough ? 'var(--neon-green)' : 'var(--neon-red)';
    }
}

/* ══════════════════════════════════════════════════════════════
   SEND PAYMENT TRANSACTION
   Builds an SPL token transfer and requests wallet signature
══════════════════════════════════════════════════════════════ */
async function sendPaymentTransaction() {
    if (!APP.wallet || !APP.walletProvider) {
        setModalStatus('error', '❌ No wallet connected.');
        return;
    }
    if (!APP.qhubxAmount) {
        setModalStatus('error', '❌ Price not loaded yet. Please wait.');
        return;
    }
    if (APP.qhubxBalance < APP.qhubxAmount * 0.98) {
        setModalStatus('error', `❌ Insufficient QHUBX. You have ${APP.qhubxBalance.toFixed(2)}, need ${APP.qhubxAmount.toFixed(2)}.`);
        return;
    }

    setModalStatus('verifying', '<span class="spin-icon">⟳</span> Building transaction…');
    document.getElementById('btnPay').disabled = true;

    try {
        // Dynamically load @solana/web3.js from CDN
        await loadScript('https://unpkg.com/@solana/web3.js@1.87.6/lib/index.iife.min.js');
        await loadScript('https://unpkg.com/@solana/spl-token@0.3.8/lib/index.iife.min.js');

        const { Connection, PublicKey, Transaction } = solanaWeb3;
        const splToken = window.splToken;

        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const payerPk    = new PublicKey(APP.wallet);
        const receiverPk = new PublicKey(RECEIVER_WALLET);
        const mintPk     = new PublicKey(QHUBX_MINT);

        // Get/create associated token accounts
        const fromATA = await splToken.getAssociatedTokenAddress(mintPk, payerPk);
        const toATA   = await splToken.getAssociatedTokenAddress(mintPk, receiverPk);

        // Get mint info for decimals
        const mintInfo = await splToken.getMint(connection, mintPk);
        const decimals = mintInfo.decimals;
        const rawAmount = BigInt(Math.floor(APP.qhubxAmount * Math.pow(10, decimals)));

        const tx = new Transaction();

        // Create receiver ATA if it doesn't exist
        const toATAInfo = await connection.getAccountInfo(toATA);
        if (!toATAInfo) {
            tx.add(
                splToken.createAssociatedTokenAccountInstruction(
                    payerPk, toATA, receiverPk, mintPk
                )
            );
        }

        tx.add(
            splToken.createTransferCheckedInstruction(
                fromATA, mintPk, toATA, payerPk, rawAmount, decimals
            )
        );

        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = payerPk;

        setModalStatus('verifying', '<span class="spin-icon">⟳</span> Awaiting wallet approval…');

        // Request signature from wallet
        const signed = await APP.walletProvider.signTransaction(tx);
        const txid   = await connection.sendRawTransaction(signed.serialize());

        setModalStatus('verifying', `<span class="spin-icon">⟳</span> Confirming on-chain…`);

        // Wait for confirmation
        await connection.confirmTransaction(txid, 'confirmed');

        // ✅ Payment confirmed
        const expiry = Date.now() + SUB_DAYS * 24 * 60 * 60 * 1000;
        saveSub(APP.wallet, expiry);
        applyPremiumUI();
        startExpiryWatcher();
        showSuccessStep(expiry);

    } catch (err) {
        console.error('Payment error:', err);
        const msg = err?.message?.includes('User rejected')
            ? '❌ Transaction cancelled by user.'
            : `❌ Error: ${err.message}`;
        setModalStatus('error', msg);
        document.getElementById('btnPay').disabled = false;
    }
}

/* Load external script once */
const _loadedScripts = {};
function loadScript(src) {
    if (_loadedScripts[src]) return Promise.resolve();
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => { _loadedScripts[src] = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
    });
}

/* ══════════════════════════════════════════════════════════════
   EXPIRY WATCHER — runs every minute, updates header badge
══════════════════════════════════════════════════════════════ */
function startExpiryWatcher() {
    clearInterval(APP._expiryTimer);
    tickExpiry();
    APP._expiryTimer = setInterval(tickExpiry, 60 * 1000);
}

function tickExpiry() {
    if (!APP.wallet) return;
    const sub = getSubForWallet(APP.wallet);
    if (!sub) return;

    const days = daysRemaining(APP.wallet);
    const badge = document.getElementById('subExpiryBadge');
    const counter = document.getElementById('subCountdown');

    if (!badge) return;

    if (!isSubActive(APP.wallet)) {
        // EXPIRED — block premium
        badge.style.display = 'flex';
        badge.className = 'sub-badge expired';
        badge.innerHTML = '🔴 Premium Expired — <span onclick="openPremiumModal()" style="cursor:pointer;text-decoration:underline;margin-left:4px">Renew</span>';
        revokePremiumUI();
        return;
    }

    if (days <= WARNING_DAYS_BEFORE) {
        // WARNING — show countdown
        badge.style.display = 'flex';
        badge.className = 'sub-badge warning';
        if (counter) counter.textContent = `${days}d`;
        badge.querySelector?.('.badge-text').textContent = `Premium expires in ${days} day${days !== 1 ? 's' : ''}`;
    } else {
        // Active, no warning needed
        badge.style.display = 'none';
    }
}

/* ══════════════════════════════════════════════════════════════
   PREMIUM UI APPLY / REVOKE
══════════════════════════════════════════════════════════════ */
function applyPremiumUI() {
    document.body.classList.add('is-premium');
    window.sAIgnalX_isPremium = true;

    const vt = document.querySelector('.version-tag');
    if (vt) vt.innerHTML = '<span class="premium-badge">👑 Premium</span>';

    // Show Go Pro badge in header (for future re-entries when already paid)
    const goProBtn = document.getElementById('goProBtn');
    if (goProBtn) goProBtn.style.display = 'none'; // already premium, hide it

    const getPremBtn = document.getElementById('btnGetPremiumHeader');
    if (getPremBtn) getPremBtn.style.display = 'none';

    // Start expiry watcher
    startExpiryWatcher();
}

function revokePremiumUI() {
    document.body.classList.remove('is-premium');
    window.sAIgnalX_isPremium = false;
    const vt = document.querySelector('.version-tag');
    if (vt) vt.textContent = '|| Free v2.0';
}

function updateNavWalletUI() {
    const walletBtn = document.getElementById('navConnectBtn');
    if (!walletBtn) return;

    const short = APP.wallet
        ? APP.wallet.slice(0,4) + '…' + APP.wallet.slice(-4)
        : 'Connect Wallet';

    walletBtn.textContent = short;
    walletBtn.classList.toggle('connected', !!APP.wallet);

    // Show Go Pro button if wallet connected, premium active
    const goProBtn = document.getElementById('goProBtn');
    if (goProBtn) {
        goProBtn.style.display = (APP.wallet && isSubActive(APP.wallet)) ? 'flex' : 'none';
    }

    // Show Get Premium button if wallet connected, no active sub
    const getPremBtn = document.getElementById('btnGetPremiumHeader');
    if (getPremBtn) {
        getPremBtn.style.display = (APP.wallet && !isSubActive(APP.wallet)) ? 'inline-flex' : 'none';
    }
}

/* ══════════════════════════════════════════════════════════════
   MODAL SYSTEM
══════════════════════════════════════════════════════════════ */

/* ── Wallet Select Modal ── */
function openWalletSelectModal() {
    const modal = document.getElementById('walletSelectModal');
    if (!modal) return;
    const providers = detectWalletProviders();
    const list = document.getElementById('walletProviderList');
    list.innerHTML = '';

    if (!providers.length) {
        list.innerHTML = `<div class="no-wallet-msg">
            No Solana wallet detected.<br>
            <a href="https://phantom.app" target="_blank" style="color:var(--neon-cyan)">Install Phantom →</a>
        </div>`;
    } else {
        providers.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'wallet-option-btn';
            btn.innerHTML = `<span class="wallet-icon">${p.icon}</span> ${p.name}`;
            btn.onclick = () => connectWallet(p.provider, p.name);
            list.appendChild(btn);
        });
    }

    modal.classList.add('active');
}
function closeWalletSelectModal() {
    document.getElementById('walletSelectModal')?.classList.remove('active');
}

/* ── Premium Modal ── */
function openPremiumModal() {
    if (!APP.wallet) {
        openWalletSelectModal();
        return;
    }
    if (isSubActive(APP.wallet)) {
        showPremiumActiveModal();
        return;
    }
    showPremiumPayModal();
}

function showPremiumPayModal() {
    const modal = document.getElementById('premiumModal');
    modal.classList.add('active');
    document.getElementById('payStep').style.display  = 'block';
    document.getElementById('successStep').style.display = 'none';
    document.getElementById('btnPay').disabled = false;

    // Show wallet & balance
    const walEl = document.getElementById('payWalletDisplay');
    if (walEl) walEl.textContent = APP.wallet.slice(0,6) + '…' + APP.wallet.slice(-6);
    document.getElementById('destWalletDisplay').textContent = RECEIVER_WALLET;

    clearModalStatus();
    fetchPrices();
    APP._priceInterval = setInterval(fetchPrices, 30000);
}

function showPremiumActiveModal() {
    const modal = document.getElementById('premiumModal');
    modal.classList.add('active');
    document.getElementById('payStep').style.display  = 'none';
    document.getElementById('successStep').style.display = 'block';
    const sub = getSubForWallet(APP.wallet);
    populateSuccessStep(APP.wallet, sub.expiry);
}

function showSuccessStep(expiry) {
    document.getElementById('payStep').style.display  = 'none';
    document.getElementById('successStep').style.display = 'block';
    populateSuccessStep(APP.wallet, expiry);
}

function populateSuccessStep(wallet, expiry) {
    const expDate = new Date(expiry);
    document.getElementById('successExpiry').textContent =
        expDate.toLocaleDateString() + ' at ' + expDate.toLocaleTimeString();
    document.getElementById('successWallet').textContent =
        wallet.slice(0,6) + '…' + wallet.slice(-6);
    document.getElementById('successDays').textContent = daysRemaining(wallet);
}

function closePremiumModal() {
    document.getElementById('premiumModal')?.classList.remove('active');
    clearInterval(APP._priceInterval);
}

/* ── Status helpers ── */
function setModalStatus(type, html) {
    const el = document.getElementById('payStatus');
    if (!el) return;
    el.className = `payment-status ${type}`;
    el.innerHTML = html;
}
function clearModalStatus() {
    const el = document.getElementById('payStatus');
    if (!el) return;
    el.className = 'payment-status';
    el.textContent = '';
}

/* ══════════════════════════════════════════════════════════════
   INIT — runs on DOMContentLoaded
══════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {

    // Close modals on overlay click
    document.getElementById('premiumModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('premiumModal')) closePremiumModal();
    });
    document.getElementById('walletSelectModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('walletSelectModal')) closeWalletSelectModal();
    });

    // Restore session if wallet still connected (Phantom auto-reconnect)
    const tryAutoConnect = async () => {
        const phantom = window.solana;
        if (phantom?.isPhantom && !phantom?.isBackpack && phantom.isConnected) {
            const pubkey = phantom.publicKey?.toString();
            if (pubkey) {
                APP.wallet = pubkey;
                APP.walletProvider = phantom;
                APP.qhubxBalance = await fetchQhubxBalance(pubkey);
                updateNavWalletUI();
                if (isSubActive(pubkey)) {
                    applyPremiumUI();
                    startExpiryWatcher();
                }
            }
        }
    };
    tryAutoConnect();

    // Ensure expiry badge exists in DOM
    tickExpiry();
});