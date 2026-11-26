# SECURITY — LiftCon

- **Повърхност:** статичен сайт + един endpoint `POST /api/richiesta` (формата) и `GET /health`.
- **Лични данни:** формата не пише в база; данните се препращат по имейл през Brevo (ЕС) и не се логват
  (pino: само изход и услуга). Информацията по чл. 13 GDPR — `/privacy/`.
- **Защити на формата:** zod с горни граници на всяко поле, отказ на управляващи символи, тема на писмото на един
  ред (без header injection), капан за ботове + минимално време, лимит по IP (приложение 5/15 мин + Nginx
  10/мин), проверка на `Origin`, тяло ≤16 KB (Nginx 32 KB).
- **Заглавия:** строг CSP без `unsafe-inline` (JSON-LD е data block), HSTS preload, `frame-ancestors 'none'`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- **Трети страни при зареждане:** нула. Картата на OpenStreetMap — само след клик.
- **Тайни:** `BREVO_API_KEY` само в `/opt/few-few/shared/liftcon/.env` (mode 600); никога в репото или архива.
- **Контейнер:** закован по digest, `USER node`, `read_only`, `cap_drop: ALL`, `no-new-privileges`, порт само на
  127.0.0.1.
- Докладване на уязвимост: виж кореновия `SECURITY.md` и `/.well-known/security.txt`.
