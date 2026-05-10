const WebSocket = require('ws');
const fetch = require('node-fetch');

const seenNames = new Set();
const seenSymbols = new Set();
const seenTrending = new Set();

let lastTrendingClear = Date.now();
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchTrendingTokens(callback) {
    try {
        const now = Date.now();

        if (now - lastTrendingClear > TWELVE_HOURS_MS) {
            console.log("♻️ [SERVICIOS] Rotación de Ciclo 12h: Reseteando historial de tendencias");
            seenTrending.clear();
            lastTrendingClear = now;
        }

        // Cambiamos a la API de Boosts que es más activa para tendencias "Trending Now"
        const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
        if (!response.ok) return;
        
        const boosts = await response.json();
        if (!Array.isArray(boosts)) return; // Validación de seguridad
        
        const solanaTrending = boosts
            .filter(t => t.chainId === 'solana')
            .slice(0, 10); // Ampliamos a 10 para asegurar calidad

        for (const token of solanaTrending) {
            // Dexscreener Boosts usa 'tokenAddress'. Validamos que exista.
            const address = token.tokenAddress;
            if (!address || seenTrending.has(address)) continue;
            
            seenTrending.add(address);
            if (seenTrending.size > 500) seenTrending.clear();

            const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
            const pairData = await pairRes.json();
            const mainPair = pairData.pairs?.[0];

            if (!mainPair) continue; // Si no hay par líquido, no es tendencia real

            console.log(`🔥 [TRENDING] ${mainPair.baseToken.symbol} | MCAP: $${Math.floor(mainPair.fdv || 0).toLocaleString()}`);

            callback({
                ca: address,
                symbol: mainPair.baseToken.symbol || 'TOKEN',
                name: mainPair.baseToken.name || 'Trending Token',
                mcap: mainPair.fdv || 0,
                // Priorizamos la imagen de la pareja de Dexscreener
                image: mainPair.info?.imageUrl || token.header || token.icon || null,
                updateType: 'realtime_update',
                type: 'graduation_visual_update', 
                isMigration: true, 
                timestamp: Date.now()
            });
        }
    } catch (e) {
        console.error("Error en trending:", e.message);
    }
}

// --- FUNCIÓN SOCIAL: extrae web, twitter, telegram desde pump.fun ---
async function fetchPumpFunSocials(mint, uri) {
    try {
        // 1. Intentar desde frontend-api.pump.fun (mismo endpoint que la imagen)
        const coinUrl = `https://frontend-api.pump.fun/coins/${mint}`;
        const res = await fetch(coinUrl);
        if (res.ok) {
            const d = await res.json();
            const socials = {};
            if (d.website)  socials.website  = d.website;
            if (d.twitter)  socials.twitter  = d.twitter.startsWith('http') ? d.twitter : `https://x.com/${d.twitter}`;
            if (d.telegram) socials.telegram = d.telegram.startsWith('http') ? d.telegram : `https://t.me/${d.telegram}`;
            if (Object.keys(socials).length > 0) return socials;
        }
        // 2. Fallback: metadata URI (IPFS/Arweave)
        if (uri) {
            const metaRes = await fetch(uri);
            if (metaRes.ok) {
                const meta = await metaRes.json();
                const socials = {};
                if (meta.external_url) socials.website  = meta.external_url;
                if (meta.twitter)      socials.twitter  = meta.twitter.startsWith('http') ? meta.twitter : `https://x.com/${meta.twitter}`;
                if (meta.telegram)     socials.telegram = meta.telegram.startsWith('http') ? meta.telegram : `https://t.me/${meta.telegram}`;
                if (Object.keys(socials).length > 0) return socials;
            }
        }
    } catch (e) { /* silencioso */ }
    return {};
}

// --- TUS FUNCIONES DE IMÁGENES (SIN ALTERAR) ---
async function fetchTokenImageUrl(mint, uri) {
    try {
        const coinUrl = `https://frontend-api.pump.fun/coins/${mint}`;
        const res = await fetch(coinUrl);
        if (res.ok) {
            const coinData = await res.json();
            if (coinData.video_uri) return coinData.video_uri;
            if (coinData.image_uri) return coinData.image_uri;
        }
        const metaRes = await fetch(uri);
        if (metaRes.ok) {
            const metaData = await metaRes.json();
            return metaData.video || metaData.animation_url || metaData.image || null;
        }
        const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
        const dexRes = await fetch(dexUrl);
        if (dexRes.ok) {
            const dexData = await dexRes.json();
            if (dexData.pairs?.[0]) return dexData.pairs[0].baseToken.logoURI || null;
        }
        return null;
    } catch (e) { return null; }
}

async function fetchImageUntilAvailable(imageUrl, tokenData, callback) {
    let attempt = 0;
    let finalUrl = imageUrl.startsWith('ipfs://')
        ? `https://ipfs.io/ipfs/${imageUrl.split('ipfs://')[1]}`
        : imageUrl;
    while (attempt < 15) {
        attempt++;
        try {
            const res = await fetch(finalUrl);
            if (res.ok) {
                const contentType = res.headers.get('content-type') || '';
                const contentLength = parseInt(res.headers.get('content-length') || '0');
                if (contentType.includes('video') && contentLength > 31457280) return;
                if (contentType.includes('image') && contentLength > 15728640) return;
                const buffer = await res.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                const mimeType = contentType || 'image/png';
                const imageData = `data:${mimeType};base64,${base64}`;
                callback({ ...tokenData, imageData, imageStatus: 'ready' });
                return;
            }
        } catch (e) { }
        await delay(2000);
    }
}

async function listenToPumpFun(callback) {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    // Ejecución inmediata al iniciar y luego cada 45s
    fetchTrendingTokens(callback);
    setInterval(() => fetchTrendingTokens(callback), 45000);

    ws.on('open', () => {
        console.log("✅ [RADAR] Motor Híbrido Activo: Pump.fun + Dex Trending List (12H Cycle)");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            if (message.mint && message.name && message.symbol) {
                const nameNorm = message.name.toLowerCase().trim();
                const symNorm = message.symbol.toLowerCase().trim();
                if (seenNames.has(nameNorm) || seenSymbols.has(symNorm)) return;
                if (!/^[a-zA-Z0-9\s]+$/.test(message.name)) return;
                
                const solNeto = (message.vSolInBondingCurve || 30) - 30;
                if (solNeto < 0.75 || solNeto > 2.99) return;
                
                seenNames.add(nameNorm);
                seenSymbols.add(symNorm);
                
                // Fetch imagen y sociales en paralelo
                const [mediaUrl, socials] = await Promise.all([
                    fetchTokenImageUrl(message.mint, message.uri),
                    fetchPumpFunSocials(message.mint, message.uri)
                ]);
                const tokenData = {
                    ca: message.mint,
                    name: message.name,
                    symbol: message.symbol,
                    buyAmount: solNeto.toFixed(2),
                    pumpLink: `https://pump.fun/${message.mint}`,
                    timestamp: Date.now(),
                    mcap: 5000,
                    // Sociales desde Pump.fun
                    website:  socials.website  || null,
                    twitter:  socials.twitter  || null,
                    telegram: socials.telegram || null,
                };
                callback({ ...tokenData, imageStatus: 'queued' });
                if (mediaUrl) {
                    fetchImageUntilAvailable(mediaUrl, tokenData, callback).catch(() => {});
                }
                if (seenNames.size > 2000) { // Aumentado para evitar repeticiones de nombres comunes
    seenNames.clear(); 
    seenSymbols.clear(); 
}
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        setTimeout(() => listenToPumpFun(callback), 5000);
    });
}

module.exports = { listenToPumpFun };