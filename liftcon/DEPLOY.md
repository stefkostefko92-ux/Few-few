# LiftCon — деплой на VPS-а (netcup)

Каноничният поток на репото: сървърът сваля архива на `main` и го подава на `deploy/autodeploy.sh`, който
вика `liftcon/deploy/deploy.sh` (`deploy_liftcon`). Всичко е идемпотентно; при провал `deploy.sh` връща
предишното състояние (връзката `current` на сайта, Nginx конфига, образа на приложението).

## 1. Преди първия деплой (еднократно)

**DNS при Register.it** (панелът на домейна `liftcon.it`):
- `A` за `liftcon.it` и `www.liftcon.it` → IP адреса на VPS-а (и `AAAA`, ако сървърът има IPv6).
- **MX записите НЕ се пипат** — пощата `info@liftcon.it` остава в Register.it.
- За Brevo (известията от формата): в Brevo → *Senders, Domains & Dedicated IPs → Domains* → добавете
  `liftcon.it` и копирайте показаните записи (TXT „Brevo code“, двата DKIM CNAME, DMARC TXT — ако вече има
  `_dmarc`, не добавяйте втори). SPF не се пипа.
- Проверка преди деплоя (certbot иска DNS-а): `getent hosts liftcon.it` трябва да върне IP-то на VPS-а.

**На сървъра** трябват: `docker` (с `docker compose`), `nginx`, `certbot`, `curl`, `ss`, `gzip`, `openssl`,
`flock` (`deploy.sh` проверява всяка и спира, ако липсва), и systemd (за дневния бекъп). `node` — само за IndexNow (по желание).
Порт `127.0.0.1:4370` трябва да е свободен — `deploy.sh` го проверява с `ss` и спира при зает.

## 2. Деплой (довечера) — в SSH терминал, като root

```bash
sudo PROJECTS="liftcon" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

Какво става (`liftcon/deploy/deploy.sh`):
1. `/opt/few-few/shared/liftcon/.env` (права 600) — създава се и **тайните се генерират сами**
   (`POSTGRES_PASSWORD`, `JWT_SECRET`, `SEAL_KEY`). **Запазете копие на файла в password manager** —
   без `SEAL_KEY` 2FA и ключът за Brevo в базата не могат да се дешифрират.
2. Бекъп (`deploy/backup.sh --deploy`, при следващите деплои): дъмп на базата + моментна снимка на файловете
   на документите; всичко по-старо от 30 дни се трие. Базовата версия на сайта от репото.
3. Docker: `db` (PostgreSQL 16) + `api` (миграциите — `prisma migrate deploy`, после старт; при старт
   приложението прилага пак списъка на изтриванията — виж „Възстановяване от бекъп“).
4. Сертификат (certbot, първия път), Nginx конфиг + заглавия, проверки: `https://liftcon.it/`,
   `/health`, `/admin/login` (иначе — откат).
5. Дневният бекъп: `liftcon-backup.timer` (04:10 UTC) → `/usr/local/sbin/liftcon-backup`.
6. **Пита за имейл и парола на администратора** (само ако няма потребители; паролата — скрито, два пъти;
   не се записва никъде освен като хеш в базата).
7. IndexNow (Bing, Yandex, Seznam, Naver, Yep).

Без терминал (напр. от друг скрипт) администраторът не се пита — после: `sudo bash
/opt/few-few/current/liftcon/deploy/deploy.sh --admin`.

## 3. След деплоя

1. `https://liftcon.it/admin` → вход → 2FA с приложение за кодове (QR) → запазете резервните кодове.
2. **Профил** → име и квалификация (появяват се като автор в PDF-ите на документите).
3. **Impostazioni → Email**: API ключ на Brevo, подател `info@liftcon.it` (потвърден в Brevo), получател —
   вашата поща в Register.it → „Verifica connessione“ → „Invia email di prova“.
4. На телефона/таблета: `https://liftcon.it/admin/documenti/` → „Installa l'app“.
5. Google: Search Console → добавете `https://liftcon.it` и подайте `sitemap.xml` (IndexNow не стига до Google).

## Следващи деплои

Същата команда. Тайните не се пипат; базата и файловете се архивират преди смяната.

## Бекъпи (решение L6-B)

- Всеки ден в 04:10 UTC и преди всеки деплой, в `/opt/few-few/shared/liftcon/backup/`: `db-<време>.sql.gz`
  (базата) и `data-<време>/` (снимките и PDF-ите — твърди връзки, без допълнително място).
- **Срок: най-много 30 дни.** По-старите се трият при всяко пускане, и когато бекъпът не мине. Така
  изтритото (и по GDPR) изчезва от бекъпите най-късно за 30 дни — това е обещано в privacy политиката.
- Списъкът на изтриванията `/opt/few-few/shared/liftcon/eliminazioni/` (вид, id, час — без лични данни)
  **не е в бекъпа и не се трие**. Не го пипайте: без него приложението не тръгва (виж „Ако нещо се обърка“).
- Проверка: `systemctl list-timers liftcon-backup.timer` · `journalctl -u liftcon-backup` ·
  `cat /opt/few-few/shared/liftcon/backup/LAST_OK` · ръчен бекъп: `sudo /usr/local/sbin/liftcon-backup`.
- Бекъпите са на същия сървър: при загуба на диска не помагат. Копие извън сървъра — по ваше решение.

## Ако нещо се обърка

- Логове на приложението: `docker logs --tail 200 liftcon-api`
- Провален деплой: сайтът, Nginx и образът са върнати автоматично; базата не се връща — бекъпът е в
  `/opt/few-few/shared/liftcon/backup/` (виж по-долу).
- Приложението не тръгва и в лога има `EACCES` или `ENOENT` за `/srv/eliminazioni`: папката
  `/opt/few-few/shared/liftcon/eliminazioni` трябва да е на потребител 1000 с права 700 (`deploy.sh` я прави
  така). Без нея приложението нарочно не тръгва, иначе изтрито би се върнало.
- Приложението не тръгва с „списъкът eliminazioni.jsonl липсва, а базата помни … изтривания“: файлът е изгубен
  (изтрит, нов сървър). Върнете го от копието и `docker restart liftcon-api`. Ако е изгубен окончателно и
  приемате, че изтритото след последния бекъп може да се върне, създайте го празен:
  `sudo install -m 600 -o 1000 -g 1000 /dev/null /opt/few-few/shared/liftcon/eliminazioni/eliminazioni.jsonl`,
  после `docker restart liftcon-api`. При преместване на сървъра копирайте папката `eliminazioni/` заедно с `.env`.
- Certbot не издава сертификат → DNS-ът още не сочи сървъра (`getent hosts liftcon.it`); временният HTTP
  конфиг се маха сам; пуснете деплоя пак, когато DNS-ът се разпространи.

## Възстановяване от бекъп (само с човек, след преглед)

Връща базата и файловете към момента на бекъпа. Изтритото след бекъпа (документи, снимки, заявки) се трие пак
при старта по списъка на изтриванията — в лога: `eliminazioni_riapplicate`. Базата се сменя в **една транзакция**
(`-1`): цялата схема се маха и се зарежда от дъмпа, а сесиите се трият. Веригата `&&` спира на първата
грешка: повреден дъмп (`gunzip -t`) — приложението не се спира; грешка в базата — нищо не се сменя, нито
базата, нито файловете. Миграциите
след бекъпа `migrate deploy` прилага сам при старта. Командите са минати на тестов стек (26.11.2026). Пример —
последният бекъп; за друг сменете `T` с време от `ls "$B"`:

```bash
B=/opt/few-few/shared/liftcon/backup
ls -1 "$B"
T="$(ls -1 "$B" | sed -n 's/^db-\(.*\)\.sql\.gz$/\1/p' | tail -n 1)"; echo "$T"
gunzip -t "$B/db-$T.sql.gz" && docker stop liftcon-api \
  && { echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; gunzip -c "$B/db-$T.sql.gz"; echo 'DELETE FROM public."Sessione";'; } \
  | docker exec -i liftcon-db-1 psql -q -1 -U liftcon -d liftcon -v ON_ERROR_STOP=1 \
  && if [ -d "$B/data-$T" ]; then cd /opt/few-few/shared/liftcon && mv data "data.prima-$T" && cp -a "$B/data-$T" data; fi
docker start liftcon-api
docker logs liftcon-api 2>&1 | grep eliminazioni_riapplicate
```

След това:
- Всички влизат наново (сесиите са изтрити). Сесиите, затворени след бекъпа, не се връщат.
- Потребителите, ролите и 2FA са както в момента на бекъпа. Прегледайте **Utenti** (напр. отнет достъп след бекъпа).
- Проверете и изтрийте `data.prima-<време>`: то е копие с лични данни извън 30-дневния срок.
