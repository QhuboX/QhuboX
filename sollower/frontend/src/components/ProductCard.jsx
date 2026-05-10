// frontend/src/components/ProductCard.jsx
import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { payToAddress, processDonation } from '../services/dappService.js';
import { getTokenPrices, usdToQhubx } from '../services/tokenPriceService.js';
import { IconDownload, IconLink, IconCheck, IconCoin } from './Icons.jsx';

function PriceDisplay({ usdAmount, label = '' }) {
  const [tokens, setTokens] = useState(null);
  const [rate, setRate] = useState(null);

  useEffect(() => {
    usdToQhubx(usdAmount)
      .then(r => { setTokens(r.tokens); setRate(r.rate); })
      .catch(() => {});
  }, [usdAmount]);

  return (
    <div style={{ marginBottom: 4 }}>
      {label && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>}
      <div className="price-big" style={{ color: 'var(--green)' }}>
        ${parseFloat(usdAmount).toFixed(2)} USD
      </div>
      {tokens && (
        <div className="price-usd">
          ≈ {parseFloat(tokens).toFixed(4)} QHUBX
          {rate && <span style={{ marginLeft: 6, opacity: 0.6 }}>@ ${rate.toFixed(6)}/token</span>}
        </div>
      )}
    </div>
  );
}

function ProductCard({ postData }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [donationUSD, setDonationUSD] = useState('');
  const [donationTokens, setDonationTokens] = useState(null);

  const handleDonationChange = async val => {
    setDonationUSD(val);
    if (val && parseFloat(val) > 0) {
      try {
        const r = await usdToQhubx(parseFloat(val));
        setDonationTokens(r.tokens);
      } catch { setDonationTokens(null); }
    } else {
      setDonationTokens(null);
    }
  };

  const handleBuy = async () => {
    if (!wallet.connected) return alert('Connect your wallet first');
    setLoading(true);
    try {
      await payToAddress(wallet, connection, postData.sellerWallet, postData.productPriceUSD);
      setPurchased(true);
    } catch (e) {
      alert('Payment error: ' + e.message);
    } finally { setLoading(false); }
  };

  const handleDonate = async () => {
    if (!wallet.connected) return alert('Connect your wallet first');
    const amt = parseFloat(donationUSD);
    if (!amt || amt <= 0) return alert('Enter a valid USD amount');
    setLoading(true);
    try {
      await processDonation(postData.id, wallet, connection, postData.sellerWallet, amt);
      alert(`Donation of $${amt} sent!`);
      setDonationUSD('');
      setDonationTokens(null);
    } catch (e) {
      alert('Donation error: ' + e.message);
    } finally { setLoading(false); }
  };

  const goalUSD = parseFloat(postData.goalAmountUSD || postData.goalAmount || 0);
  const raisedUSD = parseFloat(postData.raisedAmountUSD || postData.raisedAmount || 0);
  const pct = goalUSD > 0 ? Math.min(100, (raisedUSD / goalUSD) * 100) : 0;

  if (postData.type === 'sale') {
    return (
      <div className="product-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <IconCoin size={13} /> Digital Product
            </div>
            <PriceDisplay usdAmount={postData.productPriceUSD} />
          </div>
          <div className="token-chip">QHUBX</div>
        </div>

        {postData.images?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 6, marginBottom: 14 }}>
            {postData.images.slice(0, 4).map((img, i) => (
              <img key={i} src={img} alt="" onClick={() => window.open(img)}
                style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
        )}

        {!purchased ? (
          <button className="btn-green" onClick={handleBuy} disabled={loading}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? '⏳ Processing…' : <><IconCoin size={15} /> Buy Now</>}
          </button>
        ) : (
          <div>
            <div style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <IconCheck size={16} /> Payment Complete!
            </div>
            {postData.productFileLink && (
              <a href={postData.productFileLink} target="_blank" rel="noreferrer"
                className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', color: 'white' }}>
                <IconDownload size={15} /> Download Product
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  if (postData.type === 'fund') {
    return (
      <div className="donation-panel">
        <div style={{ fontSize: '0.8rem', color: 'var(--red)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
          ❤️ Fundraising Campaign
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.86rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Raised</span>
          <span style={{ fontWeight: 700 }}>
            <span style={{ color: 'var(--red)' }}>${raisedUSD.toFixed(2)}</span>
            <span style={{ color: 'var(--text-muted)' }}> / ${goalUSD.toFixed(2)}</span>
          </span>
        </div>
        <div className="fund-progress-bg">
          <div className="fund-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 14 }}>{pct.toFixed(1)}% of goal reached</div>

        <label className="field-label">Donation amount (USD)</label>
        <input type="number" step="0.01" min="0.01" placeholder="e.g. 5.00"
          value={donationUSD} onChange={e => handleDonationChange(e.target.value)}
          style={{ marginBottom: 6 }} />
        {donationTokens && (
          <div style={{ fontSize: '0.78rem', color: 'var(--cyan)', marginBottom: 10 }}>
            ≈ {parseFloat(donationTokens).toFixed(4)} QHUBX will be sent
          </div>
        )}
        <button className="btn-red" onClick={handleDonate} disabled={loading || !donationUSD}
          style={{ width: '100%', opacity: (!donationUSD || loading) ? 0.5 : 1 }}>
          {loading ? '⏳ Sending…' : '❤️ Donate Now'}
        </button>
      </div>
    );
  }

  return null;
}

export default ProductCard;
