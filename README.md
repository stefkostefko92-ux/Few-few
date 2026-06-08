# Опълченците · 1877 (The Volunteers · 1877)

Образователна, разказвателна 2D игра по глави за **Българското опълчение в
Руско-турската освободителна война 1877–1878 г.** Осем глави следват
историческата дъга — от лагера в Плоещ, през Самарското знаме, Стара Загора и
Шипка, до Шейново и Освобождението.

> Подготвено за **Carbon Stealth VCC**.

## Характеристики

- **8 глави**, всяка с проста, отделна механика (туториал, церемония, тайминг,
  защита на знаменосеца, wave-defense, маршрут, съгласуван щурм, епилог).
- **Двуезичен** интерфейс и съдържание: български и английски от старта.
- **Изцяло офлайн** — без бекенд, без акаунти, без реклами, без събиране на
  данни. Прогресът се пази нативно през Capacitor Preferences (на Android —
  SharedPreferences).
- Историческите текстове и факти са по открити източници (виж Част I на
  проучването); никакъв placeholder/lorem текст и никакви измислени числа.

## Технологичен стек

| Слой            | Избор                                   |
| --------------- | --------------------------------------- |
| Game engine     | Phaser 3.90                             |
| Език / bundler  | TypeScript (strict) + Vite              |
| Валидация       | zod (конфигурация на главите, прогрес)  |
| Native wrapper  | Capacitor 7 (Android)                   |
| Локално хранене | @capacitor/preferences                  |
| i18n            | прости JSON речници (`bg.json`/`en.json`) |

## Структура на проекта

```
src/
  main.ts                # Phaser.Game конфиг (FIT, портрет 9:16)
  theme.ts               # палитра, размери, имена на сцени
  config/chapters.ts     # данни за 8-те глави (zod-валидирани)
  i18n/                  # bg.json, en.json, index.ts (t() + смяна на език)
  state/progress.ts      # прогрес и език (Capacitor Preferences)
  assets/textures.ts     # процедурни векторни текстури
  scenes/                # Boot, Preload, Menu, Map, Chapter, Credits
  mechanics/             # по една механика на файл + регистър
  ui/                    # Button, Dialog, scenery (фон/хълмове)
```

Всяка глава е **чисти данни** в `config/chapters.ts`; нищо не е hard-coded в
сцените. Механиката се избира от регистъра `mechanics/index.ts` спрямо полето
`mechanic`.

## Разработка

Изисквания: Node 22.x, npm.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit (strict)
npm run build      # typecheck + vite build -> dist/
```

## Android (Capacitor)

`capacitor.config.ts` сочи `webDir: "dist"` и appId
`eu.carbonstealth.opalchentsi`.

```bash
npm run build
npx cap add android      # първоначално
npm run cap:sync         # build + cap sync
npx cap open android     # отваря Android Studio за подписан AAB
```

При всяка промяна в кода: `npm run cap:sync` преди нов Android run.

Подробният план за build, подпис (keystore), Google Play (Organization акаунт,
D-U-N-S, merchant профил, цена 0,49 €), content rating и Data safety е описан в
проучването (Част II, Фази 6–8).

## Лицензи на активите

Графиката в v1 е оригинална, генерирана по време на изпълнение (`assets/textures.ts`).
Всеки бъдещ външен актив (изображение/звук/шрифт) трябва да има чист,
документиран лиценз за комерсиална употреба — виж `ASSETS.md`.

## Поверителност

Играта не събира никакви данни. Виж `PRIVACY.md`.
