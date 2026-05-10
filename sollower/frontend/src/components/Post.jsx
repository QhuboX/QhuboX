// frontend/src/components/Post.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  toggleLikePost, addCommentToPost, claimAdReward, getUserProfile,
} from '../services/dappService.js';
import { checkAdEligibility, registerAdView } from '../services/deviceUtils.js';
import ImageGalleryModal from './ImageGalleryModal.jsx';
import ProductCard from './ProductCard.jsx';
import {
  IconHeart, IconComment, IconShare, IconSend, IconEllipsis, IconCoin, IconCheck,
} from './Icons.jsx';

function fmtTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d/60000)}m`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h`;
  if (d < 604800000) return `${Math.floor(d/86400000)}d`;
  return new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function shortAddr(a) { if (!a) return '?'; return `${a.slice(0,5)}…${a.slice(-4)}`; }

// ── 15s Auto-reward banner ─────────────────────────────────────
function AdRewardBanner({ post, userWallet }) {
  const DURATION = 15;
  const [phase, setPhase] = useState('checking'); // checking | blocked | counting | claimable | claiming | claimed
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [progress, setProgress] = useState(100);
  const [blockReason, setBlockReason] = useState('');
  const [autoError, setAutoError] = useState('');
  const timerRef = useRef(null);
  const hasStarted = useRef(false);

  const rewardUSD = parseFloat(post.rewardPerViewUSD || post.rewardPerView || 0);
  const hasBudget = (post.remainingBudgetUSD ?? 0) >= rewardUSD && rewardUSD > 0;

  useEffect(() => {
    if (!hasBudget || !userWallet || hasStarted.current) return;
    hasStarted.current = true;
    setPhase('checking');

    checkAdEligibility(post.id).then(({ eligible, reason }) => {
      if (!eligible) {
        const msgs = {
          already_viewed: 'You already claimed this reward.',
          ip_already_used: 'This reward was already claimed from your network.',
          vpn_detected: 'VPN/proxy detected. Disable it to claim rewards.',
        };
        setBlockReason(msgs[reason] || 'Not eligible for this reward.');
        setPhase('blocked');
        return;
      }

      // Start 15s countdown
      setPhase('counting');
      let t = DURATION;
      timerRef.current = setInterval(() => {
        t -= 1;
        setTimeLeft(t);
        setProgress((t / DURATION) * 100);
        if (t <= 0) {
          clearInterval(timerRef.current);
          autoClaim();
        }
      }, 1000);
    });

    return () => clearInterval(timerRef.current);
  }, [post.id, userWallet, hasBudget]);

  const autoClaim = async () => {
    setPhase('claiming');
    try {
      await claimAdReward(post.id, userWallet, rewardUSD);
      await registerAdView(post.id);
      setPhase('claimed');
    } catch (e) {
      setAutoError(e.message);
      setPhase('counting'); // show error but don't block UI
    }
  };

  if (!rewardUSD || !hasBudget) return null;
  if (!userWallet) return (
    <div className="ad-reward-banner">
      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
        <IconCoin size={13}/>
        <span>Connect wallet to earn ${rewardUSD.toFixed(4)} reward</span>
      </div>
    </div>
  );

  if (phase === 'checking') return (
    <div className="ad-reward-banner">
      <span style={{ opacity:0.7, fontSize:'0.78rem' }}>Checking eligibility…</span>
    </div>
  );

  if (phase === 'blocked') return (
    <div className="ad-reward-banner" style={{ color:'rgba(255,100,120,0.9)' }}>
      <span style={{ fontSize:'0.78rem' }}>🚫 {blockReason}</span>
    </div>
  );

  if (phase === 'claimed') return (
    <div className="ad-reward-banner" style={{ color:'rgba(20,241,149,0.95)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <IconCheck size={14}/>
        <span>${rewardUSD.toFixed(4)} sent to your wallet!</span>
      </div>
    </div>
  );

  if (phase === 'claiming') return (
    <div className="ad-reward-banner">
      <span style={{ fontSize:'0.78rem', opacity:0.8 }}>⏳ Sending reward to your wallet…</span>
    </div>
  );

  // counting
  return (
    <div className="ad-reward-banner">
      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
        <IconCoin size={13}/>
        <span>Watch {timeLeft}s to earn <strong>${rewardUSD.toFixed(4)}</strong> → your wallet</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {autoError && <span style={{ fontSize:'0.7rem', color:'rgba(255,120,100,0.8)' }}>Retrying…</span>}
        <div className="timer-bar-wrap">
          <div className="timer-bar-fill" style={{ width:`${progress}%` }}/>
        </div>
        <span style={{ fontSize:'0.78rem', fontVariantNumeric:'tabular-nums', minWidth:20 }}>{timeLeft}s</span>
      </div>
    </div>
  );
}

// ── Post component ─────────────────────────────────────────────
function Post({ post, onDelete, currentUserId, onNavigateToProfile, onOpenChat }) {
  const [liked, setLiked] = useState(post.likedBy?.includes(currentUserId));
  const [likes, setLikes] = useState(post.likesCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [commentText, setCommentText] = useState('');
  const [galleryIdx, setGalleryIdx] = useState(null);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isOwner = currentUserId === post.user;

  useEffect(() => {
    getUserProfile(post.user).then(setAuthorProfile).catch(() => {});
  }, [post.user]);

  // Close menu on outside click
  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLike = async () => {
    if (!currentUserId) return;
    const updated = await toggleLikePost(post.id, currentUserId);
    if (updated) { setLiked(updated.likedBy.includes(currentUserId)); setLikes(updated.likesCount); }
  };

  const handleComment = async () => {
    if (!commentText.trim() || !currentUserId) return;
    const c = await addCommentToPost(post.id, { user: currentUserId, text: commentText.trim() });
    if (c) { setComments(prev => [...prev, c]); setCommentText(''); }
  };

  const handleShare = () => {
    const url = `${window.location.origin}?post=${post.id}`;
    navigator.clipboard?.writeText(url).then(() => alert('Link copied!')).catch(() => alert(url));
  };

  const badgeMap = { personal:'badge-personal', sale:'badge-sale', fund:'badge-fund', ad:'badge-ad' };
  const labelMap = { personal:'Post', sale:'Sale', fund:'Fund', ad:'Ad' };

  const avatarSrc = authorProfile?.profileImages?.[0] ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${post.user}&backgroundColor=0a0d1c`;

  return (
    <div className={`post-card glass-card${post.type==='ad' ? ' ad-card' : ''}`}>
      {/* Ad shimmer overlay */}
      {post.type === 'ad' && post.enableRewards && <div className="ad-shimmer"/>}

      {/* Ad reward banner — 15s auto-claim */}
      {post.type === 'ad' && post.enableRewards && (
        <AdRewardBanner post={post} userWallet={currentUserId}/>
      )}

      {/* Ad external links */}
      {post.type === 'ad' && (post.adLink1 || post.adLink2) && (
        <div style={{ padding:'8px 20px', display:'flex', gap:8, flexWrap:'wrap', borderBottom:'1px solid rgba(255,215,0,0.1)' }}>
          {post.adLink1 && (
            <a href={post.adLink1} target="_blank" rel="noreferrer noopener"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:999,
                background:'rgba(255,215,0,0.08)', border:'1px solid rgba(255,215,0,0.2)',
                color:'rgba(255,215,0,0.95)', fontSize:'0.78rem', fontWeight:600, textDecoration:'none' }}>
              🔗 {post.adLinkLabel1 || 'Visit Link 1'}
            </a>
          )}
          {post.adLink2 && (
            <a href={post.adLink2} target="_blank" rel="noreferrer noopener"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:999,
                background:'rgba(0,229,255,0.07)', border:'1px solid rgba(0,229,255,0.2)',
                color:'rgba(0,229,255,0.95)', fontSize:'0.78rem', fontWeight:600, textDecoration:'none' }}>
              🔗 {post.adLinkLabel2 || 'Visit Link 2'}
            </a>
          )}
        </div>
      )}

      <div className="post-card-inner">
        {/* Header */}
        <div className="post-header">
          <img className="post-avatar" src={avatarSrc} alt=""
            onClick={() => onNavigateToProfile?.(post.user)}/>
          <div className="post-meta">
            <div className="post-author" onClick={() => onNavigateToProfile?.(post.user)}>
              {authorProfile?.name || shortAddr(post.user)}
              <span className={`post-type-badge ${badgeMap[post.type]||'badge-personal'}`}>
                {labelMap[post.type]||'Post'}
              </span>
            </div>
            <div className="post-time">{fmtTime(post.timestamp)}</div>
          </div>

          {/* Menu */}
          <div ref={menuRef} style={{ position:'relative', marginLeft:'auto' }}>
            <button className="post-menu-btn" onClick={() => setMenuOpen(v => !v)}>
              <IconEllipsis size={15}/>
            </button>
            {menuOpen && (
              <div style={{ position:'absolute', top:36, right:0, zIndex:50, background:'linear-gradient(180deg,rgba(8,12,26,0.98),rgba(6,10,20,0.98))',
                border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'5px 4px',
                minWidth:140, boxShadow:'0 16px 40px rgba(0,0,0,0.6)', animation:'fadeUp 0.18s ease' }}>
                {onOpenChat && !isOwner && currentUserId && (
                  <button onClick={() => { setMenuOpen(false); onOpenChat(post.user); }}
                    style={{ width:'100%', textAlign:'left', background:'none', border:'none',
                      color:'rgba(0,229,255,0.9)', padding:'8px 13px', borderRadius:8,
                      fontSize:'0.85rem', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                    💬 Message
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); handleShare(); }}
                  style={{ width:'100%', textAlign:'left', background:'none', border:'none',
                    color:'rgba(200,210,240,0.85)', padding:'8px 13px', borderRadius:8,
                    fontSize:'0.85rem', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                  Share
                </button>
                {isOwner && (
                  <button onClick={() => { setMenuOpen(false); onDelete(post.id); }}
                    style={{ width:'100%', textAlign:'left', background:'none', border:'none',
                      color:'rgba(255,85,119,0.9)', padding:'8px 13px', borderRadius:8,
                      fontSize:'0.85rem', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {post.content && <div className="post-body">{post.content}</div>}

        {/* Images */}
        {post.images?.length > 0 && (
          <div className={`post-images count-${Math.min(post.images.length, 4)}`}>
            {post.images.slice(0, 4).map((img, i) => (
              <div key={i} className="img-wrap" onClick={() => setGalleryIdx(i)}>
                <img src={img} alt="" loading="lazy"/>
                {i === 3 && post.images.length > 4 && (
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'white', fontSize:'1.3rem', fontWeight:700, fontFamily:'Syne,sans-serif' }}>
                    +{post.images.length - 4}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Product/Donation panel */}
        {(post.type === 'sale' || post.type === 'fund') && <ProductCard postData={post}/>}

        {/* Actions */}
        <div className="post-actions">
          <button className={`action-btn${liked?' liked':''}`} onClick={handleLike}>
            <IconHeart size={15} filled={liked}/>
            {likes > 0 && <span>{likes}</span>}
          </button>
          <button className="action-btn" onClick={() => setShowComments(v => !v)}>
            <IconComment size={15}/>
            {comments.length > 0 && <span>{comments.length}</span>}
          </button>
          <button className="action-btn" onClick={handleShare}>
            <IconShare size={15}/>
          </button>
        </div>

        {/* Comments */}
        {showComments && (
          <div className="comments-section">
            {comments.map(c => (
              <div key={c.id} className="comment-item">
                <img className="comment-avatar"
                  src={`https://api.dicebear.com/7.x/identicon/svg?seed=${c.user}&backgroundColor=0a0d1c`} alt=""/>
                <div className="comment-bubble">
                  <div className="comment-user">{shortAddr(c.user)}</div>
                  <div className="comment-text">{c.text}</div>
                </div>
              </div>
            ))}
            {currentUserId && (
              <div className="comment-form">
                <input className="comment-input" placeholder="Write a comment…"
                  value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}/>
                <button className="comment-send-btn" onClick={handleComment}>
                  <IconSend size={13}/>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gallery */}
      {galleryIdx !== null && (
        <ImageGalleryModal images={post.images} startIndex={galleryIdx} onClose={() => setGalleryIdx(null)}/>
      )}
    </div>
  );
}

export default Post;