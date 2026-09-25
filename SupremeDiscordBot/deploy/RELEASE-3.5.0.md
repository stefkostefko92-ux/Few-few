# Supreme Bot 3.5.0 — деплой бележки (Server Season · сезони от админ конзолата · 13 SEO страници · DISCORD_VERIFICATION.md)

Какво носи: играта **Server Season** (нива/XP, искри, `/daily`, магазин, 60 спътника,
седмични сървърни куестове, Counting, trivia, `/wyr`/`/tod`), сезони, управлявани от
Admin → **Season**, 13 страници `/features/*`, готовите отговори за верификацията,
правни текстове с играта (Privacy §2/§8, RoPA дейност 18, DPA §2). Пълният списък —
`CHANGELOG.md` → `[3.5.0]`. Играта е **изключена по подразбиране** за всеки сървър.

## 0. ВНИМАНИЕ — защо предишният деплой не премести `current`

`autodeploy.sh` пуска `deploy/smoke.sh` и мести `current` само ако е зелен. Проверка 6
(„Discord магазинът е конфигуриран“) пада, докато `DISCORD_SKU_PREMIUM` и
`DISCORD_SKU_WHITELABEL` липсват в `backend/.env` — точно това стана на 3.4.0. Без тях
**нито 3.4.0, нито 3.5.0 ще станат `current`**. Сложи ги ПРЕДИ деплоя (§1). Ако
съзнателно пускаш без магазин (играта и SEO да са живи, продажби още не), деплоят приема
`SMOKE_ALLOW_BILLING_UNCONFIGURED=1` — проверка 6 става бележка, всичко друго остава гейт (§2).

## 1. Env промени (на сървъра, преди autodeploy)

Файловете живеят в `/opt/few-few/shared/SupremeDiscordBot/` (mode 600) и се копират във
всеки нов релийз. Редактирай ТАМ. (До 3.5.0 `autodeploy.sh` копираше безусловно
`current/` → `shared/` преди деплоя и прясна редакция в `shared/` се губеше, ако
`current/SupremeDiscordBot/backend/.env` съществува. Сега печели по-пресният файл —
безопасно е на което и да е от двете места; `shared/` е каноничното.)

```bash
# backend/.env — задължително за 3.5.0
FRONTEND_URL="https://supremebot.carbonstealth.eu"   # базата на картинките на спътниците в Discord embed-ите; placeholder = празни embed-и
DISCORD_SKU_PREMIUM="<SKU id от Developer Portal → Monetization>"      # без тях Premium не може да се купи и smoke пада
DISCORD_SKU_WHITELABEL="<SKU id>"
# без промяна: AI_REPLY_TRAINING_ATTESTED=false (докато няма платен Gemini tier без обучение)
```

Проверка без да печаташ тайни:
```bash
sudo grep -cE '^(FRONTEND_URL|DISCORD_SKU_PREMIUM|DISCORD_SKU_WHITELABEL)=.+' /opt/few-few/shared/SupremeDiscordBot/backend/.env   # очаквано: 3 (празна стойност не се брои)
sudo grep -E '^FRONTEND_URL=' /opt/few-few/shared/SupremeDiscordBot/backend/.env                                                # реалният домейн, не YOUR_DOMAIN
```

Бекъп: `autodeploy.sh` сам прави дъмп ПРЕДИ миграцията (`/var/backups/supreme/pre-deploy-*.dump`,
600 в папка 700) и **спира деплоя**, ако дъмпът се провали или е подозрително малък.
Допълнителен ръчен — криптиран и проверен, със същия скрипт като дневния таймер:
```bash
sudo /usr/local/sbin/supreme-backup-postgres
sudo ls -la /var/backups/supreme/ | tail -3     # нов supreme-*.dump.gpg, ненулев размер
```
(Не ползвай `pg_dump … | gzip > …` на ръка: без `umask 077` файлът е четим от всички,
а без `pipefail` провален дъмп оставя ~20-байтов gzip, който „има размер“.)

## 2. Деплой (каноничният поток — `fetch-deploy.sh` → autodeploy)

Сървърът сам сваля неизменяем архив за точен ref (`deploy/README.md`). Скриптът може
още да го няма в текущия релийз, затова първият път се взима от самото репо:

```bash
curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
  | tar -xz -C /root --strip-components=1 --wildcards '*/deploy/fetch-deploy.sh'
sudo PROJECTS="SupremeDiscordBot" bash /root/deploy/fetch-deploy.sh
```

Следващите пъти: `sudo PROJECTS="SupremeDiscordBot" bash /opt/few-few/current/deploy/fetch-deploy.sh`.
**Препоръчително — точен комит, не клон:** `REF=<пълен SHA>` (клонът и `main` се местят;
SHA-то гарантира, че на сървъра отива точно прегледаният код). Преди сливане на PR-а:
`REF=<SHA на последния комит в claude/discord-bot-audit-seo-p5edww>`.

Резервен път (сървърът няма изходяща мрежа към GitHub) — ръчно качен ZIP:
```bash
cd /root && unzip -q -o Few-few.zip && SRC="/root/$(unzip -Z1 /root/Few-few.zip | head -1 | cut -d/ -f1)"   # папката ОТ ТОЗИ архив
sudo ARCHIVE=/root/Few-few.zip PROJECTS="SupremeDiscordBot" bash "$SRC/deploy/autodeploy.sh"
```

Ако магазинът съзнателно още не е конфигуриран и искаш `current` да мръдне въпреки това
(играта и SEO страниците да са живи, продажбите — не):
```bash
sudo PROJECTS="SupremeDiscordBot" SMOKE_ALLOW_BILLING_UNCONFIGURED=1 bash /root/deploy/fetch-deploy.sh
```
Само проверка 6 на smoke-а става бележка; базата, ботът, гардът, правните страници и
играта остават твърди гейтове. Не оставяй така за постоянно — без SKU никой не може да купи.

### Миграция в този релийз

- **v50 `server_season`** — адитивна: 13 нови таблици (`game_settings`, `game_seasons`,
  `member_progress`, `game_xp_grants`, `shop_items`, `shop_purchases`, `member_companions`,
  `companion_spawns`, `companion_trades`, `server_quests`, `quest_contributions`,
  `trivia_rounds`, `trivia_answers`), нищо по съществуващите. `db:deploy` я прилага
  автоматично. Rollback на кода без връщане на базата е възможен — виж §5 (иска една
  env промяна: проверката на схемата в стария entrypoint вижда 13-те таблици като разлика).
- Сезонът S1 („First Light“, 21.09–14.12.2026) се записва сам при първо четене на каталога.
- Ботът регистрира 9-те нови команди при старт (SHA на дефинициите → един PUT); Discord ги
  показва до ~1 час. Ръчно: `docker compose exec bot npm run deploy-commands`.
- Картинките на спътниците (`frontend/public/game/companions/*.jpg`, 180 файла) влизат в
  билда на фронтенда и се отдават от nginx — smoke #9 го проверява.

## 3. След деплоя (проверки, 15 мин)

```bash
cd /opt/few-few/current/SupremeDiscordBot && docker compose ps               # всички healthy
docker compose logs --tail=80 backend | grep -iE "v50|migrat|error"          # миграцията е минала, нула error
bash deploy/smoke.sh    # от НОВИЯ release (ако current не е мръднал — пътят е в изхода на autodeploy); проверява съдържание, не само 200
docker compose exec -T backend node scripts/game-smoke.mjs                   # каталог 60 · сезон S1 · картинки към FRONTEND_URL
docker compose exec -T backend node scripts/game-smoke.mjs <ID на тестов сървър>   # + настройки/куестове на сървъра
```

В таблото (`Ctrl+Shift+R`):
1. `/dashboard/admin` → **Season**: S1 с 4 сезонни спътника, статус „active“ (от 21.09).
2. Сървър → **Game** → Overview: включи играта САМО в тестовия сървър, задай каналите.
3. `docs/GAME_SMOKE.md` — едночасовият чеклист в тестовия сървър (XP, `/daily`, магазин,
   поява/улавяне, куест, Counting, trivia, `/privacy info|delete`). Чак след него включваш
   играта в реални сървъри.

SEO (13 нови страници + sitemap): `autodeploy.sh` подава URL-ите към IndexNow **само след
зелен smoke** (`supreme_ping_indexnow` → `tools/seo/indexnow.mjs`; ключът е
`public/09d438d11f84037ca203486287865836.txt`); `deploy.sh`, викан от autodeploy, вече не
пинга преди health. Ръчно при нужда:
`cd /opt/few-few/current/SupremeDiscordBot && bash scripts/indexnow-ping.sh`. Google не
поддържа IndexNow — sitemap-ът се самооткрива; Search Console по желание (`tools/seo/gsc.mjs`).

## 4. Developer Portal — ръчни задачи (непроменени от 3.4.0 + едно ново)

- Monetization → SKU-та (Premium, White-label) → id-тата в env (§1); eligibility на екипа.
- App Verification (>100 сървъра) и Privileged Intent review (10 000 потребители) —
  отговорите са в `docs/DISCORD_VERIFICATION.md`; **§3.1 вече описва 4 употреби** на Message
  Content (новата: Counting каналът) — при подновяване копирай актуалния текст.
- Privacy Policy URL / Terms URL, 2FA на екипа, Gemini платен tier — както в 3.4.0.

## 5. Rollback план

`current` се мести към новия релийз едва след зелен health + smoke. **Внимание:**
контейнерите се сменят на място още в `deploy.sh`, преди smoke-а — ако smoke падне,
продукцията вероятно вече върви на кода на 3.5.0, а `current` още сочи 3.4.0 (Supreme
няма автоматичен откат; `autodeploy.sh` печата точната команда за връщане).

Откат към 3.4.0 (проверено срещу Postgres 16: разликата е САМО 13-те таблици на v50 + FK):

1. Старият entrypoint сравнява живата база със своя `schema.prisma` и би спрял backend-а в
   цикъл от рестарти. Разликата е безопасна (излишни таблици), затова временно добави ред
   `SKIP_SCHEMA_CHECK=1` в `/opt/few-few/shared/SupremeDiscordBot/backend/.env` (с редактор).
2. Пълен деплой на стария release — той пресъздава ОБРАЗИТЕ. Само `docker compose up -d`
   след смяна на симлинка ползва пак образите на 3.5.0 (имената им не зависят от release-а):
   ```bash
   OLD="$(readlink -f /opt/few-few/current)"      # 3.4.0, ако current не е мръднал
   sudo RELEASE_DIR="$OLD" PROJECTS="SupremeDiscordBot" bash "$OLD/deploy/autodeploy.sh"
   ```
3. При следващия деплой на 3.5.0+ махни реда `SKIP_SCHEMA_CHECK=1` — от 3.5.0 нататък
   entrypoint-ът сам различава „само излишни таблици“ от истинско разминаване.

При откат към 3.4.0 играта изчезва от Discord (командите остават регистрирани до следващия
старт на бота, но отговарят с грешка) — кажи на операторите.

**Внимание за другите продукти на същия сървър:** деплой с `PROJECTS="SupremeDiscordBot"`
мести `current` в release, в който НЯМА `.env` на продукти без `shared/` (например
`eternaltouch/`, `zabobovdol/`). При следващия им деплой `autodeploy.sh` би генерирал нови
тайни. Ако вървят на тази машина, провери, че техните `.env` са в
`/opt/few-few/shared/<продукт>/`, преди да деплойваш само Supreme.
