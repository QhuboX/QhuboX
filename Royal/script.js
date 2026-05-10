/* ════════════════════════════════════════════════════════════════
   SOLUCKU CASINO v3.0 — script.js
   Multi-wallet · QHUBX-only · Canvas animations · Live Feed
   Fortune Wheel · Blackjack · Roulette · Slots
════════════════════════════════════════════════════════════════ */
'use strict';

/* ── ADMIN CONFIG ──────────────────────────────────────────── */
const CFG = {
    SERVER:         '',          // same-origin via Express
    QHUBX_MINT:     'REPLACE_WITH_QHUBX_MINT_ADDRESS',
    QHUBX_DECIMALS: 6,
    MIN_BET:        100,
    MAX_BET:        1_000_000,
    JACKPOT_QHUBX:  50_000,
};

/* ── SOLANA ────────────────────────────────────────────────── */
const {
    Connection, clusterApiUrl, PublicKey,
    Transaction, LAMPORTS_PER_SOL, TransactionInstruction,
} = solanaWeb3;

const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_PROG = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS');

/* ── STATE ─────────────────────────────────────────────────── */
const ST = {
    connected:false, pubkey:null, providerName:null,
    qhubxBal:0, solBal:0, solPrice:null, qhubxPrice:null,
    casinoWallet:null, prizePool:0, jackpotPct:0,
    busy:false, balTimer:null,
};
const GAME = {
    wheelNonce:null, bjNonce:null, bjGameId:null,
    bjBet:0, bjDoubled:false, bjActive:false,
    rlNonce:null, rlBetType:'color', rlBetDetail:'red', rlBetNums:[],
    slNonce:null,
};
let feedTotal=0, feedPaid=0, feedWins=0;

/* ── DOM ───────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const st = (id,v,c='')=>{ const e=$(id);if(e){e.textContent=v;e.className=`sl ${c}`;} };
const tx = (id,v)=>{ const e=$(id);if(e) e.textContent=v; };

/* ════════════════════════════════════════════════════════════
   MULTI-WALLET DETECTION
════════════════════════════════════════════════════════════ */
const KNOWN_WALLETS = [
    { name:'Phantom',   key:'solana',      icon:'👻', check:()=>!!(window.solana?.isPhantom),    get:()=>window.solana, url:'https://phantom.app' },
    { name:'Solflare',  key:'solflare',    icon:'🌟', check:()=>!!(window.solflare?.isSolflare), get:()=>window.solflare, url:'https://solflare.com' },
    { name:'Backpack',  key:'backpack',    icon:'🎒', check:()=>!!(window.backpack),              get:()=>window.backpack, url:'https://backpack.app' },
    { name:'Glow',      key:'glow',        icon:'💡', check:()=>!!(window.glow),                 get:()=>window.glow, url:'https://glow.app' },
    { name:'Exodus',    key:'exodus',      icon:'🚀', check:()=>!!(window.exodus?.solana),        get:()=>window.exodus?.solana, url:'https://exodus.com' },
    { name:'Slope',     key:'slope',       icon:'📱', check:()=>!!(window.Slope),                get:()=>window.Slope ? new window.Slope() : null, url:'https://slope.finance' },
    { name:'Coin98',    key:'coin98',      icon:'💰', check:()=>!!(window.coin98?.sol),           get:()=>window.coin98?.sol, url:'https://coin98.com' },
    { name:'OKX Wallet',key:'okxwallet',   icon:'⭕', check:()=>!!(window.okxwallet?.solana),    get:()=>window.okxwallet?.solana, url:'https://okx.com/web3' },
];

function detectWallets() {
    return KNOWN_WALLETS.filter(w => w.check());
}

function openWalletMenu() {
    if (ST.connected) {
        showConnectedPanel();
    } else {
        showWalletList();
    }
    $('wm-overlay').classList.add('show');
    $('wallet-menu').classList.add('show');
}
function closeWalletMenu() {
    $('wm-overlay').classList.remove('show');
    $('wallet-menu').classList.remove('show');
}

function showWalletList() {
    $('wm-connected').style.display = 'none';
    const list = $('wm-list');
    list.innerHTML = '';
    const detected = detectWallets();
    const all = KNOWN_WALLETS;

    all.forEach(w => {
        const installed = detected.includes(w);
        const btn = document.createElement('button');
        btn.className = 'wm-wallet-btn';
        btn.innerHTML = `
            <div class="wm-wallet-icon">${w.icon}</div>
            <div style="flex:1">
                <div>${w.name}</div>
                <div class="wm-wallet-sub">${installed ? 'Detected' : 'Not installed'}</div>
            </div>
            <span class="wm-wallet-status ${installed ? 'installed' : 'get'}">${installed ? 'CONNECT' : 'GET'}</span>
        `;
        btn.onclick = () => {
            if (installed) connectWallet(w);
            else window.open(w.url, '_blank');
        };
        list.appendChild(btn);
    });
}

function showConnectedPanel() {
    $('wm-list').innerHTML = '';
    $('wm-connected').style.display = 'block';
    $('wm-addr').textContent = ST.pubkey
        ? `${ST.pubkey.slice(0,8)}…${ST.pubkey.slice(-8)}`
        : '';
    $('wm-bal').textContent = `${ST.qhubxBal.toLocaleString('en-US',{maximumFractionDigits:2})} QHUBX`;
}

async function connectWallet(walletDef) {
    closeWalletMenu();
    const provider = walletDef.get();
    if (!provider) { showModal('⚠️','Error','Could not get wallet provider.',''); return; }
    try {
        st('wheel-status','Connecting…','warn');
        let resp;
        if (typeof provider.connect === 'function') {
            resp = await provider.connect();
        }
        const pk = resp?.publicKey || provider.publicKey;
        if (!pk) throw new Error('No public key returned.');

        ST.pubkey       = pk.toString();
        ST.connected    = true;
        ST.providerName = walletDef.name;

        $('wallet-dot').classList.add('on');
        tx('wallet-label', `${walletDef.icon} ${ST.pubkey.slice(0,4)}…${ST.pubkey.slice(-4)}`);
        $('btn-connect').textContent = 'Wallet';
        $('btn-connect').classList.remove('dc');
        $('balance-bar').classList.add('show');

        await Promise.all([refreshBalances(), loadCasinoInfo(), fetchPrices()]);
        ST.balTimer = setInterval(refreshBalances, 8000);
        enableBtns(true);
        stAll('Ready — QHUBX only','ok');

        provider.on?.('accountChanged', pk2 => {
            if (pk2) { ST.pubkey = pk2.toString(); refreshBalances(); }
            else disconnectWallet();
        });
        provider.on?.('disconnect', disconnectWallet);

    } catch(e) {
        stAll('Connection failed: ' + (e.message||'cancelled'),'err');
    }
}

function disconnectWallet() {
    try {
        const w = KNOWN_WALLETS.find(w => w.name === ST.providerName);
        if (w) w.get()?.disconnect?.();
    } catch(_) {}
    closeWalletMenu();
    ST.connected=false; ST.pubkey=null; ST.providerName=null;
    ST.qhubxBal=0; ST.solBal=0;
    clearInterval(ST.balTimer);
    $('wallet-dot').classList.remove('on');
    tx('wallet-label','Connect Wallet');
    $('btn-connect').textContent='Connect';
    $('btn-connect').classList.remove('dc');
    $('balance-bar').classList.remove('show');
    enableBtns(false);
    stAll('Connect wallet to play','');
}

function enableBtns(on) {
    ['wheel-btn','bj-btn','rl-btn','sl-btn'].forEach(id => {
        const el=$(id); if(el) el.disabled=!on;
    });
}
function stAll(msg,cls){ ['wheel-status','bj-status','rl-status','sl-status'].forEach(id=>st(id,msg,cls)); }

/* ════════════════════════════════════════════════════════════
   BALANCE (via server proxy — avoids 403 mainnet-beta)
════════════════════════════════════════════════════════════ */
async function refreshBalances() {
    if (!ST.connected || !ST.pubkey) return;
    try {
        const r = await fetch(`${CFG.SERVER}/api/balance?wallet=${ST.pubkey}`);
        if (!r.ok) return;
        const d = await r.json();
        ST.qhubxBal = d.qhubx || 0;
        ST.solBal   = d.sol   || 0;
        tx('bal-qhubx', ST.qhubxBal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
        tx('bal-sol',   ST.solBal.toFixed(4));
        tx('bal-qhubx-usd', ST.qhubxPrice ? `≈ $${(ST.qhubxBal*ST.qhubxPrice).toFixed(4)}` : '≈ $—');
        tx('bal-sol-usd',   ST.solPrice   ? `≈ $${(ST.solBal*ST.solPrice).toFixed(2)}`      : '≈ $—');
        upPrev();
        if (ST.connected) showConnectedPanel();
    } catch(_) {}
}

/* ════════════════════════════════════════════════════════════
   PRICES (server proxy)
════════════════════════════════════════════════════════════ */
async function fetchPrices() {
    let d = null;

    try {
        const r = await fetch(`${CFG.SERVER}/api/prices`);
        if (r.ok) {
            const json = await r.json();
            if (json && (json.sol != null || json.btc != null || json.eth != null || json.qhubx != null)) {
                d = json;
            }
        }
    } catch (err) {
        console.warn('Server price fetch failed:', err?.message || err);
    }

    if (!d) {
        try {
            const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
            if (r.ok) {
                const json = await r.json();
                d = {
                    sol: json.solana?.usd ?? null,
                    solChange: json.solana?.usd_24h_change ?? null,
                    btc: json.bitcoin?.usd ?? null,
                    eth: json.ethereum?.usd ?? null,
                    qhubx: json.solana?.usd != null ? json.solana.usd * CFG.QHUBX_SOL_RATE : null,
                };
            }
        } catch (err) {
            console.warn('CoinGecko fallback failed:', err?.message || err);
        }
    }

    if (!d) {
        setTimeout(fetchPrices, 90_000);
        return;
    }

    ST.solPrice   = d.sol   || null;
    ST.qhubxPrice = d.qhubx || null;

    if (d.sol != null) {
        tx('tk-sol', `$${d.sol.toFixed(2)}`);
        if (d.solChange != null) {
            const el = $('tk-sol-ch');
            if (el) {
                el.textContent = `${d.solChange >= 0 ? '+' : ''}${d.solChange.toFixed(1)}%`;
                el.className = `tk-ch ${d.solChange >= 0 ? 'up' : 'dn'}`;
            }
        }
    }
    if (d.qhubx != null) {
        tx('tk-qhubx', `$${d.qhubx < 0.01 ? d.qhubx.toFixed(6) : d.qhubx.toFixed(4)}`);
    }
    if (d.btc != null) tx('tk-btc', `$${(d.btc/1000).toFixed(1)}k`);
    if (d.eth != null) tx('tk-eth', `$${d.eth.toFixed(3)}`);

    tx('bal-qhubx-usd', ST.qhubxPrice ? `≈ $${(ST.qhubxBal*ST.qhubxPrice).toFixed(4)}` : '≈ $—');
    tx('bal-sol-usd',   ST.solPrice   ? `≈ $${(ST.solBal*ST.solPrice).toFixed(2)}`      : '≈ $—');

    setTimeout(fetchPrices, 90_000);
}

/* ════════════════════════════════════════════════════════════
   CASINO INFO
════════════════════════════════════════════════════════════ */
async function loadCasinoInfo() {
    try {
        const r = await fetch(`${CFG.SERVER}/casino-info`);
        if (!r.ok) return;
        const d = await r.json();
        ST.casinoWallet = d.casinoWallet;
        ST.prizePool    = d.pool || 0;
        ST.jackpotPct   = d.jackpotPct || 0;
        updateStats(d);
    } catch(_) {}
    setTimeout(loadCasinoInfo, 15_000);
}
function updateStats(d) {
    const pool = d?.pool ?? ST.prizePool;
    const pct  = d?.jackpotPct ?? ST.jackpotPct;
    tx('stat-pool',   pool>0 ? Math.round(pool).toLocaleString() : '—');
    tx('hs-pool',     pool>0 ? Math.round(pool).toLocaleString() : '0');
    tx('hs-games',    d?.games ? d.games.toLocaleString() : '0');
    tx('hs-jackpot',  '50K');
    $('jackpot-fill').style.width = `${Math.min(pct,100)}%`;
    tx('jackpot-pct', `${Math.round(pct)}%`);
}

/* ════════════════════════════════════════════════════════════
   BET HELPERS
════════════════════════════════════════════════════════════ */
const BIDS = { wheel:'wheel-amt', bj:'bj-amt', rl:'rl-amt', sl:'sl-amt' };
function getBet(g) { return parseFloat($(BIDS[g])?.value||0); }
function sBet(g,v) {
    const e=$(BIDS[g]); if(!e) return;
    e.value = Math.max(CFG.MIN_BET, Math.min(CFG.MAX_BET, v));
    upPrev();
}
function adjBet(g,f) {
    const e=$(BIDS[g]); if(!e) return;
    sBet(g, parseFloat(e.value||CFG.MIN_BET)*f);
}
function upPrev() {
    const wb=getBet('wheel'); tx('w-x2', wb>0?`${(wb*2).toLocaleString()} QHUBX`:'—');
    const bb=getBet('bj');    tx('bj-dbl-prev', bb>0?`${(bb*4).toLocaleString()} QHUBX`:'—');
    const sb=getBet('sl');
    tx('sl-max',  sb>0?`${(sb*500).toLocaleString()} QHUBX`:'—');
    tx('sl-diam', sb>0?`${(sb*100).toLocaleString()} QHUBX`:'—');
    tx('sl-star', sb>0?`${(sb*50).toLocaleString()} QHUBX`:'—');
    updateRlPot();
}
function valBet(g) {
    const bet=getBet(g);
    const smap={wheel:'wheel-status',bj:'bj-status',rl:'rl-status',sl:'sl-status'};
    if (!ST.connected) { st(smap[g],'Connect wallet to play',''); return false; }
    if (bet<CFG.MIN_BET) { st(smap[g],`Min: ${CFG.MIN_BET.toLocaleString()} QHUBX`,'err'); return false; }
    if (bet>CFG.MAX_BET) { st(smap[g],`Max: ${CFG.MAX_BET.toLocaleString()} QHUBX`,'err'); return false; }
    if (bet>ST.qhubxBal) { st(smap[g],'Insufficient QHUBX balance','err'); return false; }
    return true;
}

/* ════════════════════════════════════════════════════════════
   QHUBX SPL TRANSFER (Phantom/any wallet signs)
════════════════════════════════════════════════════════════ */
async function findATA(owner, mint) {
    const [ata] = await PublicKey.findProgramAddress(
        [owner.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()],
        ASSOC_PROG
    );
    return ata;
}

function buildTransferIx(fromATA, toATA, authority, rawAmount) {
    const data = new Uint8Array(9); data[0]=3;
    const v=new DataView(data.buffer,1);
    let r=BigInt(Math.floor(rawAmount));
    for(let i=0;i<8;i++){v.setUint8(i,Number(r&0xffn));r>>=8n;}
    return new TransactionInstruction({
        programId:TOKEN_PROG,
        keys:[{pubkey:fromATA,isSigner:false,isWritable:true},{pubkey:toATA,isSigner:false,isWritable:true},{pubkey:authority,isSigner:true,isWritable:false}],
        data: typeof Buffer!=='undefined' ? Buffer.from(data) : data,
    });
}

async function sendQHUBX(amountQHUBX) {
    if (!ST.casinoWallet) throw new Error('Casino wallet not loaded. Is the server running at localhost:3000?');
    if (CFG.QHUBX_MINT==='REPLACE_WITH_QHUBX_MINT_ADDRESS') throw new Error('QHUBX mint address not configured in script.js.');

    const walletDef = KNOWN_WALLETS.find(w=>w.name===ST.providerName);
    if (!walletDef) throw new Error('Wallet provider not found.');
    const provider  = walletDef.get();
    const playerPk  = new PublicKey(ST.pubkey);
    const casinoPk  = new PublicKey(ST.casinoWallet);
    const mintPk    = new PublicKey(CFG.QHUBX_MINT);
    const raw       = BigInt(Math.round(amountQHUBX * Math.pow(10, CFG.QHUBX_DECIMALS)));

    const playerATA = await findATA(playerPk, mintPk);
    const casinoATA = await findATA(casinoPk, mintPk);

    // Use RPC just for blockhash (server proxied conn)
    const conn = new Connection('https://api.mainnet-beta.solana.com','confirmed');
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');

    const tx2 = new Transaction({ recentBlockhash:blockhash, feePayer:playerPk });
    tx2.add(buildTransferIx(playerATA, casinoATA, playerPk, raw));

    const signed = await provider.signTransaction(tx2);
    const rawArr = Array.from(signed.serialize());

    const res = await fetch(`${CFG.SERVER}/api/send-tx`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ tx: rawArr }),
    });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error||'Send failed'); }
    const data = await res.json();
    return data.signature;
}

/* ════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════ */
function openView(name) {
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const el = $(`view-${name}`);
    if (el) el.classList.add('active');
    if (name==='wheel')    initDrum();
    if (name==='slots')    initReels();
    if (name==='roulette') drawRL();
    upPrev();
    stopArcadeAnimations();
    if (name==='lobby') startLobbyAnimations();
}

/* ════════════════════════════════════════════════════════════
   LOBBY ANIMATIONS
════════════════════════════════════════════════════════════ */
let animFrames = {};

function startLobbyAnimations() {
    animHeroParticles();
    animGameCards();
    animArcadeLeft();
    animArcadeRight();
    animNetworkNodes();
}
function stopArcadeAnimations() {
    Object.values(animFrames).forEach(id => cancelAnimationFrame(id));
    animFrames = {};
}

/* ── HERO PARTICLE FIELD ── */
function animHeroParticles() {
    const c = $('hero-canvas'); if(!c) return;
    const ctx = c.getContext('2d');
    const W = () => c.width  = c.offsetWidth;
    const H = () => c.height = c.offsetHeight;
    W(); H();
    const resize = () => { W(); H(); };
    window.addEventListener('resize', resize);

    const particles = Array.from({length:60}, () => ({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        vx: (Math.random()-.5)*.4,
        vy: (Math.random()-.5)*.3,
        r: Math.random()*2+.5,
        a: Math.random(),
        pulse: Math.random()*Math.PI*2,
        col: Math.random()>.6 ? '#00ffe0' : Math.random()>.5 ? '#f5c842' : '#bf00ff',
    }));

    function tick() {
        animFrames.hero = requestAnimationFrame(tick);
        ctx.clearRect(0,0,c.width,c.height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.pulse += .02;
            if (p.x<0) p.x=c.width; if (p.x>c.width) p.x=0;
            if (p.y<0) p.y=c.height; if (p.y>c.height) p.y=0;
            const alpha = (.3 + .5*Math.sin(p.pulse)) * p.a;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
            ctx.fillStyle = p.col + Math.floor(alpha*255).toString(16).padStart(2,'0');
            ctx.fill();
            // connect nearby
            particles.forEach(q => {
                const dx=p.x-q.x, dy=p.y-q.y, d=Math.sqrt(dx*dx+dy*dy);
                if (d<60) {
                    ctx.beginPath();
                    ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y);
                    ctx.strokeStyle = p.col + Math.floor(alpha*(1-d/60)*.3*255).toString(16).padStart(2,'0');
                    ctx.lineWidth = .4;
                    ctx.stroke();
                }
            });
        });
    }
    animFrames.hero = requestAnimationFrame(tick);
}

/* ── NETWORK NODES ANIMATION ── */
function animNetworkNodes() {
    const c = $('network-canvas'); if(!c) return;
    const ctx = c.getContext('2d');
    const W = () => c.width  = c.offsetWidth;
    const H = () => c.height = c.offsetHeight;
    W(); H();
    const resize = () => { W(); H(); };
    window.addEventListener('resize', resize);

    // Blanco intenso añadido en lugar del amarillo
    const colors = ['#00FFA3', '#9945FF', '#FFFFFF', '#DC1FFF']; 
    const nodes = Array.from({length:50}, () => ({ 
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        // Velocidad constante y un poco más rápida que el original
        vx: (Math.random() > 0.5 ? 1 : -1) * 5, 
        vy: (Math.random() > 0.5 ? 1 : -1) * 3,
        r: Math.random() * 12 + 2,
        col: colors[Math.floor(Math.random() * colors.length)],
        glow: Math.random() * Math.PI * 2,
    }));

    function tick() {
        if (typeof animFrames !== 'undefined') {
            animFrames.network = requestAnimationFrame(tick);
        } else {
            requestAnimationFrame(tick);
        }
        
        ctx.clearRect(0, 0, c.width, c.height);
        
        nodes.forEach(n => {
            n.x += n.vx;
            n.y += n.vy;
            n.glow += 0.15;

            // Rebote Horizontal (Velocidad constante)
            if (n.x <= n.r || n.x >= c.width - n.r) {
                n.vx = -n.vx; // Inversión simple, sin acelerar
                n.x = Math.max(n.r, Math.min(c.width - n.r, n.x));
            }

            // Rebote Vertical (Velocidad constante)
            if (n.y <= n.r || n.y >= c.height - n.r) {
                n.vy = -n.vy; // Inversión simple
                n.y = Math.max(n.r, Math.min(c.height - n.r, n.y));
            }

            // Efecto de Parpadeo y Brillo para las blancas
            let opacity = 1;
            if (n.col === '#FFFFFF') {
                // Parpadeo aleatorio rápido
               
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#FFFFFF";
            }

            // 1. Dibujar Resplandor (Glow)
            const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.5);
            gradient.addColorStop(0, n.col + Math.floor(opacity * 100).toString(16).padStart(2,'0'));
            gradient.addColorStop(1, n.col + '00');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // 2. Dibujar Núcleo (Bola principal)
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = n.col + Math.floor(opacity * 255).toString(16).padStart(2,'0');
            ctx.fill();

            // 3. Capa de Pulso (Pulsing effect)
            const pulse = 0.5 + 0.5 * Math.sin(n.glow);
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
            ctx.fillStyle = n.col + '33'; // Opacidad suave
            ctx.fill();
            
            // Reset de sombras para que no afecte a los otros colores
            ctx.shadowBlur = 0;
        });
    }
    requestAnimationFrame(tick);
}

/* ── GAME CARD CANVAS PREVIEWS ── */
function animGameCards() {
    animWheelCard();
    animBJCard();
    animRlCard();
    animSlCard();
}

function animWheelCard() {
    const c = $('gc-wheel-canvas'); if(!c) return;
    const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    const cx=W/2, cy=H/2, r=48;
    let angle=0;
    const segs=[
        {color:'#ff2244',label:'×0'},{color:'#f5c842',label:'×1'},
        {color:'#00e676',label:'×2'},{color:'#ff2244',label:'×0'},
        {color:'#f5c842',label:'×1'},{color:'#bf00ff',label:'AIR'},
        {color:'#ff2244',label:'×0'},{color:'#f5c842',label:'💎'},
    ];
    const arc=Math.PI*2/segs.length;
    function draw(){
        animFrames.wcard=requestAnimationFrame(draw);
        angle+=.008;
        ctx.clearRect(0,0,W,H);
        segs.forEach((s,i)=>{
            const st=angle+i*arc-Math.PI/2;
            ctx.beginPath(); ctx.moveTo(cx,cy);
            ctx.arc(cx,cy,r,st,st+arc); ctx.closePath();
            ctx.fillStyle=s.color+'66'; ctx.fill();
            ctx.strokeStyle=s.color+'99'; ctx.lineWidth=1; ctx.stroke();
            ctx.save(); ctx.translate(cx,cy); ctx.rotate(st+arc/2);
            ctx.fillStyle='#fff'; ctx.font='bold 8px Orbitron,monospace';
            ctx.textAlign='center'; ctx.fillText(s.label, r*.65, 3);
            ctx.restore();
        });
        ctx.beginPath(); ctx.arc(cx,cy,10,0,Math.PI*2);
        ctx.fillStyle='#060810'; ctx.fill();
        ctx.strokeStyle='rgba(0,255,224,.7)'; ctx.lineWidth=1.5; ctx.stroke();
        ctx.fillStyle='rgba(0,255,224,.9)'; ctx.font='bold 8px Orbitron';
        ctx.textAlign='center'; ctx.fillText('S',cx,cy+3);
        // pointer
        ctx.beginPath(); ctx.moveTo(cx,cy-r-2); ctx.lineTo(cx-5,cy-r+10); ctx.lineTo(cx+5,cy-r+10);
        ctx.closePath(); ctx.fillStyle='#00ffe0'; ctx.fill();
    }
    animFrames.wcard=requestAnimationFrame(draw);
}

function animBJCard() {
    const c=$('gc-bj-canvas'); if(!c) return;
    const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    const cards=[
        {r:'A',s:'♠',color:'#cee8e4',x:22,y:20,rot:-.15},
        {r:'K',s:'♥',color:'#ff7096',x:65,y:18,rot:.08},
        {r:'Q',s:'♦',color:'#ff7096',x:W-25,y:22,rot:.18},
    ];
    let t=0;
    function draw(){
        animFrames.bjcard=requestAnimationFrame(draw);
        t+=.02;
        ctx.clearRect(0,0,W,H);
        // table felt
        const grad=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,80);
        grad.addColorStop(0,'rgba(10,40,24,.9)'); grad.addColorStop(1,'rgba(5,12,20,.6)');
        ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
        ctx.strokeStyle='rgba(0,200,100,.2)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.ellipse(W/2,H/2,W/2-10,H/2-12,0,0,Math.PI*2); ctx.stroke();

        cards.forEach((card,i)=>{
            const float=Math.sin(t+i*1.2)*.8;
            ctx.save();
            ctx.translate(card.x+float*.5, card.y+float);
            ctx.rotate(card.rot+Math.sin(t*.5+i)*.02);
            // card
            ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=8;
            ctx.fillStyle='#0d1220'; ctx.strokeStyle='rgba(245,200,66,.4)'; ctx.lineWidth=1;
            roundRect(ctx,0,0,42,58,5); ctx.fill(); ctx.stroke();
            ctx.shadowBlur=0;
            ctx.fillStyle=card.color; ctx.font='bold 14px Orbitron,monospace';
            ctx.textAlign='left'; ctx.fillText(card.r,5,18);
            ctx.font='18px serif'; ctx.textAlign='center'; ctx.fillText(card.s,21,40);
            ctx.restore();
        });
        // 21 glow
        const glow=.5+.5*Math.sin(t*2);
        ctx.fillStyle=`rgba(245,200,66,${.4+glow*.4})`;
        ctx.font=`bold ${14+glow*2}px Orbitron,monospace`;
        ctx.textAlign='center'; ctx.fillText('21',W/2,H-8);
    }
    animFrames.bjcard=requestAnimationFrame(draw);
}

function animRlCard() {
    const c=$('gc-rl-canvas'); if(!c) return;
    const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    const cx=W/2, cy=H/2, r=46;
    const RL_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    let angle=0;
    function draw(){
        animFrames.rlcard=requestAnimationFrame(draw);
        angle+=.012;
        ctx.clearRect(0,0,W,H);
        const n=RL_ORDER.length, arc2=Math.PI*2/n;
        RL_ORDER.forEach((num,i)=>{
            const s=angle+i*arc2-Math.PI/2;
            ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,s,s+arc2); ctx.closePath();
            ctx.fillStyle=num===0?'#008000':RED.has(num)?'rgba(192,57,43,.8)':'rgba(26,26,26,.8)';
            ctx.fill();
            ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=.5; ctx.stroke();
        });
        ctx.beginPath(); ctx.arc(cx,cy,r*.15,0,Math.PI*2);
        ctx.fillStyle='#060810'; ctx.fill();
        ctx.strokeStyle='rgba(255,34,68,.5)'; ctx.lineWidth=1.5; ctx.stroke();
    }
    animFrames.rlcard=requestAnimationFrame(draw);
}

function animSlCard() {
    const c=$('gc-sl-canvas'); if(!c) return;
    const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    const syms=['🍒','🍋','💎','7️⃣','⭐','🔔','🍊','🍇'];
    const reels=[0,1,2].map(()=>({offset:Math.random()*syms.length,speed:.06+Math.random()*.04}));
    let t=0;
    function draw(){
        animFrames.slcard=requestAnimationFrame(draw);
        t+=.016;
        ctx.clearRect(0,0,W,H);
        // machine body
        ctx.fillStyle='rgba(191,0,255,.07)';
        roundRect(ctx,10,10,W-20,H-20,8); ctx.fill();
        ctx.strokeStyle='rgba(191,0,255,.35)'; ctx.lineWidth=1; ctx.stroke();
        // reels
        const rw=28, rh=36, ry=(H-rh)/2, gap=8;
        const totalW=(rw*3+gap*2), rx=(W-totalW)/2;
        reels.forEach((reel,i)=>{
            reel.offset=(reel.offset+reel.speed)%syms.length;
            const x=rx+i*(rw+gap);
            ctx.fillStyle='rgba(0,0,0,.5)';
            roundRect(ctx,x,ry,rw,rh,4); ctx.fill();
            ctx.strokeStyle='rgba(191,0,255,.5)'; ctx.lineWidth=1; ctx.stroke();
            ctx.save(); ctx.rect(x,ry,rw,rh); ctx.clip();
            ctx.font=`${rw*.7}px serif`;
            ctx.textAlign='center';
            ctx.fillText(syms[Math.floor(reel.offset)%syms.length], x+rw/2, ry+rh*.72);
            ctx.restore();
        });
        // win line
        ctx.strokeStyle=`rgba(191,0,255,${.4+.4*Math.sin(t*4)})`;
        ctx.lineWidth=1.5;
        ctx.setLineDash([3,2]);
        ctx.beginPath(); ctx.moveTo(rx-4,H/2); ctx.lineTo(rx+totalW+4,H/2); ctx.stroke();
        ctx.setLineDash([]);
        // lights
        [20,40,60,80,100].forEach((lx,i)=>{
            const on=(Math.floor(t*4+i)%2===0);
            ctx.beginPath(); ctx.arc(lx,8,3,0,Math.PI*2);
            ctx.fillStyle=on?'#bf00ff':'rgba(191,0,255,.2)'; ctx.fill();
        });
    }
    animFrames.slcard=requestAnimationFrame(draw);
}

/* ── RETRO ARCADE ANIMATIONS (Pong left, Pac-Man right) ── */
function animArcadeLeft() {
    const c=$('arcade-left'); if(!c) return;
    c.width=200; c.height=160;
    const ctx=c.getContext('2d');
    // Classic Pong
    let ball={x:100,y:80,vx:1.8,vy:1.4},
        p1y=60, p2y=60, ph=30, pw=5, score=[0,0];
    function draw(){
        animFrames.arcL=requestAnimationFrame(draw);
        ctx.clearRect(0,0,200,160);
        ctx.fillStyle='rgba(0,255,224,.04)'; ctx.fillRect(0,0,200,160);
        // center line
        ctx.setLineDash([4,4]);
        ctx.strokeStyle='rgba(0,255,224,.15)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(100,0); ctx.lineTo(100,160); ctx.stroke();
        ctx.setLineDash([]);
        // move ball
        ball.x+=ball.vx; ball.y+=ball.vy;
        if(ball.y<5||ball.y>155) ball.vy*=-1;
        // AI paddles
        if(ball.y>p1y+ph/2) p1y=Math.min(130,p1y+2); else p1y=Math.max(0,p1y-2);
        if(ball.y>p2y+ph/2) p2y=Math.min(130,p2y+2); else p2y=Math.max(0,p2y-2);
        // bounce paddles
        if(ball.x<10+pw&&ball.y>=p1y&&ball.y<=p1y+ph){ball.vx=Math.abs(ball.vx);ball.vy+=(Math.random()-.5)*.5;}
        if(ball.x>190-pw&&ball.y>=p2y&&ball.y<=p2y+ph){ball.vx=-Math.abs(ball.vx);ball.vy+=(Math.random()-.5)*.5;}
        if(ball.x<0){score[1]++;ball.x=100;ball.y=80;ball.vx=1.8;}
        if(ball.x>200){score[0]++;ball.x=100;ball.y=80;ball.vx=-1.8;}
        // draw paddles
        ctx.fillStyle='rgba(0,255,224,.7)';
        ctx.fillRect(10,p1y,pw,ph);
        ctx.fillRect(185,p2y,pw,ph);
        // draw ball
        ctx.beginPath(); ctx.arc(ball.x,ball.y,4,0,Math.PI*2);
        ctx.fillStyle='rgba(0,255,224,.9)'; ctx.fill();
        ctx.shadowColor='#00ffe0'; ctx.shadowBlur=6; ctx.fill(); ctx.shadowBlur=0;
        // score
        ctx.fillStyle='rgba(0,255,224,.4)';
        ctx.font='bold 10px Orbitron,monospace';
        ctx.textAlign='center';
        ctx.fillText(score[0],75,15); ctx.fillText(score[1],125,15);
        // label
        ctx.fillStyle='rgba(0,255,224,.2)';
        ctx.font='7px Orbitron,monospace'; ctx.fillText('PONG',100,155);
    }
    animFrames.arcL=requestAnimationFrame(draw);
}

function animArcadeRight() {
    const c=$('arcade-right'); if(!c) return;
    c.width=200; c.height=160;
    const ctx=c.getContext('2d');
    // Simple Pac-Man maze-ish
    const dots=[]; const COLS=10, ROWS=8;
    for(let r=0;r<ROWS;r++) for(let col=0;col<COLS;col++) dots.push({x:10+col*18,y:12+r*18,eaten:false});
    let pac={x:100,y:80,dir:0,mouth:0,mdir:1,step:0};
    const dirs=[{dx:1.2,dy:0},{dx:0,dy:1.2},{dx:-1.2,dy:0},{dx:0,dy:-1.2}];
    let ghost={x:30,y:30,dx:1,dy:.5,color:'#ff2244',blink:0};
    let t=0;
    function draw(){
        animFrames.arcR=requestAnimationFrame(draw);
        t+=.05;
        ctx.clearRect(0,0,200,160);
        ctx.fillStyle='rgba(191,0,255,.04)'; ctx.fillRect(0,0,200,160);
        // dots
        dots.forEach(d=>{
            if(!d.eaten){
                ctx.beginPath(); ctx.arc(d.x,d.y,2,0,Math.PI*2);
                ctx.fillStyle='rgba(245,200,66,.5)'; ctx.fill();
            }
        });
        // move pac
        pac.step++;
        if(pac.step%60===0) pac.dir=Math.floor(Math.random()*4);
        pac.x+=dirs[pac.dir].dx; pac.y+=dirs[pac.dir].dy;
        if(pac.x<5||pac.x>195) {pac.dir=(pac.dir+2)%4;}
        if(pac.y<5||pac.y>155) {pac.dir=(pac.dir+2)%4;}
        pac.mouth+=pac.mdir*.12; if(pac.mouth>0.4||pac.mouth<0) pac.mdir*=-1;
        // eat dots
        dots.forEach(d=>{if(!d.eaten&&Math.hypot(d.x-pac.x,d.y-pac.y)<8) d.eaten=true;});
        // respawn eaten
        if(dots.every(d=>d.eaten)) dots.forEach(d=>d.eaten=false);
        // pac
        ctx.beginPath();
        ctx.moveTo(pac.x,pac.y);
        const rot=dirs[pac.dir].dx>0?0:dirs[pac.dir].dx<0?Math.PI:dirs[pac.dir].dy>0?Math.PI/2:-Math.PI/2;
        ctx.arc(pac.x,pac.y,8,rot+pac.mouth,rot+Math.PI*2-pac.mouth);
        ctx.closePath();
        ctx.fillStyle='rgba(245,200,66,.9)'; ctx.fill();
        // ghost
        ghost.x+=ghost.dx; ghost.y+=ghost.dy;
        if(ghost.x<10||ghost.x>190) ghost.dx*=-1;
        if(ghost.y<10||ghost.y>150) ghost.dy*=-1;
        ghost.blink=Math.sin(t*3);
        ctx.fillStyle=ghost.blink>.5?'rgba(255,34,68,.8)':'rgba(255,34,68,.5)';
        ctx.beginPath(); ctx.arc(ghost.x,ghost.y,7,0,Math.PI); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.rect(ghost.x-7,ghost.y,14,7); ctx.fill();
        // eyes
        ctx.fillStyle='white';
        ctx.beginPath(); ctx.arc(ghost.x-2,ghost.y-1,2,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ghost.x+3,ghost.y-1,2,0,Math.PI*2); ctx.fill();
        // label
        ctx.fillStyle='rgba(191,0,255,.2)';
        ctx.font='7px Orbitron,monospace'; ctx.textAlign='center';
        ctx.fillText('PAC-MAN',100,155);
    }
    animFrames.arcR=requestAnimationFrame(draw);
}

function roundRect(ctx,x,y,w,h,r2){
    ctx.beginPath();
    ctx.moveTo(x+r2,y); ctx.lineTo(x+w-r2,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r2);
    ctx.lineTo(x+w,y+h-r2); ctx.quadraticCurveTo(x+w,y+h,x+w-r2,y+h);
    ctx.lineTo(x+r2,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r2);
    ctx.lineTo(x,y+r2); ctx.quadraticCurveTo(x,y,x+r2,y);
    ctx.closePath();
}

/* ════════════════════════════════════════════════════════════
   FORTUNE WHEEL
════════════════════════════════════════════════════════════ */
const SLOT_H=85, REPEAT=4;
const SLOTS=[
    {type:'lose',    label:'×0',     emoji:'💀',desc:'BURNED'},
    {type:'retry',   label:'×1',     emoji:'🔄',desc:'TRY AGAIN'},
    {type:'double',  label:'×2',     emoji:'💚',desc:'DOUBLE WIN'},
    {type:'lose',    label:'×0',     emoji:'💀',desc:'BURNED'},
    {type:'retry',   label:'×1',     emoji:'🔄',desc:'TRY AGAIN'},
    {type:'airdrop', label:'AIRDROP',emoji:'🎁',desc:'QHUBX DROP'},
    {type:'lose',    label:'×0',     emoji:'💀',desc:'BURNED'},
    {type:'jackpot', label:'JACKPOT',emoji:'💎',desc:'50K QHUBX'},
];
let drumBuilt=false, drumNodes=[];

function initDrum() {
    if (drumBuilt) return;
    const strip=$('drum-strip'); if(!strip) return;
    for (let r=0;r<REPEAT;r++) SLOTS.forEach(s=>{
        const el=document.createElement('div');
        el.className=`drum-slot t-${s.type}`;
        el.innerHTML=`<span class="ds-e">${s.emoji}</span><span class="ds-l">${s.label}</span><span class="ds-d">${s.desc}</span>`;
        strip.appendChild(el); drumNodes.push(el);
    });
    const start=SLOTS.length, vis=2;
    $('drum-strip').style.transform=`translateY(${-(start-vis)*SLOT_H}px)`;
    drumBuilt=true;
}

function getDrumY(){
    const t=$('drum-strip')?.style.transform||'';
    const m=t.match(/translateY\(([-\d.]+)px\)/);
    return m?parseFloat(m[1]):0;
}

function drumTo(slotId){
    return new Promise(res=>{
        const strip=$('drum-strip');
        const setBase=SLOTS.length*2, idx=setBase+slotId, vis=2;
        const targetY=-(idx-vis)*SLOT_H, extra=SLOTS.length*SLOT_H*3, finalY=targetY-extra;
        strip.style.transition='transform 3.6s cubic-bezier(.23,1,.32,1)';
        strip.style.transform=`translateY(${finalY}px)`;
        strip.addEventListener('transitionend',()=>{
            strip.style.transition='none';
            strip.style.transform=`translateY(${targetY}px)`;
            drumNodes.forEach(n=>n.classList.remove('active'));
            if(drumNodes[idx]) drumNodes[idx].classList.add('active');
            res();
        },{once:true});
    });
}

let drumIdleOn=false, drumIdleAF=null;
function drumIdleStart(){
    drumIdleOn=true; const startY=getDrumY(); let el=0;
    function t(){
        if(!drumIdleOn) return;
        el+=16; const off=(el/1000)*3*SLOT_H;
        $('drum-strip').style.transition='none';
        $('drum-strip').style.transform=`translateY(${startY-off}px)`;
        drumIdleAF=requestAnimationFrame(t);
    }
    drumIdleAF=requestAnimationFrame(t);
}
function drumIdleStop(){
    drumIdleOn=false;
    if(drumIdleAF) cancelAnimationFrame(drumIdleAF);
}

async function spinWheel(){
    if(!valBet('wheel')||ST.busy) return;
    const bet=getBet('wheel'); ST.busy=true;
    $('wheel-btn').disabled=true;
    st('wheel-status','Requesting game…','warn');
    try {
        const req=await fetch(`${CFG.SERVER}/request-game`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:ST.pubkey,amount:bet,game:'wheel'})});
        if(!req.ok){const e=await req.json();throw new Error(e.error);}
        const {nonce}=await req.json();
        GAME.wheelNonce=nonce;
        st('wheel-status','Approve in '+ST.providerName+'…','warn');
        const sig=await sendQHUBX(bet);
        st('wheel-status','Confirmed — spinning!','ok');
        drumIdleStart();
        const proc=await fetch(`${CFG.SERVER}/process-bet`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:sig,nonce})});
        if(!proc.ok){const e=await proc.json();throw new Error(e.error);}
        const d=await proc.json();
        drumIdleStop();
        await drumTo(d.slot.id);
        if(d.slot.type==='retry'&&d.retrySlot){await sleep(800);await drumTo(d.retrySlot.id);}
        showWheelRes(d); updateStats(d);
        addFeedItem('Fortune Wheel',bet,d);
        setTimeout(refreshBalances,3000);
    } catch(e){ drumIdleStop(); st('wheel-status',e.message,'err'); setRB('wheel-result','⚠️','Error',e.message.slice(0,50),''); }
    ST.busy=false; $('wheel-btn').disabled=false;
}

function showWheelRes(d){
    const final=(d.slot.type==='retry'&&d.retrySlot)?d.retrySlot:d.slot;
    const maps={
        lose:   {icon:'💀',main:'BURNED',sub:'Lost to the casino',bc:'var(--c-red)',conf:'fire'},
        retry:  {icon:'🔄',main:'RETRY',sub:'Bet refunded — no win no loss',bc:'var(--c-gold)',conf:null},
        double: {icon:'💚',main:`+${((d.payout?.amount||d.retryPayout?.amount)||0).toLocaleString()} QHUBX`,sub:'×2 DOUBLE WIN!',bc:'var(--c-green)',conf:'win'},
        airdrop:{icon:'🎁',main:'QHUBX AIRDROP!',sub:`${(d.payout?.amount||d.retryPayout?.amount||0).toLocaleString()} QHUBX sent`,bc:'var(--c-purple)',conf:'win'},
        jackpot:{icon:'💎',main:'JACKPOT!',sub:'50,000 QHUBX sent!',bc:'var(--c-gold)',conf:'jackpot'},
    };
    const m=maps[final.type]||maps.lose;
    setRB('wheel-result',m.icon,m.main,m.sub,m.bc);
    st('wheel-status', final.type==='lose'?'Better luck next time!':final.type==='retry'?'Bet refunded.':'Win! Payout sent.', final.type==='lose'?'err':'ok');
    if(m.conf) confetti(m.conf);
    if(['double','airdrop','jackpot'].includes(final.type)){
        const amt=d.payout?.amount||d.retryPayout?.amount||0;
        showModal(m.icon,m.main,`${amt.toLocaleString()} QHUBX sent to your wallet!`,d.payout?.signature||'');
    }
}
function setRB(id,icon,main,sub,bc){
    const el=$(id); if(!el) return;
    el.innerHTML=`<div class="rb-icon">${icon}</div><div class="rb-main">${main}</div><div class="rb-sub">${sub}</div>`;
    if(bc) el.style.borderColor=bc;
}

/* ════════════════════════════════════════════════════════════
   BLACKJACK
════════════════════════════════════════════════════════════ */
const SC={'♠':false,'♥':true,'♦':true,'♣':false};
function mkCard(r,s,back=false){
    const el=document.createElement('div');
    el.className=`pcard ${back?'back-c':SC[s]?'red-c':'black-c'} fi`;
    el.innerHTML=back?'<span class="pc-r">?</span>':`<span class="pc-r">${r}</span><span class="pc-s">${s}</span>`;
    return el;
}
function renderCards(id,cards,hideIdx=-1){
    const el=$(id); if(!el) return; el.innerHTML='';
    cards.forEach((c,i)=>el.appendChild(mkCard(c.r,c.s,i===hideIdx)));
}
function bjVal(id,v){
    const el=$(id); if(!el) return;
    el.textContent=v?`(${v})`:'';
    el.style.color=v>21?'var(--c-red)':v===21?'var(--c-gold)':'var(--c-muted)';
}
async function dealBJ(){
    if(!valBet('bj')||ST.busy||GAME.bjActive) return;
    const bet=getBet('bj'); ST.busy=true; GAME.bjActive=true;
    $('bj-btn').disabled=true; $('bj-acts').style.display='none';
    $('bj-banner').className='bj-ban'; $('bj-banner').textContent='';
    $('bj-pc').innerHTML=''; $('bj-dc').innerHTML='';
    bjVal('bj-pv',''); bjVal('bj-dv','');
    st('bj-status','Requesting game…','warn');
    try {
        const req=await fetch(`${CFG.SERVER}/request-game`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:ST.pubkey,amount:bet,game:'blackjack'})});
        if(!req.ok){const e=await req.json();throw new Error(e.error);}
        const {nonce}=await req.json();
        GAME.bjNonce=nonce; GAME.bjBet=bet; GAME.bjDoubled=false;
        st('bj-status','Approve in '+ST.providerName+'…','warn');
        const sig=await sendQHUBX(bet);
        st('bj-status','Dealing…','warn');
        const res=await fetch(`${CFG.SERVER}/blackjack/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:sig,nonce})});
        if(!res.ok){const e=await res.json();throw new Error(e.error);}
        const d=await res.json();
        renderCards('bj-pc',d.playerCards);
        if(d.result){
            renderCards('bj-dc',d.dealerCards);
            bjVal('bj-pv',d.playerVal); bjVal('bj-dv',d.dealerVal);
            showBJBanner(d); GAME.bjActive=false; GAME.bjGameId=null;
        } else {
            GAME.bjGameId=d.gameId;
            renderCards('bj-dc',[d.dealerUpCard]);
            bjVal('bj-pv',d.playerVal); bjVal('bj-dv',d.dealerUpVal);
            $('bj-dbl').disabled=!d.canDouble;
            $('bj-acts').style.display='flex';
            st('bj-status','Hit, Stand, or Double?','warn');
        }
        updateStats(d); addFeedItem('Blackjack',bet,d);
        setTimeout(refreshBalances,3000);
    } catch(e){ st('bj-status',e.message,'err'); GAME.bjActive=false; }
    ST.busy=false; if(!GAME.bjActive) $('bj-btn').disabled=false;
}
async function bjAct(action){
    if(!GAME.bjGameId||!GAME.bjActive) return;
    ST.busy=true; $('bj-acts').style.display='none';
    st('bj-status',`${action.toUpperCase()}…`,'warn');
    try {
        if(action==='double'){
            st('bj-status','Approve double bet in '+ST.providerName+'…','warn');
            await sendQHUBX(GAME.bjBet); GAME.bjDoubled=true;
        }
        const res=await fetch(`${CFG.SERVER}/blackjack/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:GAME.bjGameId,action})});
        if(!res.ok){const e=await res.json();throw new Error(e.error);}
        const d=await res.json();
        renderCards('bj-pc',d.playerCards);
        bjVal('bj-pv',d.playerVal);
        if(d.result){
            if(d.dealerCards) renderCards('bj-dc',d.dealerCards);
            if(d.dealerVal)   bjVal('bj-dv',d.dealerVal);
            showBJBanner(d); GAME.bjActive=false; GAME.bjGameId=null;
            updateStats(d); addFeedItem('Blackjack',GAME.bjDoubled?GAME.bjBet*2:GAME.bjBet,d);
            setTimeout(refreshBalances,3000);
        } else {
            $('bj-dbl').disabled=true;
            $('bj-acts').style.display='flex';
            st('bj-status','Hit or Stand?','warn');
        }
    } catch(e){ st('bj-status',e.message,'err'); if(GAME.bjGameId) $('bj-acts').style.display='flex'; }
    ST.busy=false; if(!GAME.bjActive) $('bj-btn').disabled=false;
}
function showBJBanner(d){
    const eff=GAME.bjDoubled?GAME.bjBet*2:GAME.bjBet;
    const maps={
        blackjack:{cls:'bj',txt:`🃏 BLACKJACK! +${(d.payout?.amount||0).toLocaleString()} QHUBX`,ok:true},
        win:      {cls:'win',txt:`✅ WIN! +${(d.payout?.amount||0).toLocaleString()} QHUBX`,ok:true},
        loss:     {cls:'loss',txt:'❌ DEALER WINS',ok:false},
        loss_pool:{cls:'loss',txt:'❌ DEALER WINS',ok:false},
        bust:     {cls:'loss',txt:'💥 BUST! Over 21',ok:false},
        push:     {cls:'push',txt:'🤝 PUSH — Bet returned',ok:false},
    };
    const m=maps[d.result]||maps.loss;
    const ban=$('bj-banner'); ban.className=`bj-ban ${m.cls}`; ban.textContent=m.txt;
    st('bj-status', m.ok?'Win! Payout sent.':d.result==='push'?'Bet returned.':'Lost.', m.ok?'ok':'err');
    if(m.ok&&d.result!=='push') confetti('win');
    if(d.result==='blackjack') showModal('🃏','BLACKJACK!',`3:2 payout — ${(d.payout?.amount||0).toLocaleString()} QHUBX sent!`,d.payout?.signature||'');
}

/* ════════════════════════════════════════════════════════════
   EUROPEAN ROULETTE
════════════════════════════════════════════════════════════ */
const RL_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RL_RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const numSets={
    color_red:RL_ORDER.filter(n=>n!==0&&RL_RED.has(n)),
    color_black:RL_ORDER.filter(n=>n!==0&&!RL_RED.has(n)),
    parity_even:RL_ORDER.filter(n=>n!==0&&n%2===0),
    parity_odd:RL_ORDER.filter(n=>n!==0&&n%2!==0),
    half_low:RL_ORDER.filter(n=>n>=1&&n<=18),
    half_high:RL_ORDER.filter(n=>n>=19&&n<=36),
    dozen_1:RL_ORDER.filter(n=>n>=1&&n<=12),
    dozen_2:RL_ORDER.filter(n=>n>=13&&n<=24),
    dozen_3:RL_ORDER.filter(n=>n>=25&&n<=36),
};

let rlAngle=0, rlSpinning=false;

function drawRL(hl=-1, ang=0){
    const canvas=$('rl-canvas'); if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    const cx=W/2, cy=H/2, r=Math.min(cx,cy)-6;
    ctx.clearRect(0,0,W,H);
    const n=RL_ORDER.length, arc=Math.PI*2/n;
    RL_ORDER.forEach((num,i)=>{
        const s=ang+i*arc-Math.PI/2;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,s,s+arc); ctx.closePath();
        const isHl=num===hl;
        ctx.fillStyle=isHl?'#ffd700':num===0?'#008000':RL_RED.has(num)?'#c0392b':'#1a1a1a';
        ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=.5; ctx.stroke();
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(s+arc/2);
        ctx.textAlign='center';
        ctx.font=`bold ${r<110?8:9}px Orbitron,monospace`;
        ctx.fillStyle=isHl?'#000':'#fff';
        ctx.fillText(num.toString(), r*.73, 4);
        ctx.restore();
    });
    // outer ring
    ctx.beginPath(); ctx.arc(cx,cy,r+4,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,34,68,.5)'; ctx.lineWidth=2; ctx.stroke();
    // center
    ctx.beginPath(); ctx.arc(cx,cy,r*.12,0,Math.PI*2);
    ctx.fillStyle='#060810'; ctx.fill();
    ctx.strokeStyle='rgba(255,34,68,.5)'; ctx.lineWidth=1.5; ctx.stroke();
    // pointer
    ctx.beginPath(); ctx.moveTo(cx,cy-r-5); ctx.lineTo(cx-5,cy-r+11); ctx.lineTo(cx+5,cy-r+11);
    ctx.closePath(); ctx.fillStyle='var(--c-teal)'; ctx.fill();
}

function setRlBet(type,detail){
    document.querySelectorAll('.rbt').forEach(b=>b.classList.remove('active'));
    const btns=document.querySelectorAll('.rbt');
    btns.forEach(b=>{
        const t=b.getAttribute('onclick')||'';
        if(t.includes(`'${type}','${detail}'`)||t.includes(`"${type}","${detail}"`)) b.classList.add('active');
    });
    GAME.rlBetType=type; GAME.rlBetDetail=detail;
    if(type==='straight'){
        const n=parseInt(detail);
        GAME.rlBetNums=(!isNaN(n)&&n>=0&&n<=36)?[n]:[];
    } else {
        GAME.rlBetNums=numSets[`${type}_${detail}`]||[];
    }
    const labels={color:'Color (1:1)',parity:'Even/Odd (1:1)',half:'Half (1:1)',dozen:'Dozen (2:1)',straight:`#${detail} Straight (35:1)`};
    const el=$('rl-bd'); if(el) el.textContent=labels[type]||type;
    updateRlPot();
}

function updateRlPot(){
    const bet=getBet('rl');
    const pm={straight:35,dozen:2,half:1,color:1,parity:1};
    const mult=pm[GAME.rlBetType]||1;
    const el=$('rl-pot'); if(el) el.textContent=bet>0?`${(bet*mult).toLocaleString()} QHUBX`:'—';
}

async function spinRL(){
    if(!valBet('rl')||ST.busy||rlSpinning) return;
    if(!GAME.rlBetNums.length){st('rl-status','Select a bet type first','err');return;}
    const bet=getBet('rl'); ST.busy=true; rlSpinning=true;
    $('rl-btn').disabled=true;
    st('rl-status','Requesting game…','warn');
    try {
        const req=await fetch(`${CFG.SERVER}/request-game`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:ST.pubkey,amount:bet,game:'roulette'})});
        if(!req.ok){const e=await req.json();throw new Error(e.error);}
        const {nonce}=await req.json();
        GAME.rlNonce=nonce;
        st('rl-status','Approve in '+ST.providerName+'…','warn');
        const sig=await sendQHUBX(bet);
        st('rl-status','Spinning wheel…','warn');
        // animate
        let ang=0; const duration=3800, start=performance.now();
        function animSpin(now){
            const t=Math.min((now-start)/duration,1);
            const ease=1-Math.pow(1-t,3);
            ang=ease*Math.PI*16; // ~8 full rotations
            drawRL(-1,ang);
            if(t<1) requestAnimationFrame(animSpin);
        }
        requestAnimationFrame(animSpin);
        const proc=await fetch(`${CFG.SERVER}/process-bet`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:sig,nonce,betType:GAME.rlBetType,betNumbers:GAME.rlBetNums})});
        if(!proc.ok){const e=await proc.json();throw new Error(e.error);}
        const d=await proc.json();
        await sleep(Math.max(0, duration-(performance.now()-start)));
        const wi=RL_ORDER.indexOf(d.number);
        const arcS=Math.PI*2/RL_ORDER.length;
        drawRL(d.number,(ang%(Math.PI*2)+wi*arcS+Math.PI/2)%(Math.PI*2));
        showRlRes(d,bet); updateStats(d);
        addFeedItem('Roulette',bet,d);
        setTimeout(refreshBalances,3000);
    } catch(e){ st('rl-status',e.message,'err'); }
    ST.busy=false; rlSpinning=false; $('rl-btn').disabled=false;
}
function showRlRes(d,bet){
    const colIcon={red:'🔴',black:'⚫',green:'🟢'}[d.color]||'🎯';
    const rb=$('rl-result'); if(!rb) return;
    if(d.win){
        const pay=d.payout?.amount||0;
        rb.innerHTML=`<div class="rb-icon">${colIcon}</div><div class="rb-main" style="color:var(--c-green)">WIN! +${pay.toLocaleString()} QHUBX</div><div class="rb-sub">Number ${d.number} · ${d.color.toUpperCase()}</div>`;
        rb.style.borderColor='var(--c-green)';
        st('rl-status',`Number ${d.number} — Win!`,'ok');
        confetti('win');
        if(GAME.rlBetType==='straight') showModal('🎡',`Number ${d.number}!`,`Straight up win! +${pay.toLocaleString()} QHUBX`,d.payout?.signature||'');
    } else {
        rb.innerHTML=`<div class="rb-icon">${colIcon}</div><div class="rb-main" style="color:var(--c-red)">Number ${d.number}</div><div class="rb-sub">${d.color.toUpperCase()} — Your bet lost</div>`;
        rb.style.borderColor='var(--c-red)';
        st('rl-status',`Number ${d.number} — Lost`,'err');
    }
}

/* ════════════════════════════════════════════════════════════
   SLOTS
════════════════════════════════════════════════════════════ */
const SYM_LIST=['🍒','🍋','🍊','🍇','🔔','⭐','💎','7️⃣'];
let reelsBuilt=false;

function initReels(){
    if(reelsBuilt) return;
    for(let i=0;i<3;i++){
        const ri=$(`ri-${i}`); if(!ri) continue;
        ri.innerHTML='';
        for(let j=0;j<9;j++){
            const s=document.createElement('div');
            s.className='sym';
            s.textContent=SYM_LIST[Math.floor(Math.random()*SYM_LIST.length)];
            ri.appendChild(s);
        }
    }
    // Generate machine lights
    const lights=$('sl-lights');
    if(lights){
        lights.innerHTML='';
        const colors=['#ff2244','#f5c842','#00e676','#bf00ff','#00ffe0','#ff2244','#f5c842','#00e676','#bf00ff','#00ffe0'];
        colors.forEach((col,i)=>{
            const l=document.createElement('div');
            l.className='sl-light';
            l.style.background=col;
            l.style.boxShadow=`0 0 5px ${col}`;
            l.style.animationDelay=`${i*.12}s`;
            lights.appendChild(l);
        });
    }
    reelsBuilt=true;
}

function stopReel(idx, sym){
    return new Promise(res=>{
        const reel=$(`reel-${idx}`);
        const ri   =$(`ri-${idx}`);
        if(!reel||!ri){res();return;}
        reel.classList.remove('spinning');
        const syms=ri.querySelectorAll('.sym');
        if(syms[4]) syms[4].textContent=sym;
        reel.classList.add('land');
        reel.addEventListener('animationend',()=>{reel.classList.remove('land');res();},{once:true});
    });
}

async function spinSL(){
    if(!valBet('sl')||ST.busy) return;
    const bet=getBet('sl'); ST.busy=true;
    $('sl-btn').disabled=true;
    $('sl-result').style.display='none';
    st('sl-status','Requesting game…','warn');
    try {
        const req=await fetch(`${CFG.SERVER}/request-game`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet:ST.pubkey,amount:bet,game:'slots'})});
        if(!req.ok){const e=await req.json();throw new Error(e.error);}
        const {nonce}=await req.json();
        GAME.slNonce=nonce;
        st('sl-status','Approve in '+ST.providerName+'…','warn');
        const sig=await sendQHUBX(bet);
        st('sl-status','Spinning reels…','warn');
        for(let i=0;i<3;i++) $(`reel-${i}`)?.classList.add('spinning');
        const proc=await fetch(`${CFG.SERVER}/process-bet`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:sig,nonce})});
        if(!proc.ok){const e=await proc.json();throw new Error(e.error);}
        const d=await proc.json();
        for(let i=0;i<3;i++){
            await sleep(280+i*340);
            await stopReel(i,d.reels[i].emoji);
        }
        showSlRes(d,bet); updateStats(d);
        addFeedItem('Slots',bet,d);
        setTimeout(refreshBalances,3000);
    } catch(e){
        for(let i=0;i<3;i++) $(`reel-${i}`)?.classList.remove('spinning');
        st('sl-status',e.message,'err');
    }
    ST.busy=false; $('sl-btn').disabled=false;
}
function showSlRes(d,bet){
    const res=$('sl-result');
    res.style.display='flex';
    if(d.mult>0){
        const pay=d.payout?.amount||0;
        $('sl-ico').textContent='🎰';
        $('sl-main').textContent=`WIN! +${pay.toLocaleString()} QHUBX`;
        $('sl-main').style.color='var(--c-green)';
        $('sl-sub').textContent=`×${d.mult.toFixed(1)} · ${d.reels.map(r=>r.emoji).join(' ')}`;
        res.style.borderColor='var(--c-green)';
        st('sl-status',`Won ${pay.toLocaleString()} QHUBX!`,'ok');
        confetti(d.mult>=100?'jackpot':'win');
        if(d.mult>=50) showModal('🎰',`×${d.mult} WIN!`,`${pay.toLocaleString()} QHUBX sent to your wallet!`,d.payout?.signature||'');
    } else {
        $('sl-ico').textContent='💀'; $('sl-main').textContent='MISS';
        $('sl-main').style.color='var(--c-red)';
        $('sl-sub').textContent=d.reels.map(r=>r.emoji).join(' ');
        res.style.borderColor='var(--c-red)';
        st('sl-status','No match — try again','err');
    }
}

/* ════════════════════════════════════════════════════════════
   LIVE FEED
════════════════════════════════════════════════════════════ */
let feedOpen=false;
function toggleFeed(){
    feedOpen=!feedOpen;
    $('feed-sidebar').classList.toggle('open',feedOpen);
}

const gameIcons={'Fortune Wheel':'🎡','Blackjack':'🃏','Roulette':'🎡','Slots':'🎰'};

function addFeedItem(game,bet,data){
    feedTotal++;
    let isWin=false, resText='', payout=0;
    if(data.payout?.amount>0){isWin=true;payout=data.payout.amount;}
    else if(data.retryPayout?.amount>0){isWin=true;payout=data.retryPayout.amount;}
    else if(data.win){isWin=true;payout=data.payout?.amount||0;}
    else if(data.mult>0){isWin=true;payout=data.payout?.amount||0;}
    else if(data.result==='push'){isWin=false;payout=0;}

    if(isWin){ feedWins++; feedPaid+=payout; }
    resText=isWin?`+${Math.round(payout).toLocaleString()}`:`-${Math.round(bet).toLocaleString()}`;

    tx('fm-total',feedTotal.toLocaleString());
    tx('fm-paid',Math.round(feedPaid).toLocaleString());
    tx('fm-wins',feedWins.toLocaleString());

    const list=$('feed-list');
    const empty=list.querySelector('.feed-empty');
    if(empty) empty.remove();

    const addr=ST.pubkey?`${ST.pubkey.slice(0,4)}…${ST.pubkey.slice(-4)}`:'anon';
    const item=document.createElement('div');
    item.className='feed-item';
    item.innerHTML=`
        <span class="fi-icon">${gameIcons[game]||'🎰'}</span>
        <div class="fi-info">
            <div class="fi-addr">${addr}</div>
            <div class="fi-game">${game} · ${bet.toLocaleString()} QHUBX</div>
        </div>
        <div class="fi-res ${isWin?'win':'lose'}">${resText}</div>
    `;
    list.insertBefore(item,list.firstChild);
    while(list.children.length>30) list.removeChild(list.lastChild);
}

/* ════════════════════════════════════════════════════════════
   MODAL + CONFETTI
════════════════════════════════════════════════════════════ */
function showModal(icon,title,body,txSig){
    tx('m-icon',icon); tx('m-title',title); tx('m-body',body);
    tx('m-tx', txSig?`TX: ${txSig}`:'');
    $('modal-overlay').classList.add('show');
}
function closeModal(){ $('modal-overlay').classList.remove('show'); }

function confetti(type){
    const sets={
        win:    ['💚','✨','💰','🌟','🚀','💎'],
        fire:   ['🔥','💀','❤️‍🔥','💥'],
        jackpot:['💎','🌟','✨','🏆','💰','🎉','💛'],
    };
    const p=sets[type]||sets.win;
    for(let i=0;i<30;i++){
        setTimeout(()=>{
            const el=document.createElement('div');
            el.className='cp';
            el.textContent=p[Math.floor(Math.random()*p.length)];
            el.style.cssText=`left:${Math.random()*95}vw;font-size:${14+Math.random()*14}px;animation-duration:${2+Math.random()*3}s;animation-delay:${Math.random()*.4}s`;
            $('confetti-container').appendChild(el);
            setTimeout(()=>el.remove(),5500);
        },i*60);
    }
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
    $('btn-connect').addEventListener('click', openWalletMenu);
    $('btn-lobby').addEventListener('click', ()=>openView('lobby'));
    $('modal-overlay').addEventListener('click',e=>{ if(e.target===$('modal-overlay')) closeModal(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

    // Roulette default
    setRlBet('color','red');
    // Initialise drum (Fortune Wheel)
    initDrum();
    // Initialise reels (Slots)
    initReels();
    // Lobby: start animations
    openView('lobby');
    // Server data (prices + casino info — no wallet needed)
    fetchPrices();
    loadCasinoInfo();

    console.log('🎰 SoluckU Casino v3.0 — QHUBX · Multi-wallet · Production ready');
});