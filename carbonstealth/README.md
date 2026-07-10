# Carbon Stealth VCC — сайт

Новият бранд сайт на **Carbon Stealth VCC** (carbonstealth.eu) — дигиталната агенция
„We build what others won't touch". Творчески, максимално визуален SPA в тъмна
cyber-естетика (терминален HUD брутализъм, cyan `#00e5ff` акцент).

## Стек
Vite 6 · React 18 · TypeScript (strict) · Three.js r0.171 · @react-three/fiber v8 ·
GSAP 3 · Lenis · react-router-dom v6. Напълно **data-driven** от `data/*.json`.

## Бърз старт
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/ (статичен, качва се на всеки static host)
```
SPA — конфигурирай хоста да сервира `index.html` за всички пътища
(`public/_redirects` покрива Netlify-style хостове).

## Ефекти (какво е вградено)
**Hero (WebGL / GLSL, „THE FORGE CORE"):**
- Fullscreen шейдър фон с **domain-warped fBm noise** — течно cyan energy-поле, реагира
  на курсора; радиален vignette към черно (фонът не се бори с текста).
- Централен **fresnel-кристал** (icosahedron) с noise displacement + дишане, обвит в
  wireframe клетка, адитивно смесване.
- **GPU частици** (хиляди points, custom vertex/fragment шейдър) — вихрят се, отблъскват
  се от курсора, бяло ядро.
- Деградация по **капацитет на устройството**: dpr + брой частици (5200 десктоп / 1600
  mobile), не по reduced-motion.

**Микро-interactions:**
- **Custom cursor** — cyan ринг (догонва с инерция) + точка + CRT фосфорна следа (canvas).
- **Magnetic Text Repulsion** на hero заглавието + **Proximity Variable Weight** (Inter
  Tight 100–900 според близост).
- **Magnetic buttons** (GSAP quickTo) — притегляне към курсора.
- **Scramble/decode** текст при hover (услуги, портфолио, блог заглавия).
- **Ghost/echo заглавия** — cyan следа зад секционните заглавия.
- **Scroll-reveal** каскади (IntersectionObserver, GPU-евтино).
- Плавен инерционен **скрол** (Lenis), безкраен **тикер**, диагонална скен линия,
  live **FPS HUD** в навигацията, blink индикатори.

## Информационна архитектура (data-driven, 3 езика)
- Начална страница `/`, `/en/`, `/bg/` — hero, about+stats, 13 услуги, 11 World Firsts,
  portfolio, live продукти, Reverse Lab, FAQ, контакт форма (POST `/api/contact.php`).
- Услуги, правни (privacy/cookie/termini), chi-siamo/contatti/portfolio — от `pages`.
- Блог (индекс + 5 статии) от `blog.json`; GEO (индекс + 20 града) от `geo.json`.
- SEO: per-route title/description/canonical/hreflang/OG от `seo.json` (SPA инжекция),
  JSON-LD от `site.json` на началната и от данните на вътрешните страници.

## Достъпност / движение
- **Творчески режим по нареждане на собственика:** без `prefers-reduced-motion` —
  пълна анимация за всички, без toggle.
- **Твърда граница:** без стробоскоп > 3/сек (WCAG 2.3.1). Проверено с
  `node ../tools/design/motion-a11y.mjs src --creative` → 0 HIGH.

## Оставено за следваща итерация
Виж отчета в PR/чата — накратко: част от 23-те стари канав-ефекта (Living Monument,
Live Print Forge, Matrix Rain, ASCII поле) не са пренесени 1:1; manifest реферира
липсващи `icon-192/512.png`; блог/geo съдържанието е с различна пълнота по език (както
в източника); FPS профилът се потвърждава в браузър.
