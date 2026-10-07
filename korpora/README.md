# Korpora by Carbon Stealth

Програма в браузъра за проектиране на корпусни мебели. От един проект:

- 3D модел от истински детайли (дебелина, кант, посока на шарката) и проверки на конструкцията;
- разкрой с размерите за рязане след канта и нареждане по листове;
- обков в бройки, по каталог от българските магазини (в репото шифрован, ключът е само на сървъра);
- чертежи: сглобен и на всеки детайл с карта за пробиване (панти Blum CLIP top, Hettich Sensys, GTV,
  Salice Series 200; водачи GTV H45 PRESTIGE, Blum TANDEM 560H, Blum MOVENTO 760H);
- файлове за машината: DXF R12 на слоеве и G-code (ISO/Fanuc и GRBL), CSV таблици, целият проект в ZIP.

Акаунти с 30-дневен тестов период, планове Premium (25 € на месец без ДДС; 3/6/12 месеца с 5/10/20 %
отстъпка) и Lifetime (750 € без ДДС), активирани ръчно от админ панела. BG/EN/IT за сайта, акаунта и
панела; редакторът засега е на български.

## Локално

Нужни са Node ≥ 22 и PostgreSQL 16 (например в контейнер — същия потребител и парола очакват и
интеграционните тестове):

```bash
npm ci
docker run -d --name korpora-dev-db -p 127.0.0.1:5432:5432 -e POSTGRES_USER=korpora \
  -e POSTGRES_PASSWORD=korpora_dev -e POSTGRES_DB=korpora postgres:16-alpine
docker exec korpora-dev-db createdb -U korpora korpora_test   # за npm run test:integration
cp .env.example .env    # ключове: openssl rand -hex 32 (два различни); после смени/добави редовете:
#   NODE_ENV=development
#   DATABASE_URL=postgresql://korpora:korpora_dev@127.0.0.1:5432/korpora
#   PUBLIC_BASE_URL=http://127.0.0.1:4320
#   SMTP_HOST=
#   KORPORA_DEV_OUTBOX=1
npx prisma migrate deploy   # Prisma чете .env сама
npm run dev                 # http://127.0.0.1:4320 — .env се зарежда с --env-file
```

`NODE_ENV=development` е нужен: по подразбиране е `production` (бисквитки `__Host-`, HSTS и задължителен
SMTP — не за `http://127.0.0.1`). С празен `SMTP_HOST` писмата не напускат машината и се виждат на
`/__dev/outbox`. GeoIP по желание: `npm run build && node --env-file=.env dist/scripts/geoip-update.js`.

Гейтът и подредбата: `CLAUDE.md`. Сигурност: `SECURITY.md`. Продукция: `DEPLOY.md`.

## Лицензи на трети страни

three.js, three-gpu-pathtracer и three-mesh-bvh (MIT — пълните текстове в
`public/editor/THIRD-PARTY-LICENSES.txt`, сборката ги събира от всеки вграден пакет), Geologica и
JetBrains Mono (SIL OFL 1.1, `public/fonts/`), DB-IP Lite (CC BY 4.0 — „IP Geolocation by DB-IP“ в
панела и в политиката).
