// frontend/src/components/UserProfile.jsx
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getUserProfile, saveUserProfile, toggleFollow, fileToBase64 } from '../services/dappService.js';
import { getTokenPrices } from '../services/tokenPriceService.js';
import PostCreator from './PostCreator.jsx';
import Post from './Post.jsx';
import { IconArrowLeft, IconPen, IconCheck } from './Icons.jsx';

// ── Inline price ticker — visible only in mobile via CSS ───────
function ProfilePriceTicker() {
  const [prices, setPrices] = useState(null);
  useEffect(() => {
    getTokenPrices().then(setPrices).catch(() => {});
    const id = setInterval(() => getTokenPrices().then(setPrices).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="profile-price-ticker">
      {/* SOL */}
      <div className="ppt-item">
        <span className="ppt-dot ppt-dot--cyan" />
        <span className="ppt-token">SOL</span>
        <span className="ppt-value">
          {prices ? `$${prices.sol?.toFixed(2)}` : '—'}
        </span>
      </div>

      <div className="ppt-sep" />

      {/* QHUBX */}
      <div className="ppt-item">
        <span className="ppt-dot ppt-dot--violet" />
        <span className="ppt-token">QHUBX</span>
        <div className="ppt-value-group">
          <span className="ppt-value">
            {prices ? `$${prices.qhubx?.toFixed(6) ?? '—'}` : '—'}
          </span>
          {prices?.qhubxPerUsd && (
            <span className="ppt-rate">1 USD = {prices.qhubxPerUsd.toFixed(2)} QHUBX</span>
          )}
        </div>
      </div>
    </div>
  );
}

function shortAddr(a) { if (!a) return ''; return `${a.slice(0,6)}…${a.slice(-4)}`; }

// ── Social network icon detection ─────────────────────────────
const SOCIALS = [
  { key:'twitter',   pattern:/twitter\.com|x\.com/i,       icon:'𝕏',   color:'rgba(240,244,255,0.9)', label:'X / Twitter' },
  { key:'instagram', pattern:/instagram\.com/i,             icon:'📸',  color:'rgba(225,100,180,0.9)', label:'Instagram' },
  { key:'tiktok',    pattern:/tiktok\.com/i,                icon:'🎵',  color:'rgba(240,244,255,0.9)', label:'TikTok' },
  { key:'youtube',   pattern:/youtube\.com|youtu\.be/i,     icon:'▶',   color:'rgba(255,60,60,0.9)',   label:'YouTube' },
  { key:'telegram',  pattern:/t\.me|telegram/i,             icon:'✈',   color:'rgba(0,160,220,0.9)',   label:'Telegram' },
  { key:'discord',   pattern:/discord\.(com|gg)/i,          icon:'◈',   color:'rgba(100,120,240,0.9)', label:'Discord' },
  { key:'github',    pattern:/github\.com/i,                icon:'⌥',   color:'rgba(200,210,240,0.9)', label:'GitHub' },
  { key:'linkedin',  pattern:/linkedin\.com/i,              icon:'in',  color:'rgba(0,120,200,0.9)',   label:'LinkedIn' },
  { key:'twitch',    pattern:/twitch\.tv/i,                 icon:'◉',   color:'rgba(145,70,255,0.9)', label:'Twitch' },
];

function detectSocial(url) {
  if (!url) return null;
  return SOCIALS.find(s => s.pattern.test(url)) || { icon:'🔗', color:'rgba(155,175,225,0.85)', label:'Link' };
}

function SocialBadge({ url }) {
  if (!url) return null;
  const s = detectSocial(url);
  return (
    <a href={url.startsWith('http') ? url : `https://${url}`}
      target="_blank" rel="noreferrer noopener" className="social-link-btn" title={s.label} aria-label={s.label}>
      <span style={{ color: s.color, fontSize:'0.9rem' }}>{s.icon}</span>
    </a>
  );
}

function UserProfile({ onBack, viewAddress, allPosts, onNewPost, onDeletePost, onOpenChat }) {
  const { publicKey, connected } = useWallet();
  const myAddress = publicKey?.toBase58();
  const isOwnProfile = myAddress === viewAddress;

  const [profile, setProfile] = useState({
    name:'', bio:'', profileImages:[], bannerImage:'', followers:[], following:[],
    social1:'', social2:'',
  });
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editSocial1, setEditSocial1] = useState('');
  const [editSocial2, setEditSocial2] = useState('');
  const [saving, setSaving] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [copied, setCopied] = useState(false);

  const userPosts = (allPosts || []).filter(p => p.user === viewAddress);

  useEffect(() => {
    if (!viewAddress) return;
    getUserProfile(viewAddress).then(p => {
      setProfile(p);
      setEditName(p.name || '');
      setEditBio(p.bio || '');
      setEditSocial1(p.social1 || '');
      setEditSocial2(p.social2 || '');
      setIsFollowing(p.followers?.includes(myAddress));
    });
  }, [viewAddress, myAddress]);

  // ── Avatar click-to-upload (edit mode only) ──────────────────
  const handleAvatarClick = () => {
    if (!editMode) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      const b64 = await fileToBase64(file);
      setProfile(prev => ({ ...prev, profileImages: [b64, ...(prev.profileImages||[]).slice(1)] }));
    };
    input.click();
  };

  // ── Banner click-to-upload (edit mode only) ──────────────────
  const handleBannerClick = () => {
    if (!editMode) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      const b64 = await fileToBase64(file);
      setProfile(prev => ({ ...prev, bannerImage: b64 }));
    };
    input.click();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveUserProfile(viewAddress, {
        ...profile,
        name: editName.trim(),
        bio: editBio.trim(),
        social1: editSocial1.trim(),
        social2: editSocial2.trim(),
      });
      setProfile(updated);
      setEditMode(false);
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleFollow = async () => {
    if (!myAddress || !viewAddress) return;
    const { toggleFollow: tf } = await import('../services/dappService.js');
    const result = await tf(myAddress, viewAddress);
    if (result) {
      setIsFollowing(result.my.following.includes(viewAddress));
      setProfile(prev => ({ ...prev, followers: result.target.followers }));
    }
  };

  const avatarSrc = profile.profileImages?.[0] ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${viewAddress}&backgroundColor=0a0d1c`;

  const handleCopyAddress = async () => {
    if (!viewAddress) return;
    try {
      await navigator.clipboard.writeText(viewAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div>
      {/* ── Profile Card ── */}
      <div className="glass-card" style={{ marginBottom:14, overflow:'hidden' }}>
        {/* Cover / Banner */}
        <div className="profile-cover"
          onClick={handleBannerClick}
          style={{ cursor: editMode ? 'pointer' : 'default' }}
          title={editMode ? 'Click to change banner' : ''}>
          {profile.bannerImage
            ? <img className="profile-cover-img" src={profile.bannerImage} alt="banner"/>
            : null}
          <div className="profile-cover-bottom"/>
          {editMode && (
            <button className="profile-cover-edit">
              📷 Change Banner
            </button>
          )}
        </div>

        {/* Info section */}
        <div className="profile-info-wrap">
          {/* Avatar — click to change in edit mode */}
          <div className="profile-avatar-wrap" onClick={handleAvatarClick}
            style={{ cursor: editMode ? 'pointer' : 'default' }}
            title={editMode ? 'Click to change photo' : ''}>
            <img className="profile-avatar-big" src={avatarSrc} alt="avatar"/>
            {editMode && (
              <div className="profile-avatar-edit-btn">
                <span style={{ fontSize:'1.2rem' }}>📷</span>
                <span style={{ fontSize:'0.62rem', marginTop:2 }}>Change</span>
              </div>
            )}
          </div>

          {/* Name row */}
          <div className="profile-name-row">
            <div style={{ flex:1, minWidth:0 }}>
              {editMode ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    placeholder="Display name"
                    style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:'1.05rem', marginBottom:0 }}/>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)}
                    placeholder="Bio — tell the world about yourself…" rows={3}
                    style={{ resize:'vertical', minHeight:60, marginTop:8, marginBottom:8 }}/>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:180 }}>
                      <label className="field-label">Social link 1</label>
                      <input value={editSocial1} onChange={e => setEditSocial1(e.target.value)}
                        placeholder="https://twitter.com/you" style={{ marginBottom:0 }}/>
                      {editSocial1 && (
                        <div style={{ fontSize:'0.74rem', color:'rgba(100,120,180,0.7)', marginTop:3 }}>
                          Detected: {detectSocial(editSocial1)?.label}
                        </div>
                      )}
                    </div>
                    <div style={{ flex:1, minWidth:180 }}>
                      <label className="field-label">Social link 2</label>
                      <input value={editSocial2} onChange={e => setEditSocial2(e.target.value)}
                        placeholder="https://instagram.com/you" style={{ marginBottom:0 }}/>
                      {editSocial2 && (
                        <div style={{ fontSize:'0.74rem', color:'rgba(100,120,180,0.7)', marginTop:3 }}>
                          Detected: {detectSocial(editSocial2)?.label}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="profile-name">{profile.name || shortAddr(viewAddress)}</div>
                  <div className="profile-handle" style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span>{shortAddr(viewAddress)}</span>
                    <button
                      onClick={handleCopyAddress}
                      className="btn-icon"
                      title="Copy wallet address"
                      aria-label="Copy wallet address"
                      style={{ width:24, height:24 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                    {copied && (
                      <span style={{ fontSize:'0.72rem', color:'var(--cyan)' }}>Copied</span>
                    )}
                  </div>
                  {profile.bio && <div className="profile-bio">{profile.bio}</div>}
                  {(profile.social1 || profile.social2) && (
                    <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                      {profile.social1 && <SocialBadge url={profile.social1}/>}
                      {profile.social2 && <SocialBadge url={profile.social2}/>}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="profile-actions-row">
              {isOwnProfile ? (
                editMode ? (
                  <>
                    <button className="btn-cyan" onClick={handleSave} disabled={saving}
                      style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {saving ? '⏳' : <><IconCheck size={14}/> Save</>}
                    </button>
                    <button className="btn-ghost" onClick={() => setEditMode(false)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn-ghost" onClick={() => setEditMode(true)}
                    style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <IconPen size={14}/> Edit Profile
                  </button>
                )
              ) : (
                <>
                  {connected && (
                    <>
                      <button className={isFollowing ? 'btn-unfollow' : 'btn-follow'} onClick={handleFollow}>
                        {isFollowing ? 'Unfollow' : 'Follow'}
                      </button>
                      {onOpenChat && (
                        <button className="btn-ghost" onClick={() => onOpenChat(viewAddress)}
                          style={{ display:'flex', alignItems:'center', gap:6 }}>
                          💬 Message
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Live prices — mobile only, sits below Edit Profile / Follow buttons */}
          <ProfilePriceTicker />

          {/* Stats */}
          <div className="profile-stats-row">
            <div className="stat-item">
              <span className="stat-value">{userPosts.length}</span>
              <span className="stat-label">Posts</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{profile.followers?.length || 0}</span>
              <span className="stat-label">Sollowers</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{profile.following?.length || 0}</span>
              <span className="stat-label">Sollowing</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Post creator — ALL 4 TYPES only here ── */}
      {isOwnProfile && connected && <PostCreator onNewPost={onNewPost} isProfileMode={true}/>}

      {/* ── User posts ── */}
      {userPosts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>No posts yet</h3>
          <p>{isOwnProfile ? 'Create your first post above!' : 'Nothing posted yet.'}</p>
        </div>
      ) : (
        userPosts.map(post => (
          <Post key={post.id} post={post} onDelete={onDeletePost}
            currentUserId={myAddress} onNavigateToProfile={() => {}}
            onOpenChat={onOpenChat}/>
        ))
      )}
    </div>
  );
}

export default UserProfile;