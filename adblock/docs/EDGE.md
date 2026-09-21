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
   (1280×800, макс. 6), иконата `store/store_icon_128.png` (минимумът; 300×300 е
   препоръчано), promo `store/promo_small_440x280.png`.
   **Description е задължително за ВСЕКИ език в `_locales/` на пакета** (en, bg,
   it, de — мин. 250, макс. 10 000 знака): четирите текста са в
   `docs/STORE_LISTING.md` (секция „Detailed description, localised“); логото —
   „Duplicate this logo for all languages“. Manifest-ското `extDescription` е
   само *short description*, не покрива това поле.
   **Search terms**: макс. 7 термина / 21 думи / 30 знака и само релевантни —
   НЕ пренасяй ключовите думи от landing page-а (там има чужди марки като
   „uBlock Origin alternative“; в стора това е нарушение).
4. **Privacy**: Privacy Policy URL `https://adblock.carbonstealth.eu/privacy`
   (текстът е браузър-неутрален — Edge 1.5.2 не допуска политика, която говори
   за друг браузър; `PRIVACY.md`). Декларацията „не събира данни" е същата.
   Обосновка на permission-ите — §5 в `docs/SUBMISSION.md`.
   **„Are you using remote code?“ → No.** Notes for certification — виж по-долу.
5. **Availability**: Public; Markets: всички.
6. Submit → ревюто е до **седем работни дни**.

## Notes for certification (Edge 1.2: дистанционни DNR правила)

Paste as-is:

> The bundled rulesets in `rules/` are static and fully reviewable. In addition,
> `background.js` may add **dynamic block rules** derived from a twice-daily,
> Ed25519-signed **data** file (`filters.json`): a list of ad/tracker **domain
> strings** only. Each entry is regex-validated, capped, and turned into a DNR
> rule by code that ships in the package. This is necessary because ad networks
> rotate domains daily; without it the extension goes stale between releases.
> No rule JSON, no code and no selector logic is executed from the network. Users
> can disable it (Settings → auto-update off). The single MAIN-world content
> script `scriptlets/main.js` ships in the package, unminified; the same data
> file may only add rows (hostname, routine name, arguments) to its fixed table
> of 18 named routines — see the reviewer note in `docs/SUBMISSION.md` §5.

## Ъпдейти

Качи новия zip в същия листинг (версията в `manifest.json` трябва да е по-висока).
Day-to-day фиксове минават през `filters.json` (без ревю), както при Chrome.

## Разлики, за които да се внимава

- Edge има свой **tracking prevention** — не конфликтира с DNR правилата.
- `chrome.*` API-тата работят 1:1 (Edge ги алиасва); `browser.*` не се ползва.
- Ed25519 в WebCrypto: същата версия на Chromium (137+) като при Chrome —
  policy-то „изисквай подпис, когато платформата може" се държи еднакво.
