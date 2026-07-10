import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Конфигурация на Vite за статичен SPA билд на Carbon Stealth.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    // Ръчно разделяне на тежките 3D зависимости в отделен chunk —
    // hero WebGL сцената се зарежда lazy, не бави първоначалния LCP.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber'],
          gsap: ['gsap'],
        },
      },
    },
  },
});
