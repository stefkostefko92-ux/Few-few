# Microsoft Edge Add-ons — публикуване

Edge е Chromium: **същият MV3 пакет** (`dist/supreme-adblock-<version>.zip` от
`bash tools/package.sh`) се качва без промени. Всичко, което важи за Chrome Web
Store (single purpose, без remote code, privacy декларации), важи и тук.

## Стъпки (еднократно)

1. Partner Center → <https://partner.microsoft.com/dashboard/microsoftedge/> →
   регистрация като разработчик (безплатно).
2. **Create new extension** → качи zip-а от `dist/`.
3. Листинг: ползвай текстовете от `docs/STORE_LISTING.md` (име, кратко/пълно
   описание, категория *Productivity*), скрийншотите `store/screenshots/*.png`
   (1280×800), иконата `store/store_icon_128.png`, promo `store/promo_small_440x280.png`.
   Локализирани описания: Edge приема повече езици — `_locales/{bg,it,de}` вече
   носят `extDescription`.
4. **Privacy**: Privacy Policy URL `https://adblock.carbonstealth.eu/privacy`;
   декларацията „не събира данни" е същата (виж `PRIVACY.md`). Ако Partner
   Center поиска обосновка на permission-ите — §5 в `docs/SUBMISSION.md`.
5. **Availability**: Public; Markets: всички.
6. Submit → ревюто обикновено е 1–7 дни.

## Ъпдейти

Качи новия zip в същия листинг (версията в `manifest.json` трябва да е по-висока).
Day-to-day фиксове минават през `filters.json` (без ревю), както при Chrome.

## Разлики, за които да се внимава

- Edge има свой **tracking prevention** — не конфликтира с DNR правилата.
- `chrome.*` API-тата работят 1:1 (Edge ги алиасва); `browser.*` не се ползва.
- Ed25519 в WebCrypto: същата версия на Chromium (137+) като при Chrome —
  policy-то „изисквай подпис, когато платформата може" се държи еднакво.
