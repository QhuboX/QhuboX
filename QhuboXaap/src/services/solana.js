// src/solana.js
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SystemProgram,
  VersionedTransaction
} from '@solana/web3.js';

import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

window.Buffer = Buffer;

const HELIUS_API_KEY  = import.meta.env.VITE_HELIUS_API_KEY  || '';
const SOLANA_RPC_URL  = import.meta.env.VITE_SOLANA_RPC_URL
  || (HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com');

const JUPITER_API_KEY = import.meta.env.VITE_JUPITER_API_KEY || ''; // should NOT be set in frontend for prod
const USE_PROXY       = import.meta.env.VITE_USE_PROXY === 'true';
const PROXY_BASE      = (import.meta.env.VITE_PROXY_BASE || '').replace(/\/$/, '');

// Upstream endpoints (client uses proxy when configured)
const LITE_PRICE_BASE = 'https://lite-api.jup.ag/price/v2';
const LITE_TOKENS_BASE = 'https://lite-api.jup.ag/tokens/v1';
const SWAP_BASE_V2 = 'https://api.jup.ag/swap/v2';

const JUP_PRICE_PUBLIC = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/price` : `${LITE_PRICE_BASE}`;
const JUP_TOKENS_PUBLIC = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/tokens` : `${LITE_TOKENS_BASE}`;
const JUP_QUOTE_PUBLIC = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/quote` : `${SWAP_BASE_V2}/order`;
const JUP_SWAP_PUBLIC = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/swap` : `${SWAP_BASE_V2}/execute`;

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

export const SOL_MINT = 'So11111111111111111111111111111111111111112';

const metadataCache = new Map();
const priceCache    = new Map();
const PRICE_CACHE_TTL = 30_000; // 30 s

// Simple client-side circuit breaker to avoid hammering failing upstreams
const clientCircuit = { failures: 0, openUntil: 0, threshold: 6, cooldownMs: 30_000 };
function clientCircuitOpen() { return Date.now() < clientCircuit.openUntil; }
function clientRecordFailure() {
  clientCircuit.failures += 1;
  if (clientCircuit.failures >= clientCircuit.threshold) clientCircuit.openUntil = Date.now() + clientCircuit.cooldownMs;
}
function clientRecordSuccess() { clientCircuit.failures = 0; clientCircuit.openUntil = 0; }

// HELPERS
export const shortenAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

/** Fetch with timeout and normalized errors */
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    const msg = e && e.name === 'AbortError' ? 'timeout' : (e && e.message ? e.message : String(e));
    console.error('fetchWithTimeout error for', url, msg);
    throw e;
  }
}

// CoinGecko fallback
async function fetchCoinGeckoPrice(coinId = 'solana') {
  try {
    const res = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      {}, 6000
    );
    if (!res.ok) return 0;
    const d = await res.json();
    return d?.[coinId]?.usd || 0;
  } catch (err) {
    console.warn('CoinGecko fetch failed', err && err.message ? err.message : err);
    return 0;
  }
}

// Generic tryUrl with retries/backoff and client circuit integration
const tryUrl = async (url, timeout = 6000, retries = 2) => {
  if (clientCircuitOpen()) {
    console.warn('Client circuit open, skipping request to', url);
    return null;
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {}, timeout);
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          const delay = 200 * Math.pow(2, attempt);
          console.warn(`Upstream ${res.status} for ${url}, retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.warn('Price endpoint not ok', url, res.status);
        return null;
      }
      const d = await res.json();
      clientRecordSuccess();
      return d;
    } catch (err) {
      const msg = err && err.name === 'AbortError' ? 'timeout' : (err && err.message ? err.message : String(err));
      console.warn(`Price fetch failed for ${url} attempt ${attempt}:`, msg);
      if (attempt < retries) {
        const delay = 200 * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      clientRecordFailure();
      return null;
    }
  }
  return null;
};

// Robust getSolUsdPrice with proxy/direct fallback, retries, caching
export const getSolUsdPrice = async () => {
  const cacheKey = `price_${SOL_MINT}`;
  const cached   = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) return cached.value;

  const urls = [];
  if (USE_PROXY && PROXY_BASE) {
    urls.push(`${PROXY_BASE}/api/jupiter/price?ids=${encodeURIComponent(SOL_MINT)}`);
  }
  urls.push(`${LITE_PRICE_BASE}?ids=${encodeURIComponent(SOL_MINT)}`);
  urls.push(`https://api.jup.ag/price/v2?ids=${encodeURIComponent(SOL_MINT)}`);
  urls.push(`https://quote-api.jup.ag/price/v2?ids=${encodeURIComponent(SOL_MINT)}`);

  for (const url of urls) {
    const d = await tryUrl(url, 6000, 2);
    if (d && d.data && d.data[SOL_MINT]) {
      const price = Number(d.data[SOL_MINT].price || 0);
      if (price > 0) { priceCache.set(cacheKey, { value: price, ts: Date.now() }); return price; }
    } else {
      console.warn('Price fetch failed or no data for', url);
    }
  }

  // Final fallback: CoinGecko
  const cg = await fetchCoinGeckoPrice('solana');
  priceCache.set(cacheKey, { value: cg, ts: Date.now() });
  return cg;
};

export const getTokenPricesUsd = async (mintAddresses) => {
  if (!mintAddresses || mintAddresses.length === 0) return {};

  const result  = {};
  const toFetch = [];

  for (const mint of mintAddresses) {
    const cached = priceCache.get(`price_${mint}`);
    if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) result[mint] = cached.value;
    else toFetch.push(mint);
  }
  if (toFetch.length === 0) return result;

  for (let i = 0; i < toFetch.length; i += 100) {
    const chunk = toFetch.slice(i, i + 100);
    try {
      const ids = chunk.join(',');
      const proxyUrl = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/price?ids=${encodeURIComponent(ids)}` : null;
      const directUrl = `${LITE_PRICE_BASE}?ids=${encodeURIComponent(ids)}`;

      let d = null;
      if (proxyUrl) {
        d = await tryUrl(proxyUrl, 8000, 2);
        if (!d) d = await tryUrl(directUrl, 8000, 2);
      } else {
        d = await tryUrl(directUrl, 8000, 2);
      }

      if (d && d.data) {
        for (const [mint, info] of Object.entries(d.data || {})) {
          const price = Number(info?.price || 0);
          result[mint] = price;
          priceCache.set(`price_${mint}`, { value: price, ts: Date.now() });
        }
      }
    } catch (e) {
      console.warn('Batch price error:', e && e.message ? e.message : e);
    }
    for (const mint of chunk) {
      if (result[mint] === undefined) result[mint] = 0;
    }
  }
  return result;
};

// TOKEN METADATA
export const getTokenMetadata = async (mint) => {
  if (mint === SOL_MINT) return {
    symbol: 'SOL', name: 'Solana', decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  };

  if (metadataCache.has(mint)) return metadataCache.get(mint);

  if (HELIUS_API_KEY) {
    try {
      const d = await heliusFetch(`/tokens/${mint}`);
      const meta = {
        symbol: d?.symbol || '?', name: d?.name || 'Unknown',
        logoURI: d?.logo || null, decimals: d?.decimals ?? 6
      };
      metadataCache.set(mint, meta);
      return meta;
    } catch (e) {
      console.warn('Helius token metadata failed', e && e.message ? e.message : e);
    }
  }

  try {
    const url = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/tokens/${mint}` : `${LITE_TOKENS_BASE}/${mint}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (res.ok) {
      const j = await res.json();
      const meta = { symbol: j?.symbol || j?.data?.symbol || '?', name: j?.name || j?.data?.name || 'Unknown', logoURI: j?.logoURI || j?.data?.logoURI || null, decimals: j?.decimals ?? j?.data?.decimals ?? 6 };
      metadataCache.set(mint, meta);
      return meta;
    }
  } catch (e) {
    console.warn('lite-api token metadata failed', e && e.message ? e.message : e);
  }

  try {
    const res = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {}, 6000);
    if (res.ok) {
      const d = await res.json();
      if (d.pairs?.length) {
        const p = d.pairs[0];
        const meta = { symbol: p.baseToken?.symbol || '?', name: p.baseToken?.name || 'Unknown', logoURI: p.info?.imageUrl || null, decimals: 6 };
        metadataCache.set(mint, meta);
        return meta;
      }
    }
  } catch (e) { /* fallthrough */ }

  return { symbol: '???', name: 'Unknown Token', decimals: 6, logoURI: null };
};

// TOKEN BALANCES
export const getTokenBalances = async (walletAddress) => {
  if (!walletAddress) return [];

  if (HELIUS_API_KEY) {
    try {
      const data = await heliusFetch(`/addresses/${walletAddress}/tokens`);
      const balances = await Promise.all(data.map(async (t) => {
        const decimals  = t.decimals ?? 0;
        const uiAmount  = Number(t.amount) / Math.pow(10, decimals);
        if (!uiAmount || uiAmount <= 0) return null;
        const meta = await getTokenMetadata(t.mint).catch(() => null);
        return {
          mint:     t.mint,
          balance:  uiAmount,
          decimals: decimals || (meta?.decimals ?? 6),
          symbol:   meta?.symbol || t.symbol || '???',
          name:     meta?.name || 'Unknown',
          logo:     meta?.logoURI || null,
          usdValue: 0
        };
      }));
      return balances.filter(Boolean);
    } catch (e) {
      console.warn('Helius token balances failed, falling back to RPC', e && e.message ? e.message : e);
    }
  }

  try {
    const publicKey = new PublicKey(walletAddress);
    const response  = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
    const balances  = await Promise.all(response.value.map(async (acc) => {
      const info     = acc.account.data.parsed.info;
      const uiAmount = info.tokenAmount.uiAmount;
      if (!uiAmount || uiAmount <= 0) return null;
      const meta = await getTokenMetadata(info.mint);
      return {
        mint:     info.mint,
        balance:  uiAmount,
        decimals: info.tokenAmount.decimals,
        symbol:   meta?.symbol || '???',
        name:     meta?.name || 'Unknown',
        logo:     meta?.logoURI || null,
        usdValue: 0
      };
    }));
    return balances.filter(Boolean);
  } catch (e) {
    console.error('getTokenBalances error:', e);
    return [];
  }
};

// SOL BALANCE
export const getSolBalance = async (walletAddress) => {
  try {
    const pubKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (e) {
    console.error('getSolBalance error:', e);
    return 0;
  }
};

// FULL PORTFOLIO
export const getFullPortfolio = async (walletAddress) => {
  if (!walletAddress) return { solBalance: 0, solUsdPrice: 0, tokens: [], totalUsd: 0 };

  const [solBalance, solUsdPrice, rawTokens] = await Promise.all([
    getSolBalance(walletAddress),
    getSolUsdPrice(),
    getTokenBalances(walletAddress)
  ]);

  const prices = rawTokens.length > 0 ? await getTokenPricesUsd(rawTokens.map(t => t.mint)) : {};
  const tokens = rawTokens.map(t => ({ ...t, usdValue: (prices[t.mint] || 0) * t.balance }));
  const totalUsd = solBalance * solUsdPrice + tokens.reduce((s, t) => s + t.usdValue, 0);

  return { solBalance, solUsdPrice, tokens, totalUsd };
};

// VALIDATE MINT
export const validateMintBasic = async (mintStr) => {
  try {
    const info     = await connection.getParsedAccountInfo(new PublicKey(mintStr));
    if (!info.value) return { ok: false };
    const decimals = info.value.data?.parsed?.info?.decimals ?? 6;
    return { ok: true, decimals };
  } catch { return { ok: false }; }
};

// JUPITER QUOTE — proxy-first then direct (Swap V2 order/build)
export async function getJupiterQuote(inputMint, outputMint, amountBaseUnitsStr, slippageBps = 50) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount:      String(amountBaseUnitsStr),
    slippageBps: String(slippageBps),
    swapMode:    'ExactIn'
  }).toString();

  const proxyUrl = USE_PROXY && PROXY_BASE ? `${PROXY_BASE}/api/jupiter/quote?${params}` : null;
  const directOrder = `${SWAP_BASE_V2}/order?${params}`;
  const directBuild = `${SWAP_BASE_V2}/build?${params}`;

  if (proxyUrl) {
    const d = await tryUrl(proxyUrl, 10000, 2);
    if (d) {
      if (d?.outAmount || d?.data) return { success: true, data: d };
      if (d?.error) return { success: false, error: 'no-route', message: d.error };
    } else {
      console.warn('Proxy quote fetch failed, will try direct endpoints.');
    }
  }

  // Try order then build
  const headers = {};
  if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;

  for (const url of [directOrder, directBuild]) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers }, 10000);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`Jupiter quote ${res.status} for ${url}:`, text.slice(0, 200));
        continue;
      }
      const data = await res.json();
      if (data?.outAmount || data?.data) return { success: true, data };
      if (data?.error) return { success: false, error: 'no-route', message: data.error };
    } catch (e) {
      console.error('getJupiterQuote error for', url, e && e.message ? e.message : e);
    }
  }

  return { success: false, error: 'no-route' };
}

// PERFORM SWAP — build via proxy (preferred) then direct; proxy must POST to /swap/v2/execute
export const performSwap = async (walletInstance, inputMint, outputMint, amountUi, slippageBps = 50) => {
  try {
    const inMeta       = await getTokenMetadata(inputMint).catch(() => ({ decimals: 9 }));
    const inDecimals   = inMeta?.decimals ?? 9;
    const amountBase   = Math.floor(Number(amountUi) * Math.pow(10, inDecimals));

    if (!Number.isFinite(amountBase) || amountBase <= 0) {
      return { success: false, error: 'invalid-amount', message: 'Amount must be > 0' };
    }

    const quoteRes = await getJupiterQuote(inputMint, outputMint, amountBase, slippageBps);
    if (!quoteRes.success) return { success: false, error: quoteRes.error, message: quoteRes.message, details: quoteRes.raw };

    // Build swap transaction: prefer proxy (server should have API key for POST), fallback to direct only if key present (not recommended)
    const swapEndpoints = [];
    if (USE_PROXY && PROXY_BASE) swapEndpoints.push(`${PROXY_BASE}/api/jupiter/swap`);
    swapEndpoints.push(`${SWAP_BASE_V2}/execute`);

    let swapData = null;
    for (const swapUrl of swapEndpoints) {
      try {
        const swapHeaders = { 'Content-Type': 'application/json' };
        // Only attach client-side JUPITER_API_KEY if it's set in env (should NOT be in client in prod)
        if (JUPITER_API_KEY && !swapUrl.includes(PROXY_BASE)) swapHeaders['x-api-key'] = JUPITER_API_KEY;

        const swapRes = await fetchWithTimeout(swapUrl, {
          method:  'POST',
          headers: swapHeaders,
          body:    JSON.stringify({
            quoteResponse:              quoteRes.data,
            userPublicKey:              walletInstance.publicKey.toString(),
            wrapAndUnwrapSol:           true,
            dynamicComputeUnitLimit:    true,
            prioritizationFeeLamports:  'auto'
          })
        }, 15000);

        if (swapRes.ok) { swapData = await swapRes.json(); break; }

        const txt = await swapRes.text().catch(() => '');
        console.warn(`Swap endpoint ${swapUrl} → ${swapRes.status}:`, txt.slice(0, 200));
        if (swapRes.status === 401) {
          return { success: false, error: 'unauthorized', message: 'Swap endpoint unauthorized (server missing API key?)' };
        }
      } catch (e) {
        console.warn(`Swap endpoint ${swapUrl} failed:`, e && e.message ? e.message : e);
      }
    }

    if (!swapData?.swapTransaction) {
      return { success: false, error: 'swap-tx-build-failed', message: 'Could not build swap transaction from any endpoint.' };
    }

    const txBuf      = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);

    let signedTx;
    if (typeof walletInstance.signTransaction === 'function') {
      signedTx = await walletInstance.signTransaction(transaction);
    } else {
      transaction.sign([walletInstance]);
      signedTx = transaction;
    }

    const txid   = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true, maxRetries: 3 });
    const latest = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({ blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, signature: txid }, 'confirmed');

    return { success: true, txid, quote: quoteRes.data };
  } catch (err) {
    console.error('performSwap error:', err && err.message ? err.message : err);
    return { success: false, error: err.message || 'unknown' };
  }
};

export const performSwapWithOrderExecute = performSwap;
export const executeSwap = async (wallet, quoteData) => {
  if (!quoteData?.inputMint || !quoteData?.outputMint) {
    return { success: false, error: 'invalid-quote' };
  }

  let amountUi = Number(quoteData.amount || quoteData.inAmount || quoteData.amountUi || 0);
  if (!amountUi || amountUi <= 0) {
    // from quote object may have inAmount, outAmount in base units; convert using decimals
    const inMint = quoteData.inputMint;
    const inMeta = await getTokenMetadata(inMint).catch(() => ({ decimals: 9 }));
    const inDecimals = inMeta?.decimals ?? 9;
    const inAmountBase = Number(quoteData.inAmount || quoteData.amount || 0);
    if (inAmountBase > 0) {
      amountUi = inAmountBase / Math.pow(10, inDecimals);
    }
  }

  if (!amountUi || amountUi <= 0) {
    return { success: false, error: 'invalid-amount', message: 'Missing amount in quoteData' };
  }

  return performSwap(wallet, quoteData.inputMint, quoteData.outputMint, amountUi, quoteData.slippageBps || 50);
};

// SEND SOL
export const sendSol = async (fromWallet, toAddress, amount) => {
  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey:   new PublicKey(toAddress),
        lamports:   Math.floor(amount * LAMPORTS_PER_SOL)
      })
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer        = fromWallet.publicKey;

    if (typeof fromWallet.signTransaction === 'function') {
      const signed = await fromWallet.signTransaction(tx);
      const sig    = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, 'confirmed');
      return sig;
    } else {
      tx.sign(fromWallet);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, 'confirmed');
      return sig;
    }
  } catch (e) {
    console.error('sendSol error:', e);
    return null;
  }
};