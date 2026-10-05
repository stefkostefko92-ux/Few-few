# Разгръщане на Агентския шлюз в продукция (собствен ЕС сървър)

Шлюзът слуша **само на 127.0.0.1:3070**; отвън се стига през Nginx + TLS. Claude се вика
**единствено през Google Vertex AI в ЕС** (`VERTEX_REGION=eu`). Тайните живеят на сървъра
(mode 600) и никога не влизат в репото или в архива за деплой.

> Интеграцията в `deploy/autodeploy.sh` на монорепото е **следваща стъпка за VPS-аджията**.
> Докато я няма, стъпките по-долу се правят ръчно.

## 0. Преди всичко — Google Cloud (ръчно, еднократно)

1. **Проект:** създай GCP проект (напр. `carbonstealth-agents`) с активен billing.
2. **API:** включи Vertex AI API:
   `gcloud services enable aiplatform.googleapis.com --project <ПРОЕКТ>`
3. **Модели:** в **Vertex AI → Model Garden** потърси „Claude“ и **активирай** (Enable) Claude Opus 5
   и Claude Sonnet 5 за проекта (приемане на условията на Anthropic). Провери, че са налични за
   мулти-региона **`eu`** — по документацията единичните региони (`europe-west1` и др.) поддържат
   само Claude Sonnet 4.6 и по-стари; Opus 5 / Sonnet 5 вървят през `eu` или `global`
   (`global` е **забранен** тук — няма гаранция за ЕС обработка). Цената на `eu` е +10% спрямо
   global (затова `PRICE_MULTIPLIER=1.1`).
4. **Квоти:** Vertex AI → Quotas — провери/поискай квота за Claude в `eu`.
5. **Service account с минимална роля:**
   ```bash
   gcloud iam service-accounts create agentgw --project <ПРОЕКТ> --display-name "Агентски шлюз"
   gcloud projects add-iam-policy-binding <ПРОЕКТ> \
     --member "serviceAccount:agentgw@<ПРОЕКТ>.iam.gserviceaccount.com" \
     --role roles/aiplatform.user
   gcloud iam service-accounts keys create agentgw-sa.json \
     --iam-account agentgw@<ПРОЕКТ>.iam.gserviceaccount.com
   ```
   Само `roles/aiplatform.user` — никакви Owner/Editor. Файлът `agentgw-sa.json` се копира
   **директно на сървъра** (scp), не минава през репото/имейл/чат, и после се трие локално.
6. **Поверителност:** Google е обработващ (чл. 28 GDPR) по Cloud Data Processing Addendum —
   приеми го в конзолата. Изключи request-response логването на Vertex, ако не е нужно.

## 1. Потребител и папки

```bash
sudo useradd --system --home /opt/agentgw --shell /usr/sbin/nologin agentgw
sudo install -d -o agentgw -g agentgw -m 750 /opt/agentgw
sudo install -d -o root -g agentgw -m 750 /etc/agentgw
```

## 2. Node.js и кодът

Node 22 LTS. Кодът е в `/opt/agentgw/current` (от архива на монорепото — папка `agentgw/`):

```bash
cd /opt/agentgw/current
npm ci
npm run build        # prisma generate + tsc → dist/
```

## 3. Конфигурация и тайни

```bash
sudo install -o agentgw -g agentgw -m 600 /dev/null /etc/agentgw/agentgw.env
sudo -e /etc/agentgw/agentgw.env          # по образеца на .env.example
sudo install -o agentgw -g agentgw -m 600 agentgw-sa.json /etc/agentgw/agentgw-sa.json
shred -u agentgw-sa.json
```

Задължително: `DATABASE_URL`, `KEY_PEPPER` (`openssl rand -hex 32`), `VERTEX_PROJECT_ID`,
`VERTEX_REGION=eu`, `GOOGLE_APPLICATION_CREDENTIALS=/etc/agentgw/agentgw-sa.json`.

**Fail-closed:** без проект, без файла или с файл, по-отворен от 600 → `/v1/chat` връща 503 и
`/healthz` показва `"ai": false`. Регион извън ЕС → шлюзът изобщо не стартира.

## 4. База

Собствена PostgreSQL (ЕС), отделна база и потребител `agentgw`:

```bash
sudo -u agentgw bash -c 'set -a; . /etc/agentgw/agentgw.env; cd /opt/agentgw/current && npx prisma migrate deploy'
```

## 5. Услуга (systemd)

```bash
sudo cp deploy/agentgw.service /etc/systemd/system/agentgw.service
sudo systemctl daemon-reload && sudo systemctl enable --now agentgw
curl -fsS http://127.0.0.1:3070/healthz        # {"ok":true,"ai":true}
```

## 6. Reverse proxy и TLS

```bash
sudo cp deploy/nginx/agentgw.conf /etc/nginx/sites-available/agentgw.conf   # смени домейна
sudo ln -s ../sites-available/agentgw.conf /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d <домейн>
sudo nginx -t && sudo systemctl reload nginx
```

SSE изисква `proxy_buffering off` (вече е в конфигурацията). Таймаутът на Nginx (120 s) е над
таймаута към Vertex (`UPSTREAM_TIMEOUT_MS=90000`), за да не плащаме за отговор, който никой не чака.

## 7. Ключове (собственикът решава кой сайт кой агент ползва)

```bash
cd /opt/agentgw/current
run() { sudo -u agentgw bash -c 'set -a; . /etc/agentgw/agentgw.env; exec npm run -s key -- "$@"' _ "$@"; }
run create --site "Мастилко" --agents seo,prevodach --origins https://mastilko-bg.com,https://www.mastilko-bg.com --cap 20
run create --site "Бекенд X" --agents pravniyat-razbirach --cap 10 --secret
run list
run grant <id|префикс> --agents dizayner          # --remove маха
run origins <id|префикс> --origins https://нов.bg # само за публичен ключ
run limit <id|префикс> --cap 50 --rate 30
run revoke <id|префикс>
```

Ключът се показва **само веднъж** — в базата е само HMAC хешът му. Изгубен ключ → нов + revoke.

## 8. Вграждане в сайт

```html
<script
  src="https://<домейн>/widget.js"
  data-key="cs_pk_…"
  data-agent="seo"
  data-lang="bg"
  data-privacy-url="https://сайт.bg/privacy"
  defer
></script>
```

Ако сайтът има CSP: `script-src https://<домейн>` и `connect-src https://<домейн>`.
Политиката за поверителност на сайта трябва да разкрие: AI асистент (чл. 50 AI Act),
обработващ Google Cloud (Vertex AI, ЕС), че разговорите не се пазят, и „не въвеждай лични данни“.

## 9. Бекъпи и мониторинг

- `pg_dump` на базата дневно (ключове като хеш + броячи + одит) — криптиран, извън сървъра.
- `journalctl -u agentgw` — редове JSON без съдържание на разговори, без ключове и IP.
- Следи `/healthz` и месечния разход (`run list`); задай бюджетна аларма и в GCP Billing.

## 10. Контролен списък преди „на живо“

- [ ] Claude Opus 5 / Sonnet 5 активирани в Model Garden за `eu`; реална проба с `curl`
      срещу `https://aiplatform.eu.rep.googleapis.com/v1/projects/<ПРОЕКТ>/locations/eu/publishers/anthropic/models/claude-sonnet-5:rawPredict`
- [ ] Service account само с `roles/aiplatform.user`; JSON mode 600, собственик `agentgw`
- [ ] `/etc/agentgw/agentgw.env` mode 600; `KEY_PEPPER` генериран, не копиран
- [ ] `/healthz` → `"ai": true`; TLS A на SSL Labs
- [ ] Поверителността на всеки сайт с уиджет е обновена (Правният Разбирач)
- [ ] Бюджетна аларма в GCP Billing
