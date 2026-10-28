# print/ — брошурата A5 на LiftPilot (отпред и отзад)

## Файловете

- `LiftPilot-brochure-A5-stampa.pdf` — **за печатницата**: 154 × 216 mm, 3 mm изрязване (abbondanza) от всяка страна,
  TrimBox на 148 × 210 mm, без марки за рязане. Текстът стои на 8 mm от реза. Цветовете са RGB (както ги дава
  Chromium): печатницата ги превръща в CMYK; циановото на марката (`#27dff0`) излиза малко по-матово на хартия.
- `LiftPilot-brochure-A5.pdf` — **за имейл и WhatsApp**: точно A5, без изрязване.
- `brochure.html` + `brochure.css` — източникът (облика Premium на сайта: тъмносин фон, циан, мрежа на чертеж; шрифтовете
  Manrope и DM Mono от `public/fonts/`, SIL OFL, вградени в PDF-а).
- `qr-liftpilot.svg` — QR към `https://liftpilot.carbonstealth.eu` (ниво M), генериран веднъж с пакета `qrcode`
  1.5.4 и проверен с декодер върху готовата страница.

Всичко в брошурата е на софтуера: числата (125 автоматични проверки и 198 стойности с източник — `registryCounts()`,
5 сценария — `SCENARIOS`), сечението A-A (`public/img/lp-section.svg`, `scripts/landing-drawings.ts`), примерът за
«Rimedi» (изходът на `src/lib/rimedi` в Progetto върху тестов проект с измислени данни: «Testata» 3700 → 4240 mm за
«Spazio di rifugio sul tetto di cabina», на листа съкратено и белязано «Esempio»), нормите и текстовете — от началната
страница (`messages/it.json` → `landing`). Контактите — `src/lib/provider.ts`.
Ако числата, сечението или текстовете на сайта се сменят, брошурата се пресъбира.

## Пресъбиране (в `liftpilot/`)

```bash
node print/build-brochure.mjs    # двата PDF-а; нужни Playwright (както за smoke) и PyMuPDF (както за landing-docs)
```

Скриптът спира, ако съдържанието не се побира на листа. `boxes.py` реже страницата до милиметъра (Chromium закръгля
размера нагоре до стотна от инча) и пише BleedBox и TrimBox.

## Проверка след пресъбиране

- `pdfinfo -box print/LiftPilot-brochure-A5-stampa.pdf` — 436.535 × 612.283 pt, TrimBox 8.50 навътре от всяка страна.
- `pdffonts` — всички шрифтове вградени (`emb yes`).
- QR-ът се чете с телефона от отпечатан лист (минимум 20 mm страна — тук 22,6 mm).
