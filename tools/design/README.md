# tools/design — „ръце" на Дизайнера (v2.0)

```bash
node tools/design/motion-a11y.mjs zabobovdol/src            # СЕРИОЗЕН режим (по подразбиране)
node tools/design/motion-a11y.mjs medqr/public
node tools/design/motion-a11y.mjs my-art-site --creative    # ТВОРЧЕСКИ режим
node tools/design/design-lint.mjs zabobovdol                # статичният под на дизайна
node tools/design/design-lint.mjs medqr --json
```

- **design-lint.mjs** — статичният под: това, което прави страница генерирана, неудобна или незаконна, без
  да я рендерира. **HIGH** (изход 1): шрифт от чужд сървър (Google Fonts, Fontshare, Typekit, Bunny…) —
  `next/font` е наред, той самохоства при билда; скрипт/стил от публичен CDN; картинка, закачена от чужд сайт
  (Wikimedia, Unsplash, placeholder услуги); `outline: none`/`outline-none` без `:focus-visible` или видим
  заместител (ring, border, box-shadow) — контейнер с `tabIndex={-1}`/`role="dialog"` е изключение (WCAG 2.4.7);
  забранен зум (1.4.4); `img` без `alt` (1.1.1; декоративна → `alt=""`); текст-пълнеж (lorem, `[ЗА ПОПЪЛВАНЕ]`).
  **MEDIUM:** твърдение, което иска доказателство („10 000 клиенти“, „#1“, „най-добрият“, „гарантирано“) →
  умение `marketing-claims-review`. **INFO:** SVG (правилото „никога SVG“; наличният остава) — веднъж на файл.
  Коментарите не се броят. Заглушаване на един ред: `design-lint-disable-line <правило>` — само с причина.
  Идеята за „под“ от твърди правила + статична проверка е от Nutlope/hallmark (MIT); кодът и правилата са
  наши и обратни на подразбирането там: нищо от чужди сървъри. Движението остава в `motion-a11y.mjs`.

- **motion-a11y.mjs** — евристичен гейт за правилата на движението, **по режим**:
  анимация/transition без `prefers-reduced-motion: reduce`, WebGL/Three/Pixi без
  `matchMedia('prefers-reduced-motion')` + fallback, авто-play/безкраен луп без контрол
  (**WCAG 2.2.2**), inline `<script>` без nonce (CSP риск за **medqr**), вероятен строб (**WCAG 2.3.1**).
  - **Сериозен режим (по подразбиране):** корпоративни/медицински/граждански сайтове (zabobovdol/medqr).
    Липсата на reduced-motion/fallback е **HIGH** → exit **1**.
  - **`--creative` режим:** портфолио/арт/бранд, където WOW е целта. reduced-motion/fallback стават **по избор** (INFO).
  - **Универсално и в двата:** анти-строб (2.3.1) остава — не може да навредиш физически на зрител.
  Евристично — **потвърди с реален FPS/Lighthouse профил** в браузъра.

## Граница
- Инструментът чете код, не рендерира — НЕ мери реален FPS/LCP/INP, нито вижда дали ефектът е
  „брутален". Визуалната и performance проверка са в браузъра (DevTools FPS, Lighthouse, throttle).
- Browser support/Baseline за нови API (WebGPU, View Transitions, scroll-driven) са подвижни —
  **провери на живо** (MDN/caniuse) преди да обещаеш ефект на дадена аудитория.

⚠ Спектакълът е добавъчен слой: съдържанието работи без JS; ефектът се самоизключва под
reduced-motion / low-FPS / prefers-reduced-data. В спешния изглед на medqr — почти без анимация.
