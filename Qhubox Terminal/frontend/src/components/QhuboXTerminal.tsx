'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
  connectWallet, getSOLBalance, getSwapQuote, buildSwapTransaction,
  executeSwap, detectWallet, SOL_MINT, LAMPORTS_PER_SOL
} from '@/lib/wallet';
import { useSocket, TokenAlert } from '@/lib/useSocket';

// ─── HELPERS ────────────────────────────────────────────────────────────────
const DEX = 'https://api.dexscreener.com';

function fmtNum(n?: number): string {
  if (!n || isNaN(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtPrice(p?: string | number): string {
  const n = parseFloat(String(p));
  if (isNaN(n)) return '$0';
  if (n < 0.000001) return '$' + n.toExponential(2);
  if (n < 0.01) return '$' + n.toFixed(6);
  if (n < 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm';
}

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface PairData {
  ca: string; symbol: string; name: string; price: string;
  mcap: number; liq: number; vol24: number; chg24: number;
  holders?: number; image?: string; pairAddr?: string;
  txns?: { buys: number; sells: number };
  isNew?: boolean; isHot?: boolean; isGrad?: boolean;
  website?: string; twitter?: string; telegram?: string; hasDexPaid?: boolean;
}

type TradeTab = 'new' | 'hot' | 'grad';
type TradeMode = 'buy' | 'sell';

// ─── TOAST ──────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'ok' | 'err' | 'inf' }[]>([]);
  const show = useCallback((msg: string, type: 'ok' | 'err' | 'inf' = 'inf') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function QhuboXTerminal() {
  // Wallet state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string>('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);

  // Token lists
  const [tokenData, setTokenData] = useState<{ new: PairData[]; hot: PairData[]; grad: PairData[] }>({ new: [], hot: [], grad: [] });
  const [activeTab, setActiveTab] = useState<TradeTab>('new');

  // Selection & trade
  const [selected, setSelected] = useState<PairData | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [chartTF, setChartTF] = useState('1');
  const [tradeLoading, setTradeLoading] = useState(false);
  const [quoteOut, setQuoteOut] = useState<string>('—');
  
  // NEW: time filter for radar, search state (✨ AQUÍ ESTÁ EL CAMBIO)
  const [timeFilter, setTimeFilter] = useState<'🌱 New' | 5 | 15>('🌱 New');
  
  const [searchCA, setSearchCA] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Socket for real-time radar feed
  const { alerts, connected: socketConnected } = useSocket();

  const { toasts, show: showToast } = useToast();
  const balanceIntervalRef = useRef<any>(null);

  // ─── FETCH TOKEN LISTS ────────────────────────────────────────────────────
  const fetchTokens = useCallback(async (tab: TradeTab) => {
    try {
      if (tab === 'new' || tab === 'hot') {
        const r = await fetch(`${DEX}/token-boosts/top/v1`);
        const boosts = await r.json();
        const addrs = boosts.filter((t: any) => t.chainId === 'solana')
          .slice(0, 20).map((t: any) => t.tokenAddress).join(',');
        if (!addrs) return;
        const r2 = await fetch(`${DEX}/latest/dex/tokens/${addrs}`);
        const d = await r2.json();
        if (!d.pairs) return;
        const now = Date.now();
        const seen = new Set<string>();
        const arr: PairData[] = [];
        d.pairs.forEach((p: any) => {
          if (seen.has(p.baseToken.address)) return;
          seen.add(p.baseToken.address);
          const age = (now - (p.pairCreatedAt || now)) / 3600000;
          const vol24 = p.volume?.h24 || 0;
          const chg24 = p.priceChange?.h24 || 0;
          arr.push({
            ca: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name,
            price: p.priceUsd || '0', mcap: p.fdv || 0, liq: p.liquidity?.usd || 0,
            vol24, chg24, holders: p.info?.holders || 0,
            image: p.info?.imageUrl || undefined,
            pairAddr: p.pairAddress,
            txns: { buys: p.txns?.h24?.buys || 0, sells: p.txns?.h24?.sells || 0 },
            isNew: age < 2,
            isHot: Math.abs(vol24) > 50000 || Math.abs(chg24) > 20,
          });
        });
        if (tab === 'new')
          setTokenData(d => ({ ...d, new: arr.filter(t => t.isNew).slice(0, 20) }));
        else
          setTokenData(d => ({ ...d, hot: arr.filter(t => (t.chg24 || 0) > -40).sort((a, b) => Math.abs(b.vol24) - Math.abs(a.vol24)).slice(0, 20) }));
      }
      if (tab === 'grad') {
        const r = await fetch(`${DEX}/token-profiles/latest/v1`);
        const profiles = await r.json();
        const addrs = profiles.filter((t: any) => t.chainId === 'solana')
          .slice(0, 12).map((t: any) => t.tokenAddress).join(',');
        if (!addrs) return;
        const r2 = await fetch(`${DEX}/latest/dex/tokens/${addrs}`);
        const d = await r2.json();
        if (!d.pairs) return;
        const seen = new Set<string>();
        const arr: PairData[] = [];
        d.pairs.forEach((p: any) => {
          if (seen.has(p.baseToken.address)) return;
          seen.add(p.baseToken.address);
          arr.push({
            ca: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name,
            price: p.priceUsd || '0', mcap: p.fdv || 0, liq: p.liquidity?.usd || 0,
            vol24: p.volume?.h24 || 0, chg24: p.priceChange?.h24 || 0,
            image: p.info?.imageUrl || undefined, pairAddr: p.pairAddress,
            txns: { buys: p.txns?.h24?.buys || 0, sells: p.txns?.h24?.sells || 0 },
            isGrad: true,
          });
        });
        setTokenData(d => ({ ...d, grad: arr.filter(t => (t.chg24 || 0) > -40) }));
      }
    } catch (e) { console.error('Fetch tokens error:', e); }
  }, []);

  useEffect(() => {
    fetchTokens('new');
    fetchTokens('hot');
    const iv = setInterval(() => fetchTokens(activeTab), 30000);
    return () => clearInterval(iv);
  }, [activeTab, fetchTokens]);

  // ─── FETCH SELECTED TOKEN DETAILS ─────────────────────────────────────────
  const fetchPairDetails = useCallback(async (ca: string) => {
    try {
      const r = await fetch(`${DEX}/latest/dex/tokens/${ca}`);
      const d = await r.json();
      const p = d.pairs?.[0];
      if (!p) return;
      const socials = p.info?.socials || [];
      const links = p.info?.websites || [];
      setSelected(prev => prev ? {
        ...prev, price: p.priceUsd || prev.price, mcap: p.fdv || prev.mcap,
        liq: p.liquidity?.usd || prev.liq, vol24: p.volume?.h24 || prev.vol24,
        chg24: p.priceChange?.h24 || prev.chg24,
        holders: p.info?.holders || prev.holders,
        txns: { buys: p.txns?.h24?.buys || 0, sells: p.txns?.h24?.sells || 0 },
        pairAddr: p.pairAddress || prev.pairAddr,
        website: links[0]?.url || prev.website,
        twitter: socials.find((s: any) => s.type === 'twitter')?.url || prev.twitter,
        telegram: socials.find((s: any) => s.type === 'telegram')?.url || prev.telegram,
        hasDexPaid: (p.boosts?.active > 0) || prev.hasDexPaid,
      } : null);
    } catch (_) {}
  }, []);

  const selectToken = useCallback((t: PairData) => {
    setSelected(t);
    setTradeAmount('');
    setQuoteOut('—');
    setTimeout(() => fetchPairDetails(t.ca), 100);
  }, [fetchPairDetails]);

  // Auto-refresh selected token every 15s
  useEffect(() => {
    if (!selected) return;
    const iv = setInterval(() => fetchPairDetails(selected.ca), 15000);
    return () => clearInterval(iv);
  }, [selected, fetchPairDetails]);

  // ─── WALLET ───────────────────────────────────────────────────────────────
  const handleConnectWallet = async () => {
    if (walletConnected) {
      setWalletConnected(false);
      setWalletAddress(null);
      setWalletBalance(0);
      if (balanceIntervalRef.current) clearInterval(balanceIntervalRef.current);
      showToast('Wallet disconnected', 'inf');
      return;
    }
    setWalletLoading(true);
    try {
      const { publicKey, name, balance } = await connectWallet();
      setWalletAddress(publicKey);
      setWalletName(name);
      setWalletBalance(balance);
      setWalletConnected(true);
      showToast(`Connected: ${name} ✓`, 'ok');

      // Poll balance every 30s
      balanceIntervalRef.current = setInterval(async () => {
        const bal = await getSOLBalance(publicKey);
        setWalletBalance(bal);
      }, 30000);
    } catch (e: any) {
      showToast(e.message || 'Connection failed', 'err');
    } finally {
      setWalletLoading(false);
    }
  };

  // ─── QUOTE ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tradeAmount || !selected || parseFloat(tradeAmount) <= 0) { setQuoteOut('—'); return; }
    const debounce = setTimeout(async () => {
      try {
        const isBuy = tradeMode === 'buy';
        const inMint = isBuy ? SOL_MINT : selected.ca;
        const outMint = isBuy ? selected.ca : SOL_MINT;
        const amount = isBuy
          ? Math.round(parseFloat(tradeAmount) * LAMPORTS_PER_SOL)
          : Math.round(parseFloat(tradeAmount) * 1e6);
        const slipBps = Math.round(parseFloat(slippage) * 100);
        const quote = await getSwapQuote(inMint, outMint, amount, slipBps);
        const out = parseFloat(quote.outAmount);
        if (isBuy) setQuoteOut((out / 1e6).toFixed(4) + ' ' + selected.symbol);
        else setQuoteOut((out / LAMPORTS_PER_SOL).toFixed(6) + ' SOL');
      } catch (_) { setQuoteOut('—'); }
    }, 600);
    return () => clearTimeout(debounce);
  }, [tradeAmount, tradeMode, slippage, selected]);


  // ─── SEARCH BY CA ────────────────────────────────────────────────────────
  const searchByCA = async () => {
    const ca = searchCA.trim();
    if (!ca || ca.length < 32) { showToast('Enter a valid contract address', 'err'); return; }
    setSearchLoading(true);
    try {
      const r = await fetch(`${DEX}/latest/dex/tokens/${ca}`);
      const d = await r.json();
      const p = d.pairs?.[0];
      if (!p) { showToast('Token not found on DexScreener', 'err'); return; }
      const socials = p.info?.socials || [];
      const links = p.info?.websites || [];
      const tok: PairData = {
        ca: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name,
        price: p.priceUsd || '0', mcap: p.fdv || 0, liq: p.liquidity?.usd || 0,
        vol24: p.volume?.h24 || 0, chg24: p.priceChange?.h24 || 0,
        holders: p.info?.holders || 0, image: p.info?.imageUrl || undefined,
        pairAddr: p.pairAddress, txns: { buys: p.txns?.h24?.buys || 0, sells: p.txns?.h24?.sells || 0 },
        website: links[0]?.url || undefined,
        twitter: socials.find((s: any) => s.type === 'twitter')?.url || undefined,
        telegram: socials.find((s: any) => s.type === 'telegram')?.url || undefined,
        hasDexPaid: (p.boosts?.active > 0) || false,
      };
      selectToken(tok);
      setSearchCA('');
      showToast(`Found: ${tok.symbol} ✓`, 'ok');
    } catch (e) { showToast('Search failed', 'err'); }
    finally { setSearchLoading(false); }
  };

  // ─── EXECUTE TRADE ────────────────────────────────────────────────────────
  const executeTrade = async () => {
    if (!walletConnected || !selected || !tradeAmount) return;
    const detected = detectWallet();
    if (!detected) { showToast('Wallet not available', 'err'); return; }

    setTradeLoading(true);
    showToast('Getting best route via Jupiter...', 'inf');

    try {
      const isBuy = tradeMode === 'buy';
      const inMint = isBuy ? SOL_MINT : selected.ca;
      const outMint = isBuy ? selected.ca : SOL_MINT;
      const amount = isBuy
        ? Math.round(parseFloat(tradeAmount) * LAMPORTS_PER_SOL)
        : Math.round(parseFloat(tradeAmount) * 1e6);
      const slipBps = Math.round(parseFloat(slippage) * 100);

      showToast('Requesting quote...', 'inf');
      const quote = await getSwapQuote(inMint, outMint, amount, slipBps);

      showToast('Building transaction...', 'inf');
      const { swapTransaction } = await buildSwapTransaction(quote, walletAddress!);

      showToast('Please approve in your wallet...', 'inf');
      const txid = await executeSwap(swapTransaction, detected.provider);

      showToast(
        `✓ ${isBuy ? 'BOUGHT' : 'SOLD'} ${selected.symbol} — TX: ${txid.slice(0, 8)}...`,
        'ok'
      );
      setTradeAmount('');
      setQuoteOut('—');

      // Refresh balance
      if (walletAddress) {
        const bal = await getSOLBalance(walletAddress);
        setWalletBalance(bal);
      }
    } catch (e: any) {
      showToast('Swap failed: ' + (e.message || 'Unknown error'), 'err');
    } finally {
      setTradeLoading(false);
    }
  };

  const copyCA = () => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.ca).catch(() => {});
    showToast('Contract address copied ✓', 'inf');
  };

  // ─── LÓGICA DE FILTRADO ACTUALIZADA (Frontend) ──────────────────────────
const radarTokens = alerts.filter(a => {
  if (a.isMigration) return false;
  
  // Edad exacta en minutos
  const ageMins = (Date.now() - a.timestamp) / 60000;

  if (timeFilter === '🌱 New') {
    return ageMins < 5; // 🚀 Ahora solo dura de 0 a 5 minutos
  }
  if (timeFilter === 5) {
    return ageMins >= 5 && ageMins < 15; // De 5 a 15 minutos
  }
  if (timeFilter === 15) {
    return ageMins >= 15; // De 15 minutos en adelante
  }
  return false;
});

  const currentTokens = tokenData[activeTab] || [];
  const liqPct = selected ? Math.min(100, Math.round((selected.liq || 0) / Math.max(selected.mcap || 1, 1) * 100 * 12)) : 0;
  const mcapPct = selected ? Math.min(100, Math.round(Math.min((selected.mcap || 0) / 1e6, 100))) : 0;
  const holdPct = selected ? Math.min(100, Math.round(Math.min((selected.holders || 0) / 5000, 1) * 100)) : 0;
  const isBuy = tradeMode === 'buy';
  const chgColor = (selected?.chg24 ?? 0) >= 0 ? '#059669' : '#e11d48';

  const chartUrl = selected
    ? `https://dexscreener.com/solana/${selected.pairAddr || selected.ca}?embed=1&loadChartSettings=0&trades=1&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=${chartTF}`
    : '';

  const badge = (t: PairData) => {
    if (t.isNew) return <span style={styles.bNew}>NEW</span>;
    if (t.isHot) return <span style={styles.bHot}>HOT</span>;
    if (t.isGrad) return <span style={styles.bGrad}>TREND</span>;
    return null;
  };

  return (
    <div style={styles.root}>
      {/* ── FIXED HEADER ─────────────────────────────────────────── */}
      <header style={styles.hdr}>
        <div style={styles.logo}>
          <div style={styles.logoCube}>
            {/* Use actual icon.png */}
            <img src="/icon.png" alt="QhuboX" style={{ width: 50, height: 50, borderRadius: 10, objectFit: 'cover' }} />
          </div>
          <div>
            <div style={styles.logoName}>QhuboX <span style={{ color: '#0891b2' }}>Terminal</span></div>
            <div style={styles.logoSub}>SPL Trading · Solana Mainnet</div>
          </div>
        </div>
        <div style={styles.hdrRight}>
          {socketConnected && (
            <div style={styles.netPill}>
              <div style={styles.pDot} />
              SOLANA
            </div>
          )}
          <button
            style={{ ...styles.wBtn, ...(walletConnected ? styles.wBtnOn : {}) }}
            onClick={handleConnectWallet}
            disabled={walletLoading}
          >
            {walletLoading ? '...' : walletConnected
              ? `◉ ${walletAddress!.slice(0, 4)}...${walletAddress!.slice(-4)}`
              : '◉ CONNECT WALLET'}
          </button>
        </div>
      </header>

      {/* ── SCROLLABLE BODY ──────────────────────────────────────── */}
      <div style={styles.body}>
        <div style={styles.grid}>

          {/* ── LEFT PANEL: TOKEN LIST ─────────────────────────── */}
          <div style={styles.panelL}>

            {/* ── SEARCH BY CA ── */}
            <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid rgba(210,220,255,0.4)' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  value={searchCA}
                  onChange={e => setSearchCA(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchByCA()}
                  placeholder="Search by contract address..."
                  style={{ flex: 1, background: 'rgba(255,255,255,.7)', border: '1px solid rgba(210,220,255,.6)', borderRadius: 7, padding: '5px 8px', fontSize: 8, fontFamily: "'Space Mono',monospace", color: '#1a1a2e', outline: 'none' }}
                />
                <button
                  onClick={searchByCA}
                  disabled={searchLoading}
                  style={{ padding: '5px 9px', background: 'rgba(0,229,255,.1)', border: '1px solid rgba(0,229,255,.35)', borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#bff2ff', fontFamily: "'Space Mono',monospace", letterSpacing: .5 }}
                >
                  {searchLoading ? '...' : '⌕'}
                </button>
              </div>
            </div>
            <div style={styles.tabBar}>
              {(['new', 'hot', 'grad'] as TradeTab[]).map(t => (
                <button
                  key={t}
                  style={{ ...styles.tab, ...(activeTab === t ? styles.tabOn : {}) }}
                  onClick={() => { setActiveTab(t); if (!tokenData[t].length) fetchTokens(t); }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            <div style={styles.tokList}>
              <div style={styles.secHdr}>
                <span>{activeTab.toUpperCase()} TOKENS</span>
                <span style={{ color: '#79e3fd' }}>{currentTokens.length} LIVE</span>
              </div>

              

              {currentTokens.map(t => (
                <div
                  key={t.ca}
                  style={{ ...styles.tok, ...(selected?.ca === t.ca ? styles.tokSel : {}) }}
                  onClick={() => selectToken(t)}
                >
                  <div style={styles.tokImg}>
                    {t.image
                      ? <img src={t.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                      : <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9' }}>{t.symbol?.slice(0, 2)}</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.tokSym}>{t.symbol} {badge(t)}</div>
                    <div style={styles.tokName}>{t.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={styles.tokMc}>{fmtNum(t.mcap)}</div>
                    <div style={{ ...styles.tokChg, color: t.chg24 >= 0 ? '#059669' : '#e11d48' }}>
                      {t.chg24 >= 0 ? '+' : ''}{(t.chg24 || 0).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}

              {/* RADAR FEED from WebSocket */}
              {activeTab === 'new' && (
                <>
                  <div style={{ ...styles.secHdr, marginTop: 12, borderTop: '1px solid rgba(210,220,255,0.4)', paddingTop: 8 }}>
                    <span>⚡ RADAR FEED</span>
                    <span style={{ color: '#94e7fc' }}>LIVE</span>
                  </div>
                 {/* Time filter buttons — actualizados con la nueva lógica y label */}
{alerts.length > 0 && ( // Usamos alerts.length para que los botones se vean si hay data global
  <div style={{ display: 'flex', gap: 3, padding: '0 2px 6px' }}>
   {/* Cambiamos el array de opciones a [ '🌱 New', 5, 15 ] */}
{(['🌱 New', 5, 15] as const).map(m => (
  <button
        key={m.toString()}
        onClick={() => setTimeFilter(m)}
        style={{ 
          flex: 1, 
          padding: '3px 0', 
          border: `1px solid ${timeFilter === m ? 'rgba(0,229,255,.5)' : 'rgba(217, 222, 240, 0.97)'}`, 
          borderRadius: 6, 
          fontSize: 8, 
          fontWeight: 700, 
          fontFamily: "'Space Mono',monospace", 
          cursor: 'pointer', 
          color: timeFilter === m ? '#00ccff' : '#78a4fd', 
          background: timeFilter === m ? 'rgba(174, 201, 204, 0.55)' : 'rgba(255,255,255,.4)' 
        }}
      >
    {typeof m === 'string' ? m : `${m}m`}
  </button>

    ))}
  </div>
)}
                  {radarTokens.length === 0 ? (
                    <div style={{ padding: '16px 8px', textAlign: 'center', color: '#9aa3bc', fontSize: 8, fontFamily: "'Space Mono',monospace", letterSpacing: '1px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={styles.spinner} />
                      <span>AWAITING SIGNAL...</span>
                    </div>
                  ) : radarTokens.slice(0, 10).map(a => (
                    <div
                      key={a.ca}
                      style={{ ...styles.tok, ...(selected?.ca === a.ca ? styles.tokSel : {}) }}
                      onClick={() => selectToken({
                        ca: a.ca, symbol: a.symbol, name: a.name,
                        price: '0', mcap: a.mcap || 5000, liq: 0, vol24: 0,
                        chg24: 0, image: a.imageData || a.image,
                        website: a.website, twitter: a.twitter, telegram: a.telegram,
                        hasDexPaid: a.hasDexPaid,
                      })}
                    >
                      <div style={styles.tokImg}>
                        {(a.imageData || a.image)
                          ? <img src={a.imageData || a.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                          : <span style={{ fontSize: 10, color: '#6d28d9' }}>{a.symbol?.slice(0, 2)}</span>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.tokSym}>{a.symbol} <span style={styles.bNew}>NEW</span></div>
                        <div style={styles.tokName}>{a.name}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ ...styles.tokMc, color: '#c6fceb', fontSize: 9 }}>{a.buyAmount} SOL</div>
                        <div style={{ ...styles.tokChg, color: '#a2bbff' }}>{timeAgo(a.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ── CENTER: CHART + METRICS ──────────────────────────── */}
          <div style={styles.panelC}>
            {!selected ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}></div>
                <div style={styles.emptyText}>SELECT A TOKEN TO BEGIN</div>
                <div style={styles.emptySub}>QhuboX · REAL-TIME SPL · SOLANA</div>
              </div>
            ) : (
              <>
                {/* Token Header */}
                <div style={styles.tokHdr}>
                  <div style={styles.tokAv}>
                    {selected.image
                      ? <img src={selected.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                      : <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{selected.symbol?.slice(0, 2)}</span>
                    }
                  </div>
                  <div>
                    <div style={styles.tokMetaH1}>{selected.symbol}</div>
                    <div style={styles.tokMetaP}>{selected.name}</div>
                  </div>
                  <div style={{ marginLeft: 12 }}>
                    <div style={styles.priceBig}>{fmtPrice(selected.price)}</div>
                    <span style={{ ...styles.chgBig, color: chgColor }}>
                      {(selected.chg24 ?? 0) >= 0 ? '+' : ''}{(selected.chg24 ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  <div style={styles.lnks}>
                    <a style={{ ...styles.lnk, borderColor: 'rgba(195, 181, 253, 0.86)', color: '#5d00ff' }} href={`https://dexscreener.com/solana/${selected.ca}`} target="_blank" rel="noreferrer">↗ DEX</a>
                    <a style={{ ...styles.lnk, borderColor: 'rgba(195, 181, 253, 0.86)', color: '#5d00ff' }} href={`https://pump.fun/${selected.ca}`} target="_blank" rel="noreferrer">↗ PUMP</a>
                    <a style={{ ...styles.lnk, borderColor: 'rgba(195, 181, 253, 0.86)', color: '#5d00ff' }} href={`https://solscan.io/token/${selected.ca}`} target="_blank" rel="noreferrer">↗ SCAN</a>
                    <a style={{ ...styles.lnk, borderColor: 'rgba(195, 181, 253, 0.86)', color: '#5d00ff' }} href={`https://x.com/search?q=${selected.ca}`} target="_blank" rel="noreferrer">↗ X</a>
                  </div>
                </div>

                {/* Social / Info row */}
                {(selected.website || selected.twitter || selected.telegram || selected.hasDexPaid) && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, marginTop: -4 }}>
                    {selected.website && (
                      <a href={selected.website} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', border: '1px solid rgba(96,165,250,.35)', borderRadius: 6, fontSize: 8, fontWeight: 700, color: '#3b82f6', background: 'rgba(96,165,250,.07)', textDecoration: 'none', fontFamily: "'Space Mono',monospace" }}>
                        🌐 WEBSITE
                      </a>
                    )}
                    {selected.twitter && (
                      <a href={selected.twitter} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', border: '1px solid rgba(29,161,242,.3)', borderRadius: 6, fontSize: 8, fontWeight: 700, color: '#1da1f2', background: 'rgba(29,161,242,.07)', textDecoration: 'none', fontFamily: "'Space Mono',monospace" }}>
                        𝕏 TWITTER
                      </a>
                    )}
                    {selected.telegram && (
                      <a href={selected.telegram} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', border: '1px solid rgba(0,136,204,.3)', borderRadius: 6, fontSize: 8, fontWeight: 700, color: '#0088cc', background: 'rgba(0,136,204,.07)', textDecoration: 'none', fontFamily: "'Space Mono',monospace" }}>
                        ✈ TELEGRAM
                      </a>
                    )}
                    {selected.hasDexPaid && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', border: '1px solid rgba(245,158,11,.35)', borderRadius: 6, fontSize: 8, fontWeight: 700, color: '#d97706', background: 'rgba(245,158,11,.08)', fontFamily: "'Space Mono',monospace" }}>
                        ⚡ DEX PAID
                      </span>
                    )}
                  </div>
                )}

                {/* Metrics Bar */}
                <div style={styles.mBar}>
                  {[
                    { l: 'Market Cap', v: fmtNum(selected.mcap), c: '#cdf5ff' },
                    { l: 'Liquidity', v: fmtNum(selected.liq), c: '#7c3aed' },
                    { l: 'Vol 24H', v: fmtNum(selected.vol24), c: '#d97706' },
                    { l: 'Buys / Sells', v: `${selected.txns?.buys ?? 0} / ${selected.txns?.sells ?? 0}`, c: '#1a1a2e' },
                  ].map(m => (
                    <div key={m.l} style={styles.met}>
                      <div style={styles.metL}>{m.l}</div>
                      <div style={{ ...styles.metV, color: m.c }}>{m.v}</div>
                    </div>
                  ))}
                </div>

                

                {/* Chart */}
                <div style={styles.chartFr}>
                  <div style={styles.chartTb}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[].map(tf => (
                        <button
                          key={tf}
                          style={{ ...styles.tfBtn, ...(chartTF === tf ? styles.tfBtnOn : {}) }}
                          onClick={() => setChartTF(tf)}
                        >
                          {tf}
                        </button>
                      
                          
                      ))}
                    </div>
                    <div style={styles.chartTag}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#070808', boxShadow: '0 0 8px #000000', }} />
                      DEXSCREENER · LIVE
                    </div>
                  </div>
                  <iframe
  key={`${selected.ca}-${chartTF}`}
  src={chartUrl}
  style={{ width: '100%', height: 485, border: 'none', display: 'block' }}
  title={`Chart ${selected.symbol}`}
/>

                </div>
              </>
            )}
          </div>

          {/* ── RIGHT PANEL: TRADE ───────────────────────────────── */}
          <div style={styles.panelR}>
            <div style={styles.trHdr}>
              {tradeLoading && <div style={styles.spinner} />}
              ⚡ TRADE TERMINAL
            </div>

            {!selected ? (
              <div style={styles.noSel}>
                <div style={{ fontSize: 40, opacity: 0.1, marginBottom: 8 }}></div>
                <div>SELECT A TOKEN</div>
                <div style={{ color: 'rgb(215, 248, 255)', marginTop: 4 }}>FROM THE LIST</div>
              </div>
            ) : (
              <>
                <div style={styles.trTabs}>
                  <button style={{ ...styles.trTab, ...(isBuy ? styles.trTabBuyOn : styles.trTabBuy) }} onClick={() => setTradeMode('buy')}>▲ BUY</button>
                  <button style={{ ...styles.trTab, ...(!isBuy ? styles.trTabSellOn : styles.trTabSell) }} onClick={() => setTradeMode('sell')}>▼ SELL</button>
                </div>
                <div style={styles.trBody}>
                  {walletConnected && (
                    <div style={styles.wInfo}>
                      <div style={styles.wiR}><span style={styles.wiL}>WALLET ({walletName})</span><span style={styles.wiV}>{walletAddress!.slice(0, 4)}...{walletAddress!.slice(-4)}</span></div>
                      <div style={{ ...styles.wiR, marginTop: 2 }}><span style={styles.wiL}>SOL BALANCE</span><span style={styles.wiV}>{walletBalance.toFixed(4)} SOL</span></div>
                    </div>
                  )}

                  <div style={styles.caRow}>
                    <span style={styles.caV}>{selected.ca}</span>
                    <button style={styles.cpBtn} onClick={copyCA}>⎘ COPY</button>
                  </div>

                  <div style={styles.fg}>
                    <div style={styles.fl}>
                      <span>{isBuy ? 'PAY (SOL)' : 'SELL (TOKENS)'}</span>
                      <span>{isBuy ? walletBalance.toFixed(4) + ' SOL' : '—'}</span>
                    </div>
                    <input
                      type="number"
                      style={styles.fi}
                      placeholder={isBuy ? '0.0 SOL' : 'Amount...'}
                      value={tradeAmount}
                      onChange={e => setTradeAmount(e.target.value)}
                    />
                    <div style={styles.sqG}>
                      {isBuy
                        ? ['0.1', '0.5', '1.0', '5.0'].map(v => <div key={v} style={styles.sq} onClick={() => setTradeAmount(v)}>{v}</div>)
                        : ['25%', '50%', '75%', 'MAX'].map((v, i) => <div key={v} style={styles.sq} onClick={() => setTradeAmount(String([25, 50, 75, 100][i]))}>{v}</div>)
                      }
                    </div>
                  </div>

                  <div style={styles.fg}>
                    <div style={styles.fl}><span>SLIPPAGE</span></div>
                    <div style={styles.slRow}>
                      {['0.5', '1', '2', '5'].map(s => (
                        <button key={s} style={{ ...styles.sl, ...(slippage === s ? styles.slOn : {}) }} onClick={() => setSlippage(s)}>{s}%</button>
                      ))}
                    </div>
                  </div>

                  <div style={styles.div} />

                  <div style={styles.os}>
                    <div style={styles.osR}><span style={styles.osL}>TOKEN</span><span style={styles.osV}>{selected.symbol}</span></div>
                    <div style={styles.osR}><span style={styles.osL}>PRICE</span><span style={{ ...styles.osV, color: '#0891b2' }}>{fmtPrice(selected.price)}</span></div>
                    <div style={styles.osR}><span style={styles.osL}>{isBuy ? 'YOU GET' : 'SOL OUT'}</span><span style={styles.osV}>{quoteOut}</span></div>
                    <div style={styles.osR}><span style={styles.osL}>SLIPPAGE</span><span style={styles.osV}>{slippage}%</span></div>
                    <div style={styles.osR}><span style={styles.osL}>ROUTE</span><span style={{ ...styles.osV, color: '#7c3aed', fontSize: 8 }}>Jupiter v6</span></div>
                  </div>

                  <button
                    style={{ ...styles.exBtn, ...(isBuy ? styles.buyBtn : styles.sellBtn) }}
                    onClick={executeTrade}
                    disabled={!walletConnected || !tradeAmount || tradeLoading}
                  >
                    {tradeLoading ? 'PROCESSING...' : !walletConnected ? 'CONNECT WALLET FIRST' : isBuy ? `▲ BUY ${selected.symbol}` : `▼ SELL ${selected.symbol}`}
                  </button>

                  {walletConnected && selected && (
                    <a
                      href={`https://jup.ag/swap/SOL-${selected.ca}`}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.jupLink}
                    >
                      ↗ 
                    </a>
                  )}

                  <div style={styles.riskBox}>⚠ SPL tokens carry high volatility. Always verify the contract address before trading. Swaps routed via Jupiter Aggregator. DYOR — not financial advice.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── TOASTS ───────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ ...styles.toast, ...(t.type === 'ok' ? styles.toastOk : t.type === 'err' ? styles.toastErr : styles.toastInf) }}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  mono: "'Space Mono', monospace" as const,
  sans: "'Outfit', sans-serif" as const,
};

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1 },

  // Header - fixed
  hdr: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 20px',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderBottom: '1px solid rgba(200,210,245,0.6)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.8)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoCube: {
    width: 50, height: 50, borderRadius: 10, overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(129,140,248,0.4)',
  },
  logoName: {
    fontSize: 18, fontWeight: 800, letterSpacing: 1, fontFamily: S.sans,
    background: 'linear-gradient(90deg,#6d28d9 0%,#818cf8 45%,#00b4cc 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  logoSub: { fontSize: 8, color: '#a1b5df', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: S.mono },
  hdrRight: { display: 'flex', alignItems: 'center', gap: 10 },
  netPill: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
    background: 'rgba(0, 0, 0, 0.68)', border: '1px solid rgba(0,229,255,0.3)',
    borderRadius: 20, fontSize: 8, letterSpacing: '2px', color: '#0891b2', fontFamily: S.mono,
  },
  pDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#7700ff',
    boxShadow: '0 0 8px #7700ff',
    animation: 'pulse-dot 1.8s infinite',
  },
  wBtn: {
    padding: '6px 14px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    cursor: 'pointer', border: '1px solid rgba(196,181,253,0.5)',
    background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(10px)',
    color: '#7c3aed', transition: 'all .25s', fontFamily: S.sans,
  },
  wBtnOn: { borderColor: 'rgba(0,229,255,0.5)', color: '#0891b2', background: 'rgba(0,229,255,0.08)', boxShadow: '0 0 16px rgba(0,229,255,0.2)' },

  // ─── ESTILOS ACTUALIZADOS ──────────────────────────────────────────────────

body: { 
  marginTop: 60, 
  height: 'calc(100vh - 60px)', // Forzamos altura exacta (Viewport - Header)
  overflow: 'hidden',           // Evitamos que el body principal scrollee
  padding: '12px',
  boxSizing: 'border-box'       // Importante para que el padding no sume altura
},

grid: { 
  display: 'grid', 
  gridTemplateColumns: '285px 1fr 268px', 
  gap: 0, 
  height: '100%',               // Ocupa el 100% de la altura limitada del body
},

// LEFT PANEL
panelL: {
  background: 'rgba(255,255,255,0.45)', 
  backdropFilter: 'blur(30px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRight: '1px solid rgba(210,220,255,0.5)',
  display: 'flex', 
  flexDirection: 'column', 
  height: '100%',               // Se estira al alto del grid
  overflowY: 'auto',            // Habilita el scroll solo aquí
  overflowX: 'hidden'
},
  tabBar: { display: 'flex', borderBottom: '1px solid rgba(210,220,255,0.5)', background: 'rgba(255,255,255,0.3)' },
  tab: {
    flex: 1, padding: '9px 4px', fontSize: 8, fontWeight: 700, letterSpacing: '2px', textAlign: 'center',
    cursor: 'pointer', color: '#000000', border: 'none', background: 'transparent',
    borderBottom: '2px solid transparent', textTransform: 'uppercase', fontFamily: S.mono, transition: 'all .22s',
  },
  tabOn: { color: '#000000', borderBottom: '2px solid #00e5ff', background: 'rgba(0,229,255,0.06)' },
  tokList: { flex: 1, overflowY: 'auto', padding: 6 },
  secHdr: {
    padding: '6px 10px 4px', fontSize: 7, fontWeight: 700, letterSpacing: '3px', color: '#6b7a99',
    textTransform: 'uppercase', fontFamily: S.mono, display: 'flex', justifyContent: 'space-between',
  },
  scanMsg: { padding: 24, textAlign: 'center', color: '#000000', fontSize: 9, fontFamily: S.mono, letterSpacing: '2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  tok: {
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px',
    borderRadius: 12, cursor: 'pointer', border: '1px solid transparent',
    transition: 'all .2s', marginBottom: 3, background: 'transparent',
  },
  tokSel: {
    background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,229,255,0.4)',
    boxShadow: '0 2px 16px rgba(0,229,255,0.15)',
  },
  tokImg: {
    width: 36, height: 36, borderRadius: 9, flexShrink: 0, overflow: 'hidden',
    background: 'linear-gradient(135deg,rgba(196,181,253,.4),rgba(0,229,255,.3))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.6)',
  },
  tokSym: { fontSize: 12, fontWeight: 700, color: '#000000', letterSpacing: .3, display: 'flex', alignItems: 'center', gap: 4 },
  tokName: { fontSize: 9, color: '#000000e5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 },
  tokMc: { fontSize: 9, fontFamily: S.mono, color: '#7c3aed' },
  tokChg: { fontSize: 9, fontFamily: S.mono, fontWeight: 700 },
  bNew: { padding: '1px 5px', borderRadius: 6, fontSize: 7, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', fontFamily: S.mono, background: 'rgba(0, 0, 0, 0.25)', color: '#8fffdb', border: '1px solid rgba(5,150,105,.25)' } as React.CSSProperties,
  bHot: { padding: '1px 5px', borderRadius: 6, fontSize: 7, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', fontFamily: S.mono, background: 'rgba(128, 53, 69, 0.08)', color: '#ff5e81', border: '1px solid rgba(225,29,72,.2)' } as React.CSSProperties,
  bGrad: { padding: '1px 5px', borderRadius: 6, fontSize: 7, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', fontFamily: S.mono, background: 'rgba(217,119,6,.1)', color: '#ffb259', border: '1px solid rgba(217,119,6,.2)' } as React.CSSProperties,

  // CENTER
  panelC: { background: 'transparent', overflowY: 'auto', padding: 14 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 500, gap: 8 },
  emptyIcon: { fontSize: 52, opacity: .08, background: 'linear-gradient(135deg,#b8a0f0,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  emptyText: { fontSize: 9, fontWeight: 700, letterSpacing: '3px', color: '#d7e1ff', fontFamily: S.mono },
  emptySub: { fontSize: 7, letterSpacing: '2px', color: 'rgba(0, 180, 220, 0.56)', fontFamily: S.mono },
  tokHdr: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, paddingBottom: 12, borderBottom: '1px solid rgba(210,220,255,.5)', flexWrap: 'wrap' },
  tokAv: {
    width: 48, height: 48, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
    background: 'linear-gradient(135deg,#c4b5fd,#00cfec)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 4px 16px rgba(167, 175, 252, 0.3)',
  },
  tokMetaH1: {
    fontSize: 20, fontWeight: 800, letterSpacing: .5, fontFamily: S.sans,
    background: 'linear-gradient(90deg,#4c1d95,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  tokMetaP: { fontSize: 9, color: '#e4dfdf', letterSpacing: '2px', marginTop: 1 },
  priceBig: { fontSize: 22, fontWeight: 700, fontFamily: S.mono, color: '#0891b2', textShadow: '0 0 20px rgba(0,180,220,.25)' },
  chgBig: { fontSize: 11, fontFamily: S.mono, fontWeight: 700, marginLeft: 6 },
  lnks: { display: 'flex', gap: 5, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' },
  lnk: {
    padding: '4px 9px', border: '1px solid rgba(200,210,240,.6)', borderRadius: 8, fontSize: 8, fontWeight: 700,
    letterSpacing: 1, cursor: 'pointer', color: '#6b7a99', textDecoration: 'none', fontFamily: S.mono,
    background: 'rgba(255,255,255,.5)', display: 'inline-flex', alignItems: 'center',
  },
  mBar: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 },
  met: {
    background: 'rgba(255,255,255,.6)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(210,220,255,.6)', borderRadius: 11, padding: '8px 10px', textAlign: 'center',
    boxShadow: '0 2px 8px rgba(130,100,250,.06)',
  },
  metL: { fontSize: 7, fontWeight: 700, letterSpacing: '2px', color: '#6b7a99', textTransform: 'uppercase', fontFamily: S.mono, marginBottom: 4 },
  metV: { fontSize: 12, fontWeight: 700, fontFamily: S.mono },
  hBar: { background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(210,220,255,.6)', borderRadius: 11, padding: '10px 14px', marginBottom: 10 },
  hbTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  hbL: { fontSize: 7, fontWeight: 700, letterSpacing: '2px', color: '#6b7a99', textTransform: 'uppercase', fontFamily: S.mono },
  hbV: { fontSize: 10, fontFamily: S.mono, color: '#0891b2' },
  hbRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  hbRn: { fontSize: 7, fontFamily: S.mono, color: '#6b7a99', width: 72, flexShrink: 0, letterSpacing: .5 },
  hbTrack: { flex: 1, height: 5, background: 'rgba(200,210,240,.3)', borderRadius: 3, overflow: 'hidden' },
  hbPct: { fontSize: 8, fontFamily: S.mono, color: '#6b7a99', width: 28, textAlign: 'right', flexShrink: 0 },
  chartFr: { background: 'rgba(255,255,255,.5)', backdropFilter: 'blur(14px)', border: '1px solid rgba(210,220,255,.6)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 },
  chartTb: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(210,220,255,.5)', background: 'rgba(255,255,255,.4)' },
  tfBtn: { padding: '3px 8px', border: '1px solid transparent', borderRadius: 6, fontSize: 8, fontWeight: 700, fontFamily: S.mono, cursor: 'pointer', color: '#6b7a99', background: 'transparent', transition: 'all .2s' },
  tfBtnOn: { background: 'rgba(0,229,255,.1)', borderColor: 'rgba(0,229,255,.4)', color: '#0891b2', boxShadow: '0 0 8px rgba(0,229,255,.15)' },
  chartTag: { fontSize: 7, color: '#6b7a99', fontFamily: S.mono, letterSpacing: '1.5px', display: 'flex', alignItems: 'center', gap: 5 },

  // RIGHT
  panelR: { background: 'rgba(255,255,255,.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(210,220,255,.5)', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  trHdr: { padding: '10px 14px', borderBottom: '1px solid rgba(210,220,255,.5)', fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#7c3aed', textTransform: 'uppercase', fontFamily: S.mono, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  noSel: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: '#6b7a99', fontFamily: S.mono, fontSize: 8, letterSpacing: '2px', textAlign: 'center' },
  trTabs: { display: 'flex', borderBottom: '1px solid rgba(210,220,255,.5)', flexShrink: 0 },
  trTab: { flex: 1, padding: 9, textAlign: 'center', fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '1.5px', border: 'none', borderBottom: '2px solid transparent', background: 'transparent', transition: 'all .22s', fontFamily: S.sans },
  trTabBuy: { color: '#020202' },
  trTabBuyOn: { color: '#00ff15', borderBottom: '2px solid #059669', background: 'rgba(5,150,105,.05)' },
  trTabSell: { color: '#000000' },
  trTabSellOn: { color: '#e11d48', borderBottom: '2px solid #e11d48', background: 'rgba(225,29,72,.05)' },
  trBody: { padding: '12px 14px', flex: 1, overflowY: 'auto' },
  wInfo: { background: 'rgba(0,229,255,.06)', border: '1px solid rgba(0,229,255,.25)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 },
  wiR: { display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: S.mono, marginBottom: 2 },
  wiL: { color: '#000000' },
  wiV: { color: '#000000' },
  caRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'rgba(255,255,255,.5)', border: '1px solid rgba(210,220,255,.6)', borderRadius: 8, marginBottom: 10 },
  caV: { fontSize: 8, fontFamily: S.mono, color: '#6b7a99', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cpBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7a99', fontSize: 9, fontFamily: S.mono, padding: '2px 5px' },
  fg: { marginBottom: 10 },
  fl: { fontSize: 7, fontWeight: 700, letterSpacing: '1.5px', color: '#6b7a99', textTransform: 'uppercase', fontFamily: S.mono, marginBottom: 4, display: 'flex', justifyContent: 'space-between' },
  fi: { width: '100%', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(210,220,255,.6)', borderRadius: 9, padding: '8px 10px', color: '#1a1a2e', fontFamily: S.mono, fontSize: 13, outline: 'none' },
  sqG: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginTop: 4 },
  sq: { padding: 4, border: '1px solid rgba(210,220,255,.6)', borderRadius: 6, fontSize: 8, fontWeight: 700, fontFamily: S.mono, textAlign: 'center', cursor: 'pointer', color: '#6b7a99', background: 'rgba(255,255,255,.5)' },
  slRow: { display: 'flex', gap: 3 },
  sl: { flex: 1, padding: 4, border: '1px solid rgba(210,220,255,.6)', borderRadius: 6, fontSize: 8, fontWeight: 700, fontFamily: S.mono, textAlign: 'center', cursor: 'pointer', color: '#6b7a99', background: 'rgba(255,255,255,.5)' },
  slOn: { borderColor: 'rgba(0, 0, 0, 0.5)', color: '#020202', background: 'rgba(0,229,255,.1)' },
  div: { height: 1, background: 'rgba(61, 63, 73, 0.5)', margin: '10px 0' },
  os: { background: 'rgba(255,255,255,.5)', border: '1px solid rgba(210,220,255,.6)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 },
  osR: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 9 },
  osL: { color: '#6b7a99', fontFamily: S.mono },
  osV: { color: '#1a1a2e', fontFamily: S.mono, fontWeight: 700 },
  exBtn: { width: '100%', padding: 11, borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: '2px', cursor: 'pointer', transition: 'all .25s', fontFamily: S.sans, textTransform: 'uppercase', marginBottom: 8 },
  buyBtn: { background: 'linear-gradient(135deg,rgb(90, 2, 131),rgba(16, 95, 185, 0.08))', border: '1px solid rgba(5,150,105,.35)', color: '#04e49d', boxShadow: '0 4px 16px rgba(5,150,105,.1)' },
  sellBtn: { background: 'linear-gradient(135deg,rgba(225,29,72,.1),rgba(244,63,94,.07))', border: '1px solid rgba(225,29,72,.3)', color: '#ff0037', boxShadow: '0 4px 16px rgba(225,29,72,.08)' },
  jupLink: { display: 'block', textAlign: 'center', fontSize: 8, color: '#0891b2', fontFamily: S.mono, letterSpacing: 1, textDecoration: 'none', marginBottom: 8, opacity: .7 },
  riskBox: { background: 'rgba(217,119,6,.05)', border: '1px solid rgba(217,119,6,.2)', borderRadius: 8, padding: 8, fontSize: 8, color: '#92400e', lineHeight: 1.6, fontFamily: S.mono },

  // Toasts
  toast: { padding: '9px 14px', borderRadius: 10, fontSize: 9, fontWeight: 700, fontFamily: S.mono, letterSpacing: 1, backdropFilter: 'blur(16px)', animation: 'slideInRight .3s ease' },
  toastOk: { background: 'rgba(240,255,248,.9)', border: '1px solid rgba(5,150,105,.35)', color: '#059669' },
  toastErr: { background: 'rgba(255,241,244,.9)', border: '1px solid rgba(225,29,72,.3)', color: '#e11d48' },
  toastInf: { background: 'rgba(240,252,255,.9)', border: '1px solid rgba(0,229,255,.35)', color: '#0891b2' },

  // Spinner
  spinner: { width: 13, height: 13, border: '2px solid rgba(0,229,255,.2)', borderTopColor: '#00e5ff', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' },
};


