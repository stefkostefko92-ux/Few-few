# Server hardening — brute-force defence

Three layers guard the admin gate. Two are already in the repo and deploy with
the site; the third (this directory) needs root on the box, once.

| Layer | Where | What it does |
|-------|-------|--------------|
| 1. Application | `api/_auth.php` | Per-IP progressive lockout (5 tries → 60 s → 5 min → 30 min → 24 h), a global slow-mode when >100 failures land across all IPs in 10 min, and a 300–500 ms floor on every failure. Ships with the site. |
| 2. Web server | `nginx/carbonstealth.conf` | `limit_req` on the admin endpoints so floods never reach PHP-FPM. Needs the zones below defined once in `nginx.conf`. |
| 3. Firewall | this directory | fail2ban reads the auth-failure log and bans the source IP at the packet level. |

## 1. nginx rate-limit zones (one time)

`limit_req zone=…` only works if the zone is declared in the **http** block.
Add to `/etc/nginx/nginx.conf` inside `http { … }`:

```nginx
# Site-wide budget (the vhost already references cs_limit)
limit_req_zone $binary_remote_addr zone=cs_limit:10m rate=20r/s;
# Admin/API budget — deliberately small; humans never need more
limit_req_zone $binary_remote_addr zone=cs_api:10m rate=1r/s;
# Cap concurrent connections per IP as well
limit_conn_zone $binary_remote_addr zone=cs_conn:10m;
```

Then:

```bash
nginx -t && systemctl reload nginx
```

## 2. fail2ban (one time)

```bash
apt-get update && apt-get install -y fail2ban
cp deploy/security/fail2ban-carbonstealth.conf /etc/fail2ban/filter.d/carbonstealth-auth.conf
cp deploy/security/fail2ban-jail.local        /etc/fail2ban/jail.d/carbonstealth.local
systemctl enable --now fail2ban
fail2ban-client status carbonstealth-auth      # verify the jail is up
```

The jail watches `auth_failures.log`, written by `api/_auth.php`. Confirm the
path matches your `CS_LOG_DIR` (default `/var/www/carbonstealth.eu/api/logs`).

## 3. Log rotation

The failure log holds raw IPs — keep it short-lived (security legitimate
interest, not indefinite retention):

```bash
cp deploy/security/logrotate-carbonstealth /etc/logrotate.d/carbonstealth
logrotate -d /etc/logrotate.d/carbonstealth    # dry run
```

## Verify it actually works

```bash
# 6 bad tokens in a row: the 6th must return 429, not 401
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code} " -H "X-CS-Token: wrong-$i" \
    https://carbonstealth.eu/api/monitor.php
done; echo
# expect: 401 401 401 401 401 429

# the real token still works (and clears the counter)
curl -s -H "X-CS-Token: $CS_ADMIN_TOKEN" https://carbonstealth.eu/api/monitor.php | head -c 60
```

If a legitimate admin ever locks themselves out:

```bash
fail2ban-client set carbonstealth-auth unbanip <IP>
rm -f /var/www/carbonstealth.eu/api/logs/auth_throttle.json   # clears app-level lockouts
```
