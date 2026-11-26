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

**На сървъра** трябват: `docker` (с `docker compose`), `nginx`, `certbot`, `curl`, `ss`, `tar`, `gzip`,
`openssl` (`deploy.sh` проверява всяка и спира, ако липсва). `node` — само за IndexNow (по желание).
Порт `127.0.0.1:4370` трябва да е свободен — `deploy.sh` го проверява с `ss` и спира при зает.

## 2. Деплой (довечера) — в SSH терминал, като root

```bash
sudo PROJECTS="liftcon" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

Какво става (`liftcon/deploy/deploy.sh`):
1. `/opt/few-few/shared/liftcon/.env` (права 600) — създава се и **тайните се генерират сами**
   (`POSTGRES_PASSWORD`, `JWT_SECRET`, `SEAL_KEY`). **Запазете копие на файла в password manager** —
   без `SEAL_KEY` 2FA и ключът за Brevo в базата не могат да се дешифрират.
2. Бекъп на базата и на снимките (при следващите деплои), базовата версия на сайта от репото.
3. Docker: `db` (PostgreSQL 16) + `api` (миграциите — `prisma migrate deploy`, после старт).
4. Сертификат (certbot, първия път), Nginx конфиг + заглавия, проверки: `https://liftcon.it/`,
   `/health`, `/admin/login` (иначе — откат).
5. **Пита за имейл и парола на администратора** (само ако няма потребители; паролата — скрито, два пъти;
   не се записва никъде освен като хеш в базата).
6. IndexNow (Bing, Yandex, Seznam, Naver, Yep).

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

Същата команда. Тайните не се пипат; базата и снимките се архивират преди смяната
(`/opt/few-few/shared/liftcon/backup/`, последните 10 дъмпа и 3 архива на снимките).

## Ако нещо се обърка

- Логове на приложението: `docker logs --tail 200 liftcon-api`
- Провален деплой: сайтът, Nginx и образът са върнати автоматично; бекъпът на базата е в
  `/opt/few-few/shared/liftcon/backup/db-<време>.sql.gz` (възстановяване — само с човек, след преглед).
- Certbot не издава сертификат → DNS-ът още не сочи сървъра (`getent hosts liftcon.it`); временният HTTP
  конфиг се маха сам; пуснете деплоя пак, когато DNS-ът се разпространи.
