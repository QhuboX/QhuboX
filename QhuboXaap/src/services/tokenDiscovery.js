// services/tokenDiscovery.js

const formatCash = (n) => {
    const val = parseFloat(n);
    if (!val || isNaN(val) || val === 0) return "0.00";
    if (val < 1e3) return val.toFixed(2);
    if (val < 1e6) return (val / 1e3).toFixed(1) + "K";
    if (val < 1e9) return (val / 1e6).toFixed(1) + "M";
    return (val / 1e9).toFixed(1) + "B";
};

export const getNewPairs = async () => {
    try {
        const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
        if (!response.ok) return [];
        const trendingData = await response.json();

        const solanaTrending = trendingData
            .filter(t => t.chainId === 'solana')
            .slice(0, 15);

        const mints = solanaTrending.map(t => t.tokenAddress).join(',');
        const marketRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints}`);
        const marketData = await marketRes.json();

        return solanaTrending.map(trend => {
            const pair = marketData.pairs?.find(p => p.baseToken.address === trend.tokenAddress);
            
            const imageUrl = pair?.info?.imageUrl || 
                             trend.icon || 
                             `https://dd.dexscreener.com/ds-data/tokens/solana/${trend.tokenAddress}.png`;

            // Extraemos la liquidez de forma segura
            const rawLiq = pair?.liquidity?.usd ? parseFloat(pair.liquidity.usd) : 0;

            return {
                mint: trend.tokenAddress,
                name: pair?.baseToken?.name || "Trending Token",
                symbol: pair?.baseToken?.symbol || "???",
                image: imageUrl,
                price: pair?.priceUsd ? parseFloat(pair.priceUsd) : 0,
                mcap: pair?.fdv || 0,
                mcapFormatted: formatCash(pair?.fdv || 0),
                liquidity: rawLiq, // Dato numérico
                liquidityFormatted: formatCash(rawLiq), // <--- NUEVO: Para evitar el NaN en la UI
                priceChange24h: pair?.priceChange?.h24 || 0,
                url: pair?.url || `https://dexscreener.com/solana/${trend.tokenAddress}`
            };
        });
    } catch (error) {
        console.error("Error al cargar Trending:", error);
        return [];
    }
};

export const getTokenSecurity = async (mintAddress) => {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
        const data = await response.json();
        
        if (!data.pairs || data.pairs.length === 0) return { ok: false };
        const bestPair = data.pairs[0]; 
        const rawLiq = bestPair?.liquidity?.usd ? parseFloat(bestPair.liquidity.usd) : 0;

        return {
            ok: true,
            mint: mintAddress,
            symbol: bestPair.baseToken?.symbol || '???',
            name: bestPair.baseToken?.name || 'Unknown',
            image: bestPair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${mintAddress}.png`,
            price: parseFloat(bestPair.priceUsd || 0),
            liquidity: rawLiq,
            liquidityFormatted: formatCash(rawLiq), // <--- NUEVO: También aquí
            marketCapFormatted: formatCash(bestPair.fdv || 0),
            priceChange24h: bestPair.priceChange?.h24 || 0,
        };
    } catch (error) {
        return { ok: false };
    }
};