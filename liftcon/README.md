# LiftCon — consulenza tecnica ascensori

Сайт и админ панел на LiftCon (Carbon Stealth VCC): консултантски услуги за асансьори в Милано и Ломбардия.

```bash
node liftcon/build.mjs                        # генерира liftcon/public/
node --test liftcon/test/*.test.mjs           # гейтът на сайта
cd liftcon/server && npm ci && npm test       # приложението (форма + /admin)
```

Локален преглед на сайта: `npx http-server liftcon/public -p 4399`.

**Админ панел** `https://liftcon.it/admin` — първият вход е с `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` от `.env`
на сървъра; при него се настройва 2FA (приложение за кодове) и се сменя паролата. Спецификация: `docs/admin-spec.md`.

Деплой (на сървъра, от `main`): `sudo DOMAIN=liftcon.it bash liftcon/deploy/deploy.sh` — изисква
`/opt/few-few/shared/liftcon/.env` (mode 600) по образеца `server/.env.example`. Подробности — `CLAUDE.md`.
