import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills'; // <--- 1. Importa el plugin

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ // <--- 2. Añade el plugin aquí
      globals: {
        Buffer: true, // Esto soluciona tu error de "Buffer is not defined"
        global: true,
        process: true,
      },
      protocolImports: true, // Esto ayuda con librerías que usan node:stream, etc.
    }),
  ],
  // Nota: Ya no necesitas 'define: { global: ... }' porque el plugin lo maneja mejor
  resolve: {
    alias: {
      // Si el plugin nodePolyfills está activo, ya no suele ser necesario
      // poner 'stream-browserify' aquí manualmente, pero puedes dejarlo si prefieres.
      stream: 'stream-browserify',
    },
  },
  optimizeDeps: {
    include: ['@solana/web3.js', '@solana/spl-token', 'buffer'], // Añade 'buffer' aquí
    esbuildOptions: { 
      target: 'esnext',
      // Inyectar Buffer también durante la optimización de dependencias
      define: {
        global: 'globalThis'
      }
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          solana: ['@solana/web3.js', '@solana/spl-token'],
          wallet: [
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-solflare',
          ],
        },
      },
    },
  },
});