# art/ — 3D рендери за LiftCon

Фотореалистични статични изображения (three.js, без CDN), рендерирани в headless Chromium (Playwright, SwiftShader) и
конвертирани с Python PIL в `../public/img/render/`.

## Пускане
```bash
cd liftcon/art
npm ci                       # three@0.187.0 (точна версия)
node render.mjs              # hero + dettaglio + og (~10 мин), после автоматично postprocess.py
node render.mjs hero         # само един кадър
node render.mjs hero --scale 0.35 --spp 12 --no-post   # бърз преглед -> out/hero-preview.png
python3 postprocess.py       # само конвертиране от out/*.png (AVIF/WebP/JPG, бюджет по размер)
```
Нужни: глобален `playwright` с Chromium, Python 3 с Pillow (AVIF+WebP).

## Как работи
- `scene.mjs` — сцената (PBR материали, процедурни текстури от `textures.mjs`, ACES Filmic, sRGB), акумулационен рендер:
  субпиксел supersampling, дълбочина на рязкост, меки сенки (слънце през прозорец, светлина от кабината), размазано
  планарно отражение на пода, bloom, винетка, лек шум. Средата за отраженията е заснета от самата сцена (2 отскока).
- `shots.mjs` — камери, spp и параметри на трите кадъра. Детерминистично (Halton, seed).
- `out/` и `node_modules/` са в `.gitignore`.
