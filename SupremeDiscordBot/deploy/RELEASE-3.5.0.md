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
всеки нов релийз (поправката от #233). Редактирай ТАМ, не в `current/`.

```bash
# backend/.env — задължително за 3.5.0
FRONTEND_URL="https://supremebot.carbonstealth.eu"   # базата на картинките на спътниците в Discord embed-ите; placeholder = празни embed-и
DISCORD_SKU_PREMIUM="<SKU id от Developer Portal → Monetization>"      # без тях Premium не може да се купи и smoke пада
DISCORD_SKU_WHITELABEL="<SKU id>"
# без промяна: AI_REPLY_TRAINING_ATTESTED=false (докато няма платен Gemini tier без обучение)
```

Проверка без да печаташ тайни:
```bash
sudo grep -cE '^(FRONTEND_URL|DISCORD_SKU_PREMIUM|DISCORD_SKU_WHITELABEL)=' /opt/few-few/shared/SupremeDiscordBot/backend/.env   # очаквано: 3
sudo grep -E '^FRONTEND_URL=' /opt/few-few/shared/SupremeDiscordBot/backend/.env                                                # реалният домейн, не YOUR_DOMAIN
```

Ръчен бекъп както винаги (v50 добавя 13 таблици, но бекъпът е правило, не избор):
```bash
cd /opt/few-few/current/SupremeDiscordBot && docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > /var/backups/supreme-manual-$(date +%F-%H%M).sql.gz
ls -la /var/backups/supreme-manual-*.gz   # ненулев размер!
```
(`POSTGRES_USER`/`POSTGRES_DB` идват от `.env` на compose-а: `set -a; . /opt/few-few/shared/SupremeDiscordBot/.env; set +a` преди командата.)

## 2. Деплой (каноничният поток — GitHub ZIP → autodeploy)

```bash
cd /root
rm -rf Few-few-main Few-few.zip
curl -fsSL -o Few-few.zip https://github.com/stefkostefko92-ux/Few-few/archive/refs/heads/main.zip
unzip -q -o Few-few.zip
SRC="$(ls -d /root/[Ff]ew-few-main | head -1)"
sudo ARCHIVE=/root/Few-few.zip PROJECTS="SupremeDiscordBot" bash "$SRC/deploy/autodeploy.sh"
```

Ако магазинът съзнателно още не е конфигуриран и искаш `current` да мръдне въпреки това
(играта и SEO страниците да са живи, продажбите — не):
```bash
sudo ARCHIVE=/root/Few-few.zip PROJECTS="SupremeDiscordBot" SMOKE_ALLOW_BILLING_UNCONFIGURED=1 bash "$SRC/deploy/autodeploy.sh"
```
Само проверка 6 на smoke-а става бележка; базата, ботът, гардът, правните страници и
играта остават твърди гейтове. Не оставяй така за постоянно — без SKU никой не може да купи.

### Миграция в този релийз

- **v50 `server_season`** — адитивна: 13 нови таблици (`game_settings`, `game_seasons`,
  `member_progress`, `game_xp_grants`, `shop_items`, `shop_purchases`, `member_companions`,
  `companion_spawns`, `companion_trades`, `server_quests`, `quest_contributions`,
  `trivia_rounds`, `trivia_answers`), нищо по съществуващите. `db:deploy` я прилага
  автоматично. Rollback на кода без връщане на базата е безопасен (таблиците просто стоят).
- Сезонът S1 („First Light“, 21.09–14.12.2026) се записва сам при първо четене на каталога.
- Ботът регистрира 9-те нови команди при старт (SHA на дефинициите → един PUT); Discord ги
  показва до ~1 час. Ръчно: `docker compose exec bot npm run deploy-commands`.
- Картинките на спътниците (`frontend/public/game/companions/*.jpg`, 180 файла) влизат в
  билда на фронтенда и се отдават от nginx — smoke #9 го проверява.

## 3. След деплоя (проверки, 15 мин)

```bash
cd /opt/few-few/current/SupremeDiscordBot && docker compose ps               # всички healthy
docker compose logs --tail=80 backend | grep -iE "v50|migrat|error"          # миграцията е минала, нула error
bash deploy/smoke.sh                                                         # 10 проверки, вкл. #9 (картинки + страница на играта)
docker compose exec -T backend node scripts/game-smoke.mjs                   # каталог 60 · сезон S1 · картинки към FRONTEND_URL
docker compose exec -T backend node scripts/game-smoke.mjs <ID на тестов сървър>   # + настройки/куестове на сървъра
```

В таблото (`Ctrl+Shift+R`):
1. `/dashboard/admin` → **Season**: S1 с 4 сезонни спътника, статус „active“ (от 21.09).
2. Сървър → **Game** → Overview: включи играта САМО в тестовия сървър, задай каналите.
3. `docs/GAME_SMOKE.md` — едночасовият чеклист в тестовия сървър (XP, `/daily`, магазин,
   поява/улавяне, куест, Counting, trivia, `/privacy info|delete`). Чак след него включваш
   играта в реални сървъри.

SEO (13 нови страници + sitemap): `autodeploy.sh` подава всички URL-и от sitemap-а към
IndexNow автоматично след деплоя (`supreme_ping_indexnow` → `scripts/indexnow-ping.sh`,
ключът е `public/09d438d11f84037ca203486287865836.txt`). Ръчно при нужда:
`cd /opt/few-few/current/SupremeDiscordBot && bash scripts/indexnow-ping.sh`. Google не
поддържа IndexNow — sitemap-ът се самооткрива; Search Console по желание (`tools/seo/gsc.mjs`).

## 4. Developer Portal — ръчни задачи (непроменени от 3.4.0 + едно ново)

- Monetization → SKU-та (Premium, White-label) → id-тата в env (§1); eligibility на екипа.
- App Verification (>100 сървъра) и Privileged Intent review (10 000 потребители) —
  отговорите са в `docs/DISCORD_VERIFICATION.md`; **§3.1 вече описва 4 употреби** на Message
  Content (новата: Counting каналът) — при подновяване копирай актуалния текст.
- Privacy Policy URL / Terms URL, 2FA на екипа, Gemini платен tier — както в 3.4.0.

## 5. Rollback план

`current` сочи новия релийз едва след успешен health + smoke. При проблем: върни симлинка към
предишния релийз + `docker compose up -d`. v50 е адитивна — старият код не вижда новите
таблици и работи. Внимание: при откат към 3.4.0 играта изчезва от Discord (командите остават
регистрирани до следващия старт на бота, но отговарят с грешка) — казвай на операторите.
