# Firefox Add-ons (AMO) — публикуване

Firefox пакетът е същият код с друг manifest (`tools/package.sh` → `dist/supreme-adblock-<версия>-firefox.zip`):
фоновият скрипт е event page (`background.scripts`), Gecko id `supreme-adblock@carbonstealth.eu`,
минимум Firefox 128 (`world: "MAIN"` в `scripting`), `data_collection_permissions: none`. Днес AMO не
намира листинг (<https://addons.mozilla.org/api/v5/addons/search/?q=Supreme%20AdBlock&app=firefox>) —
на сайта не пишем, че сме във Firefox, докато листингът не е публичен.

## Стъпки

1. `bash tools/package.sh` → `dist/` съдържа `-firefox.zip` и `-source.zip` (изходният код от HEAD
   през `git archive` — комитни преди това).
2. `npx web-ext@8 lint --source-dir <разархивиран -firefox.zip>` → **0 грешки** (5.5.1: 0 грешки,
   15 предупреждения, 0 бележки). Очакваните предупреждения и какво да кажеш за тях:
   - `UNSUPPORTED_API` `getMatchedRules` / `onRuleMatchedDebug` — липсват във Firefox; кодът проверява
     за тях и popup-ът скрива дневника „Блокирано на тази страница“;
   - `INCOMPATIBLE_API` `action.onUserSettingsChanged` (welcome) — слуша се само ако го има;
     без него стъпката „Закачи“ остава обикновен съвет;
   - `DANGEROUS_EVAL` в `scriptlets/main.js` — рутините `noeval` / `noeval-if` **подменят**
     `window.eval` на изброените сайтове, за да спрат техния eval; разширението никога не вика
     eval (`tools/package.sh` проверява пакета за `eval(` и `new Function(`);
   - `COINMINER_USAGE_DETECTED` в EasyPrivacy и AdGuard French — правила, които **блокират** майнъри.
3. <https://addons.mozilla.org/developers/> → Submit a New Add-on → On this site → качи `-firefox.zip`.
4. **Source code: Yes** → качи `-source.zip` (файловете в `rules/` и `scriptlets/` са генерирани).
5. Описание: `docs/listing/en.txt` (не говори за Chrome). Категория *Privacy & Security*.
   Privacy policy URL `https://adblock.carbonstealth.eu/privacy`; support `…/support`.
6. Бележката за ревюъра — по-долу, дословно.

## Notes for reviewers (paste as-is)

> Build: everything generated is reproducible from the source archive with Node 20+ and no network
> for the scriptlets: `node tools/build_scriptlets.mjs` recreates `scriptlets/main.js` and
> `scriptlets/ubo/*` byte for byte; `rules/*.json` are a recorded snapshot of the public filter
> lists (sources, dates and SHA-256 in `THIRD_PARTY_NOTICES.txt`; `node tools/build_filters.mjs`
> rebuilds them from the lists). `tools/package.sh` builds both packages; the Firefox one only
> changes `manifest.json`.
> No remote code: all JavaScript ships unminified. The only automatic request is
> `https://adblock.carbonstealth.eu/filters.json` and its Ed25519 signature, a data file (domain
> names, CSS selectors, YouTube response field names) validated against a strict schema and never
> executed; it can be switched off in Settings. Nothing from the network configures the MAIN-world
> script. Data collection: none. Lists the user turns on from their authors (four regional lists)
> are downloaded from the author's address, as text, and converted locally.
> Lint warnings: `DANGEROUS_EVAL` in `scriptlets/main.js` is the `noeval` routines replacing the page's
> `window.eval` on listed sites (the extension itself never calls eval); `getMatchedRules`,
> `onRuleMatchedDebug` and `action.onUserSettingsChanged` are feature-detected; the coin-miner
> warnings are block rules for miners.

## Какво се държи различно във Firefox (честно)

Видимо от кода, без отделен ръчен тест:

- **„Блокирано на тази страница“** липсва: Firefox няма `declarativeNetRequest.getMatchedRules`;
  popup-ът скрива дневника вместо да показва празен.
- **Молбата за отзив** не показва линк: линкът към отзивите е само при инсталация от Chrome Web
  Store (`background.js`, `reviewUrl`) — в AMO няма грешен линк към друг магазин.
- **Страницата-предупреждение** за опасни сайтове е web-accessible без `use_dynamic_url` (Firefox не
  го поддържа); пренасочването ползва `runtime.getURL`, както в Chrome.

Не е изпробвано във Firefox — да се провери ръчно преди да твърдим нещо на сайта: YouTube (MAIN
world, махането на рекламите от отговорите), Ed25519 проверката на подписа, „Връзки на страницата“,
клавишните комбинации, Firefox за Android. Не позиционираме разширението като по-силно от uBlock
Origin във Firefox: там uBO има пълния webRequest API, който MV3 блокерите нямат.
