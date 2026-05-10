// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4001;

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Config validation ─────────────────────────────────────────
function validateConfig() {
  const required = ['PLATFORM_PRIVATE_KEY', 'TOKEN_MINT_ADDRESS'];
  const missing = required.filter(k => !process.env[k] || process.env[k].includes('YOUR_'));
  if (missing.length) {
    console.error('\n🚨 Missing required env vars:', missing.join(', '));
    console.error('📝 Copy backend/.env.example → backend/.env and fill in values\n');
    process.exit(1);
  }
}

// ── Routes ────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  app: 'Sollower Backend', version: '2.0.0', status: 'running',
  storage: 'localStorage (frontend)', timestamp: new Date().toISOString(),
}));

app.get('/api/status', (_req, res) => res.json({
  server: 'online', timestamp: new Date().toISOString(),
  network: process.env.SOLANA_NETWORK || 'devnet',
  platformWallet: process.env.PLATFORM_PUBLIC_KEY
    ? `${process.env.PLATFORM_PUBLIC_KEY.slice(0, 8)}…` : 'not configured',
}));

// Load route modules
const loadRoute = (path, mountAt) => {
  try {
    app.use(mountAt, require(path));
    console.log(`✅ ${mountAt}`);
  } catch (e) {
    console.warn(`⚠️  Could not load ${mountAt}: ${e.message}`);
  }
};

loadRoute('./src/routes/transactionRoutes', '/api/transactions');
loadRoute('./src/routes/escrowRoutes', '/api/escrow');
loadRoute('./src/routes/productRoutes', '/api/products');

// ── Error handlers ────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

// ── Start ─────────────────────────────────────────────────────
validateConfig();

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(52));
  console.log('  SOLLOWER BACKEND v2.0');
  console.log('='.repeat(52));
  console.log(`  URL     : http://localhost:${PORT}`);
  console.log(`  Network : ${process.env.SOLANA_NETWORK || 'devnet'}`);
  console.log(`  Token   : ${process.env.TOKEN_MINT_ADDRESS?.slice(0, 12) || 'not set'}…`);
  console.log(`  Storage : localStorage (no DB required)`);
  console.log('='.repeat(52) + '\n');
});

process.on('SIGINT', () => { console.log('\n👋 Goodbye!'); process.exit(0); });
module.exports = app;
