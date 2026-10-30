# Картинки „Как да…“ — генератори

HTML → Playwright → WebP (`deviceScaleFactor` 2, качество 82) в `public/kak-da/`. Общата основа е `_shell.js`
(реалистичен смартфон, Material Symbols, локални шрифтове и активи — без мрежа). Източници/лицензи: `assets/CREDITS.md`.

```bash
cd zabobovdol
node scripts/howto-mockups/gen-3.js              # цял файл
ONLY=power,battery node scripts/howto-mockups/gen-3.js   # само избрани имена (бърза итерация)
```

Основа: `const { phone, scene, I, ms, setRow, toggle, tip, navTitle, av, appIcon, banknote, coin, photo, statusBar, navBar, render } = require("./_shell");`
Снима се `.stage` (устройство + мека сянка + неутрален фон) или `.scene`; картинката е ≈ 876 px широка, WebP (снимките вътре правят PNG-то ~8 пъти по-тежко).

## Примери

```js
// Android (по подразбиране) и iPhone
phone(`…`, "#fff", "#0b0b0b");                       // Android: Roboto, камера-точка, жестова лента
phone(`…`, "#f2f2f7", "#000", { os: "ios" });        // iPhone: Inter, Dynamic Island
// scHl е цветът на лентата за състоянието; светъл (напр. "#fff") → светли икони върху тъмен фон

// Икони (Material Symbols Rounded)
ms("wifi", { size: 24, fill: 1, color: "#1a73e8" })  // I.search, I.back … са готови ms()
// setRow превежда емоджи към иконата; toggle — Material 3 (Android) / iOS (според os на телефона)
setRow("📶", "Wi-Fi", toggle(true), true)            // 4-ти аргумент = червен контур (.ring)

// Анотации
tip("Натиснете тук", "left:40px;top:120px", { arrow: "u", at: "30%" })  // arrow: u|d|l|r

// Икони на приложения от началния екран
appIcon("whatsapp", { size: 56, os: "android", badge: 3 })   // appIcon.names — списък

// Банкноти и монети на ЕЦБ (върху сцена, не върху телефон)
scene(`${banknote(50, "front")} ${coin("2e", "bg", { scale: 6 })}`)

// Локална снимка (само CC0/PDM, записана в assets/CREDITS.md)
photo("moya-snimka.jpg", { w: 340, h: 200, radius: 12 })     // търси в assets/credits/, после assets/
```

## Правила за банкнотите (ЕЦБ/2013/10, чл. 2)
- Само файловете от `assets/ecb/banknotes/` (образци „SPECIMEN“ 72 dpi). Надписът SPECIMEN остава.
- Никога по-голяма от оригинала: `banknote(denom, side, cssWidth)` хвърля грешка при
  `cssWidth > оригинална ширина / 2` (5 € → 170 px … 200 € → 217 px). Без `cssWidth` — най-големият позволен размер.
- Не се изрязват, не се пребагрят, не се закриват с надписи; **без банкнотоподобен фон** под елементи от дизайна
  (сцената е неутрално сива). Сянка отвън е позволена.
- Монетите: размер по реалния диаметър (`scale` = px на мм, по подразб. 6); не се уголемяват над оригинала.

## Етикетите в екрана = текстът на ръководството
Надписите, бутоните и стъпките в картинката трябва да съвпадат с текста на ръководството.
Намиране: `src/lib/howto-illustrations.ts` → картинка → slug на ръководството → текстът е в `prisma/seed-*.ts`
(напр. `grep -rn "slug: \"<slug>\"" prisma/`). Ако в ръководството пише „Известия“, в екрана не пишем „Нотификации“.

## Други
- `build-coins.js` — еднократно: прави прозрачните PNG на монетите от снимките на ЕЦБ (вж. заглавния коментар).
- Емоджи → икона: таблицата `EMOJI` в `_shell.js` (непознато емоджи остава непроменено).
- Анимации/странични ефекти в картинките няма — само статични WebP.
