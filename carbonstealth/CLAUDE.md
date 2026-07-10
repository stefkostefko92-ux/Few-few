# CLAUDE.md — carbonstealth

Насоки за AI асистенти по **новия сайт на Carbon Stealth VCC** (собствената агенция,
carbonstealth.eu). Това е **бранд/творчески** продукт → максимален визуален спектакъл.

## Тип и режим
- **Творчески режим** (не сериозен). WOW е целта.
- **Изрично нареждане на собственика:** НЯМА `prefers-reduced-motion` проверки и НЯМА
  motion toggles — пълна анимация за всички. Не добавяй reduced-motion gate.
- **Единствената твърда граница:** без стробоскоп / мигане > 3 пъти/сек (WCAG 2.3.1,
  епилепсия). Всичко останало е позволено.

## Стек
- **Vite 6 + React 18 + TypeScript (strict)**, SPA, статичен билд (без сървър).
- **three r0.171** + **@react-three/fiber v8** — hero WebGL сцена (WebGL2).
- **GSAP 3** — магнитни бутони/quickTo. **Lenis** — плавен скрол.
- **react-router-dom v6** — клиентски роутинг (единичен резолвер, без route таблица).

## Команди
```bash
cd carbonstealth
npm install
npm run dev         # локален dev сървър
npm run build       # tsc -b && vite build → dist/
npm run typecheck   # tsc --noEmit
npm run preview     # преглед на build-а
```

## Quality gate (преди „готово")
1. `npm run typecheck` — чисто (strict, без unjustified any).
2. `npm run build` — чисто, `dist/` се генерира.
3. `node ../tools/design/motion-a11y.mjs src --creative` — **0 HIGH** (без строб).
4. Ръчно: FPS профил в браузъра (hero 60fps на десктоп, деградира по устройство).

## Данни — source of truth
Целият сайт е **data-driven** от `data/*.json` (извлечение от живия сайт). Копия за
runtime стоят в `public/data/`. **Не hardcode-вай съдържание в компонентите.**
- `content.{it,en,bg}.json` — UI (54 ключа), 13 услуги, stats, portfolio, products,
  11 World Firsts, FAQ, footer, misc, decor + `pages` (структурирани статични страници).
- `site.json` — организация, контакти, contactApi договор, JSON-LD graph.
- `blog.json` (5×3), `geo.json` (20 града×3), `seo.json` (per-URL за 126 маршрута).
- `design-tokens.json` — заключената палитра + каталог на 23-те стари ефекта.
- IT е основен език (`/`), EN (`/en/`), BG (`/bg/`). Не превеждай/съкращавай текстове.

## Палитра (заключена — design-tokens.json)
cyan `#00e5ff` (rgb 0,229,255) · green `#00ff88` · red `#ff3366` · amber `#ffaa00` ·
purple `#aa88ff` · off-white `#f5f5f0` · text `#ccc` · фонове `#000`/`#060608`/`#0a0a0c`.
Шрифтове: **Inter Tight** (100–900, заглавия) + **Space Mono** (body/HUD).
Естетика: терминален/HUD брутализъм, остри 1px рамки без радиуси, „// ТАГ" секции.

## Структура
```
src/
  main.tsx, App.tsx        # entry + роутинг/резолвер + layout chrome
  lib/                     # types, data (fetch+кеш), i18n, seo (head инжект),
                           # content-context, pointer, scroll
  hooks/                   # useLenis, useReveal, useAsync
  components/              # Cursor, Nav, Footer, Ticker, CookieBanner, BootScreen,
                           # MagneticButton, MagneticText, ScrambleText, GhostHeading,
                           # ContactForm, Blocks
    effects/               # HeroCanvas (lazy r3f) + shaders.ts (GLSL)
  pages/                   # Home (спектакъл), ContentPage, Blog, Geo, PageShell, NotFound
  styles/global.css        # токени, keyframes, решетки, адаптивност
public/                    # assets + data/*.json + robots.txt, llms.txt, manifest, _redirects
```

## Правила
- Пипай само `carbonstealth/`. Кодови коментари на български. Строг TS.
- Custom cursor само на `pointer: fine` (десктоп); ефектите деградират по **капацитет
  на устройството** (dpr, брой частици), НЕ по reduced-motion.
- Тежкият three chunk е lazy (`React.lazy` в HeroCanvas) — пази LCP.
- SPA изисква fallback към `index.html` за всички пътища (виж `public/_redirects`).
