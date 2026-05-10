// frontend/src/services/chatService.js
// Real-time chat via BroadcastChannel + localStorage persistence

const CHAT_KEY = 'slw_chats';
const CHANNEL_NAME = 'sollower_chat';

let channel = null;
let listeners = [];

function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e) => {
      listeners.forEach(fn => fn(e.data));
    };
  }
  return channel;
}

function getStore() {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '{}'); }
  catch { return {}; }
}
function saveStore(store) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(store));
}

// ── Thread ID ─────────────────────────────────────────────────
export function threadId(a, b) {
  return [a, b].sort().join('::');
}

// ── Get messages for a thread ─────────────────────────────────
export function getMessages(myAddr, otherAddr) {
  const tid = threadId(myAddr, otherAddr);
  const store = getStore();
  return store[tid]?.messages || [];
}

// ── Send a message ────────────────────────────────────────────
export function sendMessage(fromAddr, toAddr, text) {
  const tid = threadId(fromAddr, toAddr);
  const store = getStore();
  if (!store[tid]) store[tid] = { messages: [], participants: [fromAddr, toAddr] };

  const msg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    from: fromAddr,
    text: text.trim(),
    ts: Date.now(),
    read: false,
  };
  store[tid].messages.push(msg);
  store[tid].lastMsg = msg;
  saveStore(store);

  // Broadcast to other tabs
  try { getChannel()?.postMessage({ type: 'new_message', tid, msg, to: toAddr, from: fromAddr }); }
  catch { }

  return msg;
}

// ── Get all conversations for a user ─────────────────────────
export function getConversations(myAddr) {
  const store = getStore();
  const convs = [];
  for (const [tid, data] of Object.entries(store)) {
    if (data.participants?.includes(myAddr)) {
      const other = data.participants.find(p => p !== myAddr);
      const unread = data.messages.filter(m => m.from !== myAddr && !m.read).length;
      convs.push({ tid, other, lastMsg: data.lastMsg, unread });
    }
  }
  return convs.sort((a, b) => (b.lastMsg?.ts || 0) - (a.lastMsg?.ts || 0));
}

// ── Mark messages as read ─────────────────────────────────────
export function markRead(myAddr, otherAddr) {
  const tid = threadId(myAddr, otherAddr);
  const store = getStore();
  if (!store[tid]) return;
  store[tid].messages = store[tid].messages.map(m =>
    m.from !== myAddr ? { ...m, read: true } : m
  );
  saveStore(store);
}

// ── Subscribe to incoming messages ────────────────────────────
export function subscribe(fn) {
  listeners.push(fn);
  getChannel(); // ensure channel is open
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// ── Total unread count ────────────────────────────────────────
export function totalUnread(myAddr) {
  return getConversations(myAddr).reduce((s, c) => s + c.unread, 0);
}