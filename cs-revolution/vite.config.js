import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Версия на „живите“ файлове (двигателят cs-live.js, слоевете, неподвижните кадри, иконите): хеш на
// съдържанието им. nginx ги праща с „immutable“ за една година, а service worker-ът ги държи cache-first,
// но имената им са постоянни — затова адресите носят ?v=<хеш>. Без него поправка по двигателя или нов
// рендер не стигат до върнал се посетител. СЪЩИЯТ алгоритъм е в scripts/static-theme.py (live_version) —
// двете места трябва да дават един и същ хеш, за да не се тегли двигателят два пъти.
function liveVersion() {
  const h = createHash('sha1');
  h.update(readFileSync('public/js/cs-live.js'));
  for (const d of ['public/brand/live', 'public/brand/svc']) {
    for (const f of readdirSync(d).sort()) h.update(f).update(readFileSync(d + '/' + f));
  }
  for (const f of ['bench-1600.webp', 'bench-800.webp']) h.update(f).update(readFileSync('public/brand/' + f));
  return h.digest('hex').slice(0, 10);
}
const LIVE_V = liveVersion();

export default defineConfig({
  plugins: [
    react(),
    { name: 'cs-live-version', transformIndexHtml: (html) => html.replaceAll('%CS_LIVE_V%', LIVE_V) },
  ],
  define: { __CS_LIVE_V__: JSON.stringify(LIVE_V) },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
