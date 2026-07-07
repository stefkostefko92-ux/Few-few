# Деплой на Мастилко (mastilko.carbonstealth.eu)

Мастилко се разгръща **автоматично** от `deploy/autodeploy.sh` в корена на
репото — същият поток като останалите продукти: качваш GitHub ZIP в `/root`
и пускаш скрипта. Този файл описва само **еднократната** настройка на сървъра
и какво прави автоматиката.

## Какво прави autodeploy.sh за mastilko (при всяко пускане)

1. Създава системен потребител `mastilko` (ако липсва) — `nologin`, без права.
2. Бекъп на `/opt/mastilko`, после `rsync` на новия код (пази `.env` и
   `.next/cache`).
3. `npm ci` (пълни зависимости — нужни за билда) → `npm run build` →
   `npm prune --omit=dev` (сваля дисковото до продукционното).
4. Инсталира/обновява systemd unit-а (`deploy/mastilko.service` →
   `/etc/systemd/system/mastilko.service`), `daemon-reload`, `enable`.
5. `systemctl restart mastilko` + health check на `http://127.0.0.1:3200/`.
   При провал: автоматичен rollback към предишния код и рестарт.

Портът е **3200** (127.0.0.1, само зад Nginx). Без `.env` сайтът работи
изцяло — само AI подсказките връщат любезно съобщение.

## Еднократна настройка (преди първия деплой)

```bash
# 1) DNS: A запис mastilko.carbonstealth.eu → IP на сървъра (в панела на DNS).

# 2) Nginx vhost + TLS
cp /opt/few-few/current/mastilko/deploy/nginx-mastilko.conf /etc/nginx/sites-available/mastilko
ln -sfn /etc/nginx/sites-available/mastilko /etc/nginx/sites-enabled/mastilko
nginx -t && systemctl reload nginx
certbot --nginx -d mastilko.carbonstealth.eu --redirect

# 3) Тайните (по желание — само за AI подсказките)
cat > /opt/mastilko/.env <<'EOF'
GEMINI_API_KEY=постави-ключа-тук
GEMINI_MODEL=gemini-2.5-flash
EOF
chmod 600 /opt/mastilko/.env && chown mastilko:mastilko /opt/mastilko/.env
systemctl restart mastilko
```

Ключ: https://aistudio.google.com/apikey (решение на собственика 2026-07:
безплатен tier — виж бележката в `mastilko/.env.example`).

## Проверка

```bash
systemctl status mastilko --no-pager
curl -I http://127.0.0.1:3200/            # 200 локално
curl -I https://mastilko.carbonstealth.eu # 200 през Nginx+TLS
journalctl -u mastilko -n 50 --no-pager   # логове при проблем
```

## Връщане назад (ръчно, ако някога потрябва)

autodeploy прави rollback сам при провален health check. Ръчно:

```bash
ls -d /opt/mastilko.bak-*                  # наличните бекъпи
systemctl stop mastilko
rsync -a --delete --exclude .env /opt/mastilko.bak-<TS>/ /opt/mastilko/
chown -R mastilko:mastilko /opt/mastilko
systemctl start mastilko
```
