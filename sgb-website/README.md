# Уебсайт на Съюза на глухите в България (СГБ)

Модерен, адаптивен уебсайт с административен панел за управление на новини, статии и електронния архив на вестник **„Тишина“**. Изграден като самостоятелно Node.js приложение със сървърно рендиране (SSR) за максимална SEO производителност, готово за хостинг на VPS.

Цветовата схема и структурата са наследени от оригиналния сайт `bg.sgbbg.com`.

---

## Възможности

- **Административен панел** (`/admin`) — създаване и редакция на статии, броеве на вестника, категории, страници, потребители и настройки, с вграден визуален редактор (WYSIWYG).
- **Управление на вестник „Тишина“** — качване на PDF броеве с корица, вграден PDF четец и архив.
- **Категории и подкатегории** — пълната структура на оригиналния сайт (Информация, Дейности, Документи и др.).
- **Enterprise SEO** — динамичен `sitemap.xml`, `robots.txt`, RSS емисия, канонични URL, Open Graph и Twitter Card мета данни.
- **GEO / AEO** (оптимизация за AI и гласови асистенти) — структурирани данни JSON-LD (`Organization`, `NewsArticle`, `BreadcrumbList`, `WebSite`), `llms.txt` и достъп за AI ботове.
- **Правни страници** — Политика за поверителност, Бисквитки, Общи условия, GDPR, Достъпност (редактируеми от панела).
- **Съгласие за бисквитки** (cookie banner), съобразено с GDPR.
- **Адаптивен дизайн** — оптимизиран за мобилни телефони, таблети и компютри.
- **Сигурност** — Helmet (CSP), хеширани пароли (bcrypt), сесии, защита срещу прекомерни заявки (rate limiting), пречистване на HTML (sanitize).

## Технологии

Node.js · Express · EJS (SSR) · SQLite (better-sqlite3) · без build стъпка.

---

## Бърз старт (локално)

```bash
cd sgb-website
npm install
cp .env.example .env        # редактирайте стойностите
npm run setup               # създава базата и администратора
npm start                   # http://localhost:3000
```

Админ панел: `http://localhost:3000/admin`
(данните за вход се вземат от `.env` при първото стартиране).

---

## Инсталация на VPS (продукция)

Подробно ръководство: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

Накратко:

```bash
# 1. Код и зависимости
git clone <repo> /var/www/sgb-website && cd /var/www/sgb-website/sgb-website
npm ci --omit=dev

# 2. Конфигурация
cp .env.example .env
nano .env                   # SITE_URL, SESSION_SECRET (openssl rand -hex 32), парола за админ
npm run setup

# 3. Процес (PM2)
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup

# 4. Nginx + SSL
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sgb
sudo ln -s /etc/nginx/sites-available/sgb /etc/nginx/sites-enabled/
sudo certbot --nginx -d bg.sgbbg.com
sudo systemctl reload nginx
```

> Алтернатива на PM2: systemd услугата в [`deploy/sgb-website.service`](deploy/sgb-website.service).

---

## Структура на проекта

```
sgb-website/
├── src/
│   ├── server.js            # входна точка
│   ├── app.js               # Express конфигурация, middleware, маршрути
│   ├── config.js            # настройки от .env
│   ├── db.js / schema.sql   # SQLite база и схема
│   ├── queries.js           # достъп до данните
│   ├── seed.js / setup.js   # начални данни (категории, страници, админ)
│   ├── routes/              # public, admin, auth, seo (sitemap/robots/rss/llms)
│   ├── middleware/          # автентикация, общи данни за изгледите
│   ├── lib/                 # помощни модули (SEO, slug, sanitize, upload)
│   ├── content/legal.js     # текстове на правните страници
│   └── views/               # EJS шаблони (public + admin)
├── public/                  # CSS, JS, изображения, качени файлове
├── deploy/                  # Nginx, systemd, ръководство
├── tools/                   # генератор на статични ресурси
└── ecosystem.config.cjs     # PM2
```

## Поддръжка

- **Резервно копие:** архивирайте папка `data/` (база данни) и `public/uploads/` (качени файлове).
- **Актуализация:** `git pull && npm ci --omit=dev && pm2 reload sgb-website`.

---

Created and Designed by **[Carbon Stealth VCC](https://carbonstealth.eu)**.
