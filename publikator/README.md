# Публикатор

Instagram контент-двигател на Carbon Stealth VCC: **чернова → човешко одобрение → публикуване**
през официалния Instagram Platform API (Instagram Login).

## Какво прави

- Пази брандовете ни (един продукт = един бранд) и свързаните им Instagram професионални акаунти.
- Генерира чернови (caption, кукичка, хаштагове, alt текст) с модел, по описанието и тона на бранда.
- Линтва всяка чернова преди одобрение: лимити на Instagram, тайни в текста, липсващ alt текст,
  линкове без UTM, хаштаг спам.
- Публикува снимки и Reels през двустъпковия поток на Meta: контейнер → `media_publish`.
- Насрочва през BullMQ и подновява дълготрайните токени (60 дни) с дневна задача.
- Води одиторска следа за всяка стъпка (`PublishLog`).

## Какво НЕ прави

**Не създава Instagram акаунти.** Meta го забранява изрично: „You can't attempt to create accounts
… in an automated way … without our express permission" ([Terms of
Use](https://help.instagram.com/581066165581870/)). Акаунтите се създават на ръка, от човек, и се
превключват на професионални (Business/Creator). Автоматизираното създаване води до бан, не до обхват.

Няма и „ботове за ангажираност" — нито масови харесвания/последвания, нито скрейпване. Всичко минава
през официалния API.

## Как се пуска един бранд

1. **Ръчно:** създай/вземи Instagram акаунта на бранда → Настройки → превключи на **професионален**
   (Business или Creator) → включи двуфакторна автентикация.
2. **Meta App:** в [developers.facebook.com](https://developers.facebook.com/) направи приложение,
   добави продукта **Instagram → API setup with Instagram login**, впиши `IG_REDIRECT_URI`.
3. **Разрешения:** `instagram_business_basic`, `instagram_business_content_publish`. Със _Standard
   Access_ работят само акаунти с роля в приложението (админ/разработчик/тестер); за чужди акаунти
   е нужен **App Review + Business Verification** (Advanced Access).
4. **Бранд в базата:** запиши ред в `Brand` (slug, name, summary, voice, language).
5. **Свързване:** `GET /auth/instagram/start?brand=<slug>` с админ токен → Instagram → callback-ът
   записва криптирания дълготраен токен.

## Маршрути

| Метод | Път                                | Кой      | Какво                                   |
| ----- | ---------------------------------- | -------- | --------------------------------------- |
| GET   | `/health`                          | публичен | 200 при жива база, иначе 503            |
| GET   | `/auth/instagram/start?brand=slug` | админ    | стартира OAuth                          |
| GET   | `/auth/instagram/callback`         | Meta     | сваля и криптира токена                 |
| GET   | `/api/posts`                       | админ    | списък с филтри `brand`, `status`       |
| POST  | `/api/posts`                       | админ    | ръчна чернова                           |
| POST  | `/api/posts/generate`              | админ    | чернови от модел (не публикува)         |
| POST  | `/api/posts/:id/approve`           | админ    | одобрение (линтът може да откаже)       |
| POST  | `/api/posts/:id/schedule`          | админ    | насрочване                              |
| POST  | `/api/posts/:id/publish-now`       | админ    | публикуване веднага (само одобрен пост) |

Всичко под `/api` иска `Authorization: Bearer <ADMIN_API_TOKEN>`; `X-Publikator-Actor` записва
кой е одобрил.

## Лимити, за които кодът знае

- **Публикации:** плаващ прозорец от 24 часа на акаунт; текущата стойност се чете от
  `content_publishing_limit` преди всяко качване, вместо да се предполага.
- **Токени:** дълготрайният живее 60 дни и се подновява от дневна задача; изтече ли, акаунтът
  става `TOKEN_EXPIRED` и иска нов OAuth от човек.
- **Caption:** 2200 знака, до 30 хаштага (линтът предупреждава далеч преди тавана).
- **Медия:** Instagram тегли файла сам — URL-ът трябва да е публичен HTTPS.

## Настройка

Копирай `.env.example` и попълни. Тайните живеят само на сървъра (mode 600), никога в репото.
`TOKEN_ENC_KEY` и `ADMIN_API_TOKEN` се раждат с `openssl rand -hex 32`.

```bash
npm ci
npm run build
npx prisma migrate deploy
node dist/index.js     # HTTP
node dist/queue/worker.js  # работник
```
