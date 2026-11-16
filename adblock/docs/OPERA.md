# Opera Add-ons — публикуване

Opera е Chromium: качва се **същият zip** като за Chrome (`dist/supreme-adblock-<версия>.zip` от
`bash tools/package.sh`). Регистрацията е безплатна. Правилата са на help.opera.com („Publishing
Guidelines“ и „Acceptance Criteria“); сверено на 6 ноември 2026 г. Страниците са стари, затова формата
в портала може да се различава.

## Стъпки

1. <https://addons.opera.com/developer/> → влез с Opera акаунт (създава се безплатно от същата страница).
2. **Upload** → `supreme-adblock-<версия>.zip`.
3. Полета:
   - **Name:** `Supreme AdBlock` (без „Opera“ в името — изрично забранено).
   - **Summary:** едно изречение — `extDescription` от `_locales/en`.
   - **Description:** `docs/listing/en.txt` (не говори за друг браузър).
   - **Category:** *Productivity* (в списъка на Opera няма отделна категория за поверителност; ако портала
     предлага *Privacy & Security* — нея).
   - **License:** MIT. Без избран лиценз Opera слага CC BY-NC-ND 4.0.
   - **Support page:** `https://adblock.carbonstealth.eu/support`.
   - **Icon:** `store/store_icon_128.png`.
   - **Screenshots:** от кита — `store-kit/opera/screenshot-1…5.png` (800×500; Opera иска до 800×600,
     препоръчва 612×408).
4. Прегледай последната страница на формата → **Submit**. Статусът е в **Submitted extensions**.

## Защо минаваме критериите

- Целият JavaScript е в пакета, неминифициран (Opera: „it can't be obfuscated or minified“).
- Няма неизползвани файлове: `tools/package.sh` слага само файловете, които manifest-ът ползва.
- Не събираме и не пращаме лични данни (Opera: „must not send private data to an external store“).
- Не пипаме реферални параметри и механизмите на Opera за приходи.

## Разлики

- Opera има вграден блокер на реклами; двата не си пречат, но потребителят може да изключи вградения.
- Инсталация от Opera Add-ons носи `update_url` на Opera: няма линк за отзив в Chrome Web Store и няма
  страница при деинсталиране (`background.js`, `reviewUrl`) — правилно е.
- Ревюто е ръчно; срок Opera не дава.
