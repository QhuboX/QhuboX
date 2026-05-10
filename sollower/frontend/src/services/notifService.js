// frontend/src/services/notifService.js
const NOTIF_KEY = 'slw_notifs';

export function getNotifs(addr) {
  if (!addr) return [];
  try {
    const store = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    return (store[addr] || []).sort((a, b) => b.ts - a.ts);
  } catch { return []; }
}

export function addNotif(addr, { type, text, from, postId }) {
  if (!addr) return;
  const store = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
  if (!store[addr]) store[addr] = [];
  store[addr].unshift({
    id: `n_${Date.now()}`,
    type, text, from, postId,
    ts: Date.now(),
    read: false,
  });
  // Keep max 50
  store[addr] = store[addr].slice(0, 50);
  localStorage.setItem(NOTIF_KEY, JSON.stringify(store));
  // Broadcast
  try { new BroadcastChannel('sollower_notif').postMessage({ addr, type, text }); } catch {}
}

export function markAllRead(addr) {
  const store = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
  if (!store[addr]) return;
  store[addr] = store[addr].map(n => ({ ...n, read: true }));
  localStorage.setItem(NOTIF_KEY, JSON.stringify(store));
}

export function unreadCount(addr) {
  return getNotifs(addr).filter(n => !n.read).length;
}

export function subscribeNotifs(fn) {
  let ch;
  try {
    ch = new BroadcastChannel('sollower_notif');
    ch.onmessage = e => fn(e.data);
  } catch {}
  return () => { try { ch?.close(); } catch {} };
}