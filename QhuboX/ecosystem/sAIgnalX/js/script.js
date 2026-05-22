/**
 * script.js — sAIgnalX Free Version Signal Engine
 * Unchanged logic; improved responsive rendering
 */

/* =============================================
   STYLE INJECTION (animations)
   ============================================= */
const style = document.createElement('style');
style.innerHTML = `
    @keyframes blinker { 50% { opacity: 0; } }
    .blink-long  { color: #00ff9d !important; animation: blinker 0.5s linear infinite; font-weight: 900; display:flex; align-items:center; justify-content:center; font-family:'Oxanium',monospace; }
    .blink-short { color: #ff0055 !important; animation: blinker 0.5s linear infinite; font-weight: 900; display:flex; align-items:center; justify-content:center; font-family:'Oxanium',monospace; }
    .profit-badge {
        font-family: 'JetBrains Mono','Courier New',monospace;
        font-weight: 700; color: #ddd; text-transform: uppercase;
        background: rgb(160,28,0); padding: clamp(2px,0.5vw,4px) clamp(4px,1vw,7px);
        border-radius: 8px; box-shadow: 0 3px 8px rgba(0,0,0,0.6);
        border-bottom: 1px solid #424242; border-top: 1px solid #424242;
        flex-shrink: 0;
        font-size: clamp(0.44rem, 1.1vw, 0.62rem);
    }
    .ai-loader-container { display:inline-flex; align-items:center; gap:6px; font-family:'JetBrains Mono','Courier New',monospace; vertical-align:middle; }
    .ai-status-text { color: #22d3ee; font-weight: 300; min-width: 60px; animation: aiBreath 2s infinite ease-in-out; font-size: clamp(0.42rem,1.1vw,0.58rem); }
    .ai-status-text::after { content: "Analyzing..."; animation: aiSwap 1s infinite step-end; }
    @keyframes aiBreath { 0%,100%{opacity:0.3} 50%{opacity:1;text-shadow:0 0 8px rgba(0,212,255,0.7);} }
    @keyframes aiSwap   { 0%,45%{content:"Analyzing...";} }
`;
document.head.appendChild(style);

/* =============================================
   CONFIGURATION
   ============================================= */
const BLACKLIST = new Set([
    'BANANAS31USDT','PAXGUSDT','BTCUSDT','ETHUSDT','USD1USDT',
    'USDCUSDT','TUSDUSDT','FDUSDUSDT','DAIUSDT','USDPUSDT','BUSDUSDT','EURUSDT'
]);

const WALL_DYNAMIC       = 3.5;
const STABILITY_RATIO    = 1.8;
const MIN_DISTANCE       = 0.5;
const SIGNAL_PERSISTENCE = 9000;

let liveMarketData = new Map();
let currentStream  = null;
let trendingFaces  = [[], [], [], []];

/* =============================================
   CONTROL ELEMENTS
   ============================================= */
const speedRange     = document.getElementById('speedRange');
const sceneContainer = document.querySelector('.scene') || document.body;
const deployBtn      = document.getElementById('deployBtn');
const cube           = document.querySelector('.cube');
const sideCols       = document.querySelectorAll('.side-column');
const playPauseBtn   = document.getElementById('playPauseBtn');

/* =============================================
   DEPLOY (expand / retract)
   ============================================= */
if (deployBtn && cube) {
    deployBtn.addEventListener('click', () => {
        const isExpanded = cube.classList.toggle('expanded');

        sideCols.forEach(col => {
            col.classList.toggle('column-hidden', isExpanded);
        });

        if (isExpanded) {
            deployBtn.textContent = 'RETRACT';
            if (playPauseBtn) {
                playPauseBtn.style.cursor = 'not-allowed';
                playPauseBtn.disabled = true;
                playPauseBtn.style.pointerEvents = 'none';
            }
            if (speedRange) {
                speedRange.disabled = true;
                speedRange.style.cursor = 'not-allowed';
            }
        } else {
            deployBtn.textContent = 'DEPLOY';
            deployBtn.style.boxShadow = 'none';
            if (playPauseBtn) {
                playPauseBtn.style.cursor = 'pointer';
                playPauseBtn.disabled = false;
                playPauseBtn.style.pointerEvents = 'auto';
            }
            if (speedRange) {
                const isPaused = sceneContainer.classList.contains('paused');
                speedRange.disabled = isPaused;
                speedRange.style.cursor = isPaused ? 'not-allowed' : 'pointer';
            }
        }
    });
}

/* =============================================
   SPEED CONTROL
   ============================================= */
function updateSpeed(v) {
    document.documentElement.style.setProperty('--rotation-speed', `${160 - (v * 4)}s`);
}

if (speedRange) {
    speedRange.addEventListener('input', (e) => updateSpeed(e.target.value));
    updateSpeed(speedRange.value);
}

/* =============================================
   PLAY / PAUSE
   ============================================= */
if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
        const isPaused = sceneContainer.classList.toggle('paused');
        playPauseBtn.textContent = isPaused ? 'PLAY' : 'PAUSE';
        if (speedRange) {
            speedRange.disabled = isPaused;
            speedRange.style.opacity = isPaused ? '0.5' : '1';
            speedRange.style.cursor  = isPaused ? 'not-allowed' : 'pointer';
            speedRange.style.filter  = isPaused ? 'grayscale(1)' : 'none';
        }
    });
}

/* =============================================
   MARKET SCANNER
   ============================================= */
async function getMarketTrends() {
    try {
        const [spotR, futR] = await Promise.all([
            fetch('https://api.binance.com/api/v3/ticker/24hr'),
            fetch('https://fapi.binance.com/fapi/v1/ticker/24hr')
        ]);
        const spot = await spotR.json();
        const fut  = await futR.json();

        const futMap = new Map(fut.map(f => [f.symbol, parseFloat(f.quoteVolume)]));

        let candidates = spot.filter(t =>
            t.symbol.endsWith('USDT') &&
            !BLACKLIST.has(t.symbol) &&
            parseFloat(t.quoteVolume) > 1500000 &&
            Math.abs(parseFloat(t.priceChangePercent)) > 2
        );

        candidates.sort((a, b) => {
            const aScore = parseFloat(a.quoteVolume) + (futMap.get(a.symbol) || 0) * 0.5;
            const bScore = parseFloat(b.quoteVolume) + (futMap.get(b.symbol) || 0) * 0.5;
            return bScore - aScore;
        });

        const top16 = candidates.slice(0, 16).map(t => t.symbol);
        for (let f = 0; f < 4; f++) {
            trendingFaces[f] = top16.slice(f * 4, (f + 1) * 4);
        }
        return top16;
    } catch (e) {
        console.error('[script] Market scan error:', e);
        return [];
    }
}

/* =============================================
   ORDER BOOK PROCESSOR
   ============================================= */
function processOrderBook(symbol, bids, asks) {
    if (!bids?.length || !asks?.length) return;

    const currPrice = (parseFloat(bids[0][0]) + parseFloat(asks[0][0])) / 2;
    const masterBid = bids.reduce((m, b) => parseFloat(b[1]) > parseFloat(m[1]) ? b : m, bids[0]);
    const masterAsk = asks.reduce((m, a) => parseFloat(a[1]) > parseFloat(m[1]) ? a : m, asks[0]);
    const bVol  = bids.reduce((s, b) => s + parseFloat(b[1]), 0);
    const aVol  = asks.reduce((s, a) => s + parseFloat(a[1]), 0);
    const ratio = bVol / aVol;

    const prev   = liveMarketData.get(symbol) || {};
    const now    = Date.now();
    const locked = prev.lastTime && (now - prev.lastTime < SIGNAL_PERSISTENCE);

    let signal = locked ? prev.type : 'NEUTRAL';
    let entry  = prev.entry  || 0;
    let target = prev.target || 0;
    let profit = prev.profit || '0.00';
    let lastTime = prev.lastTime || 0;

    if (!locked) {
        if (ratio > STABILITY_RATIO) {
            entry  = parseFloat(masterBid[0]);
            target = parseFloat(masterAsk[0]);
            signal = 'LONG'; lastTime = now;
            profit = (((target - entry) / entry) * 100).toFixed(2);
        } else if (ratio < (1 / STABILITY_RATIO)) {
            entry  = parseFloat(masterAsk[0]);
            target = parseFloat(masterBid[0]);
            signal = 'SHORT'; lastTime = now;
            profit = (((entry - target) / entry) * 100).toFixed(2);
        }
    }

    liveMarketData.set(symbol, { type: signal, price: currPrice, ratio: ratio.toFixed(2), entry, target, profit, lastTime });
}

/* =============================================
   UI RENDERER (responsive signal-btn)
   ============================================= */
function fmtPrice(p) {
    if (!p) return '—';
    if (p < 0.000001) return p.toExponential(2);
    if (p < 1)        return p.toFixed(5);
    return p.toFixed(2);
}

function updateUIFace(faceIndex, coins) {
    const container = document.getElementById(`face-${faceIndex}`);
    if (!container || !coins) return;

    if (container.children.length !== coins.length) {
        container.innerHTML = '';
        coins.forEach(() => {
            const b = document.createElement('div');
            b.className = 'signal-btn';
            container.appendChild(b);
        });
    }

    coins.forEach((coin, i) => {
        const d   = liveMarketData.get(coin);
        const btn = container.children[i];
        if (!d || !btn) return;

        const isLong  = d.type === 'LONG';
        const isShort = d.type === 'SHORT';
        const hasSig  = isLong || isShort;

        btn.className = `signal-btn ${isLong ? 'signal-long' : isShort ? 'signal-short' : 'signal-neutral'}`;

        const blinkTag = hasSig
            ? `<span class="${isLong ? 'blink-long' : 'blink-short'}">${d.type}</span>`
            : `<div class="ai-loader-container"><span class="ai-status-text"></span></div>`;

        const profitHTML = hasSig ? `<span class="profit-badge">${d.profit}%</span>` : '';
        const levelsHTML = hasSig ? `
            <div class="sb-levels" style="background:rgba(0,0,0,0.7);border-radius:5px;padding:clamp(3px,0.8vw,5px) clamp(4px,1vw,6px);border-top:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.05);margin-top:2px;">
                <div class="sb-entry" style="font-family:'JetBrains Mono',monospace;color:#00ff9d;font-size:clamp(0.4rem,1.1vw,0.56rem);font-weight:300;">E: ${fmtPrice(d.entry)}</div>
                <div class="sb-tp" style="font-family:'JetBrains Mono',monospace;color:#ffcc00;font-size:clamp(0.4rem,1.1vw,0.56rem);font-weight:300;text-align:center;">TP: ${fmtPrice(d.target)}</div>
            </div>` : '';

        btn.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <b style="font-family:'Oxanium',monospace;font-size:clamp(0.6rem,1.8vw,0.85rem);font-weight:700;color:#fff;">${coin.replace('USDT','')}</b>
                ${profitHTML}
            </div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:clamp(0.5rem,1.4vw,0.72rem);color:#00ffcc;font-weight:300;">$${fmtPrice(d.price)}</div>
            <div style="font-size:clamp(0.5rem,1.3vw,0.7rem);font-weight:700;">${blinkTag}</div>
            ${levelsHTML}
            <div style="font-family:'JetBrains Mono',monospace;font-size:clamp(0.4rem,1vw,0.56rem);font-weight:300;color:rgba(210,210,210,0.8);text-align:center;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">RATIO ${d.ratio}×</div>
        `;
    });
}

/* =============================================
   WEBSOCKET STREAM
   ============================================= */
function startLiveStream(symbols) {
    if (currentStream) {
        currentStream.onclose = null;
        currentStream.close();
    }
    const streams = symbols.map(s => `${s.toLowerCase()}@depth20@100ms`).join('/');
    currentStream = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

    currentStream.onmessage = (e) => {
        const msg    = JSON.parse(e.data);
        const symbol = msg.stream.split('@')[0].toUpperCase();
        processOrderBook(symbol, msg.data.bids, msg.data.asks);
    };

    currentStream.onclose = () => {
        console.log('[stream] Reconnecting…');
        setTimeout(() => startLiveStream(symbols), 5000);
    };
}

/* =============================================
   INIT
   ============================================= */
async function init() {
    const coins = await getMarketTrends();
    startLiveStream(coins);

    if (!window.renderLoop) {
        window.renderLoop = setInterval(() => {
            for (let i = 0; i < 4; i++) updateUIFace(i, trendingFaces[i]);
        }, 300);
    }
}

document.addEventListener('DOMContentLoaded', init);
setInterval(() => { liveMarketData.clear(); init(); }, 300000);
