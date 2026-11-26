# LiftCon — consulenza tecnica ascensori

Сайт на LiftCon (Carbon Stealth VCC): консултантски услуги за асансьори в Милано и Ломбардия.

```bash
node liftcon/build.mjs                        # генерира liftcon/public/
node --test liftcon/test/*.test.mjs           # гейтът на сайта
cd liftcon/server && npm ci && npm test       # бекендът на формата
```

Локален преглед: `npx http-server liftcon/public -p 4399` (формата иска бекенда на `/api/richiesta`).

Деплой (на сървъра, от `main`): `sudo DOMAIN=liftcom.it bash liftcon/deploy/deploy.sh` — изисква
`/opt/few-few/shared/liftcon/.env` (mode 600) по образеца `server/.env.example`. Подробности — `CLAUDE.md`.
