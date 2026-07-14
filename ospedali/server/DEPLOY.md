# Ospedali Trasparenti — админ сервиз (деплой)

Лек Node сервиз (**нула зависимости**, само вграден `node:http`/`node:crypto`),
който обслужва статичния сайт от `../site`, брои **анонимно** посещенията и дава
**админ панел** с реален брояч и превключватели за скриване на страници.

- Публично:  `/` … (целият сайт) · `/healthz` (health check)
- Админ:      `/admin` (парола) → табло с брояча + видимост на страниците
- Порт по подр.: `127.0.0.1:8788` (зад Nginx + TLS)

## Тайни (никога в репото)

Задават се през обкръжението — systemd `Environment=` или `server/.env` (mode 600):

```
OSPEDALI_ADMIN_PASSWORD=…      # парола за /admin
OSPEDALI_SESSION_SECRET=…      # дълъг случаен низ (напр. `openssl rand -hex 32`)
OSPEDALI_PORT=8788             # по избор
OSPEDALI_HOST=127.0.0.1        # по избор
```

Ако `OSPEDALI_ADMIN_PASSWORD` липсва, сервизът генерира случайна парола при
първо пускане и я отпечатва **веднъж** в лога (`journalctl -u ospedali`), а хешът
се пази в `server/.state/admin.json`. За продукция задай изрично паролата.

`server/.state/` (брояч + видимост) и `server/.env` са в `.gitignore` — рънтайм
състояние и тайни, не влизат в git.

## Локално

```bash
cd ospedali
OSPEDALI_ADMIN_PASSWORD=test OSPEDALI_INSECURE_COOKIES=1 npm run serve
# → http://127.0.0.1:8788  ·  http://127.0.0.1:8788/admin
```

(`OSPEDALI_INSECURE_COOKIES=1` маха флага `Secure` за тест по http; в продукция
НЕ го задавай — бисквитката е `Secure`, защото сайтът е зад TLS.)

## systemd (`/etc/systemd/system/ospedali.service`)

```ini
[Unit]
Description=Ospedali Trasparenti — sito + admin
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ospedali
ExecStart=/usr/bin/node server/server.js
EnvironmentFile=/opt/ospedali/server/.env
Restart=on-failure
RestartSec=3
User=www-data
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/ospedali/server/.state
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ospedali
journalctl -u ospedali -f          # лог (тук се вижда генерираната парола)
curl -s localhost:8788/healthz     # {"ok":true}
```

## Nginx (reverse proxy + TLS)

```nginx
server {
  server_name ospedalitrasparenti.it;
  location / {
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # само за дневния анонимен хеш
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

TLS през Let's Encrypt (`certbot --nginx`). Health check за мониторинг: `GET /healthz`.

## Приватност (GDPR)

Броячът е **анонимен и агрегатен**: не пази IP адреси, не поставя бисквитки за
проследяване. „Уникални посетители" се броят приблизително чрез еднопосочен HMAC
на (IP+User-Agent) с **дневна ротираща сол само в паметта** — на диска отиват
единствено числа. Затова не е нужен cookie банер и е съвместимо с политиката за
поверителност на сайта. Бисквитката `ost_admin` е строго техническа (само за
входа в `/admin`, HttpOnly+Secure+SameSite=Strict).
