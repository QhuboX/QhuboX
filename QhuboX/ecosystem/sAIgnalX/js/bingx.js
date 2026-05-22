/**
 * bingx.js — Crypto & Meme Market Tickers
 * Side columns: TOP CRYPTO (CoinGecko) + MEME MARKETS (GeckoTerminal)
 * No functional changes; style rendered via siris.css variables.
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ── APIs ─────────────────────────────────────────────────── */
    const CRYPTO_URL = 'https://api.coingecko.com/api/v3/coins/markets'
        + '?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&sparkline=false';

    const GECKO_TERMINAL_TRENDING =
        'https://api.geckoterminal.com/api/v2/networks/trending_pools?include=network';

    const STABLE_KEYWORDS = [
        'usd','dai','pax','frax','tusd','busd','usdp',
        'steth','wbtc','yield','wrapped','stader','liquid','savings'
    ];

    /* ── Container init ───────────────────────────────────────── */
    function initContainers() {
        ['crypto-ticker', 'global-ticker'].forEach(id => {
            const wrapper = document.getElementById(id);
            if (wrapper) {
                wrapper.innerHTML =
                    `<div class="auto-scroll-container" id="${id}-inner"></div>`;
            }
        });
    }

    /* ── Build ticker rows ────────────────────────────────────── */
    function buildTicker(containerId, items) {
        const inner = document.getElementById(`${containerId}-inner`);
        if (!inner || items.length === 0) return;
        inner.innerHTML = '';

        items.forEach(data => {
            const price  = parseFloat(data.price)  || 0;
            const change = parseFloat(data.change) || 0;
            const colorClass = change >= 0 ? 'up' : 'down';
            const arrow      = change >= 0 ? '▲' : '▼';

            let priceDisplay;
            if (price === 0)              priceDisplay = '—';
            else if (price < 0.000001)    priceDisplay = price.toExponential(2);
            else if (price < 1)           priceDisplay = price.toFixed(6);
            else priceDisplay = price.toLocaleString(undefined, { minimumFractionDigits: 2 });

            const row = document.createElement('div');
            row.className = 'price-item';
            row.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                    <span class="symbol-name">${data.symbol}</span>
                    <span style="font-size:0.5rem;color:#fff;background:${getNetworkColor(data.tag)};
                        padding:1px 5px;border-radius:3px;text-transform:uppercase;
                        font-family:'Oxanium',monospace;font-weight:700;letter-spacing:0.05em;">
                        ${data.tag}
                    </span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="symbol-price ${colorClass}">${priceDisplay}</span>
                    <span style="font-size:0.55rem;font-weight:700;font-family:'JetBrains Mono',monospace;"
                          class="${colorClass}">
                        ${arrow} ${Math.abs(change).toFixed(2)}%
                    </span>
                </div>
            `;
            inner.appendChild(row);
        });

        // Duplicate content for seamless infinite scroll
        inner.innerHTML += inner.innerHTML;
    }

    /* ── Network color badges ─────────────────────────────────── */
    function getNetworkColor(network) {
        const n = (network || '').toLowerCase();
        if (n.includes('solana'))              return '#ed18f8c6';
        if (n.includes('eth') || n.includes('mainnet')) return '#627EEA';
        if (n.includes('base'))                return '#0052FF';
        if (n.includes('bsc') || n.includes('binance')) return '#F3BA2F';
        if (n.includes('polygon') || n.includes('matic')) return '#8247E5';
        return 'rgba(255,255,255,0.2)';
    }

    /* ── Fetch Top Market (CoinGecko) ─────────────────────────── */
    async function getTopMarket() {
        try {
            const resp = await fetch(CRYPTO_URL);
            const data = await resp.json();

            const filtered = data
                .filter(coin => {
                    const name = coin.name.toLowerCase();
                    const sym  = coin.symbol.toLowerCase();
                    return !STABLE_KEYWORDS.some(kw => name.includes(kw) || sym.includes(kw));
                })
                .slice(0, 100);

            buildTicker('crypto-ticker', filtered.map(c => ({
                symbol : c.symbol.toUpperCase(),
                price  : c.current_price,
                change : c.price_change_percentage_24h,
                tag    : 'Chg%'
            })));
        } catch (e) {
            console.error('[bingx] Top Market error:', e);
        }
    }

    /* ── Fetch Trending Meme Pools (GeckoTerminal) ────────────── */
    async function getTrendingMemes() {
        try {
            const resp = await fetch(GECKO_TERMINAL_TRENDING);
            const json = await resp.json();

            if (json.data && json.included) {
                // Map network IDs → names
                const networks = {};
                json.included.forEach(item => {
                    if (item.type === 'network') {
                        networks[item.id] = item.attributes.name;
                    }
                });

                const items = json.data.slice(0, 50).map(pool => {
                    const attr      = pool.attributes;
                    const networkId = pool.relationships.network.data.id;
                    const baseSymbol = attr.name.split(' / ')[0];
                    return {
                        symbol : baseSymbol,
                        price  : attr.base_token_price_usd,
                        change : parseFloat(attr.price_change_percentage.h24),
                        tag    : networks[networkId] || 'DEX'
                    };
                });

                buildTicker('global-ticker', items);
            }
        } catch (e) {
            console.error('[bingx] GeckoTerminal error:', e);
        }
    }

    /* ── Boot ─────────────────────────────────────────────────── */
    initContainers();
    getTopMarket();
    getTrendingMemes();

    // Refresh every 2 minutes
    setInterval(() => {
        getTopMarket();
        getTrendingMemes();
    }, 120_000);
});
