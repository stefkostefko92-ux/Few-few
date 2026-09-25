# tools/legal — доказателства, не само съвет (Правен агент v2.0)

```bash
node tools/legal/consent-scan.mjs https://zabobovdol.carbonstealth.eu  # тракинг преди съгласие
node tools/legal/a11y.mjs          https://zabobovdol.carbonstealth.eu  # WCAG 2.1 AA / EN 301 549
```

- **consent-scan.mjs** — Playwright зарежда с чисто състояние и записва бисквитки +
  заявки към трети домейни **преди** взаимодействие → флагва неесенциален тракинг преди
  съгласие (чл. 5(3) ePrivacy + GDPR). Разширение: повтори за reject-all/accept-all (3-state).
- **a11y.mjs** — `@axe-core/playwright` (WCAG 2.1 A/AA + EN 301 549). EAA в сила от 28.06.2025.

**Инсталация:** `npm i -D playwright @axe-core/playwright`. Тук chromium е наличен в
`/opt/pw-browsers` (за headless среди подай `executablePath` / `--no-sandbox`).

⚠ axe-core хваща ~57% — зелено ≠ съответствие; ръчен преглед (клавиатура, ред на четене)
остава. Всичко тук е **обща информация, не правен съвет**.

Планирани (L, нужен инвентар): RoPA (чл. 30) + DPIA генератор от `data-map.yaml`
(Prisma схема + 3rd-party SDK), генератор на слоести политики, IAB TCF v2.3 / Consent Mode v2 валидатор.
