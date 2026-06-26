# tools/design — „ръце" на Дизайнера (v2.0)

```bash
node tools/design/motion-a11y.mjs zabobovdol/src            # СЕРИОЗЕН режим (по подразбиране)
node tools/design/motion-a11y.mjs medqr/public
node tools/design/motion-a11y.mjs my-art-site --creative    # ТВОРЧЕСКИ режим
```

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
