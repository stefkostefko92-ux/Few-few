# Разгръщане на „Carbon Stealth POS store“ в продукция (Hetzner / ЕС)

Ръководство за втвърдено пускане на лицензионния магазин (`CSPos/store/`) на сървър
под наем (Ubuntu 24.04 LTS). Моделът е като medqr: Node процес през **systemd**, зад
reverse proxy (nginx), който поема TLS; приложението слуша локално.

- Домейн: **pos.carbonstealth.eu** · Порт: **8790** · Node **22** · better-sqlite3.
- Тайните (Stripe ключове, подписващ Ed25519 ключ, store.db, инсталаторът) живеят
  **само на сървъра**, извън репото/архива.

Стъпки 1–8 се правят **веднъж**. След това всеки деплой е автоматичен през
`deploy/autodeploy.sh` (виж „Редовен деплой“ най-долу).

---

## 0. Преди всичко

- Насочи DNS записа `pos.carbonstealth.eu` (A/AAAA) към публичния IP на сървъра.
- Подготви Stripe акаунт (live), възможност за **restricted API key** и включен **Tax**.
- Приготви инсталатора `Carbon Stealth POS Setup 1.0.0.exe` (билднат от `CSPos/` през Electron).

## 1. Системен потребител и папки

```bash
adduser --system --group --home /opt/cspos-store --no-create-home cspos
install -d -o cspos -g cspos -m 755 /opt/cspos-store
install -d -o cspos -g cspos -m 755 /opt/cspos-store/app
install -d -o cspos -g cspos -m 700 /opt/cspos-store/data   # тайни/данни → 700
```

Оформление на сървъра (`autodeploy.sh` го поддържа):

```
/opt/cspos-store/
├── app/            ← кодът (rsync от архива при всеки деплой; app/data е symlink → ../data)
├── data/           ← ПОСТОЯННО: store.db (+WAL), license-signing.key, .exe  (никога от rsync)
└── .env            ← тайните (EnvironmentFile, права 600)
```

## 2. Node.js и първоначален код

```bash
# Node 22 LTS (NodeSource). better-sqlite3 се компилира при npm ci — при липса на
# prebuilt binary трябват build tools:
apt install -y build-essential python3

# Първоначален код на място (после autodeploy поема rsync-а):
rsync -a --exclude data/ --exclude node_modules/ --exclude .env \
  /root/few-few-*/CSPos/store/ /opt/cspos-store/app/
ln -sfn /opt/cspos-store/data /opt/cspos-store/app/data
chown -R cspos:cspos /opt/cspos-store
( cd /opt/cspos-store/app && sudo -u cspos npm ci --omit=dev )
```

## 3. Конфигурация и тайни (`.env`, права 600)

```bash
install -o cspos -g cspos -m 600 /dev/null /opt/cspos-store/.env
```

Попълни `/opt/cspos-store/.env` по образец на `CSPos/store/.env.example`, но
**без inline коментари** — systemd `EnvironmentFile` чете само чисти `KEY=VALUE`
редове (коментар се пише на отделен ред, започващ с `#`):

```ini
NODE_ENV=production
PORT=8790
BASE_URL=https://pos.carbonstealth.eu
STRIPE_SECRET_KEY=rk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
LICENSE_PRIVATE_KEY_FILE=./data/license-signing.key
DOWNLOAD_FILE=./data/Carbon Stealth POS Setup 1.0.0.exe
STORE_DB=./data/store.db
```

Пътищата `./data/...` са относителни спрямо `WorkingDirectory=/opt/cspos-store/app`
(където `app/data` е symlink към `/opt/cspos-store/data`). Използвай **restricted**
Stripe ключ (`rk_live_...`), не пълния секретен.

## 4. Подписващ ключ за офлайн лицензите (еднократно)

```bash
cd /opt/cspos-store/app
sudo -u cspos npm run keys:generate    # пише в data/: license-signing.key (600) + license-public.pem
```

`license-signing.key` се пази САМО тук (и в офлайн копие). Съдържанието на
`data/license-public.pem` се вгражда в касата (CSPos) като `LICENSE_PUBLIC_KEY` —
така касата проверява офлайн подписа. **Не регенерирай ключа** — обезсилва всички
издадени лицензи.

## 5. Продукт и цени в Stripe (еднократно)

```bash
cd /opt/cspos-store/app
sudo -u cspos STRIPE_SECRET_KEY=rk_live_... npm run setup:stripe
```

Създава (идемпотентно, по `lookup_key`) продукта „Carbon Stealth POS“ и трите цени.
После в Stripe Dashboard: **включи Tax** (Dashboard → Tax).

## 6. Инсталаторът за сваляне

```bash
sudo -u cspos cp "Carbon Stealth POS Setup 1.0.0.exe" /opt/cspos-store/data/
```

Пътят трябва да съвпада с `DOWNLOAD_FILE` в `.env`. Алтернатива: задай `DOWNLOAD_URL`
към подписан CDN/Release линк вместо локален файл.

## 7. Услуга (systemd)

Unit-ът `deploy/systemd/cspos-store.service` е силно ограничен (sandbox): без нови
привилегии, `ProtectSystem=strict`, единствено `data/` е записваем.

```bash
cp /opt/cspos-store/app/deploy/systemd/cspos-store.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cspos-store
systemctl status cspos-store
curl -fsS http://127.0.0.1:8790/api/plans   # health: 200 + JSON с плановете
```

## 8. Reverse proxy, TLS и защитна стена

```bash
# nginx конфиг (порт 8790 остава само на localhost зад прокси-то):
cp /opt/cspos-store/app/deploy/nginx/cspos-store.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/cspos-store.conf /etc/nginx/sites-enabled/
certbot --nginx -d pos.carbonstealth.eu     # издава + вписва сертификата
nginx -t && systemctl reload nginx

# Защитна стена: само 22/80/443 (порт 8790 НЕ се отваря навън).
ufw allow 80,443/tcp
```

Приложението не задава HSTS/CSP само — nginx конфигът добавя HSTS + основните
заглавия. За defense-in-depth портът 8790 е достъпен само локално (ufw блокира
външния достъп).

### 8б. Stripe webhook

В Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- URL: `https://pos.carbonstealth.eu/api/webhook`
- Събития: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `charge.refunded`, `charge.dispute.created`.
- Копирай „Signing secret“ (`whsec_...`) в `STRIPE_WEBHOOK_SECRET` и рестартирай:
  `systemctl restart cspos-store`.

Webhook-ът е raw body с проверка на подписа (fail-closed в production). nginx го
подава непокътнат чрез стандартен `proxy_pass`.

## 9. Бекъпи

`store.db` пази лицензите и активациите — **бекъпвай го консистентно** (не `cp` заради WAL):

```bash
sudo -u cspos sqlite3 /opt/cspos-store/data/store.db \
  ".backup '/opt/cspos-store/data/store.db.$(date +%F)'"
```

Пази офлайн копие на `license-signing.key` (загубата му прави невъзможно издаването
на нови лицензи; съвпадащите вече издадени blob-ове остават валидни до изтичане).
`autodeploy.sh` прави автоматична pre-рестарт снимка на базата при всеки деплой.

## 10. Мониторинг

- `journalctl -u cspos-store -f` — логове на приложението.
- Външен uptime монитор към `https://pos.carbonstealth.eu/api/plans` (200 + JSON).
- Следи Stripe webhook доставките (Dashboard → Webhooks → attempts) за грешки.

## 11. Контролен списък преди „на живо“

- [ ] DNS сочи сървъра; TLS работи; HTTP → HTTPS (308); HSTS присъства.
- [ ] `/api/plans` връща 200; systemd услугата се вдига при рестарт.
- [ ] `.env` е чист `KEY=VALUE` (без inline коментари), права 600, собственик cspos.
- [ ] Stripe: Tax включен, 3-те цени създадени, webhook endpoint активен с подписа.
- [ ] Тест на пълния поток в Stripe test mode (`stripe listen --forward-to
      localhost:8790/api/webhook`, тестова карта, симулирана двойна доставка + refund).
- [ ] Инсталаторът е в `data/`, `DOWNLOAD_FILE` съвпада; `/download` дава файла.
- [ ] Бекъп на `store.db` тече; `license-signing.key` е копиран офлайн.
- [ ] ufw пропуска само 22/80/443; порт 8790 не е достъпен навън.

---

## Редовен деплой (след първоначалната настройка)

Оттук нататък нищо ръчно на сървъра — важи каноничният поток на монорепото:

```bash
# 1) Ръчно: качи GitHub ZIP в /root на сървъра.
# 2) Автоматично:
cd /root && unzip -o Few-few.zip >/dev/null
sudo bash /root/few-few-*/deploy/autodeploy.sh          # или само този проект:
sudo PROJECTS="cspos-store" bash /root/few-few-*/deploy/autodeploy.sh
```

`autodeploy.sh` (проект `cspos-store`) прави: бекъп на текущия код → `rsync` в
`/opt/cspos-store/app` (без `data/`, `node_modules/`, `.env`) → symlink на `data/`
→ `npm ci --omit=dev` → снимка на `store.db` → `systemctl restart cspos-store` →
health check на `http://127.0.0.1:8790/api/plans`. При провал — **автоматичен
rollback** към предишния код и базата. Тайните и данните (`/opt/cspos-store/.env`,
`/opt/cspos-store/data/`) остават непокътнати между деплоите.
