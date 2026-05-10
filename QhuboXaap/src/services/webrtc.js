import io from 'socket.io-client';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3003';
let socket;

export const initSocket = (opts = {}) => {
    if (!socket) {
        // sensible defaults: enable reconnection and reasonable timeouts
        const options = {
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            transports: ['websocket', 'polling'],
            ...opts
        };
        socket = io(SIGNALING_SERVER_URL, options);
        console.log('Conectando al servidor de señalización...');
        socket.on('connect', () => {
            console.log('Conectado al servidor de señalización:', socket.id);
        });
        socket.on('disconnect', (reason) => {
            console.log('Desconectado del servidor de señalización.', reason);
        });
        socket.on('connect_error', (err) => {
            console.warn('Error conectando al servidor de señalización:', err && err.message ? err.message : err);
        });
    }
    return socket;
};

export const getSocket = () => {
    if (!socket) {
        console.warn('Socket no inicializado. Llamando a initSocket() automáticamente.');
        return initSocket();
    }
    return socket;
};

export const isSocketInitialized = () => !!socket && socket.connected;

export const sendVoiceMessage = (data) => {
    if (socket) {
        socket.emit('send-voice', data);
    }
};

export const sendMessage = (data) => {
    if (socket) {
        socket.emit('send-message', data);
    }
};

export const callUser = (data) => {
    if (socket) {
        socket.emit('call-user', data);
    }
};

export const acceptCall = (data) => {
    if (socket) {
        socket.emit('accept-call', data);
    }
};

export const sendSignal = (data) => {
    if (socket) {
        socket.emit('signal', data);
    }
};