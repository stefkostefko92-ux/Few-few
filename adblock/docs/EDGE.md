# Microsoft Edge Add-ons — публикуване

Edge е Chromium: **същият MV3 пакет** (`dist/supreme-adblock-<version>.zip` от
`bash tools/package.sh`) се качва без промени. Всичко, което важи за Chrome Web
Store (single purpose, без remote code, privacy декларации), важи и тук.

## Стъпки (еднократно)

1. Partner Center → <https://partner.microsoft.com/dashboard/microsoftedge/> →
   регистрация като разработчик (безплатно).
2. **Create new extension** → качи zip-а от `dist/`.
3. Листинг. **Ползвай само `docs/listing/<код>.txt`** (по един файл за всеки от 73-те локала в
   `_locales/`, минимум 250 знака — Edge иска Description за ВСЕКИ език на пакета; логото —
   „Duplicate this logo for all languages“). Дългите описания в `docs/STORE_LISTING.md` са за Chrome
   Web Store и говорят за Chrome: Edge 1.1.2 не допуска листинг, който говори за друг браузър
   (`tests/store.test.mjs` пази `docs/listing/*.txt` без „Chrome“). Името и краткото описание идват
   от manifest-а (`extName`, `extDescription`). Категория *Productivity*; скрийншотите
   `store/screenshots/*.png` (1280×800, макс. 6), иконата `store/store_icon_128.png` (минимумът;
   300×300 е препоръчано), promo `store/promo_small_440x280.png`.
   **Search terms** (макс. 7 термина / 21 думи / 30 знака на термин, само релевантни, без чужди
   марки — „uBlock Origin alternative“ от сайта тук е нарушение):
   `ad blocker` · `block ads` · `youtube ad blocker` · `tracker blocker` · `cookie banner blocker` ·
   `popup blocker` · `Carbon Stealth`.
4. **Privacy**: Privacy Policy URL `https://adblock.carbonstealth.eu/privacy` (текстът е
   браузър-неутрален — „your browser“, не „Chrome“; `PRIVACY.md`). Edge 1.5.2 иска политиката да
   се отнася до разширението, което подаваш: ако ревюто възрази, че страницата говори „primarily“
   за друг браузър, сверете текущия текст на
   <https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/store-policies/developer-policies>
   и добавете ред „This policy applies to the extension in every browser it is published for,
   including Microsoft Edge“ — не отделна политика. Декларацията „не събира данни" е същата.
   Обосновка на permission-ите — §5 в `docs/SUBMISSION.md`.
   **„Are you using remote code?“ → No.** Notes for certification — виж по-долу.
5. **Availability**: Public; Markets: всички.
6. Submit → ревюто е до **седем работни дни**.

## Notes for certification (Edge 1.2: дистанционни DNR правила)

Paste as-is:

> The bundled rulesets in `rules/` are static and fully reviewable. In addition,
> `background.js` fetches a twice-daily, Ed25519-signed **data** file
> (`https://adblock.carbonstealth.eu/filters.json` + `.sig`): ad/tracker **domain names**, CSS
> selectors for ad boxes, and the names of YouTube response fields that carry ads. Every entry is
> validated against a strict schema and capped; domains become DNR block rules, selectors are
> applied as CSS, and nothing in the file is executed. This is necessary because ad networks rotate
> domains daily; without it the extension goes stale between releases. Users can switch it off
> (Settings → auto-update). All JavaScript ships in the package, unminified. The MAIN-world script
> `scriptlets/main.js` and its per-site directives are compiled into the package at build time
> (`node tools/build_scriptlets.mjs` reproduces them); since version 5.1.4 nothing from the network
> configures or adds to them, and a `scriptlets` key in the data file is ignored. Installed from
> Edge Add-ons, the extension sets no uninstall page and links to no other store.

## Ъпдейти

Качи новия zip в същия листинг (версията в `manifest.json` трябва да е по-висока).
Day-to-day фиксове минават през `filters.json` (без ревю), както при Chrome.

## Разлики, за които да се внимава

- Edge има свой **tracking prevention** — не конфликтира с DNR правилата.
- `chrome.*` API-тата работят 1:1 (Edge ги алиасва); `browser.*` не се ползва.
- Ed25519 в WebCrypto: същата версия на Chromium (137+) като при Chrome —
  policy-то „изисквай подпис, когато платформата може" се държи еднакво.
