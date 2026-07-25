# evanitasport/ — Evanita Sport (сайт)

Production-ready one-page сайт за **Evanita Sport** — дамско студио за Kangoo Jumps
и силови тренировки в Дупница („Еванита Спорт ЕООД“, инструктор Евелина Георгиева).
Root правилата живеят в кореновия `CLAUDE.md`.

_Stack: **чисто статичен** HTML/CSS/JS — без билд, без бекенд, без база.
Домейн: **evanita.carbonstealth.eu** (Nginx + Let's Encrypt на VPS-а)._

**Език на UI: български** (единствен). Код/коментари/комити — също български.

## Структура

```
index.html        one-page сайт (всички секции + JSON-LD ExerciseGym)
css/              style.css + fonts.css (self-hosted шрифтове)
fonts/            woff2 (Cormorant Garamond + Outfit — свалени локално, нула заявки към Google)
js/main.js        splash, nav scroll, IntersectionObserver reveal, click-to-load карта
images/           снимки (компресирани, ≤1400px) + og-cover.jpg (1200×630)
privacy.html      политика за поверителност + импресум (ЕИК/имейл — попълва собственикът!)
404.html          страница за грешка (nginx error_page 404)
nginx.conf        пълен TLS vhost (иска издаден сертификат — инсталира го деплоят)
nginx.http.conf   HTTP-only бутстрап vhost (пръв деплой, преди certbot)
indexnow_key.txt  публичен IndexNow ключ (материализира се като <key>.txt в webroot)
robots.txt · sitemap.xml · llms.txt · favicon.svg
```

## Конвенции (важно)

- **Без билд, без зависимости** — редактирай HTML/CSS/JS директно; остава деплойваем
  като чисти статични файлове.
- **Шрифтовете са self-hosted** (GDPR — нула заявки към Google Fonts). При промяна
  на тегла/стилове обнови `fonts/` + `css/fonts.css` заедно.
- **Картата е click-to-load** — Google Maps iframe се зарежда САМО след клик на
  потребителя (ePrivacy). Не я връщай към авто-зареждане.
- Съдържанието е реално (график, адрес, телефон, фирма) — не измисляй програми/цени.
  Цените са индивидуални по дизайн — сайтът не публикува ценоразпис.
- SEO базата е на място: keywords (≥5, вкл. „Carbon Stealth“), canonical, OG/Twitter,
  JSON-LD (`ExerciseGym`), `llms.txt`. При промяна на страници/съдържание → IndexNow
  (`node tools/seo/indexnow.mjs https://evanita.carbonstealth.eu`).
- Footer-ът кредитира Carbon Stealth.

## Quality gate

Няма билд — гейтът е ръчен преглед + валидни препратки:

```bash
grep -o 'fonts/[a-z0-9-]*\.woff2' css/fonts.css | sort -u | while read f; do [ -f "$f" ] || echo "ЛИПСВА: $f"; done
node ../tools/security/secret-scan.mjs .   # от корена: node tools/security/secret-scan.mjs
```

## Деплой

Каноничният поток: GitHub ZIP → `/root` → `deploy/autodeploy.sh` (функция
`deploy_evanita`, модел „статичен сайт зад Nginx“ като adblock): rsync до
`/var/www/evanita.carbonstealth.eu`, инсталира vhost от `nginx.conf`,
`certbot --nginx` за TLS (идемпотентно), health check, IndexNow ping.
Ръчна стъпка (еднократно): DNS A запис `evanita.carbonstealth.eu` → VPS IP.
