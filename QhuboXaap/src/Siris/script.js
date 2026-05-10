/**
 * 1. MOTOR ESTÉTICO - INYECCIÓN ÚNICA (Intacto)
 */
const style = document.createElement('style');
style.innerHTML = `
    @keyframes blinker { 50% { opacity: 0; } }
    .blink-long { color: #00ff88 !important; animation: blinker 0.4s linear infinite; font-weight: 900; align-items: center; display: flex; justify-content: center; }
    .blink-short { color: #ff4444 !important; animation: blinker 0.4s linear infinite; font-weight: 900; align-items: center; display: flex; justify-content: center; }
    .profit-badge { 
        font-size: 14px; font-weight: 900; color: #dbdbdb; text-shadow: #000; text-transform: uppercase; font-family: 'Courier New', Courier, monospace;
       background: rgb(180, 36, 0); padding: 4px 7px; border-radius: 12px; 
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.733);border-bottom: 1px solid #424242; border-top:1px solid #424242 ;
    }
        @media (max-width: 780px) {
    .profit-badge {
        font-size: 12px;      /* Reducción de fuente */
        padding: 3px 6px;     /* Reducción de padding */
        border-radius: 8px;   /* Ajuste de curva para el nuevo tamaño */
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.733); /* Sombra más sutil */
        border-bottom: 1px solid #424242; 
        border-top: 1px solid #424242;
        margin-right: 4px; /* Espacio a la derecha para evitar que el badge toque el borde */
    }
      
}
    .ai-loader-container { display: inline-flex; align-items: center; gap: 10px; font-family: 'Courier New', Courier, monospace; vertical-align: middle; font-size: 10px; }
    .ai-status-text { font-size: 13px; color: #00d4ff; font-weight: bold; min-width: 100px; animation: ai-breath 2s infinite ease-in-out; }
    .ai-status-text::after { content: "Analyzing"; animation: ai-swapWords 1s infinite step-end; }
    @keyframes ai-breath { 0%, 100% { opacity: 0.3; text-shadow: 0 0 0px transparent; } 50% { opacity: 1; text-shadow: 0 0 8px rgba(0, 212, 255, 0.8); } }
    @keyframes ai-swapWords { 0%, 45% { content: "Analyzing..."; } }
`;
document.head.appendChild(style);

/**
 * 2. CONFIGURACIÓN TÉCNICA ESTATAL
 */
const BLACKLIST = new Set(['BANANAS31USDT','PAXGUSDT','BTCUSDT','ETHUSDT','USD1USDT','USDCUSDT', 'TUSDUSDT', 'FDUSDUSDT', 'DAIUSDT', 'USDPUSDT', 'BUSDUSDT', 'EURUSDT']);
const WALL_DYNAMIC = 3.5;      
const STABILITY_RATIO = 1.8;    
const MIN_DISTANCE = 0.5;       
const SIGNAL_PERSISTENCE_MS = 9000; // 9 Segundos de estabilidad obligatoria por señal

let liveMarketData = new Map(); 
let currentStream = null;
let trendingFaces = [[], [], [], []]; 
const speedRange = document.getElementById('speedRange');

// Seleccionamos la escena o el body para aplicar la pausa global
const sceneContainer = document.querySelector('.scene') || document.body;
const deployBtn = document.getElementById('deployBtn');
const cube = document.querySelector('.cube');
const sideCols = document.querySelectorAll('.side-column');
const playPauseBtn = document.getElementById('playPauseBtn');

if (deployBtn && cube) {
    deployBtn.addEventListener('click', () => {
        // 1. ¿Estamos expandiendo o retrayendo?
        const isExpanded = cube.classList.toggle('expanded');
        
        // 2. Gestionar Columnas Laterales
        sideCols.forEach(col => {
            if (isExpanded) {
                col.classList.add('column-hidden');
            } else {
                col.classList.remove('column-hidden');
            }
        });

        // 3. Feedback Visual del Botón DEPLOY
if (isExpanded) {
    deployBtn.textContent = 'RETRACT';
    
    
    // Bloqueamos el botón playPauseBtn
    if (playPauseBtn) {
        
        playPauseBtn.style.cursor = 'not-allowed';
        playPauseBtn.disabled = true; 
        playPauseBtn.style.pointerEvents = 'none'; 
    }

    // Bloqueamos el control de velocidad (speedRange)
    if (speedRange) {
        speedRange.disabled = true; // Bloqueo funcional nativo para inputs
        
        speedRange.style.cursor = 'not-allowed';
    }

} else {
    deployBtn.textContent = 'DEPLOY';
    
    deployBtn.style.boxShadow = 'none';
    
    // 1. Restauramos el playPauseBtn (siempre se habilita para que el usuario pueda darle click)
    if (playPauseBtn) {
        
        playPauseBtn.style.cursor = 'pointer';
        playPauseBtn.disabled = false; 
        playPauseBtn.style.pointerEvents = 'auto'; 
    }

    // 2. Restauramos speedRange CONDICIONALMENTE
    if (speedRange) {
        // Verificamos si el cubo sigue pausado buscando la clase en el contenedor
        const isCurrentlyPaused = sceneContainer.classList.contains('paused');

        if (isCurrentlyPaused) {
            // Si el cubo sigue en pausa, mantenemos el bloqueo visual y funcional
            speedRange.disabled = true;
            
            speedRange.style.cursor = 'not-allowed';
        } else {
            // Si el cubo NO está en pausa, lo habilitamos normalmente
            speedRange.disabled = false; 
            
          }

    }
    }


    });
    

}


function updateSpeed(v) { 
    document.documentElement.style.setProperty('--rotation-speed', `${160 - (v * 4)}s`); 
}

if (speedRange) { 
    speedRange.addEventListener('input', (e) => updateSpeed(e.target.value)); 
    updateSpeed(speedRange.value); 
}

// 2. Control de Play / Pause
if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
        // Alternar clase de pausa
        const isPaused = sceneContainer.classList.toggle('paused');
        
        // 1. Lógica del Botón PLAY/PAUSE
        if (isPaused) {
            playPauseBtn.textContent = 'PLAY';
          
        } else {
            playPauseBtn.textContent = 'PAUSE';
            
        }

        // 2. BLOQUEO SINCRONIZADO de speedRange
        if (speedRange) {
            // Si está pausado, deshabilitamos el slider
            speedRange.disabled = isPaused; 
            
            // Feedback visual para el slider
            speedRange.style.opacity = isPaused ? '0.5' : '1';
            speedRange.style.cursor = isPaused ? 'not-allowed' : 'pointer';
            
            // Opcional: Si quieres que el slider se vea "apagado" totalmente
            speedRange.style.filter = isPaused ? 'grayscale(1)' : 'none';
        }
    });
}

/**
 * 3. DYNAMIC SCANNER (Binance Alpha Fusion: Spot + Futures)
 */
async function getMarketTrends() {
    try {
        // Ejecución en paralelo para Spot y Futures (Alpha)
        const [spotResponse, futuresResponse] = await Promise.all([
            fetch('https://api.binance.com/api/v3/ticker/24hr'),
            fetch('https://fapi.binance.com/fapi/v1/ticker/24hr')
        ]);
        
        const spotData = await spotResponse.json();
        const futuresData = await futuresResponse.json();
        
        // Crear mapa de futuros para buscar anomalías de volumen (Alpha)
        const futuresMap = new Map(futuresData.map(f => [f.symbol, parseFloat(f.quoteVolume)]));

        let candidates = spotData.filter(t => 
            t.symbol.endsWith('USDT') && 
            !BLACKLIST.has(t.symbol) && 
            parseFloat(t.quoteVolume) > 1500000 && 
            Math.abs(parseFloat(t.priceChangePercent)) > 2
        );

        // Algoritmo de puntuación HFT: Multiplicador agresivo si hay alto volumen en futuros
        candidates.sort((a, b) => {
            const volAlphaA = futuresMap.get(a.symbol) || parseFloat(a.quoteVolume);
            const volAlphaB = futuresMap.get(b.symbol) || parseFloat(b.quoteVolume);
            
            const scoreA = volAlphaA * Math.abs(parseFloat(a.priceChangePercent));
            const scoreB = volAlphaB * Math.abs(parseFloat(b.priceChangePercent));
            return scoreB - scoreA;
        });
        
        let selected = candidates.slice(0, 16).map(t => t.symbol);
        
        if (selected.length < 16) {
            const extra = ['SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LTCUSDT','DOTUSDT','LINKUSDT','NEARUSDT','MATICUSDT','SHIBUSDT','TRXUSDT','UNIUSDT'];
            selected = [...new Set([...selected, ...extra])].slice(0, 16);
        }

        for (let i = 0; i < 4; i++) trendingFaces[i] = selected.slice(i * 4, (i + 1) * 4);
        return selected;
    } catch (e) { 
        console.error("Alpha Data Error:", e);
        const fb = ['SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LTCUSDT','DOTUSDT','LINKUSDT','NEARUSDT','MATICUSDT','SHIBUSDT','TRXUSDT','UNIUSDT'];
        for (let i = 0; i < 4; i++) trendingFaces[i] = fb.slice(i * 4, (i + 1) * 4);
        return fb;
    }
}

/**
 * 4. HYBRID ENGINE (Estabilidad + Latency Front-Running)
 */
function processOrderBook(symbol, bids, asks) {
    if (!bids.length || !asks.length) return;

    const topBid = parseFloat(bids[0][0]);
    const topAsk = parseFloat(asks[0][0]);
    const currPrice = (topBid + topAsk) / 2;

    let bVol = 0, aVol = 0;
    for(let i=0; i < bids.length; i++) bVol += parseFloat(bids[i][1]);
    for(let i=0; i < asks.length; i++) aVol += parseFloat(asks[i][1]);
    
    const ratio = bVol / aVol;
    const avgVol = (bVol + aVol) / (bids.length + asks.length);

    // Cargar datos previos para estabilización y cálculo de Momentum
    const prevData = liveMarketData.get(symbol) || {};
    const prevRatio = parseFloat(prevData.ratio) || ratio;
    const momentum = ratio - prevRatio; // Velocidad con la que cambia el libro
    const now = Date.now();
    const isSignalLocked = prevData.lastSignalTime && (now - prevData.lastSignalTime < SIGNAL_PERSISTENCE_MS);

    let signal = isSignalLocked ? prevData.type : 'NEUTRAL';
    let entry = prevData.entry || 0;
    let target = prevData.target || 0;
    let profitPct = parseFloat(prevData.profit) || 0;
    let newSignalTime = prevData.lastSignalTime || 0;

    // Solo buscamos nueva señal si no estamos "Bloqueados" (Hysteresis) o si el momentum es brutal
    if (!isSignalLocked || Math.abs(momentum) > 1.5) {
        
        // Lógica Predictiva: Si el momentum es > 0.4 (compras rápidas), bajamos la exigencia del muro (front-running)
        const dynamicWallLong = momentum > 0.4 ? WALL_DYNAMIC * 0.75 : WALL_DYNAMIC;
        const dynamicWallShort = momentum < -0.4 ? WALL_DYNAMIC * 0.75 : WALL_DYNAMIC;

        // LONG ANTICIPADO
        if (ratio >= STABILITY_RATIO || momentum > 0.6) {
            const supportWall = bids.find(b => parseFloat(b[1]) > avgVol * dynamicWallLong);
            if (supportWall) {
                // Compensación de Latencia: Entrar un poco por encima del muro para asegurar ejecución
                entry = parseFloat(supportWall[0]) * 1.0005; 
                const resWall = asks.find(a => parseFloat(a[1]) > avgVol * 1.2) || asks[asks.length-1];
                target = parseFloat(resWall[0]) * 0.9990; // Front-run al Take Profit
                profitPct = ((target - currPrice) / currPrice) * 100;
                
                if (profitPct > MIN_DISTANCE) {
                    signal = 'LONG';
                    newSignalTime = now;
                }
            }
        } 
        // SHORT ANTICIPADO
        else if (ratio <= (1 / STABILITY_RATIO) || momentum < -0.6) {
            const resistanceWall = asks.find(a => parseFloat(a[1]) > avgVol * dynamicWallShort);
            if (resistanceWall) {
                // Compensación de Latencia: Entrar un poco por debajo del muro
                entry = parseFloat(resistanceWall[0]) * 0.9995; 
                const suppWall = bids.find(b => parseFloat(b[1]) > avgVol * 1.2) || bids[bids.length-1];
                target = parseFloat(suppWall[0]) * 1.0010;
                profitPct = ((currPrice - target) / currPrice) * 100;
                
                if (profitPct > MIN_DISTANCE) {
                    signal = 'SHORT';
                    newSignalTime = now;
                }
            }
        }
    }

    liveMarketData.set(symbol, {
        type: signal,
        price: currPrice,
        ratio: ratio.toFixed(2),
        entry: entry,
        target: target,
        profit: profitPct > 0 ? profitPct.toFixed(2) : (prevData.profit || 0),
        lastSignalTime: newSignalTime // Guarda el tiempo para el bloqueo anti-parpadeo
    });
}
       function processOrderBook(symbol, bids, asks) {
    if (!bids || !asks || !bids.length || !asks.length) return;

    const currPrice = (parseFloat(bids[0][0]) + parseFloat(asks[0][0])) / 2;
    const masterBid = bids.reduce((max, b) => parseFloat(b[1]) > parseFloat(max[1]) ? b : max, bids[0]);
    const masterAsk = asks.reduce((max, a) => parseFloat(a[1]) > parseFloat(max[1]) ? a : max, asks[0]);

    const bVol = bids.reduce((s, b) => s + parseFloat(b[1]), 0);
    const aVol = asks.reduce((s, a) => s + parseFloat(a[1]), 0);
    const ratio = bVol / aVol;

    const prev = liveMarketData.get(symbol) || {};
    const now = Date.now();
    const isLocked = prev.lastTime && (now - prev.lastTime < SIGNAL_PERSISTENCE_MS);

    let signal = isLocked ? prev.type : 'NEUTRAL';
    let entry = prev.entry || 0, target = prev.target || 0, profit = prev.profit || "0.00", lastTime = prev.lastTime || 0;

    if (!isLocked) {
        if (ratio > STABILITY_RATIO) {
            entry = parseFloat(masterBid[0]); target = parseFloat(masterAsk[0]);
            signal = 'LONG'; lastTime = now; profit = (((target - entry) / entry) * 100).toFixed(2);
        } else if (ratio < (1 / STABILITY_RATIO)) {
            entry = parseFloat(masterAsk[0]); target = parseFloat(masterBid[0]);
            signal = 'SHORT'; lastTime = now; profit = (((entry - target) / entry) * 100).toFixed(2);
        }
    }

    liveMarketData.set(symbol, { type: signal, price: currPrice, ratio: ratio.toFixed(2), entry, target, profit, lastTime });
}

/**
 * 5. UI RENDERING (Intacto en diseño)
 */
function updateUIFace(faceIndex, coins) {
    const container = document.getElementById(`face-${faceIndex}`);
    if (!container || !coins) return;

    if (container.children.length !== 4) {
        container.innerHTML = '';
        coins.forEach(() => {
            const b = document.createElement('div');
            b.className = 'signal-btn';
            container.appendChild(b);
        });
    }

    coins.forEach((coin, i) => {
        const d = liveMarketData.get(coin);
        const btn = container.children[i];
        if (!d || !btn) return;

        const styleClass = d.type === 'LONG' ? 'signal-long' : (d.type === 'SHORT' ? 'signal-short' : 'signal-neutral');
        
        btn.className = `signal-btn ${styleClass}`;

        const blinkTag = d.type !== 'NEUTRAL' ? 
            `<span class="blink-${d.type.toLowerCase()}">${d.type}</span>` : 
            `<div class="ai-loader-container"><span class="ai-status-text"></span></div>`;

        const profitHTML = d.type !== 'NEUTRAL' ? `<span class="profit-badge">${d.profit}％</span>` : '';

        // Estructura y clases exactas
        btn.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size:14px; color:#fff;">${coin.replace('USDT','')}</b>
                ${profitHTML}
            </div>
            <div style="font-size:13px; color:#00ffcc; font-family:monospace;">$${d.price.toFixed(d.price < 1 ? 5 : 2)}</div>
            <div style="font-size:12px; font-weight:900;">${blinkTag}</div>
            <div style=" max-height: 100px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.733);border-bottom: 1px solid #424242; border-top:1px solid #424242 ; background: rgba(0, 0, 0, 0.856); padding: 8px ; z-index: 10; border-radius: 6px; margin-top:4px;">
                <div style="font-family: 'Courier New', monospace; color:#00ff88; font-size:11px; text-align: left;">ENTRY: ${d.entry.toFixed(5)}</div>
                <div style="font-family: 'Courier New', monospace; color:#ffcc00; font-size:11px; text-align: center;">TP: ${d.target.toFixed(5)}</div>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #dbdbdb; text-shadow: rgba(0, 0, 0, 0.938) 0px 0px 10px, rgba(0, 0, 0, 0.938) 0px 0px 20px, rgba(0, 0, 0, 0.938) 0px 0px 30px; text-transform: uppercase; font-family: 'Courier New', monospace; margin-top:4px;align-items: center; display: flex; justify-content: center; ">RATIO: ${d.ratio}x</div>
        `;
    });
}

/**
 * 6. CONNECTION & LIFECYCLE 
 */
function startLiveStream(symbols) {
    if (currentStream) {
        currentStream.onclose = null; 
        currentStream.close();
    }
    
    const streams = symbols.map(s => `${s.toLowerCase()}@depth20@100ms`).join('/');
    currentStream = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
    
    currentStream.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        const symbol = msg.stream.split('@')[0].toUpperCase();
        processOrderBook(symbol, msg.data.bids, msg.data.asks);
    };

    currentStream.onclose = () => {
        console.log("Reconnecting Stream...");
        setTimeout(() => startLiveStream(symbols), 5000);
    };
}

async function init() {
    const coins = await getMarketTrends();
    startLiveStream(coins);
    
    if (!window.renderLoop) {
        window.renderLoop = setInterval(() => {
            for(let i=0; i<4; i++) updateUIFace(i, trendingFaces[i]);
        }, 300);
    }
}

document.addEventListener('DOMContentLoaded', init);
setInterval(() => {
    liveMarketData.clear();
    init();
}, 300000);