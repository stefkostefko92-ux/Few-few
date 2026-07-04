# Deploying the Tanoth license server

Optional service that enforces the one-machine lifetime lock across computers
(offline device binding alone can't do that). It records which device id first
claimed each key and rejects the same key on a second machine.

`LICENSE_SECRET` must match the value in `src/shared/payment.js` (the extension
signs and verifies keys with it). Keep it secret and don't commit your real one.

One dependency-free file, `license-server.mjs`. Endpoints:
`POST /activate {key,device}`, `GET /status?key=&device=`, `GET /health`,
`POST /unbind {key,admin}` (support tool, see below).

## Option A: Docker + Caddy (automatic HTTPS)

```bash
cd server
# 1) DNS: point license.example.com -> this server's IP
# 2) edit Caddyfile -> your domain
# 3) create .env:
cat > .env <<EOF
LICENSE_SECRET=PUT-THE-SAME-SECRET-AS-THE-EXTENSION
LICENSE_ALLOW_ORIGIN=
EOF
# 4) launch (Caddy fetches TLS certs automatically)
docker compose up -d --build
curl https://license.example.com/health      # -> {"ok":true}
```

## Option B: systemd + nginx

```bash
sudo useradd -r -s /usr/sbin/nologin tanoth
sudo mkdir -p /opt/tanoth-license /var/lib/tanoth-license
sudo cp license-server.mjs /opt/tanoth-license/
sudo chown -R tanoth:tanoth /var/lib/tanoth-license
echo 'LICENSE_SECRET=PUT-THE-SAME-SECRET' | sudo tee /etc/tanoth-license.env
sudo cp tanoth-license.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now tanoth-license
```
Then terminate TLS with nginx (or Caddy/Cloudflare) in front:
```nginx
server {
    listen 443 ssl;
    server_name license.example.com;
    # ssl_certificate ... (certbot)
    location / { proxy_pass http://127.0.0.1:8787; }
}
```

---

## Wire the extension to it

1. In `src/shared/payment.js` set:
   ```js
   export const LICENSE_SERVER_URL = 'https://license.example.com';
   ```
2. Add the origin to `manifest.json` `host_permissions`:
   ```json
   "https://license.example.com/*"
   ```
3. Rebuild the store zip (`bash tools/package.sh`) and re-publish.

With this set, **activation calls the server**: a key already bound to another
device returns `BOUND_ELSEWHERE` and the bot stays locked. If the server is
unreachable, activation fails closed (`SERVER_UNREACHABLE`) rather than granting
access.

## Env vars
| var | default | meaning |
| --- | --- | --- |
| `LICENSE_SECRET` | (placeholder) | HMAC secret - must match the extension |
| `PORT` | `8787` | listen port |
| `HOST` | `127.0.0.1` | bind address; Docker sets `0.0.0.0` (Caddy fronts it) |
| `LICENSE_DB` | `./bindings.json` | path to the bindings store (use a volume) |
| `LICENSE_ADMIN_TOKEN` | empty | enables `POST /unbind`; keep it long and private |
| `LICENSE_ALLOW_ORIGIN` | empty | optional CORS `Access-Control-Allow-Origin` |

## Unbinding a key (support)

Reinstalling the extension generates a new device id, so a bound key would be
rejected with `BOUND_ELSEWHERE`. To let a customer re-activate:

```bash
curl -X POST https://license.example.com/unbind \
  -H 'Content-Type: application/json' \
  -d '{"key":"TZ1.xxx.yyy","admin":"YOUR-LICENSE_ADMIN_TOKEN"}'
```

The next activation from any device re-binds the key.

## Backups
The whole state is `bindings.json` (`key -> {device, exp}`). Back it up; losing it
lets a key be re-bound to a new device.
