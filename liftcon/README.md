# LiftCon — consulenza tecnica ascensori

Сайт и админ панел на LiftCon (Carbon Stealth VCC): консултантски услуги за асансьори в Милано и Ломбардия.

```bash
node liftcon/build.mjs                        # генерира liftcon/public/
node --test liftcon/test/*.test.mjs           # гейтът на сайта
cd liftcon/server && npm ci && npm test       # приложението (форма + /admin)
```

Локален преглед на сайта: `npx http-server liftcon/public -p 4399`.

**Документи** `https://liftcon.it/admin/documenti/` — relazioni di sopralluogo, controllo qualità, esame documentale и
verbali от телефон или таблет, и без връзка; чеклист с готови фрази, снимки, PDF с номер. Спецификация:
`docs/documenti-spec.md`.

**Админ панел** `https://liftcon.it/admin` — първият администратор се създава при деплоя (имейл и парола се
въвеждат в терминала); при първия вход се настройва 2FA (приложение за кодове). Спецификация: `docs/admin-spec.md`.

Деплой (на сървъра, от `main`, в терминал): `sudo DOMAIN=liftcon.it bash liftcon/deploy/deploy.sh`.
`/opt/few-few/shared/liftcon/.env` (mode 600) се създава сам: `POSTGRES_PASSWORD`, `JWT_SECRET` и `SEAL_KEY` се
генерират, ако липсват (съществуващите не се пипат) — **пазете копие на файла на сигурно място**. Ако панелът няма
потребители, деплоят пита за имейл и парола на администратора (паролата — скрито, два пъти; не се записва никъде
освен като хеш в базата). Отделно: `--solo-env` (само `.env`) и `--admin` (само администраторът). Подробности —
`CLAUDE.md`.
