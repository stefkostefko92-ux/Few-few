---
name: new-product
description: >-
  Скеле за НОВ продукт в монорепото на Carbon Stealth. Ползвай когато потребителят иска да добави нов
  проект/продукт/сайт/приложение, „започни нов …", нова папка-продукт, или отделя нещо в самостоятелен
  проект. Пази монорепо инвариантите: няма root package.json, всеки продукт е самостоятелен (свои deps/
  toolchain/CI), вложен CLAUDE.md, SECURITY.md, ключови думи ≥5 (една „Carbon Stealth"), path-филтриран CI.
---

# Скеле на нов продукт (monorepo)

**Инвариант:** продуктите **не споделят код** — отделни deps, toolchain, CI, деплой. **Няма root
`package.json`.** `cd` в новата папка за всичко. Root `.gitignore` игнорира само `node_modules/` и `.DS_Store`.

## Стъпки
1. **Папка + стек** — `mkdir <product>/`. Избери стек спрямо нуждата (виж таблицата в root `CLAUDE.md`
   за конвенции: strict TS + Zod + `@/*` в Next апове; plain ESM + Prettier в Express/EJS).
2. **`<product>/package.json`** — свои скриптове `lint`/`typecheck`(ако TS)/`test`/`build`; `"type":"module"`
   за plain ESM. Ако публично: `keywords` **≥5**, една задължително **„Carbon Stealth"**, останалите
   специфични за продукта/локала.
3. **Вложен `<product>/CLAUDE.md`** — зарежда се само при четене на файлове там (нула токен цена иначе).
   Съдържа: едно изречение какво е, стек, команди (гейта!), layout, важни конвенции. Дръж го конкретен.
4. **`<product>/SECURITY.md`** — posture + какви данни, GDPR бележки (ако лични/чувствителни — минимизация,
   криптиране в покой, тайни само на сървъра mode 600). Никога тайни в репо/архив.
5. **CI path-филтър** — нов `.github/workflows/<product>.yml` (по модел на съседен, напр. `medqr.yml`/
   `treydar.yml`): `on.push/pull_request.paths: ['<product>/**', '.github/workflows/<product>.yml']`,
   `permissions: contents: read`, `concurrency` cancel, matrix ако е нужно, гейт = lint/typecheck/test/build.
   Собственик на конвейера = агентът **Конвейерът**.
6. **Мета** — за публичен сайт: `robots.txt`/`sitemap.xml`/`llms.txt`, `<meta name="keywords">` (≥5 + Carbon
   Stealth), JSON-LD; правен минимум (импресум/поверителност) → агентът **Правният Разбирач**.
7. **Данни** — релационно/чувствително → **Prisma+Postgres** (виж `docs/adr/0001`); никога hosted CMS за
   чувствително. Начални данни → skill **seed-author**.

## Дефиниция на „готово"
Папка самостоятелна (свои deps/CI) · вложен CLAUDE.md + SECURITY.md · keywords ≥5 вкл. Carbon Stealth ·
path-филтриран CI зелен · нула тайни в репо. Български за потребителски текст/комити.
