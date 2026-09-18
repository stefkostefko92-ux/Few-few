# api/ — контактният API на портфолиото

Единственото динамично парче на сайта: формата „Контакт“ в хъба праща `POST /api/contact` (JSON през
`fetch`; без JavaScript — обикновен `application/x-www-form-urlencoded` POST и малка HTML страница с
отговор). Сървърът е `server.mjs` — `node:http`, нула зависимости, слуша **само на 127.0.0.1:4187** зад
Nginx (`nginx.conf` → `location /api/`). Имейлът тръгва през **Brevo transactional API** (HTTPS 443 —
Hetzner блокира 25/465/587). Нищо не се записва в база; логовете са JSON без лични данни.

```bash
node --test api/server.test.mjs      # гейтът: валидация · honeypot · лимит · HTTP договор (мокнат send)
```

## Договор

| Метод | Път | Отговор |
|---|---|---|
| `GET` | `/api/health` | `200 {"ok":true}` |
| `POST` | `/api/contact` | `200 {"ok":true}` · `400 {"ok":false,"errors":["name",…]}` · `429` лимит · `502` доставчикът отказа · `413` >16 KB · `415` друг content-type |

Полета: `name` 2–80 · `email` · `company` ≤120 · `demo` (slug на демо) · `message` 10–2000 · `lang` bg/en/it
· `consent` (задължително true) · `website` — honeypot, трябва да е празно (пълно → 200 без изпращане).
Лимит: 5 заявки на 15 минути на клиент (`X-Real-IP` от Nginx).

## Сървърът (еднократно)

Тайните живеят **само** на сървъра, никога в репото или в архива:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/portfolio-api.env
sudo nano /etc/portfolio-api.env
```

Съдържание (три реда, ключът е от Brevo → SMTP & API → API Keys; подателят трябва да е верифициран
домейн/адрес в Brevo):

```
BREVO_API_KEY=…
CONTACT_TO=info@carbonstealth.eu
CONTACT_FROM=portfolio@carbonstealth.eu
```

После `sudo bash portfolio/deploy.sh` — стъпка 7 копира `server.mjs` в `/opt/portfolio-api/`, инсталира
`deploy/portfolio-api.service`, пуска услугата и проверява `GET /api/health`. Без env файла деплоят
пропуска API-то (сайтът работи, формата връща грешка и предлага mailto).

```bash
journalctl -u portfolio-api -f                 # логове (JSON, без PII)
curl -s http://127.0.0.1:4187/api/health       # {"ok":true}
```
