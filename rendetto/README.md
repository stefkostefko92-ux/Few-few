# Rendetto by Carbon Stealth

Програма в браузъра за проектиране на корпусни мебели. От един проект:

- 3D модел от истински детайли (дебелина, кант, посока на шарката) и проверки на конструкцията;
- разкрой с размерите за рязане след канта и нареждане по листове;
- обков в бройки, по каталог от българските магазини (на сървъра);
- чертежи: сглобен и на всеки детайл с карта за пробиване (панти Blum CLIP top, Hettich Sensys, GTV,
  Salice Series 200; водачи GTV H45 PRESTIGE, Blum TANDEM 560H, Blum MOVENTO 760H);
- файлове за машината: DXF R12 на слоеве и G-code (ISO/Fanuc и GRBL), CSV таблици, целият проект в ZIP.

Акаунти с 30-дневен тестов период, планове Premium (25 € на месец без ДДС; 3/6/12 месеца с 5/10/20 %
отстъпка) и Lifetime (750 € без ДДС), активирани ръчно от админ панела. BG/EN/IT за сайта, акаунта и
панела; редакторът засега е на български.

## Локално

```bash
npm ci
cp .env.example .env            # попълни; ключове: openssl rand -hex 32 (два различни)
npx prisma migrate deploy
npm run geoip:update             # по желание — държава по IP
npm run dev                      # http://127.0.0.1:4320
```

Гейтът и подредбата: `CLAUDE.md`. Сигурност: `SECURITY.md`. Продукция: `DEPLOY.md`.

## Лицензи на трети страни

three.js, three-gpu-pathtracer и three-mesh-bvh (MIT — пълните текстове в
`public/editor/THIRD-PARTY-LICENSES.txt`, сборката ги събира от всеки вграден пакет), Geologica и
JetBrains Mono (SIL OFL 1.1, `public/fonts/`), DB-IP Lite (CC BY 4.0 — „IP Geolocation by DB-IP“ в
панела и в политиката).
