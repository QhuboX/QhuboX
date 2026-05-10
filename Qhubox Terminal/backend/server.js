const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { listenToPumpFun } = require('./solanaService');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 40 * 1024 * 1024,
    pingTimeout: 60000,
    pingInterval: 25000
});

const processedTokens = new Set();
let isRadarActive = false;
let currentTrendingCache = [];
let lastTrendingReset = Date.now();
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const startRadar = () => {
    if (isRadarActive) return;
    isRadarActive = true;
    console.log('⚡ QhuboX Terminal — Motor Híbrido Iniciado');

    listenToPumpFun((data) => {
        const now = Date.now();

        if (now - lastTrendingReset > TWELVE_HOURS_MS) {
            console.log('♻️ Rotación de Ciclo (12h): Limpiando caché...');
            currentTrendingCache = [];
            lastTrendingReset = now;
        }

        if (data.type === 'graduation_visual_update' || data.isMigration) {
            const exists = currentTrendingCache.find(t => t.ca === data.ca);
            if (!exists) {
                currentTrendingCache.unshift(data);
                currentTrendingCache = currentTrendingCache.slice(0, 30);
            }
            io.emit('new-token-alert', data);
            return;
        }

        if (data.imageStatus === 'queued') {
            if (processedTokens.has(data.ca)) return;
            processedTokens.add(data.ca);
        }

        if (processedTokens.size > 500) {
            const first = processedTokens.values().next().value;
            processedTokens.delete(first);
        }

        io.emit('new-token-alert', data);
    });
};

io.on('connection', (socket) => {
    console.log(`👤 QhuboX Terminal Link [${socket.id.slice(0, 4)}] Connected`);

    socket.emit('connection-success', {
        status: 'online',
        timestamp: Date.now(),
        message: 'QhuboX Terminal — SPL Trading Engine Online'
    });

    if (currentTrendingCache.length > 0) {
        currentTrendingCache.forEach(trend => {
            socket.emit('new-token-alert', trend);
        });
    }

    socket.on('disconnect', (reason) => {
        console.log(`❌ Terminal Offline: ${reason}`);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'QhuboX Terminal Backend', tokens: processedTokens.size });
});

process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando QhuboX Terminal...');
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Critical Error:', err);
});

const PORT = process.env.PORT || 4002;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`⚡ QHUBEX TERMINAL BACKEND — PORT: ${PORT}`);
    console.log(`🔥 MONITOR: Solana SPL (12h Cycle)`);
    console.log(`🎯 ENGINE: Jupiter + DexScreener + Pump.fun`);
    console.log(`==========================================\n`);
    startRadar();
});
