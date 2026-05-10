import React, { useState, useEffect, useRef, useCallback } from 'react';
import CyberMatrixBackground from './CyberMatrixBackground';
import {
    sendSol,
    getJupiterQuote,
    executeSwap,
    performSwap,
    getFullPortfolio,
    SOL_MINT
} from '../services/solana.js';
import { getNewPairs, getTokenSecurity } from '../services/tokenDiscovery';
import { TOTP } from '@otplib/totp';
import { QRCodeSVG } from 'qrcode.react';
import { Buffer } from 'buffer';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

const authenticator = new TOTP();
import {
    getAssociatedTokenAddress,
    createTransferInstruction,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import './WalletModal.css';
import vaultsLogo from '../media/wallet.png';

window.Buffer = Buffer;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const truncAddr = (a) => (a ? `${a.slice(0, 4)}...${a.slice(-4)}` : '');

const formatUsd = (n) => {
    const v = parseFloat(n);
    if (!v || isNaN(v)) return '$0.00';
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(2)}K`;
    if (v >= 1)         return `$${v.toFixed(2)}`;
    if (v >= 0.0001)    return `$${v.toFixed(4)}`;
    return `$${v.toFixed(8)}`;
};

const formatPrice = (n) => {
    const v = parseFloat(n);
    if (!v || isNaN(v) || v === 0) return '$0.00';
    if (v >= 1)      return `$${v.toFixed(2)}`;
    if (v >= 0.01)   return `$${v.toFixed(4)}`;
    if (v >= 0.0001) return `$${v.toFixed(6)}`;
    return `$${v.toFixed(9)}`;
};

const formatCrypto = (n, d = 4) => {
    const v = parseFloat(n);
    if (!v || isNaN(v)) return '0';
    if (v < 0.0001) return v.toExponential(2);
    return v.toLocaleString(undefined, { maximumFractionDigits: d });
};

// ─────────────────────────────────────────────────────────────────────────────
// SPL TOKEN SEND
// ─────────────────────────────────────────────────────────────────────────────
const sendSplToken = async (fromWallet, toAddress, mintStr, amount, decimals) => {
    const RPC  = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const conn = new Connection(RPC, 'confirmed');
    const fromPubkey = fromWallet.publicKey;
    const toPubkey   = new PublicKey(toAddress);
    const mint       = new PublicKey(mintStr);
    const fromATA    = await getAssociatedTokenAddress(mint, fromPubkey);
    const toATA      = await getAssociatedTokenAddress(mint, toPubkey);
    const tx         = new Transaction();
    const toATAInfo  = await conn.getAccountInfo(toATA);
    if (!toATAInfo) tx.add(createAssociatedTokenAccountInstruction(fromPubkey, toATA, toPubkey, mint));
    const units = Math.floor(amount * Math.pow(10, decimals));
    tx.add(createTransferInstruction(fromATA, toATA, fromPubkey, BigInt(units), [], TOKEN_PROGRAM_ID));
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;
    tx.sign(fromWallet);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
    await conn.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, 'confirmed');
    return sig;
};

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN ACTION SHEET
// ─────────────────────────────────────────────────────────────────────────────
const TokenActionSheet = ({ token, onSend, onSwap, onClose }) => {
    if (!token) return null;
    
    const pricePerToken = token.balance > 0 ? token.usdValue / token.balance : 0;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px 20px 0 0', marginBottom: '44px', padding: '22px 20px 36px', animation: 'slideUp 0.2s ease' }}>
                
                {/* Token header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {token.logo
                        ? <img src={token.logo} width={46} height={46} style={{ borderRadius: '50%', flexShrink: 0 }} alt={token.symbol} onError={e => e.target.style.display='none'} />
                        : <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '1.1rem', flexShrink: 0 }}>{token.symbol?.[0] || '?'}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{token.name || token.symbol}</p>
                        <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#555', fontFamily: 'monospace' }}>{formatCrypto(token.balance, 6)} {token.symbol}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: '#fff', fontSize: '1.05rem' }}>{formatUsd(token.usdValue)}</p>
                        <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#444' }}>{formatPrice(pricePerToken)} / {token.symbol}</p>
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Botón Enviar */}
                    <button onClick={onSend} style={{ width: '100%', height: 48, borderRadius: 12, border: '1px solid rgba(146,83,175,0.3)', background: 'rgba(146,83,175,0.1)', color: '#c084f5', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer' }}>
                        Send {token.symbol}
                    </button>
                    
                    {/* Botón Swap: Ahora visible para TODOS los tokens */}
                    <button onClick={onSwap} style={{ width: '100%', height: 48, borderRadius: 12, border: '1px solid rgba(142, 20, 241, 0.22)', background: 'rgba(215, 20, 241, 0.06)', color: '#54ddffc4', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer' }}>
                        ⇄ Swap {token.symbol}
                    </button>

                    {/* Botón Cerrar */}
                    <button onClick={onClose} style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(63, 0, 44, 0.6)', color: '#444', fontSize: '0.85rem', cursor: 'pointer' }}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD CONTACT MODAL
// ─────────────────────────────────────────────────────────────────────────────
const AddContactModal = ({ show, onClose, onSave, contactToEdit }) => {
    const [name, setName]       = useState('');
    const [address, setAddress] = useState('');
    useEffect(() => { if (show) { setName(contactToEdit?.name || ''); setAddress(contactToEdit?.address || ''); } }, [contactToEdit, show]);
    const handleSave = () => {
        if (!name.trim() || !address.trim()) return alert('Please enter a name and address.');
        onSave({ id: contactToEdit ? contactToEdit.id : Date.now(), name: name.trim(), address: address.trim() });
        onClose();
    };
    if (!show) return null;
    return (
        
        <div className="add-contact-modal-overlay">
            <div className="add-contact-modal">
                <h3>{contactToEdit ? 'Edit Contact' : 'Add New Contact'}</h3>
                <input type="text" placeholder="Contact Name" value={name} onChange={e => setName(e.target.value)} />
                <input type="text" placeholder="Wallet Address" value={address} onChange={e => setAddress(e.target.value)} />
                <div className="modal-actions">
                    <button className="action-button primary-button" onClick={handleSave}>Save</button>
                    <button className="action-button secondary-button" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE SCREEN
// ─────────────────────────────────────────────────────────────────────────────
const BalanceScreen = ({
    walletAddress, solBalance, solUsdPrice, tokens, totalUsd,
    onShowSendForm, showSendForm, sendAmount, setSendAmount,
    sendToAddress, setSendToAddress, handleSendSol,
    onCreateWallet, onImportWallet, showImport, setShowImport,
    secretKeyInput, setSecretKeyInput, handleImportClick,
    walletInstance, refreshData, isLoadingData,
    onShowKeyModal, pinState
}) => {
    const [showReceiveQR,       setShowReceiveQR]      = useState(false);
    const [showSwapForm,        setShowSwapForm]        = useState(false);
    const [swapDirection,       setSwapDirection]       = useState('SOL_TO_TOKEN');
    const [swapAmount,          setSwapAmount]          = useState('');
    const [swapContract,        setSwapContract]        = useState('');
    const [swapQuote,           setSwapQuote]           = useState(null);
    const [swapError,           setSwapError]           = useState('');
    const [isSwapping,          setIsSwapping]          = useState(false);
    const [isFetchingQuote,     setIsFetchingQuote]     = useState(false);
    const [tokenInfo,           setTokenInfo]           = useState(null);
    const [newTokens,           setNewTokens]           = useState([]);
    const [insufficientBalance, setInsufficientBalance] = useState(false);
    const [selectedToken,       setSelectedToken]       = useState(null);
    const [sendTokenMode,       setSendTokenMode]       = useState(null);

    // Copy address
    const handleCopyAddress = () => {
        if (!walletAddress) return;
        const doCopy = t => navigator.clipboard?.writeText(t).catch(() => fallback(t)) ?? fallback(t);
        const fallback = t => { const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); };
        doCopy(walletAddress);
        const btn = document.querySelector('.copy-address-btn');
        if (btn) { const o = btn.textContent; btn.textContent = '✔'; setTimeout(() => btn.textContent = o, 1200); }
    };

    // Trending tokens
    useEffect(() => {
        if (!showSwapForm) return;
        let iv;
        const load = async () => { const list = await getNewPairs(); if (list?.length) setNewTokens(list.slice(0, 15)); };
        load(); iv = setInterval(load, 30_000);
        return () => clearInterval(iv);
    }, [showSwapForm]);

    // Quote — ALWAYS fetches regardless of balance
    useEffect(() => {
        const fetchQuote = async () => {
            const amt = parseFloat(swapAmount);
            if (!amt || amt <= 0 || !swapContract || swapContract.length < 32) {
                setSwapQuote(null); setTokenInfo(null); setInsufficientBalance(false); return;
            }
            // Balance check (does NOT stop quote fetch)
            if (swapDirection === 'SOL_TO_TOKEN') {
                setInsufficientBalance(amt > solBalance - 0.001);
            } else {
                const ut = tokens.find(t => t.mint === swapContract);
                setInsufficientBalance(!ut || amt > ut.balance);
            }
            setSwapError('');
            setIsFetchingQuote(true);
            try {
                const info = await getTokenSecurity(swapContract);
                if (info?.ok) {
                    setTokenInfo(info);
                    const inputMint  = swapDirection === 'SOL_TO_TOKEN' ? SOL_MINT : swapContract;
                    const outputMint = swapDirection === 'SOL_TO_TOKEN' ? swapContract : SOL_MINT;
                    const inDec      = swapDirection === 'SOL_TO_TOKEN' ? 9 : (info.decimals || 6);
                    const units      = Math.floor(amt * Math.pow(10, inDec));
                    const slippage   = (info.liquidity || 0) < 50_000 ? 300 : 50;
                    // New solana.js returns { success, data }
                    const res = await getJupiterQuote(inputMint, outputMint, units, slippage);
                    if (res?.success) {
                        setSwapQuote(res.data);
                        setSwapError('');
                    } else {
                        setSwapQuote(null);
                        setSwapError(res?.message || res?.error || 'Swap quote unavailable');
                    }
                } else {
                    setTokenInfo(null);
                    setSwapQuote(null);
                    setSwapError('Token contract not secure or unknown');
                }
            } catch (e) {
                console.error('Quote error:', e);
                setSwapQuote(null);
                setSwapError(e?.message || 'Quote fetch failed');
            } finally {
                setIsFetchingQuote(false);
            }
        };
        const t = setTimeout(fetchQuote, 600);
        return () => clearTimeout(t);
    }, [swapAmount, swapContract, swapDirection, solBalance, tokens]);

    // Execute swap — uses performSwap (v2 + legacy fallback)
    const handleExecuteSwap = async () => {
        if (!walletInstance || insufficientBalance || isSwapping) return;
        setIsSwapping(true);
        try {
            const inputMint  = swapDirection === 'SOL_TO_TOKEN' ? SOL_MINT : swapContract;
            const outputMint = swapDirection === 'SOL_TO_TOKEN' ? swapContract : SOL_MINT;
            const slippage   = (tokenInfo?.liquidity || 0) < 50_000 ? 300 : 50;
            const result     = await performSwap(walletInstance, inputMint, outputMint, parseFloat(swapAmount), slippage);
            if (result?.success) {
                alert(`✅ Swap confirmed!\nTX: ${result.txid?.slice(0, 24)}...`);
                resetSwap(); refreshData?.();
            } else {
                alert(`❌ Swap failed: ${result?.error || result?.details || 'Try adjusting slippage or amount.'}`);
            }
        } catch (e) {
            alert('❌ Swap error: ' + (e.message || 'unknown')); console.error(e);
        } finally { setIsSwapping(false); }
    };

    const resetSwap = () => { setShowSwapForm(false); setSwapAmount(''); setSwapContract(''); setSwapQuote(null); setTokenInfo(null); setInsufficientBalance(false); };

    const getOutputDisplay = () => {
        if (!swapQuote?.outAmount) return '—';
        const dec = swapDirection === 'SOL_TO_TOKEN' ? (tokenInfo?.decimals || 6) : 9;
        return (parseInt(swapQuote.outAmount) / Math.pow(10, dec)).toFixed(6);
    };

    // SPL send
    const handleSendSplToken = async () => {
        if (!sendToAddress || !sendAmount) return alert('Fill all fields.');
        const pin = localStorage.getItem('wallet_pin');
        if (pin) { const i = prompt('🔒 Enter your Withdrawal PIN:'); if (i !== pin) return alert('❌ Incorrect PIN. Transfer blocked.'); }
        const secret = localStorage.getItem('wallet_2fa_secret');
        if (secret) { const c = prompt('🛡️ Enter your Google Authenticator code:'); if (!c || !authenticator.verifySync(c, secret)) return alert('❌ Invalid 2FA. Transfer denied.'); }
        try {
            const sig = await sendSplToken(walletInstance, sendToAddress, sendTokenMode.mint, parseFloat(sendAmount), sendTokenMode.decimals);
            if (sig) {
                alert(`✅ ${sendTokenMode.symbol} sent!\nSig: ${sig.slice(0, 22)}...`);
                setSendTokenMode(null); onShowSendForm(false); setSendAmount(''); setSendToAddress('');
                setTimeout(refreshData, 2000);
            }
        } catch (e) { alert('❌ Error: ' + (e.message || 'Check balance and address.')); }
    };

   

    // ═════ RENDER: Send form ═════
    if (showSendForm) {
        const isSpl     = !!sendTokenMode;
        const sym       = isSpl ? sendTokenMode.symbol : 'SOL';
        const availBal  = isSpl ? sendTokenMode.balance : solBalance;
        const priceEach = isSpl && sendTokenMode.balance > 0 ? sendTokenMode.usdValue / sendTokenMode.balance : solUsdPrice;
        const insuf     = parseFloat(sendAmount) > availBal;
        return (
            <div className="slide-panel">
                <div className="screen-container">
                    <div className="send-container">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {isSpl && sendTokenMode.logo && <img src={sendTokenMode.logo} width={26} height={26} style={{ borderRadius: '50%' }} alt={sym} onError={e => e.target.style.display='none'} />}
                                <h4 style={{ margin: 0, color: '#fff' }}>Send {isSpl ? (sendTokenMode.name || sym) : 'SOL'}</h4>
                            </div>
                            <button className="close-btn" onClick={() => { onShowSendForm(false); setSendTokenMode(null); }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 6, color: '#555' }}>
                            <span>Amount</span>
                            <span>Balance: <strong style={{ color: '#9b5cfb' }}>{formatCrypto(availBal, 6)} {sym}</strong></span>
                        </div>
                        <div style={{ position: 'relative', marginBottom: 10 }}>
                            <input type="number" value={sendAmount} onChange={e => setSendAmount(e.target.value)} className="input-send-amount" placeholder="0.00" style={{ paddingRight: 56 }} />
                            <button onClick={() => setSendAmount(String(isSpl ? (availBal * 0.999).toFixed(6) : Math.max(0, availBal - 0.006).toFixed(6)))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(146,83,175,0.18)', border: 'none', borderRadius: 6, color: '#c084f5', fontSize: '0.68rem', padding: '3px 7px', cursor: 'pointer' }}>MAX</button>
                        </div>
                        {sendAmount && parseFloat(sendAmount) > 0 && priceEach > 0 && (
                            <p style={{ fontSize: '0.72rem', color: '#444', marginBottom: 10, textAlign: 'right' }}>≈ {formatUsd(parseFloat(sendAmount) * priceEach)}</p>
                        )}
                        <input type="text" placeholder="Recipient Wallet Address" value={sendToAddress} onChange={e => setSendToAddress(e.target.value)} style={{ marginBottom: 18 }} />
                        {insuf && <p style={{ color: '#ff4d4d', fontSize: '0.72rem', marginBottom: 10 }}>⚠️ Insufficient {sym} balance</p>}
                        <button className="action-button primary-button" disabled={insuf || !sendToAddress || !sendAmount} onClick={isSpl ? handleSendSplToken : handleSendSol}>Confirm Send</button>
                        <button className="action-button secondary-button" style={{ marginTop: 8 }} onClick={() => { onShowSendForm(false); setSendTokenMode(null); }}>Cancel</button>
                    </div>
                </div>
            </div>
        );
    }

    // ═════ RENDER: Swap form ═════
    if (showSwapForm) {
        const payToken  = swapDirection === 'SOL_TO_TOKEN' ? 'SOL' : (tokenInfo?.symbol || 'TOKEN');
        const recvToken = swapDirection === 'SOL_TO_TOKEN' ? (tokenInfo?.symbol || 'TOKEN') : 'SOL';
        const payBal    = swapDirection === 'SOL_TO_TOKEN'
            ? `${formatCrypto(solBalance)} SOL`
            : `${formatCrypto(tokens.find(t => t.mint === swapContract)?.balance || 0)} ${tokenInfo?.symbol || ''}`;
        return (
            <div className="slide-panel">
                <div className="swap-centered-container">
                    <div className="swap-card">
                        <div className="swap-header">
                            <h4>Swap Tokens</h4>
                            <button className="close-btn" onClick={resetSwap}>✕</button>
                        </div>

                        {/* Contract — always at top */}
                        <div style={{ marginBottom: 12 }}>
                           
                            <input type="text" placeholder="Paste token mint address..." value={swapContract} onChange={e => { setSwapContract(e.target.value.trim()); setTokenInfo(null); setSwapQuote(null); }} className="contract-input" style={{ width: '100%' }} />
                        </div>

                        {/* Token preview */}
                        {tokenInfo?.ok && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                                {tokenInfo.image && <img src={tokenInfo.image} width={26} height={26} style={{ borderRadius: '50%' }} alt="" onError={e => e.target.style.display='none'} />}
                                <div style={{ flex: 1 }}>
                                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>{tokenInfo.symbol}</span>
                                    <span style={{ color: '#555', fontSize: '0.7rem', marginLeft: 6 }}>{tokenInfo.name}</span>
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '0.68rem' }}>
                                    <div style={{ color: '#666' }}>Liq ${(tokenInfo.liquidity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div style={{ color: (tokenInfo.priceChange24h || 0) >= 0 ? '#14F195' : '#ff4d4d', fontWeight: 600 }}>{(tokenInfo.priceChange24h || 0) >= 0 ? '▲' : '▼'} {Math.abs(tokenInfo.priceChange24h || 0).toFixed(2)}%</div>
                                </div>
                            </div>
                        )}

                        {/* Pay */}
                        <div className="swap-input-group">
                            <div className="input-label-row">
                                <span className="label-text">You Pay</span>
                                <span className="balance-hint">{payBal}</span>
                            </div>
                            <div className="input-row">
                                <input type="number" value={swapAmount} onChange={e => setSwapAmount(e.target.value)} placeholder="0.00" className={`swap-input ${insufficientBalance ? 'error' : ''}`} />
                                <span className="token-badge">{payToken}</span>
                            </div>
                            {insufficientBalance && <p style={{ color: '#ff4d4d', fontSize: '0.6rem', marginTop: 4 }}>⚠️ Insufficient Balance</p>}
                            {swapAmount && parseFloat(swapAmount) > 0 && swapDirection === 'SOL_TO_TOKEN' && solUsdPrice > 0 && (
                                <p style={{ color: '#444', fontSize: '0.68rem', textAlign: 'right', marginTop: 3 }}>≈ {formatUsd(parseFloat(swapAmount) * solUsdPrice)}</p>
                            )}
                        </div>

                        {/* Switch direction */}
                        <div className="swap-divider">
                            <button className="switch-btn" onClick={() => { setSwapDirection(d => d === 'SOL_TO_TOKEN' ? 'TOKEN_TO_SOL' : 'SOL_TO_TOKEN'); setSwapQuote(null); setSwapAmount(''); }}>⇅</button>
                        </div>

                        {/* Receive */}
                        <div className="swap-input-group">
                            <div className="input-label-row">
                                <span className="label-text">You Receive (min.)</span>
                            </div>
                            <div className="input-row">
                                <input type="text" readOnly value={isFetchingQuote ? 'Quoting...' : getOutputDisplay()} className="swap-input readonly" />
                                <span className="token-badge">{recvToken}</span>
                            </div>
                            {swapQuote && !isFetchingQuote && (
                                <p style={{ color: '#444', fontSize: '0.68rem', textAlign: 'right', marginTop: 3 }}>{swapQuote.routePlan?.length || 1} hop · {((swapQuote.slippageBps || 50) / 100).toFixed(1)}% slippage</p>
                            )}
                            {swapError && !isFetchingQuote && (
                                <p style={{ color: '#ff4d4d', fontSize: '0.6rem', textAlign: 'right', marginTop: 3 }}>⚠️ {swapError}</p>
                            )}
                        </div>

                        {/* Execute button */}
                        <button
                            className="action-button primary-button"
                            style={{ width: '100%', marginTop: 14, height: 33, fontSize: '0.88rem' }}
                            onClick={handleExecuteSwap}
                            disabled={!swapQuote || isSwapping || insufficientBalance || !walletInstance}
                        >
                            {isSwapping ? '⏳ Swapping...'
                                : insufficientBalance ? '🔒 Insufficient Balance'
                                : !swapContract || swapContract.length < 32 ? 'SWAP'
                                : !swapAmount || parseFloat(swapAmount) <= 0 ? 'SWAP'
                                : isFetchingQuote ? '⏳ Getting quote...'
                                : !swapQuote ? 'No route found'
                                : `Swap ${swapAmount} ${payToken} → ${recvToken}`}
                        </button>
                    </div>

                    {/* Trending — keep original dimensions/styles */}
                    {/* TOP MARKET (24H) list */}
{newTokens.length > 0 && (
  <div className="new-tokens-list" style={{ marginTop: '10px',  paddingTop: '5px' }}>
    <p className="list-title" style={{ color: '#bdbbbbff', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.8rem' }}>
      TOP MARKET (24H)
    </p>

    <div
      className="tokens-vertical-scroller"
      style={{
        maxHeight: '350px',
        overflowY: 'auto',
        paddingRight: '5px',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      }}
      role="list"
      aria-label="Top market 24 hour movers"
    >
      {newTokens.map((t, i) => (
        <div
          key={i}
          className="mini-token-card-row"
          onClick={() => {
            setSwapContract(t.tokenAddress || t.mint || '');
            setSwapDirection('SOL_TO_TOKEN');
            setSwapQuote?.(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSwapContract(t.tokenAddress || t.mint || ''); setSwapDirection('SOL_TO_TOKEN'); setSwapQuote?.(null); } }}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 10px',
            backgroundColor: '#16161621',
            borderRadius: '10px',
            marginBottom: '8px',
            cursor: 'pointer',
            border: '1px solid #413f3f',
            transition: 'transform 120ms ease, box-shadow 120ms ease'
          }}
        >
          <div className="token-info-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', width: 44, height: 34 }}>
              <img
                src={t.image || 'https://picsum.photos/32/32'}
                alt={t.symbol || 'token'}
                style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid #333', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.src = 'https://picsum.photos/32/32'; }}
              />
              <span style={{
                position: 'absolute',
                bottom: -5,
                right: -5,
                fontSize: '9px',
                background: '#000000e0',
                color: '#f2ededff',
                padding: '1px 4px',
                borderRadius: '4px',
                fontWeight: 'bold'
              }}>
                {i + 1}
              </span>
            </div>

            <div className="token-details" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="symbol" style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.symbol}
              </span>
              <span className="price-text" style={{ fontSize: '0.75rem', color: '#b6bbb9e0', fontFamily: 'monospace', fontWeight: '600' }}>
                ${t.price > 0
                  ? (t.price < 0.0001 ? t.price.toFixed(8) : t.price.toFixed(4))
                  : '0.00...'}
              </span>
            </div>
          </div>

          <div className="token-stats-right" style={{ textAlign: 'right', minWidth: 96 }}>
            <div className="stat-item">
              <span style={{
                color: (t.priceChange24h || 0) >= 0 ? '#14F195' : '#ff4d4d',
                fontWeight: 'bold',
                fontSize: '0.85rem'
              }}>
                {(t.priceChange24h || 0) >= 0 ? '▲' : '▼'} {Math.abs(t.priceChange24h || 0).toFixed(2)}%
              </span>
            </div>
            <div className="stat-item" style={{ marginTop: '6px' }}>
              <span style={{ fontSize: '0.7rem', color: '#666', fontWeight: 'bold', marginRight: '6px' }}>MCAP</span>
              <span style={{ fontSize: '0.8rem', color: '#eee', fontWeight: '700' }}>
                ${typeof t.marketCap === 'number'
                  ? (t.marketCap >= 1000000
                    ? (t.marketCap / 1000000).toFixed(2) + 'M'
                    : (t.marketCap >= 1000 ? (t.marketCap / 1000).toFixed(0) + 'K' : t.marketCap.toFixed(0)))
                  : (t.mcapFormatted || '0')}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
  
)}


{/* Compact Trending section with improved swipe/scroll UX */}
{newTokens.length > 0 && (
  <div className="trending-section" style={{ marginTop: 16 }}>
    <p style={{ fontSize: '0.72rem', color: '#555', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
      🔥 Trending on Solana
    </p>

    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxHeight: '260px',
      overflowY: 'auto',
      paddingRight: 6,
      WebkitOverflowScrolling: 'touch',
      overscrollBehavior: 'contain'
    }}>
      {newTokens.map((t, i) => (
        <div
          key={t.tokenAddress || t.mint || i}
          onClick={() => { setSwapContract(t.tokenAddress || t.mint || ''); setSwapDirection('SOL_TO_TOKEN'); setSwapQuote?.(null); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSwapContract(t.tokenAddress || t.mint || ''); setSwapDirection('SOL_TO_TOKEN'); setSwapQuote?.(null); } }}
          className="token-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            cursor: 'pointer',
            background: swapContract === (t.tokenAddress || t.mint) ? 'rgba(146,83,175,0.12)' : 'rgba(255,255,255,0.03)',
            border: swapContract === (t.tokenAddress || t.mint) ? '1px solid rgba(146,83,175,0.4)' : '1px solid transparent',
            transition: 'all 0.15s',
            userSelect: 'none'
          }}
        >
          <span style={{ color: '#999', fontSize: '0.72rem', minWidth: 22, textAlign: 'left' }}>#{i + 1}</span>

          {t.image
            ? <img src={t.image} width={22} height={22} style={{ borderRadius: '50%', flexShrink: 0 }} alt={t.symbol || 'token'} onError={e => e.currentTarget.style.display = 'none'} />
            : <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a1a1a', flexShrink: 0 }} />
          }

          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.symbol}
            </span>
            <span style={{ color: '#9aa', fontSize: '0.72rem', display: 'block' }}>
              ${t.price && t.price > 0 ? (t.price < 0.0001 ? t.price.toFixed(8) : t.price.toFixed(4)) : '0.00'}
            </span>
          </div>

          <div style={{ textAlign: 'right', fontSize: '0.72rem', minWidth: 86 }}>
            <div style={{ color: (t.priceChange24h || 0) >= 0 ? '#14F195' : '#ff4d4d', fontWeight: 700 }}>
              {(t.priceChange24h || 0) >= 0 ? '▲' : '▼'} {Math.abs(t.priceChange24h || 0).toFixed(2)}%
            </div>
            <div style={{ color: '#444', fontSize: '0.72rem', marginTop: 4 }}>
              {t.mcapFormatted ? `$${t.mcapFormatted}` : (t.marketCap ? `$${(t.marketCap >= 1000000 ? (t.marketCap / 1000000).toFixed(2) + 'M' : (t.marketCap / 1000).toFixed(0) + 'K')}` : '')}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
</div> 
  </div>
);
}
    // ═════ RENDER: Main portfolio ═════
    return (
        <div className="slide-panel">
            <div className="screen-container">
                {/* Total USD */}
                <div style={{ textAlign: 'center', padding: '14px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
                    {isLoadingData
                        ? <p style={{ color: '#333', fontSize: '0.8rem', margin: 0 }}>Loading portfolio...</p>
                        : <>
                            <p style={{ fontSize: '0.6rem', color: '#c7c4c4', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Total Portfolio Value</p>
                            <p style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.03em' }}>{formatUsd(totalUsd)}</p>
                          </>
                    }
                </div>

                {/* Actions */}
                <div className="wallet-actions-container" style={{ marginBottom: 16 }}>
                    <button className="action-button primary-button" onClick={() => { setSendTokenMode(null); onShowSendForm(true); }}>Send ↑</button>
                    <button className="action-button secondary-button" onClick={() => setShowReceiveQR(true)}> Receive</button>
                    <button className="action-button secondary-button" onClick={() => setShowSwapForm(true)}>⇄ Swap</button>
                    <button
                        className="action-button secondary-button"
                        style={{ border: '1px dashed #f5b442', background: '#1e1a00', color: '#f7c66b' }}
                        onClick={(e) => { e.stopPropagation(); onShowKeyModal(); }}
                    >🔑 Keys</button>
                </div>

                <div className="wallet-info-container">
                    {/* Address bar */}
                    <div style={{display: 'flex',alignItems: 'center',gap: 12,marginBottom: 10,padding: '8px 8px',background: 'rgba(0, 0, 0, 0.84)',borderRadius: 10,width: 316, }}>
                        <p style={{margin: 0,flex: 1,fontSize: '0.63rem',color: '#b4aeae',fontFamily: 'monospace',whiteSpace: 'normal', wordBreak: 'break-all',overflowWrap: 'anywhere'}}>{walletAddress}</p>

                        <button className="copy-address-btn copy-button" onClick={handleCopyAddress} title="Copy address">📋</button>
                        <button onClick={refreshData} style={{ background: 'none', border: 'none', color: '#a54301', cursor: 'pointer', fontSize: '0.95rem', padding: '2px 4px' }} title="Refresh">⟳</button>
                    </div>

                    {/* SOL row — clickable */}
                    <div onClick={() => setSelectedToken({ mint: SOL_MINT, symbol: 'SOL', name: 'Solana', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', balance: solBalance, usdValue: solBalance * solUsdPrice, decimals: 9 })}
                        className="token-row-hover"
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', borderRadius: 8 }}>
                        <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" width={32} height={32} style={{ borderRadius: '50%', flexShrink: 0 }} alt="SOL" />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>SOL</span>
                                <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.88rem' }}>{formatCrypto(solBalance, 6)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                <span style={{ color: '#e9dcf5b2', fontSize: '0.68rem' }}>
                                    Solana {solUsdPrice > 0 ? `· ${formatPrice(solUsdPrice)}` : ''}
                                </span>
                                <span style={{ color: '#777', fontSize: '0.7rem' }}>{formatUsd(solBalance * solUsdPrice)}</span>
                            </div>
                        </div>
                    </div>

                    {/* SPL tokens — clickable */}
                    {tokens.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <p style={{ fontSize: '0.58rem', color: '#2a2a2a', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '10px 0 6px' }}>SPL Tokens</p>
                            <div style={{ maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                                {tokens.map((t, i) => {
                                    const pricePerToken = t.balance > 0 ? t.usdValue / t.balance : 0;
                                    return (
                                        <div key={i} onClick={() => setSelectedToken(t)} className="token-row-hover"
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', borderRadius: 8 }}>
                                            {t.logo
                                                ? <img src={t.logo} width={30} height={30} style={{ borderRadius: '50%', flexShrink: 0 }} alt={t.symbol} onError={e => e.target.style.display='none'} />
                                                : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a1a1a', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#333' }}>{t.symbol?.[0] || '?'}</div>
                                            }
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>{t.symbol}</span>
                                                    <span style={{ color: '#ddd', fontSize: '0.84rem' }}>{formatCrypto(t.balance, 4)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                                    <span style={{ color: '#444', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                                                        {t.name} · {pricePerToken > 0 ? formatPrice(pricePerToken) : '—'}
                                                    </span>
                                                    <span style={{ color: t.usdValue > 0 ? '#777' : '#222', fontSize: '0.7rem' }}>{t.usdValue > 0 ? formatUsd(t.usdValue) : '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div> {/* Cierre de wallet-info-container */}

                {/* Receive QR */}
                {showReceiveQR && (
                    <div className="setup-flow-2fa" style={{ marginTop: 16, textAlign: 'center' }}>
                        <h3 style={{ marginBottom: 14 }}>Receive</h3>
                        <div style={{ background: '#fff', padding: 12, borderRadius: 12, display: 'inline-block', marginBottom: 12 }}>
                            <QRCodeSVG value={walletAddress} size={148} />
                        </div>
                        <p style={{ fontSize: '0.6rem', color: '#555', wordBreak: 'break-all', padding: '0 8px', marginBottom: 14 }}>{walletAddress}</p>
                        <button className="setup-button" onClick={() => { navigator.clipboard.writeText(walletAddress); alert('Copied!'); }}>Copy Address</button>
                        <button className="setup-button delete-button" style={{ marginTop: 8 }} onClick={() => setShowReceiveQR(false)}>Close</button>
                    </div>
                )}
            </div> {/* Cierre de screen-container */}

            {/* Token action sheet */}
            {selectedToken && (
                <TokenActionSheet
                    token={selectedToken}
                    onSend={() => {
                        if (selectedToken.mint === SOL_MINT) { setSendTokenMode(null); onShowSendForm(true); }
                        else { setSendTokenMode(selectedToken); onShowSendForm(true); }
                        setSelectedToken(null);
                    }}
                    onSwap={() => {
                        if (selectedToken.mint !== SOL_MINT) { setSwapContract(selectedToken.mint); setSwapDirection('TOKEN_TO_SOL'); setSwapAmount(''); setSwapQuote(null); setShowSwapForm(true); }
                        else { setShowSwapForm(true); }
                        setSelectedToken(null);
                    }}
                    onClose={() => setSelectedToken(null)}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY SCREEN
// ─────────────────────────────────────────────────────────────────────────────
const SecurityScreen = ({ walletAddress, onPinSet, isPinSet, on2FASet, is2FAEnabled, current2FASecret }) => {
    const [tempPin,            setTempPin]            = useState('');
    const [showQR,             setShowQR]             = useState(false);
    const [newSecret,          setNewSecret]          = useState('');
    const [qrUrl,              setQrUrl]              = useState('');
    const [verifyCode,         setVerifyCode]         = useState('');
    const [authValidationCode, setAuthValidationCode] = useState('');

    const isAuthValid = () => is2FAEnabled && authenticator.verifySync(authValidationCode, current2FASecret);

    const handleUpdatePin = () => {
        if (!is2FAEnabled) return alert('⚠️ Configure 2FA first before setting a PIN.');
        if (!tempPin || tempPin.length < 4) return alert('Enter a valid PIN (4-6 digits).');
        if (!authValidationCode) return alert('Enter your 2FA code to authorize this change.');
        if (isAuthValid()) { onPinSet(tempPin); setTempPin(''); setAuthValidationCode(''); alert('✅ PIN updated.'); }
        else { alert('❌ ACCESS DENIED: Invalid 2FA code.'); setAuthValidationCode(''); }
    };

    const handleSetup2FA = () => {
        const secret  = authenticator.generateSecret();
        const otpauth = authenticator.toURI({ issuer: 'CypherWallet', label: walletAddress || 'User', secret });
        setNewSecret(secret); setQrUrl(otpauth); setShowQR(true);
    };

    const confirm2FA = () => {
        if (authenticator.verifySync(verifyCode, newSecret)) {
            on2FASet(newSecret); setShowQR(false); setVerifyCode(''); setAuthValidationCode('');
            alert('✅ 2FA enabled! Transfers are now protected.');
        } else { alert('❌ Invalid code. Try again.'); }
    };

    const handleDisable2FA = () => {
        if (!authValidationCode) return alert('Enter your 2FA code to disable it.');
        if (isAuthValid()) {
            if (window.confirm('⚠️ Disabling 2FA removes transfer protection. Continue?')) { on2FASet(null); setAuthValidationCode(''); }
        } else { alert('❌ ACCESS DENIED: Invalid 2FA code.'); setAuthValidationCode(''); }
    };

    return (
        <div className="slide-panel">
            <div className="screen-container">
                <div className="security-settings-container">
                   

                    {is2FAEnabled && (
                        <div style={{ background: 'rgba(20,241,149,0.05)', padding: '14px 16px', borderRadius: 12, marginBottom: 20, border: '1px solid rgba(20,241,149,0.18)' }}>
                            <label style={{ 
  display: 'block', 
  textAlign: 'center', // Esta es la clave
  fontSize: '0.75rem', 
  color: '#eeeeee', 
  marginBottom: 8, 
  fontWeight: 700, 
  letterSpacing: '0.08em' 
}}>
  🛡️ ENTER Google Authenticator code (REQUIRED FOR ALL CHANGES)
</label>
                            <input type="text" placeholder="000000" value={authValidationCode} onChange={e => setAuthValidationCode(e.target.value.replace(/\D/g, ''))} className="import-input auth-verify-input" maxLength={6} style={{ textAlign: 'center', letterSpacing: '10px', fontSize: '1.4rem', background: '#000', width: '100%', boxSizing: 'border-box' }} />
                        </div>
                    )}

                    {/* PIN */}
                    <div className="security-option" style={{ opacity: is2FAEnabled ? 1 : 0.35, pointerEvents: is2FAEnabled ? 'auto' : 'none' }}>
                        <h4>Withdrawal PIN {!is2FAEnabled && <span style={{ fontSize: '0.58rem', color: '#ff4444', marginLeft: 6 }}>(Requires 2FA)</span>}</h4>
                        <p style={{ fontSize: '0.7rem', marginBottom: 10 }}>{isPinSet ? '✅ Active — Required for every transfer.' : 'Set a PIN to protect all outgoing transactions.'}</p>
                        <input type="password" placeholder="4-6 digit PIN" value={tempPin} onChange={e => setTempPin(e.target.value.replace(/\D/g, ''))} className="import-input" maxLength={6} disabled={!is2FAEnabled} />
                        <button className={`setup-button ${!is2FAEnabled ? 'disabled' : ''}`} onClick={handleUpdatePin} style={{ marginTop: 8 }}>{isPinSet ? 'Update PIN' : 'Setup PIN'}</button>
                        {!is2FAEnabled && <p style={{ color: '#ff4444', fontSize: '0.62rem', marginTop: 6 }}>⚠️ Activate 2FA below to unlock PIN.</p>}
                    </div>

                    <hr style={{ border: 0, borderTop: '1px solid #0f0f0f', margin: '20px 0' }} />

                    {/* 2FA */}
                    <div className="security-option">
                        <h4>Google Authenticator (2FA)</h4>
                        <p style={{ fontSize: '0.7rem', marginBottom: 10 }}>{is2FAEnabled ? '✅ Active — All transfers protected.' : '⚠️ Required before setting a Withdrawal PIN.'}</p>
                        {is2FAEnabled ? (
                            <button className="setup-button delete-button" onClick={handleDisable2FA}>Disable 2FA</button>
                        ) : !showQR ? (
                            <button className="setup-button" onClick={handleSetup2FA} style={{ background: 'rgba(20,241,149,0.06)', color: '#14F195', border: '1px solid rgba(20,241,149,0.15)' }}>Setup 2FA Now</button>
                        ) : (
                            <div className="setup-flow-2fa">
                                <p style={{ fontSize: '0.7rem', marginBottom: 10 }}>1. Scan with Google Authenticator · 2. Enter code:</p>
                                <div style={{ background: '#fff', padding: 10, borderRadius: 10, display: 'inline-block', marginBottom: 12 }}>
                                    <QRCodeSVG value={qrUrl} size={130} />
                                </div>
                                <input type="text" placeholder="6-digit code" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} className="import-input" maxLength={6} />
                                <button className="action-button primary-button" style={{ marginTop: 10 }} onClick={confirm2FA}>Confirm & Activate</button>
                                <button className="action-button secondary-button" style={{ marginTop: 8 }} onClick={() => setShowQR(false)}>Cancel</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS SCREEN
// ─────────────────────────────────────────────────────────────────────────────
const ContactsScreen = ({ contacts, onSendToContact, onRedirectToMessaging, onAddNewContact, onDeleteContact, onEditContact }) => {
    const containerRef = useRef(null);
    return (
        <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
            <div className="screen-container">
                <div className="agenda-container" style={{ width: '90%', margin: '0 auto', background: 'rgba(8,8,8,0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: 20 }}>
                    <h3 style={{ textAlign: 'center', fontSize: '0.68rem', letterSpacing: '2px', color: '#dad8d8', marginBottom: 18, textTransform: 'uppercase' }}>Contacts</h3>
                    <div className="contact-list-container no-scrollbar" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
                        {contacts.length === 0
                            ? <p style={{ textAlign: 'center', color: '#eeb3d7', marginTop: 20, fontSize: '0.78rem' }}>No contacts yet.</p>
                            : contacts.map((c, i) => (
                                <div key={c.id || i} className="contact-item" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 14, padding: 14, marginBottom: 8, border: '1px solid rgba(255,255,255,0.03)', position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 10 }}>
                                        <span onClick={() => onEditContact(c)} style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.18)', cursor: 'pointer', textTransform: 'uppercase' }}>edit</span>
                                        <span onClick={() => onDeleteContact(c.address)} style={{ fontSize: '0.78rem', color: 'rgba(255,50,50,0.3)', cursor: 'pointer', fontWeight: 700 }}>✕</span>
                                    </div>
                                    <h4 style={{ margin: '0 0 3px', fontSize: '0.86rem', color: '#ddd' }}>{c.name}</h4>
                                    <p style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#b9b9b9', margin: '0 0 10px', whiteSpace: 'nowrap' }}>{c.address}</p>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="action-button primary-button" style={{ height: 28, fontSize: '0.68rem', padding: '0 10px', flex: 1 }} onClick={() => onSendToContact(c.address)}>Send Crypto</button>
                                        <button className="action-button secondary-button" style={{ height: 28, fontSize: '0.68rem', padding: '0 10px', flex: 1 }} onClick={() => onRedirectToMessaging(c.address)}>Cypher Chat</button>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                    <button className="action-button primary-button full-width" onClick={onAddNewContact} style={{ marginTop: 14, height: 36, fontSize: '0.74rem', background: 'rgba(20,241,149,0.05)', color: '#14F195', border: '1px solid rgba(20,241,149,0.1)' }}>
                        + New Contact
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// SLIDING AUTH PANEL — defined at module level so React never remounts it
// ─────────────────────────────────────────────────────────────────────────────
const SlidingAuthPanel = ({ visible, onClose, pendingTx, onAuthorize, goToSecurity }) => {
    const [pinInput,  setPinInput]  = useState('');
    const [totpInput, setTotpInput] = useState('');
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const firstRef = useRef(null);

    useEffect(() => {
        if (visible) {
            setPinInput('');
            setTotpInput('');
            setError('');
            setTimeout(() => firstRef.current?.focus(), 120);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [visible]);

    if (!visible) return null;

    const isConfigured = !!(localStorage.getItem('wallet_pin') && localStorage.getItem('wallet_2fa_secret'));

    const handleSubmit = async (e) => {
        e?.preventDefault();
        setError('');
        if (!isConfigured) {
            goToSecurity?.();
            onClose?.();
            return;
        }
        if (!pinInput || !totpInput) {
            setError('Please enter PIN and 2FA code.');
            return;
        }
        setLoading(true);
        try {
            const result = await onAuthorize(pinInput.trim(), totpInput.trim());
            if (result.success) {
                setLoading(false);
                onClose();
            } else {
                setError(result.error || 'Authorization failed.');
                setLoading(false);
            }
        } catch (err) {
            setError(err?.message || 'Authorization error.');
            setLoading(false);
        }
    };

    return (
        <div
            className="sap-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="sap-panel" aria-live="polite">
                <div className="sap-handle" aria-hidden="true" />
                <div className="sap-header">
                    <h4>{isConfigured ? 'Authorize Transaction' : 'Security Required'}</h4>
                    <button className="sap-close" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="sap-body">
                    {isConfigured ? (
                        <>
                            {pendingTx && (
                                <div className="sap-txinfo">
                                    <div><strong>To:</strong> {String(pendingTx.to).slice(0,8)}...{String(pendingTx.to).slice(-6)}</div>
                                    <div><strong>Amount:</strong> {pendingTx.amount} SOL</div>
                                </div>
                            )}
                            <form onSubmit={handleSubmit}>
                                <label className="sap-label">Withdrawal PIN</label>
                                <input
                                    ref={firstRef}
                                    className="sap-input"
                                    type="password"
                                    inputMode="numeric"
                                    value={pinInput}
                                    onChange={e => setPinInput(e.target.value)}
                                    placeholder="Your PIN"
                                    autoComplete="off"
                                />
                                <label className="sap-label">Google Authenticator Code</label>
                                <input
                                    className="sap-input"
                                    type="text"
                                    inputMode="numeric"
                                    value={totpInput}
                                    onChange={e => setTotpInput(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    maxLength={6}
                                    autoComplete="off"
                                    style={{ letterSpacing: '6px', textAlign: 'center', fontSize: '1.2rem' }}
                                />
                                {error && <div className="sap-error">⚠️ {error}</div>}
                                <div className="sap-actions">
                                    <button
                                        type="submit"
                                        className="sap-btn primary"
                                        disabled={loading || !pinInput || totpInput.length < 6}
                                    >
                                        {loading ? '⏳ Sending...' : '🔓 Authorize & Send'}
                                    </button>
                                    <button type="button" className="sap-btn secondary" onClick={onClose} disabled={loading}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <>
                            <p className="sap-notice">⚠️ PIN and 2FA must be configured before sending funds.</p>
                            <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 12px' }}>Go to the Security tab to set them up.</p>
                            <div className="sap-actions">
                                <button className="sap-btn primary" onClick={() => { goToSecurity?.(); onClose?.(); }}>Go to Security</button>
                                <button className="sap-btn secondary" onClick={onClose}>Close</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: WalletModal
// ─────────────────────────────────────────────────────────────────────────────
const WalletModal = ({ onClose, walletAddress, onCreateWallet, onImportWallet, walletInstance, onRedirectToMessaging, initialTab }) => {
  // Portfolio state
  const [solBalance, setSolBalance] = useState(0);
  const [solUsdPrice, setSolUsdPrice] = useState(0);
  const [tokens, setTokens] = useState([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // UI state
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendAmount, setSendAmount] = useState('');
  const [sendToAddress, setSendToAddress] = useState('');
  const [contacts, setContacts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [contactToEdit, setContactToEdit] = useState(null);

  // Security: PIN and 2FA (persisted in localStorage)
  const [pinState, setPinState] = useState(() => localStorage.getItem('wallet_pin') || null);
  const [twoFASecret, setTwoFASecret] = useState(() => localStorage.getItem('wallet_2fa_secret') || null);

  // Key modal — at WalletModal level so it renders OUTSIDE wallet-modal overflow:hidden
  const [showKeyModal,  setShowKeyModal]  = useState(false);
  const [keyPinInput,   setKeyPinInput]   = useState('');
  const [keyAuthError,  setKeyAuthError]  = useState('');
  const [keyAuthorized, setKeyAuthorized] = useState(false);

  // Sliding auth panel state
  const [authPanelVisible, setAuthPanelVisible] = useState(false);
  const [pendingTx, setPendingTx] = useState(null); // { to, amount }

  // Attempts and lockout
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60_000; // 5 minutes
  const [attempts, setAttempts] = useState(() => Number(localStorage.getItem('wallet_auth_attempts') || 0));
  const [lockoutUntil, setLockoutUntil] = useState(() => Number(localStorage.getItem('wallet_lockout_until') || 0));

  // New tokens feed (top gainers)
  const [newTokens, setNewTokens] = useState([]);

  // Focus ref for auth inputs
  const authPinRef = useRef(null);

  useEffect(() => { setSlideIndex(initialTab === 'contacts' ? 2 : 0); }, [initialTab]);

  useEffect(() => {
    setContacts(JSON.parse(localStorage.getItem('contacts') || '[]'));
    fetchAllData();
  }, [walletAddress]);

  useEffect(() => {
    // Clear lockout if expired
    if (lockoutUntil && Date.now() > lockoutUntil) {
      localStorage.removeItem('wallet_lockout_until');
      setLockoutUntil(0);
      localStorage.setItem('wallet_auth_attempts', '0');
      setAttempts(0);
    }
  }, [lockoutUntil]);

  // Load trending tokens periodically
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const list = await getNewPairs();
        if (mounted) setNewTokens(list.slice(0, 15));
      } catch (e) {
        console.warn('Trending load error', e);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const fetchAllData = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoadingData(true);
    try {
      const p = await getFullPortfolio(walletAddress);
      setSolBalance(p.solBalance);
      setSolUsdPrice(p.solUsdPrice);
      setTokens(p.tokens);
      setTotalUsd(p.totalUsd);
    } catch (e) {
      console.error('Portfolio error:', e);
    } finally {
      setIsLoadingData(false);
    }
  }, [walletAddress]);

  const handlePinSet = p => { localStorage.setItem('wallet_pin', p); setPinState(p); };
  const handle2FASet = s => { s ? localStorage.setItem('wallet_2fa_secret', s) : localStorage.removeItem('wallet_2fa_secret'); setTwoFASecret(s); };

  // Reset attempts (e.g., after changing PIN/2FA)
  const resetAuthAttempts = () => {
    localStorage.setItem('wallet_auth_attempts', '0');
    setAttempts(0);
    localStorage.removeItem('wallet_lockout_until');
    setLockoutUntil(0);
  };

  // Verify PIN + TOTP (returns boolean)
  const verifyAuth = async (pinInput, totpInput) => {
    // Basic checks
    if (!pinState || !twoFASecret) {
      return { ok: false, error: 'PIN or 2FA not configured. Go to Security to enable them.' };
    }

    // Lockout check
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      return { ok: false, error: `Too many attempts. Try again in ${remaining} seconds.` };
    }

    // PIN check
    if (pinInput !== pinState) {
      const newAttempts = attempts + 1;
      localStorage.setItem('wallet_auth_attempts', String(newAttempts));
      setAttempts(newAttempts);
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        localStorage.setItem('wallet_lockout_until', String(until));
        setLockoutUntil(until);
        return { ok: false, error: 'Too many failed attempts. Temporarily locked.' };
      }
      return { ok: false, error: `Incorrect PIN. Attempts: ${newAttempts}/${MAX_ATTEMPTS}` };
    }

    // TOTP check
    try {
      const ok = authenticator.verifySync(String(totpInput).trim(), twoFASecret);
      if (!ok) {
        const newAttempts = attempts + 1;
        localStorage.setItem('wallet_auth_attempts', String(newAttempts));
        setAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MS;
          localStorage.setItem('wallet_lockout_until', String(until));
          setLockoutUntil(until);
          return { ok: false, error: 'Too many failed attempts. Temporarily locked.' };
        }
        return { ok: false, error: `Invalid 2FA code. Attempts: ${newAttempts}/${MAX_ATTEMPTS}` };
      }
    } catch (e) {
      console.error('2FA check error', e);
      return { ok: false, error: 'Error verifying 2FA.' };
    }

    // All good: reset attempts and authorize
    resetAuthAttempts();
    return { ok: true };
  };

  // Open sliding auth panel (instead of prompt)
  const requestAuthorizationThenSend = () => {
    if (!pinState || !twoFASecret) {
      // Show sliding panel which will instruct user to go to Security
      setPendingTx({ to: sendToAddress, amount: sendAmount });
      setAuthPanelVisible(true);
      return;
    }
    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      alert(`Account temporarily locked due to failed attempts. Try again in ${remaining} seconds.`);
      return;
    }
    setPendingTx({ to: sendToAddress, amount: sendAmount });
    setAuthPanelVisible(true);
    // focus will be handled by panel
  };

  // Replace old send handler to open panel
  const handleSendSol = async () => {
    if (!sendToAddress || !sendAmount) return alert('Please fill all fields.');
    requestAuthorizationThenSend();
  };

  // Called by the sliding panel when user submits PIN+2FA
  const onAuthorizeAndSend = async (pinInput, totpInput) => {
    // Verify locally
    const res = await verifyAuth(pinInput, totpInput);
    if (!res.ok) return { success: false, error: res.error };

    // Authorized -> perform send
    try {
      const sig = await sendSol(walletInstance, pendingTx.to, parseFloat(pendingTx.amount));
      if (sig) {
        // success: clear pending tx and refresh
        setAuthPanelVisible(false);
        setPendingTx(null);
        setShowSendForm(false);
        setSendAmount('');
        setSendToAddress('');
        setTimeout(fetchAllData, 2000);
        return { success: true };
      } else {
        return { success: false, error: 'Transaction failed. Check balance and address.' };
      }
    } catch (err) {
      return { success: false, error: err?.message || 'Network error' };
    }
  };

  // Render
  return (
    <div className="modal-overlay">
      {/* 1. Contenedor del Modal con overflow hidden para que el fondo no se salga */}
      <div className="wallet-modal" style={{ position: 'relative', overflow: 'hidden' }}>
        
        {/* 2. EL SCRIPT DE FONDO (Se renderiza primero para quedar atrás) */}
        <CyberMatrixBackground />

        {/* 3. CAPA DE CONTENIDO (Con z-index alto para estar al frente) */}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          
          <button className="close-button" onClick={onClose}>&times;</button>
          
          <div className="wallet-header">
            <img src={vaultsLogo} alt="Logo" style={{ width:34 }} />
            <h2 style={{ fontSize: '0.94rem', marginLeft: 8, letterSpacing: '0.06em' }}>QhuboX Wallet</h2>
          </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {['Portfolio', 'Security', 'Contacts'].map((label, i) => (
            <button
              key={i}
              onClick={() => setSlideIndex(i)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 0',
                fontSize: '0.68rem',
                fontWeight: slideIndex === i ? 700 : 400,
                color: slideIndex === i ? '#fff' : '#2e2e2e',
                borderBottom: slideIndex === i ? '2px solid #9253af' : '2px solid transparent',
                transition: 'all 0.18s',
                letterSpacing: '0.05em'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="slide-container" style={{ transform: `translateX(-${slideIndex * 100}%)` }}>
          <BalanceScreen
            walletAddress={walletAddress}
            solBalance={solBalance}
            solUsdPrice={solUsdPrice}
            tokens={tokens}
            totalUsd={totalUsd}
            isLoadingData={isLoadingData}
            onShowSendForm={setShowSendForm}
            showSendForm={showSendForm}
            sendAmount={sendAmount}
            setSendAmount={setSendAmount}
            sendToAddress={sendToAddress}
            setSendToAddress={setSendToAddress}
            handleSendSol={handleSendSol}
            onCreateWallet={onCreateWallet}
            onImportWallet={onImportWallet}
            showImport={showImport}
            setShowImport={setShowImport}
            secretKeyInput={secretKeyInput}
            setSecretKeyInput={setSecretKeyInput}
            handleImportClick={() => onImportWallet(secretKeyInput)}
            walletInstance={walletInstance}
            refreshData={fetchAllData}
            newTokens={newTokens}
            onShowKeyModal={() => { setKeyPinInput(''); setKeyAuthError(''); setKeyAuthorized(false); setShowKeyModal(true); }}
            pinState={pinState}
          />
          <SecurityScreen
            walletAddress={walletAddress}
            onPinSet={p => { handlePinSet(p); resetAuthAttempts(); }}
            isPinSet={!!pinState}
            on2FASet={s => { handle2FASet(s); resetAuthAttempts(); }}
            is2FAEnabled={!!twoFASecret}
            current2FASecret={twoFASecret}
          />
          <div className="slide-panel agenda-screen-container">
            <ContactsScreen
              contacts={contacts}
              onSendToContact={addr => { setSendToAddress(addr); setShowSendForm(true); setSlideIndex(0); }}
              onRedirectToMessaging={onRedirectToMessaging}
              onAddNewContact={() => { setContactToEdit(null); setShowAddModal(true); }}
              onDeleteContact={addr => { if (window.confirm('Delete this contact?')) { const n = contacts.filter(c => c.address !== addr); localStorage.setItem('contacts', JSON.stringify(n)); setContacts(n); } }}
              onEditContact={c => { setContactToEdit(c); setShowAddModal(true); }}
            />
            <AddContactModal
              show={showAddModal}
              onClose={() => setShowAddModal(false)}
              onSave={c => { const n = contactToEdit ? contacts.map(ct => ct.id === contactToEdit.id ? c : ct) : [...contacts, c]; localStorage.setItem('contacts', JSON.stringify(n)); setContacts(n); }}
              contactToEdit={contactToEdit}
            />
          </div>
        </div>
      
      </div> {/* Cierre de wallet-modal */}
    </div> 
  );




        {/* Sliding authorization panel — rendered INSIDE modal-overlay but OUTSIDE wallet-modal
            so it is NOT clipped by wallet-modal's overflow:hidden */}
        <SlidingAuthPanel
          visible={authPanelVisible}
          onClose={() => { setAuthPanelVisible(false); setPendingTx(null); }}
          pendingTx={pendingTx}
          onAuthorize={onAuthorizeAndSend}
          goToSecurity={() => { setSlideIndex(1); setAuthPanelVisible(false); }}
        />

        {/* Key viewer modal — outside wallet-modal to escape overflow:hidden clipping */}
        {showKeyModal && (
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
                onClick={() => { setShowKeyModal(false); setKeyAuthorized(false); setKeyPinInput(''); setKeyAuthError(''); }}
            >
                <div
                    onClick={e => e.stopPropagation()}
                    style={{ width: '100%', maxWidth: 250, background: '#101010', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 22, position: 'relative' }}
                >
                    <button
                        onClick={() => { setShowKeyModal(false); setKeyAuthorized(false); setKeyPinInput(''); setKeyAuthError(''); }}
                        style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#888', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}
                    >×</button>

                    <h3 style={{ margin: '0 0 16px', color: '#fff', fontSize: '1rem' }}>🔐 View Wallet Keys</h3>

                    {!pinState ? (
                        <>
                            <p style={{ color: '#ff6b6b', fontSize: '0.82rem', marginBottom: 16 }}>A Withdrawal PIN is required to view the private key. Set one in the Security tab first.</p>
                            <button className="setup-button" onClick={() => { setShowKeyModal(false); setSlideIndex(1); }}>Go to Security</button>
                        </>
                    ) : keyAuthorized ? (
                        <>
                            <p style={{ color: '#14F195', fontSize: '0.75rem', margin: '0 0 8px', fontWeight: 700 }}>PUBLIC KEY</p>
                            <div style={{ position: 'relative', marginBottom: 14 }}>
                                <textarea
                                    readOnly
                                    value={walletAddress || ''}
                                    rows={2}
                                    style={{ width: '100%', background: '#0a0a0a', color: '#aaa', border: '1px solid #222', borderRadius: 8, padding: '8px 40px 8px 10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box' }}
                                />
                                <button onClick={() => { navigator.clipboard.writeText(walletAddress || ''); }} title="Copy" style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: '#aaa', cursor: 'pointer', padding: '3px 7px', fontSize: '0.75rem' }}>📋</button>
                            </div>

                            <p style={{ color: '#ff9b4e', fontSize: '0.75rem', margin: '0 0 8px', fontWeight: 700 }}>PRIVATE KEY (Base64) — Keep secret</p>
                            <div style={{ position: 'relative', marginBottom: 16 }}>
                                <textarea
                                    readOnly
                                    rows={4}
                                    value={(() => {
                                        try {
                                            const raw = localStorage.getItem('walletSecretKey');
                                            if (!raw) return 'No key found in storage.';
                                            const arr = JSON.parse(raw);
                                            if (!Array.isArray(arr)) return 'Invalid format.';
                                            return btoa(String.fromCharCode(...arr));
                                        } catch { return 'Error reading key.'; }
                                    })()}
                                    style={{ width: '100%', background: '#0a0a0a', color: '#f7c66b', border: '1px solid #333', borderRadius: 8, padding: '8px 40px 8px 10px', fontSize: '0.72rem', fontFamily: 'monospace', resize: 'none', boxSizing: 'border-box' }}
                                />
                                <button onClick={() => {
                                    try {
                                        const raw = localStorage.getItem('walletSecretKey');
                                        const arr = JSON.parse(raw);
                                        navigator.clipboard.writeText(btoa(String.fromCharCode(...arr)));
                                        alert('Private key copied.');
                                    } catch { alert('Error copying key.'); }
                                }} title="Copy" style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: '#aaa', cursor: 'pointer', padding: '3px 7px', fontSize: '0.75rem' }}>📋</button>
                            </div>

                            <p style={{ color: '#555', fontSize: '0.68rem', marginBottom: 14 }}>⚠️ Never share your private key. Anyone with it has full access to your funds.</p>
                            <button className="setup-button delete-button" onClick={() => { setShowKeyModal(false); setKeyAuthorized(false); setKeyPinInput(''); }}>Close</button>
                        </>
                    ) : (
                        <>
                            <p style={{ color: '#aaa', fontSize: '0.82rem', marginBottom: 14 }}>Enter your Withdrawal PIN to display the private key.</p>
                            <input
                                type="password"
                                value={keyPinInput}
                                onChange={e => { setKeyPinInput(e.target.value.replace(/\D/g, '')); setKeyAuthError(''); }}
                                placeholder="PIN"
                                maxLength={6}
                                autoFocus
                                style={{ width: '100%', background: '#000', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', fontSize: '1rem', marginBottom: 10, boxSizing: 'border-box', textAlign: 'center', letterSpacing: '6px' }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        if (keyPinInput === pinState) { setKeyAuthorized(true); setKeyAuthError(''); }
                                        else { setKeyAuthError('❌ Incorrect PIN. Access denied.'); setKeyPinInput(''); }
                                    }
                                }}
                            />
                            {keyAuthError && <p style={{ color: '#ff6b6b', fontSize: '0.78rem', marginBottom: 10 }}>{keyAuthError}</p>}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="setup-button"
                                    style={{ flex: 1 }}
                                    onClick={() => {
                                        if (keyPinInput === pinState) { setKeyAuthorized(true); setKeyAuthError(''); }
                                        else { setKeyAuthError('❌ Incorrect PIN. Access denied.'); setKeyPinInput(''); }
                                    }}
                                >Verify</button>
                                <button
                                    className="setup-button delete-button"
                                    style={{ flex: 1 }}
                                    onClick={() => { setShowKeyModal(false); setKeyPinInput(''); setKeyAuthError(''); }}
                                >Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}

      {/* Inline CSS */}
      <style>{`
    /* 1. EL CONTENEDOR (OVERLAY) */
    .sap-overlay {
        position: absolute;
        /* Cubre todo el app-container desde el origen */
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        
        /* Fondo oscuro translúcido */
        background-color: rgba(0, 0, 0, 0.45);
        
        /* Centrado horizontal y anclado abajo */
        display: flex;
        align-items: flex-end; 
        justify-content: center;
        
        z-index: 3000;
        /* Importante para no salirse de los bordes redondeados del container */
        border-radius: 20px; 
        overflow: hidden;
    }

    /* 2. EL PANEL (ANCLADO AL BORDE) */
    .sap-panel {
        /* Dimensiones solicitadas */
        width: 100%; 
        max-width: 400px; /* Ajustado a tu max-width de app-container */
        
        background: linear-gradient(180deg, #0f0f10, #0b0b0b);
        
        /* Bordes: solo arriba para que abajo encaje perfecto */
        border-top-left-radius: 16px;
        border-top-right-radius: 16px;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        
        /* Anclaje total: sin margen abajo */
        margin: 0; 
        
        padding: 22px 20px 36px;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-bottom: none; /* Evita doble borde en la base */
        
        animation: slideUp 0.2s ease-out;
        box-sizing: border-box;
    }

      .sap-handle { width:48px; height:6px; background:rgba(255,255,255,0.08); border-radius:6px; margin:6px auto; }

        .sap-header { display:flex; align-items:center; justify-content:space-between; padding:6px 4px; }

        .sap-header h4 { margin:0; color:#fff; font-size:1rem; }

        .sap-close { background:none; border:none; color:#bbb; font-size:1.1rem; cursor:pointer; }

        .sap-body { padding:8px 4px 18px 4px; color:#ddd; }

        .sap-txinfo { background: rgba(255,255,255,0.02); padding:8px; border-radius:8px; margin-bottom:8px; font-size:0.85rem; color:#cfcfcf; }

        .sap-label { display:block; margin-top:8px; font-size:0.78rem; color:#aaa; }

        .sap-input { width:100%; padding:10px 12px; margin-top:6px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); color:#fff; font-size:1rem; box-sizing:border-box; }

        .sap-error { color:#ff9b9b; margin-top:8px; font-size:0.85rem; }

        .sap-notice { color:#ddd; margin:8px 0 12px 0; }

        .sap-actions { display:flex; gap:8px; margin-top:12px; }

        .sap-btn { flex:1; padding:10px 12px; border-radius:10px; border:none; cursor:pointer; font-weight:600; }

        .sap-btn.primary { background:linear-gradient(180deg,#14F195,#0fb36a); color:#001; }

        .sap-btn.secondary { background: rgba(63, 0, 44, 0.6); border:1px solid rgba(181, 26, 228, 0.06); color:#ddd; }

      `}</style>
    </div>
  );
};

export default WalletModal;