# MedQR — спешен клиничен профил с QR код

Прототип на система, която помага на хора със слухови проблеми и на всеки с
хронично заболяване: създава защитен **спешен медицински профил**, достъпен чрез
сканиране на **QR код**. При злополука или влошаване спешен екип сканира кода и
вижда кръвна група, алергии, заболявания, медикаменти и контакт на близък — а
профилът **изрично отбелязва слухов статус и предпочитан начин на комуникация**,
така че екипът да знае, че лицето може да не реагира на говор.

Подробното проучване (контекст, архитектура, GDPR, достъпност, пътна карта) е в
[`docs/ПРОУЧВАНЕ.md`](docs/ПРОУЧВАНЕ.md).

## Какво прави

- Регистрация и вход (имейл + парола, bcrypt) с **изрично съгласие** при регистрация.
- **Потвърждение на имейл** и **възстановяване на забравена парола** по имейл.
- Редакция на медицински профил: име, дата на раждане, кръвна група, алергии към
  лекарства, хронични заболявания, медикаменти, слухов статус, начин на
  комуникация, език, спешен контакт, бележки.
- Личен **QR код** (PNG за изтегляне) + **карта за портфейл** за печат.
- **Спешен изглед** само за четене, достъпен публично чрез дълъг непредвидим токен.

### Сигурност (максимална защита)

- **Криптиране в покой** (AES-256-GCM) на всички чувствителни медицински полета.
- **HTTPS пренасочване, HSTS и Secure бисквитки** в продукция; строга **CSP** (helmet).
- **CSRF защита** на всички форми (synchronizer token).
- **Двуфакторна автентикация (TOTP)** — съвместима с Google Authenticator/Authy,
  с еднократни **резервни кодове**.
- **Паскейове (WebAuthn/passkeys)** — вход без парола, устойчив на фишинг (пръстов
  отпечатък, лице, хардуерен ключ), включително discoverable вход.
- **Argon2id** хеширане на пароли/PIN (с прозрачна миграция от стари bcrypt хешове).
- **Активни сесии** с „изход от всички устройства" и tamper-evident одит лог.
- **Заключване след неуспешни опити** (brute-force защита) + rate limiting.
- Незадължителен **PIN** за спешния изглед, **обезсилване на изгубен код**.
- **Одит** на достъпите и на действията по сигурността.

### SEO / GEO / AEO

- Per-page `<title>`, meta description, canonical и `robots` (частните страници
  и спешните профили са `noindex` по подразбиране — без изтичане към търсачки).
- Open Graph + Twitter Card + генерирано OG изображение (`/og-image.png`).
- Structured data (JSON-LD): Organization, WebSite, SoftwareApplication и
  FAQPage — поднесени с CSP nonce (без `unsafe-inline`).
- `robots.txt`, `sitemap.xml`, `manifest.webmanifest` и `llms.txt` (за AI/answer
  engines), генерирани спрямо `PUBLIC_BASE_URL`.
- Видима FAQ секция, която дублира FAQPage схемата (за answer engines).

### GDPR / права на потребителя

- Екран за **изрично съгласие** (чл. 9 GDPR), със запис на момента и версията.
- **Износ на данните** (JSON) и **изтриване на профила** (право на забравяне) от приложението.
- Страници **Политика за поверителност**, **Политика за бисквитки** и **Общи условия**
  (администратор: CarbonStealth VCC). Само строго необходими бисквитки — без банер.

## Архитектура

Node.js (Express) + SQLite (better-sqlite3) + EJS. QR кодът сочи към хостван адрес
(`/e/<token>`), а данните стоят в базата — така профилът се обновява без нов код,
а достъпът може да се контролира и одитира. Обосновката е в проучването.

## Стартиране

```bash
cd medqr
npm install

# Генерирайте ключ за криптиране (32 байта hex):
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

npm start            # http://localhost:3000
```

За разработка: `npm run dev` (auto-reload). Без `ENCRYPTION_KEY` извън продукция се
ползва дев ключ (с предупреждение). За продукция вижте `.env.example` — задължителни
са `NODE_ENV=production`, `ENCRYPTION_KEY`, `PUBLIC_BASE_URL` (HTTPS).

## Разгръщане (Hetzner, Германия / ЕС)

Препоръчителна схема: процесът зад **reverse proxy** (nginx/Caddy) с TLS сертификат.
`trust proxy` е включен, за да се вижда реалният IP и протокол. Пазете `ENCRYPTION_KEY`
извън хранилището (напр. в systemd `EnvironmentFile` с права 600). Правете криптирани
архиви на `data/` и съхранявайте ключа отделно.

## Тестове

```bash
npm test
```

За паскейовете има отделен end-to-end тест с виртуален authenticator (Chromium):

```bash
npm i -D playwright && npx playwright install chromium
npm run test:webauthn
```

`test/smoke.test.js` (20 проверки) минава през целия поток end-to-end: CSRF токен,
регистрация със съгласие, криптиране в покой, въвеждане на данни, dashboard, QR,
износ на данни, спешен достъп през токена, журнал, включване и вход с 2FA, защита
на маршрутите.

## Качество на кода

Форматирането се налага от **Prettier**, а статичните правила — от **ESLint**
(flat config). И двете се проверяват в CI заедно с тестовете и `npm audit`.

```bash
npm run lint          # ESLint
npm run format        # Prettier (записва)
npm run format:check  # Prettier (само проверка)
```

Виж също [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md) и
[`CHANGELOG.md`](CHANGELOG.md).

## Структура

```
src/server.js          Express, helmet, HSTS, CSP, rate limiting, маршрути
src/db.js              SQLite схема (users, profiles, sessions, pending_logins, access_log, audit_log)
src/crypto.js          криптиране в покой (AES-256-GCM)
src/hashing.js         Argon2id хеширане (+ legacy bcrypt verify)
src/auth.js            сесии, заключване, 2FA pending, токени, резервни кодове
src/csrf.js            CSRF защита (synchronizer token + header)
src/mailer.js          имейл (nodemailer; SMTP в продукция, лог в dev)
src/webauthn.js        passkeys: RP конфигурация, challenge и credential достъп
src/profiles.js        достъп до профилите с криптиране/декриптиране
src/audit.js           tamper-evident одит лог (hash-верига)
src/seo.js             robots.txt, sitemap.xml, llms.txt, manifest
src/routes/            auth, profile, webauthn, emergency
src/views/             EJS шаблони (вкл. privacy, cookies, terms, 2fa, passkeys)
public/styles.css      стилове (висок контраст, едър шрифт, печат)
public/app.js          CSP-съвместими помощници (без inline скриптове)
public/webauthn.js     клиентска логика за passkeys
deploy/                продукционни конфигурации и ръководство (DEPLOY.md)
docs/ПРОУЧВАНЕ.md       детайлното проучване
test/smoke.test.js     end-to-end smoke тест
```

## Статус и важна бележка

Това е **прототип за демонстрация**, не медицинско изделие. Преди реална употреба
са нужни правен преглед и оценка на въздействието върху защитата на данните (DPIA).
Не въвеждайте реални медицински данни в демо среда.
