# SECURITY — LiftCon

- **Повърхност:** статичен сайт + `POST /api/richiesta` (формата), `GET /health` и админ панелът `/admin`.
- **Лични данни:** заявките са в PostgreSQL на нашия VPS (netcup, ЕС), изтриват се автоматично 6 месеца след
  последната промяна (без възлагане); известието е през Brevo (ЕС). В логовете — само изход и услуга; в регистъра
  на панела — действия без съдържание на заявки, IP само като HMAC. Информацията по чл. 13 GDPR — `/privacy/`.
- **Панел `/admin`:** задължителна 2FA (TOTP RFC 6238, без повторно ползване на код), argon2id, сесии в базата
  (JWT само носи id), CSRF токен + Origin на всеки POST, заключване 5 грешки/15 мин + лимит по IP (приложение и
  Nginx), роли с минимални права, временни пароли само в отговора (никога в адрес/лог), `noindex` + `no-store`.
  Съдържанието от панела стига до сайта само екранирано (текстов формат, без суров HTML). Спецификация и
  критерии: `docs/admin-spec.md`.
- **Защити на формата:** zod с горни граници на всяко поле, отказ на управляващи символи, тема на писмото на един
  ред (без header injection), капан за ботове + минимално време, лимит по IP (приложение 5/15 мин + Nginx
  10/мин), проверка на `Origin`, тяло ≤16 KB (Nginx 32 KB).
- **Заглавия:** строг CSP без `unsafe-inline` (JSON-LD е data block), HSTS preload, `frame-ancestors 'none'`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- **Трети страни при зареждане:** нула. Картата на OpenStreetMap — само след клик.
- **Тайни:** `BREVO_API_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `SEAL_KEY`, `ADMIN_INITIAL_PASSWORD` само в
  `/opt/few-few/shared/liftcon/.env` (mode 600); никога в репото или архива. `SEAL_KEY` не се сменя (шифрова 2FA
  тайните) — в бекъпа на тайните.
- **Контейнер:** закован по digest, `USER node`, `read_only`, `cap_drop: ALL`, `no-new-privileges`, порт само на
  127.0.0.1.
- Докладване на уязвимост: виж кореновия `SECURITY.md` и `/.well-known/security.txt`.
