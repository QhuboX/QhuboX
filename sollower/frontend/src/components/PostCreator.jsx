// frontend/src/components/PostCreator.jsx
// - Feed shows only free "personal" post option
// - Full 4-type creator only shown when isProfileMode=true (inside UserProfile)
// - Seller wallet entered by user for sale/fund (money goes direct to their wallet)
// - Platform only receives publication fee
// - Ad supports 2 external links

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { savePost, fileToBase64, getUserProfile } from '../services/dappService.js';
import { usdToQhubx } from '../services/tokenPriceService.js';
import {
  TabIconPersonal, TabIconSale, TabIconFund, TabIconAd, IconImage,
} from './Icons.jsx';

const PUBLISH_FEE_USD = 10; // platform fee for paid types

const ALL_TABS = [
  { id: 'personal', label: 'Post',  Icon: TabIconPersonal },
  { id: 'sale',     label: 'Sell',  Icon: TabIconSale },
  { id: 'fund',     label: 'Fund',  Icon: TabIconFund },
  { id: 'ad',       label: 'Ad',    Icon: TabIconAd },
];

function CostInfo({ type, rewardBudgetUSD, enableRewards }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (type === 'personal') { setInfo(null); return; }
    const total = PUBLISH_FEE_USD + (enableRewards && type === 'ad' ? (parseFloat(rewardBudgetUSD) || 0) : 0);
    usdToQhubx(total)
      .then(r => setInfo({ total, tokens: r.tokens, rate: r.rate }))
      .catch(() => {});
  }, [type, rewardBudgetUSD, enableRewards]);

  if (!info) return null;
  return (
    <div style={{ background:'rgba(0,229,255,0.05)', border:'1px solid rgba(0,229,255,0.2)',
      borderRadius:10, padding:'9px 12px', marginBottom:11, fontSize:'0.8rem' }}>
      <div style={{ color:'rgba(136,153,204,0.8)', marginBottom:3 }}>
        Platform publication fee (paid in QHUBX):
      </div>
      <div style={{ fontWeight:700, color:'rgba(0,229,255,1)', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
        ${info.total.toFixed(2)} USD
        <span style={{ color:'rgba(100,120,180,0.8)', fontWeight:400, fontSize:'0.76rem' }}>
          ≈ {parseFloat(info.tokens).toFixed(4)} QHUBX @ ${info.rate.toFixed(6)}/token
        </span>
      </div>
      <div style={{ marginTop:4, fontSize:'0.74rem', color:'rgba(100,120,180,0.65)' }}>
        Sales & donations go directly to your wallet. Reward budget held in platform escrow.
      </div>
    </div>
  );
}

function PostCreator({ onNewPost, isProfileMode = false }) {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const wallet = useWallet();

  // In feed mode only 'personal' is allowed
  const tabs = isProfileMode ? ALL_TABS : ALL_TABS.slice(0, 1);

  const [type, setType] = useState('personal');
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState(null);

  // Sale fields — seller wallet entered by the post creator
  const [sellerWallet, setSellerWallet] = useState('');
  const [productPriceUSD, setProductPriceUSD] = useState('');
  const [productFileLink, setProductFileLink] = useState('');

  // Fund fields
  const [goalAmountUSD, setGoalAmountUSD] = useState('');

  // Ad fields
  const [enableRewards, setEnableRewards] = useState(false);
  const [rewardPerViewUSD, setRewardPerViewUSD] = useState('');
  const [totalRewardBudgetUSD, setTotalRewardBudgetUSD] = useState('');
  const [adLink1, setAdLink1] = useState('');
  const [adLinkLabel1, setAdLinkLabel1] = useState('');
  const [adLink2, setAdLink2] = useState('');
  const [adLinkLabel2, setAdLinkLabel2] = useState('');

  useEffect(() => {
    if (publicKey) {
      getUserProfile(publicKey.toBase58()).then(setProfile).catch(() => {});
    }
  }, [publicKey]);

  const handleImages = async e => {
    const files = Array.from(e.target.files).slice(0, 4 - images.length);
    const b64s = await Promise.all(files.map(fileToBase64));
    setImages(prev => [...prev, ...b64s].slice(0, 4));
  };

  const reset = () => {
    setContent(''); setImages([]); setExpanded(false);
    setSellerWallet('');
    setProductPriceUSD(''); setProductFileLink(''); setGoalAmountUSD('');
    setEnableRewards(false); setRewardPerViewUSD(''); setTotalRewardBudgetUSD('');
    setAdLink1(''); setAdLinkLabel1(''); setAdLink2(''); setAdLinkLabel2('');
    setType('personal');
  };

  const handleSubmit = async () => {
    if (!connected) return alert('Connect your wallet first');
    if (!content.trim() && images.length === 0) return alert('Add content or an image');

    if (type === 'sale') {
      if (!productPriceUSD || parseFloat(productPriceUSD) <= 0) return alert('Set a price in USD');
      if (!sellerWallet) return alert('Enter your wallet address to receive payments');
    }
    if (type === 'fund') {
      if (!goalAmountUSD || parseFloat(goalAmountUSD) <= 0) return alert('Set a fundraising goal in USD');
      if (!sellerWallet) return alert('Enter the recipient wallet address');
    }
    if (type === 'ad' && enableRewards) {
      if (!rewardPerViewUSD || parseFloat(rewardPerViewUSD) <= 0) return alert('Set reward per view (USD)');
      if (!totalRewardBudgetUSD || parseFloat(totalRewardBudgetUSD) <= 0) return alert('Set total reward budget (USD)');
    }

    setSubmitting(true);
    try {
      const postData = {
        type, content: content.trim(), images,
        user: publicKey.toBase58(),
        // Seller wallet set by the post creator — money goes directly here
        sellerWallet: sellerWallet.trim(),
        // Sale
        productPriceUSD: parseFloat(productPriceUSD) || 0,
        productFileLink,
        // Fund
        goalAmountUSD: parseFloat(goalAmountUSD) || 0,
        raisedAmountUSD: 0,
        // Ad
        enableRewards,
        rewardPerViewUSD: parseFloat(rewardPerViewUSD) || 0,
        totalRewardBudgetUSD: parseFloat(totalRewardBudgetUSD) || 0,
        remainingBudgetUSD: parseFloat(totalRewardBudgetUSD) || 0,
        // Ad links
        adLink1: adLink1.trim(),
        adLinkLabel1: adLinkLabel1.trim(),
        adLink2: adLink2.trim(),
        adLinkLabel2: adLinkLabel2.trim(),
      };
      await savePost(postData, wallet, connection);
      reset();
      onNewPost?.();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally { setSubmitting(false); }
  };

  const avatarSrc = profile?.profileImages?.[0] ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${publicKey?.toBase58()}&backgroundColor=0a0d1c`;

  const btnLabel = type === 'personal'
    ? 'Post'
    : `Publish ${type.charAt(0).toUpperCase()+type.slice(1)} — pay $${PUBLISH_FEE_USD}${type==='ad'&&enableRewards&&totalRewardBudgetUSD ? ` + $${totalRewardBudgetUSD} budget` : ''} USD`;

  return (
    <div className="creator-card glass-card">
      <div className="creator-inner">
        <div className="creator-quick-row">
          {publicKey && (
            <img src={avatarSrc} alt="" style={{ width:38, height:38, borderRadius:'50%',
              border:'2px solid rgba(155,135,245,0.35)', objectFit:'cover', flexShrink:0 }}/>
          )}
          <textarea className="creator-textarea"
            placeholder={connected ? "What's on your mind?" : 'Connect wallet to post…'}
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => connected && setExpanded(true)}
            rows={expanded ? 3 : 1}
            disabled={!connected}/>
        </div>

        {expanded && (
          <div className="creator-expanded" style={{ marginTop:12 }}>
            {/* Image previews */}
            {images.length > 0 && (
              <div className="img-preview-grid">
                {images.map((img, i) => (
                  <div key={i} className="img-preview-item">
                    <img src={img} alt=""/>
                    <button className="img-preview-remove" onClick={() => setImages(p => p.filter((_,idx)=>idx!==i))}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── SALE fields ── */}
            {type === 'sale' && (
              <div className="field-section section-sale">
                <div className="section-title" style={{ color:'rgba(20,241,149,0.95)' }}>
                  <TabIconSale/> Digital Product for Sale
                </div>
                <label className="field-label">Your wallet (receives payments directly) *</label>
                <input placeholder="Solana wallet address — payments go here" value={sellerWallet}
                  onChange={e => setSellerWallet(e.target.value)}/>
                <label className="field-label">Price (USD) *</label>
                <input type="number" min="0.01" step="0.01" placeholder="e.g. 9.99"
                  value={productPriceUSD} onChange={e => setProductPriceUSD(e.target.value)}/>
                <label className="field-label">Download / product link</label>
                <input type="url" placeholder="https://…" value={productFileLink}
                  onChange={e => setProductFileLink(e.target.value)}/>
              </div>
            )}

            {/* ── FUND fields ── */}
            {type === 'fund' && (
              <div className="field-section section-fund">
                <div className="section-title" style={{ color:'rgba(255,85,119,0.95)' }}>
                  <TabIconFund/> Fundraising Campaign
                </div>
                <label className="field-label">Recipient wallet (donations go directly here) *</label>
                <input placeholder="Solana wallet — donations sent directly here" value={sellerWallet}
                  onChange={e => setSellerWallet(e.target.value)}/>
                <label className="field-label">Goal amount (USD) *</label>
                <input type="number" min="1" step="1" placeholder="e.g. 500"
                  value={goalAmountUSD} onChange={e => setGoalAmountUSD(e.target.value)}/>
              </div>
            )}

            {/* ── AD fields ── */}
            {type === 'ad' && (
              <div className="field-section section-ad">
                <div className="section-title" style={{ color:'rgba(255,215,0,0.95)' }}>
                  <TabIconAd/> Ad Campaign
                </div>

                <label className="field-label">Link 1 URL</label>
                <input type="url" placeholder="https://yoursite.com" value={adLink1}
                  onChange={e => setAdLink1(e.target.value)}/>
                <label className="field-label">Link 1 Label</label>
                <input placeholder="e.g. Visit our website" value={adLinkLabel1}
                  onChange={e => setAdLinkLabel1(e.target.value)}/>

                <label className="field-label" style={{ marginTop:4 }}>Link 2 URL (optional)</label>
                <input type="url" placeholder="https://app.yoursite.com" value={adLink2}
                  onChange={e => setAdLink2(e.target.value)}/>
                <label className="field-label">Link 2 Label</label>
                <input placeholder="e.g. Download app" value={adLinkLabel2}
                  onChange={e => setAdLinkLabel2(e.target.value)}/>

                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                  margin:'10px 0 12px', fontSize:'0.86rem', color:'rgba(200,210,240,0.85)' }}>
                  <input type="checkbox" checked={enableRewards} onChange={e => setEnableRewards(e.target.checked)}
                    style={{ width:'auto', margin:0, accentColor:'rgba(255,215,0,1)' }}/>
                  Enable viewer rewards (watch-to-earn — 15s auto-claim)
                </label>

                {enableRewards && (
                  <>
                    <div style={{ background:'rgba(255,215,0,0.05)', border:'1px solid rgba(255,215,0,0.15)',
                      borderRadius:8, padding:'9px 11px', marginBottom:10, fontSize:'0.78rem',
                      color:'rgba(200,180,100,0.85)', lineHeight:1.5 }}>
                      💡 Rewards are automatically sent to viewers after 15 seconds of viewing.
                      One reward per device / IP. VPN users are blocked.
                      Reward funds are held in platform escrow and paid out automatically.
                    </div>
                    <label className="field-label">Reward per view (USD)</label>
                    <input type="number" min="0.001" step="0.001" placeholder="e.g. 0.01"
                      value={rewardPerViewUSD} onChange={e => setRewardPerViewUSD(e.target.value)}/>
                    <label className="field-label">Total reward budget (USD) — held in escrow</label>
                    <input type="number" min="1" step="1" placeholder="e.g. 50"
                      value={totalRewardBudgetUSD} onChange={e => setTotalRewardBudgetUSD(e.target.value)}/>
                    {rewardPerViewUSD && totalRewardBudgetUSD && (
                      <div style={{ fontSize:'0.76rem', color:'rgba(100,120,180,0.8)', marginBottom:8 }}>
                        ≈ {Math.floor(parseFloat(totalRewardBudgetUSD)/parseFloat(rewardPerViewUSD))} max viewers
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <CostInfo type={type} rewardBudgetUSD={totalRewardBudgetUSD} enableRewards={enableRewards}/>

            {/* Image upload */}
            {images.length < 4 && (
              <label className="upload-zone" style={{ marginBottom:10 }}>
                <IconImage size={15} style={{ display:'inline', marginRight:6, verticalAlign:'middle' }}/>
                Add images ({images.length}/4)
                <input type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handleImages}/>
              </label>
            )}

            <button className="btn-primary" style={{ marginTop:6 }}
              onClick={handleSubmit} disabled={submitting || !connected}>
              {submitting ? '⏳ Publishing…' : btnLabel}
            </button>
            <button className="btn-ghost" style={{ marginTop:7, width:'100%' }}
              onClick={() => setExpanded(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Type tabs — only shown in profile mode */}
      {isProfileMode && (
        <div className="creator-type-tabs">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id}
              className={`type-tab${type === id ? ` active-${id}` : ''}`}
              onClick={() => { setType(id); setExpanded(true); }}>
              <Icon/> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PostCreator;