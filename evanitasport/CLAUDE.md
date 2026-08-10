# evanitasport/ — Evanita Sport (сайт)

Production-ready едностраничен сайт за **Evanita Sport** — дамско студио за
Kangoo Jumps и силови тренировки в Дупница (Еванита Спорт ЕООД, инструктор
Евелина Георгиева). Root правилата живеят в кореновия `CLAUDE.md`.

_Stack: **статичен** HTML/CSS/JS — без билд, без зависимости. Деплой: Nginx на
VPS-а (виж `deploy.sh` + `nginx.conf`). Домейн: evanita.carbonstealth.eu._

**Език на UI: български** (единствен). Код/коментари/commits — също български.

## Структура

```
index.html            едностраничният сайт (hero, програми, график, FAQ, контакт)
404.html              брандирана 404 (noindex)
css/, js/, images/    стилове, клиентска логика, снимки (jpg + webp двойки)
llms.txt              AEO съдържание за AI асистенти
robots.txt            + AI ботове; sitemap.xml; indexnow-key.txt (публичен по протокол)
apple-touch-icon.png  180×180 върху кремав фон (iOS не поддържа SVG)
nginx.conf            server блок със security headers + CSP
deploy.sh             ръчен деплой на VPS-а (копира файловете, certbot, reload)
.well-known/          security.txt
print/                печатна А5 брошура (build → PDF/PNG, вградени шрифтове/QR)
marketing/            вътрешни маркетинг документи (промоции) — НЕ се деплойват
```

## Конвенции (важно)

- **Без билд, без зависимости** — редактирай HTML/CSS/JS директно.
- **Съдържанието е реално** (график, телефон +359 88 504 5112, адрес
  ул. Рилски Езера 1, работно време) — не измисляй часове или услуги;
  промени само след потвърждение от собственика.
- Изображения: всяка снимка има **jpg + webp** двойка и `width`/`height`
  атрибути (CLS). Нови снимки минават през компресия (sharp, quality ~78).
- JSON-LD: `ExerciseGym` + `FAQPage` в `<head>` — поддържай ги в синхрон със
  съдържанието (график/FAQ/адрес).
- Splash екранът се показва само първия път в сесията и се пропуска при
  `prefers-reduced-motion` — не връщай безусловния вариант.
- SEO промяна → `node tools/seo/indexnow.mjs https://evanita.carbonstealth.eu`
  (ключът е на `/indexnow-key.txt` в web root-а).
- Гейт: `node tools/qa/static-site-check.mjs evanitasport` (CI:
  `.github/workflows/evanitasport.yml`).
