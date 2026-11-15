# Carbon Stealth — Operations & Live-Patch Runbook

> How the site is deployed on the production VPS, the traps we hit, and the
> **no-download live-patch** method to fix things directly in the server shell.
> Read this before touching the server. Everything here is battle-tested.

---

## 1. Architecture on the server

| Piece | Where | Notes |
|-------|-------|-------|
| Static site (SPA + all `/…/` pages) | `/var/www/carbonstealth.eu/` | Built from `public/` → `dist/` by `vite build`, then rsynced |
| PHP API | `/var/www/carbonstealth.eu/api/*.php` | 14 files; **must be deployed too** (see trap #3) |
| Web server | nginx, vhost `/etc/nginx/sites-available/carbonstealth.eu` (symlinked into `sites-enabled/`) | `root /var/www/carbonstealth.eu;` |
| PHP runtime | **PHP-FPM 8.5**, pool `www`, socket **`/run/php/php8.5-fpm.sock`** | pool config: `/etc/php/8.5/fpm/pool.d/www.conf` |
| Secrets | `api/smtp-local.php` (git-ignored, 0600) + FPM env | never in the repo |

The site is multi-tenant on this box (also `gaming.carbonstealth.eu` etc.), which is
why the generic `/run/php/php-fpm.sock` symlink points at the **wrong** pool — see trap #2.

---

## 2. Secrets & environment (must be set, never in git)

- **Admin token** — `CS_ADMIN_TOKEN` in the FPM pool. Same value you type in the admin
  panel and send as the `X-CS-Token` header.
  ```bash
  grep -n CS_ADMIN_TOKEN /etc/php/8.5/fpm/pool.d/www.conf     # find it
  # to set/rotate:
  TOK=$(openssl rand -hex 32)
  echo "env[CS_ADMIN_TOKEN] = $TOK" >> /etc/php/8.5/fpm/pool.d/www.conf
  systemctl restart php8.5-fpm.service
  ```
- **SMTP password** — only in `api/smtp-local.php` (see §5). Never commit it.

---

## 3. The four traps we hit (and the fix for each)

### Trap #1 — nginx serves 502 Bad Gateway
PHP-FPM is down or the socket is wrong. Restart the real service and confirm it's up:
```bash
FPM=$(systemctl list-units --type=service --all | grep -oE 'php[0-9.]*-fpm\.service' | head -1)
systemctl restart "$FPM"; systemctl is-active "$FPM"
```

### Trap #2 — `File not found.` / `Primary script unknown` (wrong FPM pool)
`/run/php/php-fpm.sock` is a Debian *alternatives* symlink that can resolve to a
**different** pool that cannot see our webroot. Point nginx at the real pool socket:
```bash
grep -E '^listen' /etc/php/8.5/fpm/pool.d/www.conf     # -> /run/php/php8.5-fpm.sock
sed -i 's#fastcgi_pass unix:[^;]*;#fastcgi_pass unix:/run/php/php8.5-fpm.sock;#' \
    /etc/nginx/sites-available/carbonstealth.eu
nginx -t && systemctl reload nginx
```

### Trap #2b — still `File not found.` with `alias` + nested location
With `location /api/ { alias …; location ~ \.php$ {…} }`, `$request_filename` can
resolve to the **directory**, not the file. Set `SCRIPT_FILENAME` explicitly:
```nginx
fastcgi_param SCRIPT_FILENAME /var/www/carbonstealth.eu$fastcgi_script_name;
```
(Already committed in `nginx/carbonstealth.conf`.)

### Trap #3 — API PHP files were never deployed
The original deploy copied only `dist/` (static). The whole `api/` was missing, so
every `/api/*.php` returned `File not found.` **Always deploy `api/*.php` too.**
Verify: `ls /var/www/carbonstealth.eu/api/monitor.php` should exist (~8.6 KB).

### Trap #4 — contact form returns `{"ok":true,"message":"logged"}`
`"logged"` = the message was saved to file but **not emailed** (all send attempts
failed). Diagnose with the CLI test in §5. Usually a bad Gmail App Password or a
blocked port.

---

## 4. The no-download live-patch method

Constraint we work under: **the user does not want to download an archive or rebuild.**
Everything is applied by pasting commands into the server shell. Techniques:

- **Replace a PHP file**: `echo "<BASE64>" | base64 -d > /var/www/carbonstealth.eu/api/<file>.php`
  (generate with `base64 -w0 api/<file>.php`). Guaranteed byte-exact, no quoting traps.
- **Deploy many files at once**: tar them, base64 the tar, paste a one-liner that
  extracts in place — **excluding** `smtp-local.php** so secrets are preserved:
  ```bash
  # build locally:
  tar czf - --exclude='smtp-local.php' -C api $(cd api && ls *.php) | base64 -w0
  # run on server:
  echo "<BASE64>" | base64 -d | tar xzf - -C /var/www/carbonstealth.eu/api/
  chown -R www-data:www-data /var/www/carbonstealth.eu/api
  ```
- **Patch static HTML in place**: a small idempotent `python3 - "$WEBROOT" <<'PY' … PY`
  that edits the deployed files (see `scripts/fix-analyzer-header.py` for the pattern).
- **Edit nginx**: targeted `sed -i` on the vhost, then always `nginx -t && systemctl reload nginx`.
- **Files sent via the chat do NOT land on the server.** Either the user pastes the
  script content into SSH, or (for big payloads) paste the inline `base64 | tar` one-liner.

**Golden rule:** everything you change on the server must ALSO be committed to the repo
(`nginx/carbonstealth.conf`, `api/*.php`, `public/**`) so the next full deploy keeps it.

---

## 5. Gmail SMTP (works without PHPMailer/composer)

`api/smtp-native.php` is a dependency-free SMTP client (SSL/465 or STARTTLS/587,
AUTH LOGIN, MIME). `contact.php` calls it (Attempt 1.5) before the Hetzner-blocked
`mail()`. Config lives in git-ignored `api/smtp-local.php`:
```php
<?php return array(
  'host'   => 'smtp.gmail.com',
  'port'   => 587,           // 465 if 587 is blocked (then 'secure' => 'ssl')
  'secure' => 'tls',
  'user'   => 'stefan.kostadinov16@gmail.com',
  'pass'   => 'APP_PASSWORD',  // 16-char Google App Password, NOT the normal password
  'to'     => 'stefan.kostadinov16@gmail.com',
);
```
Then `chmod 600` + `chown www-data:www-data` it. Gmail needs 2FA enabled and an
**App Password** (myaccount.google.com/apppasswords). Test send from CLI:
```bash
cd /var/www/carbonstealth.eu/api
php -r 'require "config.php";require "smtp-native.php";$e="";
$ok=cs_smtp_send(["host"=>SMTP_HOST,"port"=>SMTP_PORT,"secure"=>SMTP_SECURE,"user"=>SMTP_USER,
"pass"=>SMTP_PASS,"from"=>SMTP_FROM,"from_name"=>SMTP_FROM_NAME,"to"=>SMTP_TO,
"subject"=>"CS test","html"=>"<b>ok</b>","text"=>"ok"],$e);echo $ok?"SENT OK\n":"FAIL: $e\n";'
```
`FAIL: connect failed` → switch to 465/ssl. `FAIL: AUTH pass: 535` → wrong App Password.

---

## 6. Full clean deploy (when not live-patching)

```bash
# locally
npm install && npx vite build && python3 scripts/inject-widgets.py

# package (dist + api + nginx), see deploy.sh which expects /root/cs-revolution-vps.tar.gz
tar czf cs-revolution-vps.tar.gz --exclude='api/smtp-local.php' --exclude='api/logs/*' \
    cs-revolution/dist cs-revolution/api cs-revolution/nginx cs-revolution/deploy.sh

# on server
bash /root/cs-revolution/deploy.sh   # rsyncs dist, copies api/*.php, installs nginx, verifies
```
`deploy.sh` preserves `api/logs/` and does **not** touch `smtp-local.php`.

---

## 7. Post-change verification checklist

```bash
# API alive (real server stats)
curl -s -H "X-CS-Token: <TOKEN>" https://carbonstealth.eu/api/monitor.php | head -c 120
# contact form
curl -s -X POST https://carbonstealth.eu/api/contact.php -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"you@example.com","message":"ping","lang":"it","_gotcha":""}'
# IndexNow bulk (admin only) — from the panel: INDEXNOW → Submit All
# analyzer header parity — open /test/ and compare with the homepage nav
```
Expected: `monitor.php` → `{"ok":true,…}`, contact → `{"ok":true,"message":"sent"}`
(`"logged"` means email did not send — see trap #4).

---

## 8. Known-good facts (this box)

- PHP-FPM: **8.5**, socket `/run/php/php8.5-fpm.sock`, pool `www.conf`.
- Webroot: `/var/www/carbonstealth.eu`, nginx `root` points here.
- API: 14 `*.php` files in `api/` + `logs/` + `smtp-local.php`.
- Hetzner blocks outbound **port 25** → use authenticated 587/465 SMTP.
- Multi-site box → never trust `/run/php/php-fpm.sock`; use the versioned socket.
