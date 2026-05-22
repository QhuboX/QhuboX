/**
 * wallet.js v3.0 — Seguro · Verifica contra backend
 *
 * FLUJO REAL:
 *  1. Usuario conecta wallet (Phantom / Solflare — Backpack excluido)
 *  2. GET /sAIgnalX/api/subscription?wallet=... → ¿tiene sub activa?
 *  3. Si SÍ → POST /sAIgnalX/api/auth → obtiene JWT → cookie HttpOnly
 *  4. Si NO → muestra modal Get Premium
 *  5. Pago: wallet firma TX SPL on-chain
 *  6. POST /sAIgnalX/api/verify-payment → backend verifica TX en Solana
 *  7. Backend emite JWT → cookie HttpOnly
 *  8. Go Pro → redirige a /sAIgnalX/premium/ (servidor verifica JWT)
 */

'use strict';

/* ── Base path (se ajusta automáticamente) ─────────────────── */
const BASE_PATH = (() => {
    const p = window.location.pathname;
    if (p.includes('/sAIgnalX')) return '/sAIgnalX';
    return '';
})();

const API = `${BASE_PATH}/api`;

/* ══════════════════════════════════════════════════════════════
   ⚙️  NADA QUE CONFIGURAR AQUÍ.
   Todo viene del .env del servidor.
   ══════════════════════════════════════════════════════════════ */

/* ── Estado global ─────────────────────────────────────────── */
const WS = {
    connected    : false,
    publicKey    : null,
    provider     : null,
    subActive    : false,
    daysLeft     : 0,
    endTs        : 0,
    priceData    : null,   // { solPrice, qhubxPrice, requiredQhubx, receiverWallet, mintAddress }
};

/* ── DOM helper ────────────────────────────────────────────── */
const el = id => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════
   WALLET DETECTION
   ═══════════════════════════════════════════════════════════ */
function detectProvider() {
    const w = window;
    // Excluir Backpack explícitamente
    if (w.backpack?.solana && !w.solana?.isPhantom && !w.solflare) return null;
    if (w.solana?.isPhantom)   return w.solana;
    if (w.solflare?.isSolflare) return w.solflare;
    if (w.solana)               return w.solana;
    return null;
}

/* ═══════════════════════════════════════════════════════════
   CONNECT / DISCONNECT
   ═══════════════════════════════════════════════════════════ */
async function connectWallet() {
    const provider = detectProvider();
    if (!provider) {
        alert('No se detectó una wallet compatible.\nInstala Phantom o Solflare.\n(Backpack no está soportado)');
        return;
    }
    try {
        const resp    = await provider.connect();
        WS.provider   = provider;
        WS.publicKey  = resp.publicKey.toString();
        WS.connected  = true;
        await onWalletConnected();
    } catch (e) {
        console.warn('[wallet] connect error:', e);
    }
}

async function disconnectWallet() {
    if (WS.provider?.disconnect) {
        try { await WS.provider.disconnect(); } catch {}
    }
    WS.connected = false;
    WS.publicKey = null;
    WS.provider  = null;
    WS.subActive = false;
    onWalletDisconnected();
}

/* ═══════════════════════════════════════════════════════════
   POST-CONNECT
   ═══════════════════════════════════════════════════════════ */
async function onWalletConnected() {
    const addr  = WS.publicKey;
    const short = addr.slice(0, 4) + '...' + addr.slice(-4);

    // Mostrar wallet en UI
    el('connectWalletBtn')  && el('connectWalletBtn').classList.add('hidden');
    el('walletConnected')   && el('walletConnected').classList.remove('hidden');
    el('walletAddress')     && (el('walletAddress').textContent = short);

    // Verificar suscripción en el servidor
    await checkSubscription(addr);

    // Precargar precios para el modal
    fetchPricesFromServer();
}

function onWalletDisconnected() {
    el('connectWalletBtn')  && el('connectWalletBtn').classList.remove('hidden');
    el('walletConnected')   && el('walletConnected').classList.add('hidden');
    el('walletAddress')     && (el('walletAddress').textContent = '');
    el('getPremiumBtn')     && el('getPremiumBtn').classList.remove('hidden');
    el('goProBtn')          && el('goProBtn').classList.add('hidden');
    el('subStatus')         && (el('subStatus').textContent = '');
}

/* ═══════════════════════════════════════════════════════════
   VERIFICAR SUSCRIPCIÓN — API del servidor
   ═══════════════════════════════════════════════════════════ */
async function checkSubscription(wallet) {
    try {
        const res  = await fetch(`${API}/subscription?wallet=${encodeURIComponent(wallet)}`);
        const data = await res.json();

        if (data.ok && data.active) {
            WS.subActive = true;
            WS.daysLeft  = data.daysLeft;
            WS.endTs     = data.endTs;

            // Obtener JWT del servidor (lo guarda como cookie HttpOnly)
            await refreshJWT(wallet);

            showPremiumAccess(data.daysLeft);
        } else {
            WS.subActive = false;
            showFreeAccess();
        }
    } catch (e) {
        console.error('[wallet] checkSubscription error:', e);
        showFreeAccess();
    }
}

async function refreshJWT(wallet) {
    try {
        await fetch(`${API}/auth`, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            credentials: 'include',   // incluye cookies
            body    : JSON.stringify({ wallet })
        });
    } catch (e) {
        console.warn('[wallet] JWT refresh error:', e);
    }
}

/* ═══════════════════════════════════════════════════════════
   PRECIOS DESDE SERVIDOR
   ═══════════════════════════════════════════════════════════ */
async function fetchPricesFromServer() {
    try {
        const res  = await fetch(`${API}/prices`);
        const data = await res.json();
        if (!data.ok) return;

        WS.priceData = data;

        // Actualizar UI del modal
        const fmt = v => v > 0 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';

        el('solPrice')       && (el('solPrice').textContent       = `SOL: $${data.solPrice.toFixed(2)}`);
        el('qhubxPrice')     && (el('qhubxPrice').textContent     = `QHUBX: $${data.qhubxPrice.toFixed(8)}`);
        el('priceInToken')   && (el('priceInToken').textContent   = `${fmt(data.requiredQhubx)} QHUBX`);

        el('renewQhubxPrice')   && (el('renewQhubxPrice').textContent   = `QHUBX: $${data.qhubxPrice.toFixed(8)}`);
        el('renewPriceInToken') && (el('renewPriceInToken').textContent = `${fmt(data.requiredQhubx)} QHUBX`);
    } catch (e) {
        console.warn('[wallet] fetchPrices error:', e);
    }
}

/* ═══════════════════════════════════════════════════════════
   UI STATES
   ═══════════════════════════════════════════════════════════ */
function showPremiumAccess(days) {
    el('getPremiumBtn') && el('getPremiumBtn').classList.add('hidden');
    el('goProBtn')      && el('goProBtn').classList.remove('hidden');

    if (el('subStatus')) {
        el('subStatus').textContent = `PRO · ${days}d`;
        el('subStatus').classList.toggle('expiring', days <= 5);
    }

    const WARN = parseInt(process.env.WARNING_DAYS || 5);
    if (days <= WARN) showExpiryBanner(days);
}

function showFreeAccess() {
    el('getPremiumBtn') && el('getPremiumBtn').classList.remove('hidden');
    el('goProBtn')      && el('goProBtn').classList.add('hidden');
    if (el('subStatus')) {
        el('subStatus').textContent = 'FREE';
        el('subStatus').classList.remove('expiring');
    }
}

function showExpiryBanner(days) {
    const banner = el('expiryBanner');
    if (!banner) return;
    banner.classList.remove('hidden');
    el('expiryDays') && (el('expiryDays').textContent = days);
}

/* ═══════════════════════════════════════════════════════════
   PROCESO DE PAGO — SPL Token Transfer + verify backend
   ═══════════════════════════════════════════════════════════ */
async function processPayment(onSuccess) {
    if (!WS.connected) { alert('Conecta tu wallet primero.'); return; }

    if (!WS.priceData) {
        await fetchPricesFromServer();
        if (!WS.priceData) { alert('No se pudo obtener el precio. Intenta de nuevo.'); return; }
    }

    const { requiredQhubx, mintAddress, receiverWallet } = WS.priceData;

    const payBtn  = el('payNowBtn') || el('renewPayBtn');
    const payText = el('payBtnText') || el('renewBtnText');
    if (payBtn) payBtn.disabled = true;
    if (payText) payText.textContent = 'Preparando transacción…';

    try {
        // 1. Enviar TX SPL on-chain
        const signature = await sendSPLTransfer(requiredQhubx, mintAddress, receiverWallet);
        if (!signature) throw new Error('Transacción cancelada por el usuario');

        if (payText) payText.textContent = 'Verificando en servidor…';

        // 2. El servidor verifica la TX on-chain y activa la suscripción
        const res  = await fetch(`${API}/verify-payment`, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            credentials: 'include',
            body    : JSON.stringify({ txSignature: signature, wallet: WS.publicKey })
        });
        const data = await res.json();

        if (!data.ok) throw new Error(data.error || 'Verificación fallida');

        // 3. Guardar JWT en cookie (el servidor ya lo hizo con HttpOnly, pero también
        //    lo guardamos para el header de autorización en fetch calls)
        if (data.token) {
            sessionStorage.setItem('saignalx_jwt', data.token);
        }

        WS.subActive = true;
        WS.daysLeft  = data.daysLeft;
        WS.endTs     = data.endTs;

        if (payText) payText.textContent = '✓ ¡Acceso activado!';

        setTimeout(() => {
            closeAllModals();
            if (onSuccess) onSuccess(data);
            else showPremiumAccess(data.daysLeft);
        }, 1200);

    } catch (e) {
        console.error('[wallet] payment error:', e);
        if (payText) payText.textContent = 'Error: ' + (e.message || 'Intenta de nuevo');
        setTimeout(() => {
            if (payBtn)  payBtn.disabled = false;
            if (payText) payText.textContent = 'Autorizar Pago';
        }, 3000);
    }
}

/* ═══════════════════════════════════════════════════════════
   SPL TRANSFER (carga @solana/web3.js desde CDN)
   ═══════════════════════════════════════════════════════════ */
async function sendSPLTransfer(amount, mintAddress, receiverWallet) {
    if (!window.solanaWeb3) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/solana-web3.js/1.78.4/index.iife.min.js');
        window.solanaWeb3 = window.solanaWeb3JS || window.solanaWeb3;
    }

    const web3 = window.solanaWeb3;
    const RPC  = 'https://api.mainnet-beta.solana.com';
    const connection  = new web3.Connection(RPC, 'confirmed');
    const fromPubkey  = new web3.PublicKey(WS.publicKey);
    const toPubkey    = new web3.PublicKey(receiverWallet);
    const mintPubkey  = new web3.PublicKey(mintAddress);
    const TOKEN_PID   = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOC_PID   = new web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bC8');

    // Obtener ATAs
    const [fromATA] = await web3.PublicKey.findProgramAddress(
        [fromPubkey.toBuffer(), TOKEN_PID.toBuffer(), mintPubkey.toBuffer()],
        ASSOC_PID
    );
    const [toATA] = await web3.PublicKey.findProgramAddress(
        [toPubkey.toBuffer(), TOKEN_PID.toBuffer(), mintPubkey.toBuffer()],
        ASSOC_PID
    );

    // Decimales del mint
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals = mintInfo?.value?.data?.parsed?.info?.decimals || 6;
    const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));

    // Transfer instruction
    const data = Buffer.alloc(9);
    data.writeUInt8(3, 0);
    data.writeBigUInt64LE(rawAmount, 1);

    const transferIx = new web3.TransactionInstruction({
        keys: [
            { pubkey: fromATA,    isSigner: false, isWritable: true },
            { pubkey: toATA,      isSigner: false, isWritable: true },
            { pubkey: fromPubkey, isSigner: true,  isWritable: false },
        ],
        programId: TOKEN_PID,
        data,
    });

    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new web3.Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;
    tx.add(transferIx);

    const signed = await WS.provider.signTransaction(tx);
    const sig    = await connection.sendRawTransaction(signed.serialize());
    return sig;
}

function loadScript(src) {
    return new Promise((res, rej) => {
        const s   = document.createElement('script');
        s.src     = src;
        s.onload  = res;
        s.onerror = rej;
        document.head.appendChild(s);
    });
}

/* ═══════════════════════════════════════════════════════════
   MODALS
   ═══════════════════════════════════════════════════════════ */
function openPremiumModal() {
    el('premiumModal') && el('premiumModal').classList.remove('hidden');
    fetchPricesFromServer();
}

function closeAllModals() {
    ['premiumModal', 'renewModal'].forEach(id => {
        el(id) && el(id).classList.add('hidden');
    });
}

/* ═══════════════════════════════════════════════════════════
   PREMIUM PAGE INIT
   ═══════════════════════════════════════════════════════════ */
async function initPremiumPage() {
    // En la página premium, el servidor ya verificó el JWT.
    // Solo necesitamos eager-connect la wallet para mostrar la info.
    const provider = detectProvider();
    if (provider) {
        try {
            const resp   = await provider.connect({ onlyIfTrusted: true });
            WS.provider  = provider;
            WS.publicKey = resp.publicKey.toString();
            WS.connected = true;

            // Verificar sub (confirma que sigue activa)
            await checkSubscription(WS.publicKey);

            const short = WS.publicKey.slice(0,4) + '...' + WS.publicKey.slice(-4);
            el('proWalletAddr') && (el('proWalletAddr').textContent = short);

            // Timer countdown
            startSubCountdown();
        } catch {
            // Sin wallet conectada en premium = no mostramos error, ya verificó el servidor
            startSubCountdown();
        }
    }
    fetchPricesFromServer();
}

/* ── Countdown para el timer de la página premium ──────────── */
function startSubCountdown() {
    function tick() {
        if (!WS.subActive && !WS.endTs) return;
        const now     = Math.floor(Date.now() / 1000);
        const days    = Math.max(0, Math.ceil((WS.endTs - now) / 86400));
        const expiring = days <= 5;

        if (el('timerValue')) {
            el('timerValue').textContent = days > 0 ? `${days} día${days !== 1 ? 's' : ''} restantes` : 'Expirada';
            el('timerValue').classList.toggle('expiring-soon', expiring);
        }

        if (expiring && days > 0) showExpiryBanner(days);
        if (days <= 0) {
            el('renewBtn')  && el('renewBtn').classList.remove('hidden');
        }
    }
    tick();
    setInterval(tick, 60_000);
}

/* ═══════════════════════════════════════════════════════════
   DOMContentLoaded — wire up buttons
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    const isPremiumPage =
        window.location.pathname.includes('/premium') ||
        document.title.toLowerCase().includes('pro');

    /* ── Wallet ── */
    el('connectWalletBtn')?.addEventListener('click', connectWallet);
    el('disconnectBtn')?.addEventListener('click', disconnectWallet);

    /* ── Get Premium ── */
    el('getPremiumBtn')?.addEventListener('click', async () => {
        if (!WS.connected) {
            await connectWallet();
            if (WS.connected && !WS.subActive) openPremiumModal();
        } else if (!WS.subActive) {
            openPremiumModal();
        }
    });

    /* ── Go Pro → navega al premium (servidor verifica JWT) ── */
    el('goProBtn')?.addEventListener('click', () => {
        window.location.href = `${BASE_PATH}/premium/`;
    });

    /* ── Cerrar modales ── */
    el('closeModalBtn')?.addEventListener('click', closeAllModals);
    el('closeRenewModalBtn')?.addEventListener('click', closeAllModals);
    el('premiumModal')?.addEventListener('click', e => {
        if (e.target === el('premiumModal')) closeAllModals();
    });

    /* ── Pagar ── */
    el('payNowBtn')?.addEventListener('click', () => {
        processPayment(() => showPremiumAccess(WS.daysLeft));
    });

    /* ── Renovar ── */
    const openRenew = () => {
        el('renewModal')?.classList.remove('hidden');
        fetchPricesFromServer();
    };
    el('renewBtn')?.addEventListener('click', openRenew);
    el('bannerRenewBtn')?.addEventListener('click', openRenew);
    el('renewPayBtn')?.addEventListener('click', () => {
        processPayment(data => {
            WS.daysLeft = data.daysLeft;
            WS.endTs    = data.endTs;
            closeAllModals();
            startSubCountdown();
            el('expiryBanner')?.classList.add('hidden');
            el('renewBtn')?.classList.add('hidden');
        });
    });

    /* ── Init por página ── */
    if (isPremiumPage) {
        initPremiumPage();
    } else {
        // Eager connect si ya había aprobado la wallet antes
        const provider = detectProvider();
        if (provider) {
            provider.connect({ onlyIfTrusted: true })
                .then(resp => {
                    WS.provider  = provider;
                    WS.publicKey = resp.publicKey.toString();
                    WS.connected = true;
                    return onWalletConnected();
                })
                .catch(() => {});
        }
    }
});
