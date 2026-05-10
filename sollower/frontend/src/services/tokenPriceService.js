// frontend/src/services/tokenPriceService.js
// Fetches real-time SOL and QHUBX (SPL token) prices
// Uses Jupiter aggregator + CoinGecko as fallback

const CACHE_TTL = 30_000; // 30s cache
let cache = { sol: null, qhubx: null, timestamp: 0 };

const TOKEN_MINT = import.meta.env.VITE_TOKEN_MINT_ADDRESS;

/**
 * Fetch SOL price in USD from CoinGecko
 */
async function fetchSolPrice() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    const data = await res.json();
    return data?.solana?.usd ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch QHUBX token price via Jupiter Price API v2
 */
async function fetchQhubxPriceJupiter() {
  if (!TOKEN_MINT) return null;
  try {
    const res = await fetch(
      `https://price.jup.ag/v6/price?ids=${TOKEN_MINT}`,
      { headers: { Accept: 'application/json' } }
    );
    const data = await res.json();
    const price = data?.data?.[TOKEN_MINT]?.price;
    return price ? parseFloat(price) : null;
  } catch {
    return null;
  }
}

/**
 * Get both prices with caching
 * Returns { sol: number, qhubx: number, qhubxPerUsd: number }
 */
export async function getTokenPrices() {
  const now = Date.now();
  if (cache.sol && cache.qhubx && now - cache.timestamp < CACHE_TTL) {
    return { ...cache };
  }

  const [sol, qhubx] = await Promise.all([
    fetchSolPrice(),
    fetchQhubxPriceJupiter(),
  ]);

  const solPrice = sol ?? cache.sol ?? 150;
  const qhubxPrice = qhubx ?? cache.qhubx ?? 0.001;

  cache = {
    sol: solPrice,
    qhubx: qhubxPrice,
    qhubxPerUsd: qhubxPrice > 0 ? 1 / qhubxPrice : 1000,
    timestamp: now,
  };

  return { ...cache };
}

/**
 * Convert USD amount to QHUBX tokens
 * @param {number} usdAmount  e.g. 10 (dollars)
 * @returns {Promise<{tokens: number, usdValue: number, rate: number}>}
 */
export async function usdToQhubx(usdAmount) {
  const { qhubx: pricePerToken } = await getTokenPrices();
  if (!pricePerToken || pricePerToken === 0) {
    throw new Error('Token price unavailable');
  }
  const tokens = usdAmount / pricePerToken;
  return {
    tokens: parseFloat(tokens.toFixed(6)),
    usdValue: usdAmount,
    rate: pricePerToken, // USD per 1 QHUBX
  };
}

/**
 * Convert QHUBX tokens to USD
 */
export async function qhubxToUsd(tokenAmount) {
  const { qhubx: pricePerToken } = await getTokenPrices();
  return parseFloat((tokenAmount * (pricePerToken ?? 0)).toFixed(4));
}

/**
 * Format token amount nicely
 */
export function formatTokenAmount(amount) {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
  return parseFloat(amount.toFixed(4)).toString();
}
