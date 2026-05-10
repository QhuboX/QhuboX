// frontend/src/components/MainFeed.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import Post from './Post.jsx';
import PostCreator from './PostCreator.jsx';
import UserProfile from './UserProfile.jsx';
import { fetchRealPosts, deletePost, getUserProfile } from '../services/dappService.js';
import { getTokenPrices } from '../services/tokenPriceService.js';
import {
  getNotifs,
  unreadCount as getUnreadNotifs,
  markAllRead as markAllNotifsRead,
  subscribeNotifs,
} from '../services/notifService.js';
import {
  getConversations,
  getMessages,
  sendMessage,
  markRead,
  subscribe as subscribeChat,
  totalUnread as getTotalUnreadMsgs,
} from '../services/chatService.js';
import {
  checkBackendStatus,
  getUserBalance,
  getPlatformBalance,
} from '../services/backendTransactionService.js';
import {
  IconHome, IconExplore, IconProfile, IconNotif, IconMessages,
  IconPlus, IconSearch, IconTrending, IconWallet, IconStore,
  IconHeart2, IconMegaphone,
} from './Icons.jsx';

// ── Sorting: ads every ~4 posts ──────────────────────────────
function sortWithAds(posts) {
  const ads = posts.filter(p => p.type === 'ad').sort(() => Math.random() - 0.5);
  const regular = posts.filter(p => p.type !== 'ad');
  const out = [];
  let ai = 0, ri = 0;
  while (ri < regular.length || ai < ads.length) {
    if (ai < ads.length && out.length === 0) { out.push(ads[ai++]); }
    for (let i = 0; i < 4 && ri < regular.length; i++) out.push(regular[ri++]);
    if (ai < ads.length) out.push(ads[ai++]);
  }
  return out;
}

// ── Price widget ─────────────────────────────────────────────
function PriceWidget() {
  const [prices, setPrices] = useState(null);
  useEffect(() => {
    getTokenPrices().then(setPrices).catch(() => {});
    const id = setInterval(() => getTokenPrices().then(setPrices).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="widget-card">
      <div className="widget-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--cyan)"><circle cx="12" cy="12" r="10"/></svg>
        Live Prices
      </div>
      {prices ? (
        <>
          <div className="price-row">
            <span className="price-name">SOL</span>
            <div style={{ textAlign: 'right' }}>
              <div className="price-value">${prices.sol?.toFixed(2)}</div>
            </div>
          </div>
          <div className="price-row">
            <span className="price-name">QHUBX</span>
            <div style={{ textAlign: 'right' }}>
              <div className="price-value">${prices.qhubx?.toFixed(6) ?? '—'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                1 USD = {prices.qhubxPerUsd?.toFixed(2)} QHUBX
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Loading…
        </div>
      )}
    </div>
  );
}

// ── Left sidebar ─────────────────────────────────────────────
function LeftSidebar({ currentView, onNavigate, connected, publicKey }) {
  const navItems = [
    { id: 'feed',    label: 'Home',     Icon: IconHome },
    { id: 'explore', label: 'Explore',  Icon: IconExplore },
    { id: 'market',  label: 'Market',   Icon: IconStore },
    { id: 'wallet',  label: 'Wallet',   Icon: IconWallet },
  ];
  return (
    <div>
      <div className="sidebar-section-label">Menu</div>
      {navItems.map(({ id, label, Icon }) => (
        <button key={id}
          className={`sidebar-nav-item${currentView === id ? ' active' : ''}`}
          onClick={() => onNavigate(id)}>
          <Icon size={18} />
          {label}
        </button>
      ))}
      {connected && (
        <>
          <div className="sidebar-section-label" style={{ marginTop: 8 }}>You</div>
          <button className={`sidebar-nav-item${currentView === 'profile' ? ' active' : ''}`}
            onClick={() => onNavigate('profile')}>
            <IconProfile size={18} />
            My Profile
          </button>
        </>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 20 }}>
        <WalletMultiButton />
      </div>
    </div>
  );
}

// ── Right sidebar ─────────────────────────────────────────────
function RightSidebar({ posts }) {
  const topPosts = [...posts].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)).slice(0, 3);

  return (
    <div>
      <PriceWidget />
      <div className="widget-card">
        <div className="widget-title">
          <IconTrending size={12} color="var(--cyan)" />
          Trending
        </div>
        {topPosts.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No posts yet</div>
        ) : topPosts.map(p => (
          <div key={p.id} style={{
            padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
            fontSize: '0.82rem', color: 'var(--text-secondary)'
          }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>
              {p.content?.slice(0, 50) || 'Image post'}
              {(p.content?.length > 50) && '…'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
              ♥ {p.likesCount || 0} likes
            </div>
          </div>
        ))}
      </div>
      <div className="widget-card">
        <div className="widget-title">About</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <div style={{ marginBottom: 4 }}>Payments via QHUBX (SPL token)</div>
          <div style={{ marginBottom: 4 }}>Prices shown in USD</div>
          <div>Powered by Solana</div>
        </div>
      </div>
    </div>
  );
}

// ── Notifications view ─────────────────────────────────────────
function NotificationsView({ myAddr }) {
  const [items, setItems] = useState([]);

  const reload = useCallback(() => {
    setItems(getNotifs(myAddr));
  }, [myAddr]);

  useEffect(() => {
    reload();
    const unsub = subscribeNotifs(() => reload());
    return () => unsub?.();
  }, [reload]);

  useEffect(() => {
    if (!myAddr) return;
    markAllNotifsRead(myAddr);
    reload();
  }, [myAddr, reload]);

  if (!myAddr) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"></div>
        <h3>Connect to see notifications</h3>
        <p>Your alerts are tied to your wallet address.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"></div>
        <h3>No notifications</h3>
        <p>Likes, follows and messages will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: '16px 0 12px', fontFamily: 'Syne', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
        Notifications
      </div>
      {items.map(n => (
        <div key={n.id} className="glass-card" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: '0.92rem' }}>
                {n.type || 'alert'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.5 }}>
                {n.text}
              </div>
              {n.from && (
                <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                  From: {String(n.from).slice(0, 6)}…{String(n.from).slice(-4)}
                </div>
              )}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
              {new Date(n.ts).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Messages view ──────────────────────────────────────────────
function MessagesView({ myAddr, activeOtherAddr, onOpenThread, onCloseThread }) {
  const [convs, setConvs] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [profilesByAddr, setProfilesByAddr] = useState({});

  const reloadConvs = useCallback(() => {
    if (!myAddr) { setConvs([]); return; }
    setConvs(getConversations(myAddr));
  }, [myAddr]);

  const reloadMsgs = useCallback(() => {
    if (!myAddr || !activeOtherAddr) { setMsgs([]); return; }
    setMsgs(getMessages(myAddr, activeOtherAddr));
  }, [myAddr, activeOtherAddr]);

  useEffect(() => {
    reloadConvs();
    reloadMsgs();
    const unsub = subscribeChat(() => {
      reloadConvs();
      reloadMsgs();
    });
    return () => unsub?.();
  }, [reloadConvs, reloadMsgs]);

  useEffect(() => {
    if (!myAddr) return;
    const addresses = new Set([myAddr]);
    convs.forEach(c => addresses.add(c.other));
    if (activeOtherAddr) addresses.add(activeOtherAddr);
    msgs.forEach(m => addresses.add(m.from));

    addresses.forEach(addr => {
      if (!addr || profilesByAddr[addr]) return;
      getUserProfile(addr)
        .then(p => setProfilesByAddr(prev => ({ ...prev, [addr]: p || {} })))
        .catch(() => {});
    });
  }, [myAddr, convs, msgs, activeOtherAddr, profilesByAddr]);

  useEffect(() => {
    if (!myAddr || !activeOtherAddr) return;
    markRead(myAddr, activeOtherAddr);
    reloadConvs();
  }, [myAddr, activeOtherAddr, reloadConvs]);

  const handleSend = () => {
    if (!myAddr || !activeOtherAddr) return;
    const t = text.trim();
    if (!t) return;
    sendMessage(myAddr, activeOtherAddr, t);
    setText('');
    reloadConvs();
    reloadMsgs();
  };

  if (!myAddr) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"></div>
        <h3>Connect to use messages</h3>
        <p>Chats are linked to your wallet address.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: '16px 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ fontFamily: 'Syne', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
          Messages
        </div>
        {activeOtherAddr && (
          <button className="btn-ghost" onClick={onCloseThread} style={{ height: 34 }}>
            Back to inbox
          </button>
        )}
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: activeOtherAddr ? '260px 1fr' : '1fr' }}>
          {/* Inbox */}
          <div style={{ borderRight: activeOtherAddr ? '1px solid var(--border-subtle)' : 'none' }}>
            {convs.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                No conversations yet.
              </div>
            ) : convs.map(c => (
              <button key={c.tid} onClick={() => onOpenThread(c.other)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                  padding: '12px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {profilesByAddr[c.other]?.name || `${String(c.other).slice(0, 6)}…${String(c.other).slice(-4)}`}
                  </div>
                  {c.unread > 0 && (
                    <div style={{ background: 'rgba(0,229,255,0.16)', border: '1px solid rgba(0,229,255,0.3)', color: 'rgba(0,229,255,1)',
                      padding: '2px 8px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700 }}>
                      {c.unread}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.lastMsg?.text || '—'}
                </div>
              </button>
            ))}
          </div>

          {/* Thread */}
          {activeOtherAddr && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 420 }}>
              <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                Chat with <strong style={{ color: 'var(--text-primary)' }}>
                  {profilesByAddr[activeOtherAddr]?.name || `${String(activeOtherAddr).slice(0, 6)}…${String(activeOtherAddr).slice(-4)}`}
                </strong>
              </div>

              <div style={{ padding: 12, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {msgs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>No messages yet.</div>
                ) : msgs.map(m => (
                  <div key={m.id} style={{
                    alignSelf: m.from === myAddr ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}>
                    <img
                      src={profilesByAddr[m.from]?.profileImages?.[0] || `https://api.dicebear.com/7.x/identicon/svg?seed=${m.from}&backgroundColor=0a0d1c`}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)', flexShrink: 0 }}
                    />
                    <div style={{
                      padding: '9px 11px',
                      borderRadius: 12,
                      background: m.from === myAddr ? 'rgba(155,135,245,0.18)' : 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-primary)',
                      fontSize: '0.86rem',
                      lineHeight: 1.5,
                      minWidth: 120,
                    }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--cyan)', marginBottom: 2, fontWeight: 700 }}>
                        {profilesByAddr[m.from]?.name || `${String(m.from).slice(0, 6)}…${String(m.from).slice(-4)}`}
                      </div>
                      <div>{m.text}</div>
                      <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {new Date(m.ts).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…"
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  style={{ flex: 1, marginBottom: 0 }} />
                <button className="btn-primary" onClick={handleSend} disabled={!text.trim()}>
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wallet view ────────────────────────────────────────────────
function WalletView({ myAddr }) {
  const [backend, setBackend] = useState(null);
  const [bal, setBal] = useState(null);
  const [platformBal, setPlatformBal] = useState(null);
  const [prices, setPrices] = useState(null);

  const load = useCallback(async () => {
    try { setBackend(await checkBackendStatus()); } catch { setBackend({ server: 'offline' }); }
    try { setPrices(await getTokenPrices()); } catch { setPrices(null); }
    if (myAddr) {
      try { setBal(await getUserBalance(myAddr)); } catch { setBal({ success: false, balance: 0 }); }
    } else {
      setBal(null);
    }
    try { setPlatformBal(await getPlatformBalance()); } catch { setPlatformBal(null); }
  }, [myAddr]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ padding: '16px 0 12px', fontFamily: 'Syne', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
        Wallet
      </div>
      <div className="glass-card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Backend</div>
            <div style={{ fontWeight: 800, color: backend?.server === 'online' ? 'rgba(20,241,149,0.95)' : 'rgba(255,85,119,0.95)' }}>
              {backend?.server || 'unknown'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: 4 }}>
              Network: {backend?.network || '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Your address</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              {myAddr ? `${myAddr.slice(0, 8)}…${myAddr.slice(-6)}` : 'Not connected'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 6 }}>Your QHUBX balance</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
            {bal?.success ? bal.balance?.toFixed?.(6) ?? bal.balance : '—'}
          </div>
          {prices?.qhubx && bal?.success && (
            <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              ≈ ${(bal.balance * prices.qhubx).toFixed(2)} USD @ ${prices.qhubx.toFixed(6)}/QHUBX
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: 14 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 6 }}>Platform QHUBX balance</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
            {platformBal?.success ? platformBal.balance?.toFixed?.(6) ?? platformBal.balance : '—'}
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
            Used for auto-rewards payouts.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Market view ────────────────────────────────────────────────
function MarketView({ posts, loading, onDelete, currentUserId, onNavigateToProfile, onOpenChat }) {
  const items = (posts || []).filter(p => p.type === 'sale' || p.type === 'fund');
  return (
    <div>
      <div style={{ padding: '16px 0 12px', fontFamily: 'Syne', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
        Market
      </div>
      {loading ? (
        <div className="loader-wrap"><div className="spinner" /><p>Loading…</p></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"></div>
          <h3>No products or campaigns yet</h3>
          <p>Create a Sale or Fund post from your profile.</p>
        </div>
      ) : (
        items.map(post => (
          <Post key={post.id} post={post} onDelete={onDelete}
            currentUserId={currentUserId}
            onNavigateToProfile={onNavigateToProfile}
            onOpenChat={onOpenChat} />
        ))
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
function MainFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('feed');
  const [viewingAddress, setViewingAddress] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChatOther, setActiveChatOther] = useState(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const { publicKey, connected } = useWallet();
  const myAddr = publicKey?.toBase58();

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchRealPosts();
      setPosts(sortWithAds(raw || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (publicKey) getUserProfile(publicKey.toBase58()).then(setMyProfile).catch(() => {});
  }, [publicKey]);

  useEffect(() => {
    if (!myAddr) { setUnreadNotifs(0); setUnreadMsgs(0); return; }
    const refresh = () => {
      try { setUnreadNotifs(getUnreadNotifs(myAddr)); } catch { setUnreadNotifs(0); }
      try { setUnreadMsgs(getTotalUnreadMsgs(myAddr)); } catch { setUnreadMsgs(0); }
    };
    refresh();
    const unsubNotifs = subscribeNotifs(() => refresh());
    const unsubChat = subscribeChat(() => refresh());
    return () => { unsubNotifs?.(); unsubChat?.(); };
  }, [myAddr]);

  const handleDelete = async id => {
    if (!window.confirm('Delete this post?')) return;
    try { await deletePost(id); loadPosts(); }
    catch (e) { alert('Could not delete: ' + e.message); }
  };

  const handleNavigateToProfile = addr => {
    setViewingAddress(addr || publicKey?.toBase58());
    setCurrentView('profile');
    setActiveChatOther(null);
    window.scrollTo(0, 0);
  };

  const handleNav = id => {
    if (id === 'profile') {
      setViewingAddress(publicKey?.toBase58());
    }
    setCurrentView(id);
    if (id !== 'messages') setActiveChatOther(null);
    window.scrollTo(0, 0);
  };

  const handleOpenChat = addr => {
    if (!addr) return;
    setActiveChatOther(addr);
    setCurrentView('messages');
    window.scrollTo(0, 0);
  };

  const myAvatarSrc = myProfile?.profileImages?.[0] ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${publicKey?.toBase58()}&backgroundColor=transparent`;

  const filteredPosts = !searchQuery.trim()
    ? posts
    : posts.filter(p => {
      const q = searchQuery.trim().toLowerCase();
      const text = `${p.content || ''} ${p.type || ''} ${p.user || ''}`.toLowerCase();
      return text.includes(q);
    });

  const applySearch = () => setSearchQuery(searchInput);

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <header className="app-topbar">
        <div className="topbar-brand" onClick={() => handleNav('feed')}>
          <img src="/imagen/Sollower.png" alt="Sollower" onError={e => e.target.style.display = 'none'} />
          <span className="topbar-brand-name">Sollower</span>
        </div>

        <div className="topbar-search-wrap">
          <div className="topbar-search">
            <input
              placeholder="Search Sollower…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
            />
          </div>
          <button className="topbar-search-btn" onClick={applySearch} title="Search">
            <IconSearch size={16} />
          </button>
        </div>

        <div className="topbar-actions">
          {/* Desktop nav icons — hidden on mobile */}
          <button className={`topbar-icon-btn topbar-hide-mobile${currentView === 'feed' ? ' active' : ''}`}
            onClick={() => handleNav('feed')} title="Home">
            <IconHome size={18} />
          </button>
          <button className={`topbar-icon-btn topbar-hide-mobile${currentView === 'explore' ? ' active' : ''}`}
            onClick={() => handleNav('explore')} title="Explore">
            <IconExplore size={18} />
          </button>
          <button className={`topbar-icon-btn topbar-hide-mobile${currentView === 'notifs' ? ' active' : ''}`} title="Notifications"
            onClick={() => handleNav('notifs')}>
            <IconNotif size={18} />
            {unreadNotifs > 0 && <span className="notif-dot" />}
          </button>
          {/* Messages — visible on mobile */}
          <button className={`topbar-icon-btn${currentView === 'messages' ? ' active' : ''}`} title="Messages"
            onClick={() => handleNav('messages')}>
            <IconMessages size={18} />
            {unreadMsgs > 0 && <span className="notif-dot" />}
          </button>
          {connected && (
            <img src={myAvatarSrc} alt="" onClick={() => handleNav('profile')}
              className="topbar-hide-mobile"
              style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--border-violet)', cursor: 'pointer', objectFit: 'cover' }} />
          )}
          {/* Wallet — visible on mobile */}
          <WalletMultiButton />
        </div>
      </header>

      {/* ── Left sidebar (desktop) ── */}
      <aside className="app-sidebar-left">
        <LeftSidebar currentView={currentView} onNavigate={handleNav}
          connected={connected} publicKey={publicKey} />
      </aside>

      {/* ── Main content ── */}
      <main className="app-content">
        {currentView === 'profile' ? (
          <UserProfile
            onBack={() => handleNav('feed')}
            viewAddress={viewingAddress}
            allPosts={filteredPosts}
            onNewPost={loadPosts}
            onDeletePost={handleDelete}
            onOpenChat={handleOpenChat}
          />
        ) : currentView === 'wallet' ? (
          <WalletView myAddr={myAddr} />
        ) : currentView === 'market' ? (
          <MarketView
            posts={filteredPosts}
            loading={loading}
            onDelete={handleDelete}
            currentUserId={myAddr}
            onNavigateToProfile={handleNavigateToProfile}
            onOpenChat={handleOpenChat}
          />
        ) : currentView === 'notifs' ? (
          <NotificationsView myAddr={myAddr} />
        ) : currentView === 'messages' ? (
          <MessagesView
            myAddr={myAddr}
            activeOtherAddr={activeChatOther}
            onOpenThread={addr => setActiveChatOther(addr)}
            onCloseThread={() => setActiveChatOther(null)}
          />
        ) : currentView === 'explore' ? (
          <div>
            <div style={{ padding: '16px 0 12px', fontFamily: 'Syne', fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
              Explore
            </div>
            {loading ? (
              <div className="loader-wrap"><div className="spinner" /><p>Loading…</p></div>
            ) : filteredPosts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"></div>
                <h3>Nothing to explore yet</h3>
              </div>
            ) : (
              filteredPosts.filter(p => p.type !== 'personal').map((post, i) => (
                <Post key={post.id} post={post} onDelete={handleDelete}
                  currentUserId={publicKey?.toBase58()}
                  onNavigateToProfile={handleNavigateToProfile}
                  onOpenChat={handleOpenChat} />
              ))
            )}
          </div>
        ) : (
          /* FEED */
          <>
            {connected && <PostCreator onNewPost={loadPosts} />}

            {loading ? (
              <div className="loader-wrap"><div className="spinner" /><p>Loading posts…</p></div>
            ) : filteredPosts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <h3>No posts yet</h3>
                <p>{connected ? 'Be the first to post!' : 'Connect your wallet to get started'}</p>
                {!connected && (
                  <div style={{ marginTop: 18 }}><WalletMultiButton /></div>
                )}
              </div>
            ) : (
              filteredPosts.map((post, i) => (
                <Post key={post.id} post={post} onDelete={handleDelete}
                  currentUserId={publicKey?.toBase58()}
                  onNavigateToProfile={handleNavigateToProfile}
                  onOpenChat={handleOpenChat} />
              ))
            )}
          </>
        )}
      </main>

      {/* ── Right sidebar (desktop) ── */}
      <aside className="app-sidebar-right">
        <RightSidebar posts={filteredPosts} />
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-bottom-nav">
        <div className="mobile-nav-inner">
          <button className={`mobile-nav-btn${currentView === 'feed' ? ' active' : ''}`}
            onClick={() => handleNav('feed')}>
            <IconHome size={22} />
            <span className="mobile-nav-label">Home</span>
          </button>
          <button className={`mobile-nav-btn${currentView === 'explore' ? ' active' : ''}`}
            onClick={() => handleNav('explore')}>
            <IconExplore size={22} />
            <span className="mobile-nav-label">Explore</span>
          </button>
          {connected && (
            <button className="mobile-post-btn" onClick={() => {
              handleNav('feed');
              setTimeout(() => document.querySelector('.creator-textarea')?.focus(), 100);
            }}>
              <IconPlus size={22} />
            </button>
          )}
          <button className={`mobile-nav-btn${currentView === 'notifs' ? ' active' : ''}`} onClick={() => handleNav('notifs')}>
            <IconNotif size={22} />
            <span className="mobile-nav-label">Alerts</span>
          </button>
          <button className={`mobile-nav-btn${currentView === 'profile' ? ' active' : ''}`}
            onClick={() => connected ? handleNav('profile') : null}>
            <IconProfile size={22} />
            <span className="mobile-nav-label">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default MainFeed;