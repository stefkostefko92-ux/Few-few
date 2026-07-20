---
name: seed-author
description: >-
  Пише и регистрира идемпотентни Prisma seed скриптове (най-вече zabobovdol `prisma/seed-*.ts`) за
  съдържателни/начални данни — ръководства, услуги, телефони, събития, аптеки и т.н. Ползвай когато
  трябва да добавиш/обновиш seed данни, начално съдържание, „напълни базата с …", каталог или примерни
  записи. upsert по уникален ключ (нула дубли при повторно пускане), проверени факти с източник,
  регистрация в `package.json` + веригата `db:seed:all`. Собственик = агентът Сийдъра.
---

# Автор на Prisma seed (идемпотентно съдържание)

**Цел:** ново пускане на seed-а НЕ създава дубли и НЕ трие админ редакции. Фактите са проверени.

## Процес
1. **Провери версията на Prisma** — `<product>/package.json` (`@prisma/client`). zabobovdol = **Prisma 6**
   → CommonJS-съвместим ESM `import { PrismaClient } from "@prisma/client"`, `tsx`, ръчен `.env` loader
   (виж `prisma/seed-safety.ts:1-17`). **Не** прилагай Prisma-7 синтаксис (без `prisma.config.ts`/driver adapter).
2. **Намери модела + уникалния ключ** — `prisma/schema.prisma`. Напр. `Service` има `slug @unique`,
   категория `ServiceCategory` (аптека → `HEALTH`, няма отделна PHARMACY).
3. **Идемпотентност — upsert, НЕ create:**
   ```ts
   await prisma.service.upsert({ where: { slug: it.slug }, update: it, create: it });
   ```
   (шаблон: `prisma/seed-education.ts:51-55`). Провери за заети slug-ове преди да измислиш нов
   (напр. `apteka-bobov-dol`, `apteka-sopharmacy-bobov-dol` вече са заети → ползвай ново пространство).
4. **Факти или мълчание** — телефони/адреси/графици се потвърждават от официален източник (цитирай URL
   + дата в коментар, стил `seed-safety.ts:19-22`). Няма източник → placeholder + `TODO`, **не измисляй**
   (грешен телефон е по-лош от липсващ). Малките градове често нямат ротационна система — не си я въобразявай.
5. **Регистрация** — добави `"db:seed:<name>": "tsx prisma/seed-<name>.ts"` в `package.json` И в
   веригата `db:seed:all` (тя изброява поименно всеки seed).

## Проверка преди „готово"
```bash
node tools/seed/check-dups.mjs           # няма дублирани slug-ове между файловете
node tools/seed/check-integrity.mjs      # slug формат ^[a-z0-9-]+$ + задължителни непразни полета
cd <product> && npx tsc --noEmit         # типова проверка на новия файл
# при наличен Postgres: пусни seed-а ДВА пъти → нула дубли
```
Съдържанието е на **български**, проверено. Готово = check-dups/integrity чисти + фактите с източник
или явно маркирани за човек.
