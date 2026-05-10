import { KEYPAIR } from './load-keypair.js';

// server/server.js
import dotenv from 'dotenv';
dotenv.config();
import dns from 'dns';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';
import morgan from 'morgan';
import cors from 'cors';

try {
  // Force public DNS for Windows/WSL environments with DNS issues
  dns.setServers(['1.1.1.1', '8.8.8.8']);
  console.log('DNS servers set to 1.1.1.1 and 8.8.8.8');
} catch (e) {
  console.warn('Could not set DNS servers:', e && e.message ? e.message : e);
}

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));
app.use(cors({ origin: '*' }));

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8
});

// --- socket.io logic (unchanged) ---
const users = {};
const offlineQueue = { messages: {}, voice: {} };

io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);
  socket.on('register', (walletAddress) => {
    users[walletAddress] = socket.id;
    io.emit('user-status', { wallet: walletAddress, online: true });
    if (offlineQueue.messages[walletAddress]) {
      offlineQueue.messages[walletAddress].forEach(d => io.to(socket.id).emit('new-message', d));
      delete offlineQueue.messages[walletAddress];
    }
    if (offlineQueue.voice[walletAddress]) {
      offlineQueue.voice[walletAddress].forEach(d => io.to(socket.id).emit('new-voice', d));
      delete offlineQueue.voice[walletAddress];
    }
  });
  socket.on('check-status', (targetWallet) => {
    socket.emit('user-status', { wallet: targetWallet, online: !!users[targetWallet] });
  });
  socket.on('send-message', (data) => {
    const targetSocketId = users[data.to];
    data.senderWallet = Object.keys(users).find(k => users[k] === socket.id);
    if (targetSocketId && io.sockets.sockets.has(targetSocketId)) io.to(targetSocketId).emit('new-message', data);
    else { if (!offlineQueue.messages[data.to]) offlineQueue.messages[data.to] = []; offlineQueue.messages[data.to].push(data); }
  });
  socket.on('send-voice', (data) => {
    const targetSocketId = users[data.to];
    if (targetSocketId && io.sockets.sockets.has(targetSocketId)) io.to(targetSocketId).emit('new-voice', data);
    else { if (!offlineQueue.voice[data.to]) offlineQueue.voice[data.to] = []; offlineQueue.voice[data.to].push(data); }
  });
  socket.on('call-user', (data) => { const targetSocketId = users[data.to]; if (targetSocketId) io.to(targetSocketId).emit('incoming-call', data); });
  socket.on('accept-call', (data) => { const targetSocketId = users[data.to]; if (targetSocketId) io.to(targetSocketId).emit('call-accepted', data); });
  socket.on('signal', (data) => { const targetSocketId = users[data.to]; if (targetSocketId) io.to(targetSocketId).emit('signal', data); });
  socket.on('disconnect', () => {
    const walletAddress = Object.keys(users).find(k => users[k] === socket.id);
    if (walletAddress) { io.emit('user-status', { wallet: walletAddress, online: false }); delete users[walletAddress]; }
  });
});

// --- Proxy configuration ---
const JUP_BASE = (process.env.JUPITER_API_URL || 'https://api.jup.ag').replace(/\/$/, '');
const API_KEY = process.env.JUPITER_API_KEY || '';
const UPSTREAMS = {
  // Price and tokens: lite-api preferred (but we will fallback)
  price: { host: 'https://lite-api.jup.ag', pathPrefix: '/price/v2' },
  tokens: { host: 'https://lite-api.jup.ag', pathPrefix: '/tokens/v1' },
  // Swap: use Swap V2 (order/build/execute)
  swap: { host: 'https://api.jup.ag', pathPrefix: '/swap/v2' },
  api: { host: JUP_BASE, pathPrefix: '' }
};

// Circuit breaker state
const circuit = {
  failures: 0,
  lastFailureAt: 0,
  openUntil: 0,
  threshold: 5,
  cooldownMs: 60_000
};

function isCircuitOpen() {
  return Date.now() < circuit.openUntil;
}

function recordFailure() {
  circuit.failures += 1;
  circuit.lastFailureAt = Date.now();
  if (circuit.failures >= circuit.threshold) {
    circuit.openUntil = Date.now() + circuit.cooldownMs;
    console.warn('Circuit opened for upstreams until', new Date(circuit.openUntil).toISOString());
  }
}

function recordSuccess() {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

// Helper: exponential backoff fetch with retries and DNS error logging
async function fetchWithRetries(url, opts = {}, retries = 2, baseDelay = 300) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timeout = opts.timeout || 10000;
      const id = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(id);
      if (!res.ok && res.status >= 500) throw new Error(`Upstream ${res.status}`);
      return res;
    } catch (err) {
      attempt++;
      const code = err && err.code ? err.code : null;
      if (code === 'ENOTFOUND') {
        console.error('DNS resolution failed for', url, 'error:', err.message || err);
      } else {
        console.warn(`Fetch attempt ${attempt} failed for ${url}:`, err && err.message ? err.message : err);
      }
      if (attempt > retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Candidate builders for fallbacks
function buildPriceUpstreams(queryString = '') {
  const lite = `${UPSTREAMS.price.host}${UPSTREAMS.price.pathPrefix}${queryString}`;           // https://lite-api.jup.ag/price/v2?ids=...
  const quoteApi = `https://quote-api.jup.ag/price/v2${queryString}`;                         // preferred v2 quote API
  const apiFallback = `${UPSTREAMS.api.host}/price/v2${queryString}`;                        // api.jup.ag v2 fallback
  return [lite, quoteApi, apiFallback];
}

function buildTokensUpstreams(path, queryString = '') {
  const lite = `${UPSTREAMS.tokens.host}${UPSTREAMS.tokens.pathPrefix}${path}${queryString}`; // https://lite-api.jup.ag/tokens/v1/:mint
  const legacy = `https://tokens.jup.ag${path}${queryString}`;                               // legacy tokens.jup.ag
  const apiFallback = `${UPSTREAMS.api.host}/tokens/v1${path}${queryString}`;
  return [lite, legacy, apiFallback];
}

function buildQuoteUpstreams(queryString = '') {
  const swapOrder = `${UPSTREAMS.swap.host}${UPSTREAMS.swap.pathPrefix}/order${queryString}`;  // /swap/v2/order
  const swapBuild = `${UPSTREAMS.swap.host}${UPSTREAMS.swap.pathPrefix}/build${queryString}`;  // /swap/v2/build
  const quoteApi  = `https://quote-api.jup.ag/swap/v2/order${queryString}`;                    // v2 quote path (optional)
  return [swapOrder, swapBuild, quoteApi];
}

// Public GET proxy with fallback attempts
app.get('/api/jupiter/*', async (req, res) => {
  if (isCircuitOpen()) return res.status(503).json({ error: 'upstream_unavailable', message: 'Upstream temporarily unavailable' });

  const rawPath = req.path.replace('/api/jupiter', '') || '/';
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const p = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  let candidates = [];
  if (p === '/price' || p.includes('/price')) {
    candidates = buildPriceUpstreams(qs);
  } else if (p.startsWith('/tokens') || p.startsWith('/token')) {
    candidates = buildTokensUpstreams(p, qs);
  } else if (p === '/quote' || p.includes('/quote')) {
    candidates = buildQuoteUpstreams(qs);
  } else {
    candidates = [`${UPSTREAMS.swap.host}${UPSTREAMS.swap.pathPrefix}${p}${qs}`, `${UPSTREAMS.api.host}${p}${qs}`];
  }

  let lastErr = null;
  for (const upstreamUrl of candidates) {
    try {
      const headers = { 'Accept': 'application/json' };
      if (API_KEY && upstreamUrl.startsWith(UPSTREAMS.swap.host)) {
        headers['x-api-key'] = API_KEY;
        headers['Authorization'] = `Bearer ${API_KEY}`;
      }

      console.log('Proxy GET attempt ->', upstreamUrl, 'headers:', Object.keys(headers).join(','));
      const upstreamRes = await fetchWithRetries(upstreamUrl, { method: 'GET', headers, timeout: 8000 }, 2, 300);
      const text = await upstreamRes.text();

      if (upstreamRes.status === 404) {
        console.warn('Upstream returned 404 for', upstreamUrl, '— trying next candidate');
        lastErr = new Error(`Upstream 404: ${upstreamUrl}`);
        continue;
      }

      recordSuccess();
      return res.status(upstreamRes.status).send(text);
    } catch (err) {
      lastErr = err;
      console.warn('Fetch attempt failed for', upstreamUrl, err && err.message ? err.message : err);
    }
  }

  // If all candidates are 404 (route not found), do not trip circuit breaker for price/quote
  const isNotFound = lastErr && typeof lastErr.message === 'string' && lastErr.message.includes('404');
  if (isNotFound && (rawPath.startsWith('/price') || rawPath.startsWith('/quote'))) {
    console.warn('No route found for', rawPath, 'returning 404 without tripping circuit');
    return res.status(404).json({ error: 'not_found', message: 'No route in Jupiter for this endpoint' });
  }

  recordFailure();
  console.error('All upstream candidates failed for', rawPath, lastErr && lastErr.message ? lastErr.message : lastErr);
  return res.status(502).json({ error: 'Upstream failure', details: lastErr ? lastErr.message : 'unknown' });
});

// Helper to send requests to Jupiter swap endpoints
async function proxySwapEndpoint(path, method = 'POST', payload = null) {
  const targetUrl = `${UPSTREAMS.swap.host}${UPSTREAMS.swap.pathPrefix}/${path}`;
  const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'Authorization': `Bearer ${API_KEY}` };
  const options = { method, headers, timeout: 20000 };
  if (payload && (method === 'POST' || method === 'PUT')) options.body = JSON.stringify(payload);

  const upstreamRes = await fetchWithRetries(targetUrl, options, 2, 300);
  const text = await upstreamRes.text();
  return { status: upstreamRes.status, text };
}

// Protected POST proxy (build or execute) — requires API key on server
app.post('/api/jupiter/swap', async (req, res) => {
  console.log('APP ROUTE /api/jupiter/swap HIT', Object.keys(req.body || {}));
  console.log('APP ROUTE /api/jupiter/swap route event fired');
  if (!API_KEY) console.warn('JUPITER_API_KEY missing: proxying without an API key may fail or be rate-limited');
  if (isCircuitOpen()) return res.status(503).json({ error: 'upstream_unavailable', message: 'Upstream temporarily unavailable' });

  const body = req.body || {};

  if (body.signedTransaction) {
    // Execute signed tx path
    try {
      const upstream = await proxySwapEndpoint('execute', 'POST', body);
      return res.status(upstream.status).send(upstream.text);
    } catch (err) {
      console.warn('POST proxy execute failed', err && err.message ? err.message : err);
      recordFailure();
      return res.status(502).json({ error: 'Upstream failure', details: err.message || String(err) });
    }
  }

  // Build path; forward full request body to Jupiter /swap/v2/build
  const payload = body;
  try {
    const targetBuild = `${UPSTREAMS.swap.host}${UPSTREAMS.swap.pathPrefix}/build`;
    const headers = { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'Authorization': `Bearer ${API_KEY}` };
    console.log('Proxy POST /api/jupiter/swap ->', targetBuild, 'payload keys:', Object.keys(payload));
    const upstreamRes = await fetchWithRetries(targetBuild, { method: 'POST', headers, body: JSON.stringify(payload), timeout: 20000 }, 2, 500);
    const text = await upstreamRes.text();
    console.log('Upstream build response', upstreamRes.status, text.slice(0,300));
    recordSuccess();
    return res.status(upstreamRes.status).send(text);
  } catch (err) {
    console.warn('POST proxy build failed', err && err.message ? err.message : err);
    recordFailure();
    return res.status(502).json({ error: 'Upstream failure', details: err.message || String(err) });
  }
});

app.get('/api/jupiter/order', async (req, res) => {
  if (!API_KEY) console.warn('JUPITER_API_KEY missing: proxying without an API key may fail or be rate-limited');
  if (isCircuitOpen()) return res.status(503).json({ error: 'upstream_unavailable', message: 'Upstream temporarily unavailable' });

  const params = new URLSearchParams(req.query).toString();
  const targetUrl = `${UPSTREAMS.swap.host}${UPSTREAMS.swap.pathPrefix}/order?${params}`;
  const headers = { 'Accept': 'application/json', 'x-api-key': API_KEY, 'Authorization': `Bearer ${API_KEY}` };

  try {
    const upstreamRes = await fetchWithRetries(targetUrl, { method: 'GET', headers, timeout: 20000 }, 2, 300);
    const text = await upstreamRes.text();
    recordSuccess();
    return res.status(upstreamRes.status).send(text);
  } catch (err) {
    console.warn('GET proxy order failed', err && err.message ? err.message : err);
    recordFailure();
    return res.status(502).json({ error: 'Upstream failure', details: err.message || String(err) });
  }
});

app.post('/api/jupiter/execute', async (req, res) => {
  if (!API_KEY) console.warn('JUPITER_API_KEY missing: proxying without an API key may fail or be rate-limited');
  if (isCircuitOpen()) return res.status(503).json({ error: 'upstream_unavailable', message: 'Upstream temporarily unavailable' });

  try {
    const upstream = await proxySwapEndpoint('execute', 'POST', req.body);
    return res.status(upstream.status).send(upstream.text);
  } catch (err) {
    console.warn('POST proxy execute failed', err && err.message ? err.message : err);
    recordFailure();
    return res.status(502).json({ error: 'Upstream failure', details: err.message || String(err) });
  }
});

app.post('/api/jupiter/*', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Use /api/jupiter/swap for Jupiter swap operations' });
});


// Health and diagnostics
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    circuitOpen: isCircuitOpen(),
    failures: circuit.failures,
    env: {
      port: process.env.PORT || null,
      useProxy: process.env.USE_PROXY || null
    }
  });
});

// Basic root for quick check
app.get('/', (req, res) => res.send('Proxy server running'));

// Server error handling and graceful shutdown
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Puerto ${process.env.PORT || 3003} en uso. Cierra la otra instancia o cambia PORT.`);
    process.exit(1);
  } else {
    console.error('Server error', err);
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
  process.exit(1);
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});