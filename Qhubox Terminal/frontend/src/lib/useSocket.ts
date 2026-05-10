// src/lib/useSocket.ts
'use client';
import { useEffect, useRef, useState } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4002';

export interface TokenAlert {
  ca: string;
  symbol: string;
  name: string;
  buyAmount?: string;
  pumpLink?: string;
  timestamp: number;
  mcap?: number;
  image?: string;
  imageData?: string;
  imageStatus?: 'queued' | 'ready';
  isMigration?: boolean;
  type?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  hasDexPaid?: boolean;
}

export function useSocket() {
  const [alerts, setAlerts] = useState<TokenAlert[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    let socket: any;

    const init = async () => {
      // Dynamic import to avoid SSR issues
      const { io } = await import('socket.io-client');

      socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        console.log('⚡ QhuboX Terminal — Backend Connected');
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('connection-success', (data: any) => {
        console.log('✅', data.message);
      });

      socket.on('new-token-alert', (data: TokenAlert) => {
        setAlerts(prev => {
          // Update existing token with image if ready
          if (data.imageStatus === 'ready') {
            return prev.map(t => t.ca === data.ca ? { ...t, ...data } : t);
          }
          // Deduplicate
          const exists = prev.find(t => t.ca === data.ca);
          if (exists && data.imageStatus !== 'ready') return prev;
          // Add new, keep max 100
          return [data, ...prev.filter(t => t.ca !== data.ca)].slice(0, 100);
        });
      });
    };

    init();

    return () => {
      socket?.disconnect();
    };
  }, []);

  return { alerts, connected };
}
