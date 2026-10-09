import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import express from 'express';

/**
 * pdf.js за визуализатора на схеми (§9.2) от СОБСТВЕНИЯ домейн — без CDN, CSP остава `script-src 'self'`.
 * Сервират се само нужните папки на `pdfjs-dist` (браузър билд + работник, шрифтове и cmaps);
 * От `wasm/` се дават САМО JS резервните декодери (`*_nowasm_fallback.js`, зареждат се с `import()`):
 * `.wasm` файловете иска `wasm-unsafe-eval`, а CSP не се отслабва — клиентът ползва `useWasm: false`.
 */
/** URL папка → папка в pdfjs-dist. `legacy/build` — със запълнени нови API-та (Map.getOrInsertComputed…), за по-стари телефони. */
const FOLDERS = {
  build: 'legacy/build',
  cmaps: 'cmaps',
  standard_fonts: 'standard_fonts',
  iccs: 'iccs',
} as const;
const NOWASM = /_nowasm_fallback\.js$/;

export function mountPdfjs(app: express.Express): void {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  // Source map-ове не са нужни в браузъра (5 MB празен трафик).
  app.use('/vendor/pdfjs', (req, res, next) => {
    if (req.path.endsWith('.map')) return res.status(404).end();
    next();
  });
  app.use('/vendor/pdfjs/wasm', (req, res, next) => {
    if (!NOWASM.test(req.path)) return res.status(404).end();
    next();
  });
  app.use(
    '/vendor/pdfjs/wasm',
    express.static(join(root, 'wasm'), { index: false, dotfiles: 'deny' }),
  );
  for (const [url, folder] of Object.entries(FOLDERS)) {
    app.use(
      `/vendor/pdfjs/${url}`,
      express.static(join(root, folder), {
        index: false,
        dotfiles: 'deny',
        setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=86400'),
      }),
    );
  }
}
