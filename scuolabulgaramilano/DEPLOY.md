# Deploy su VPS Hetzner

Guida per mettere online il sito con Docker, un volume persistente per
database e immagini, e nginx davanti per HTTPS e rilevamento della lingua via IP.

## 1. Prerequisiti sul server

```bash
# Ubuntu/Debian
apt update && apt install -y docker.io docker-compose-plugin nginx
systemctl enable --now docker
```

## 2. Codice + variabili d'ambiente

```bash
git clone <repo> /opt/scuolabulgaramilano
cd /opt/scuolabulgaramilano/scuolabulgaramilano
cp .env.example .env
```

Modifica `.env`:

```ini
ADMIN_EMAIL="tu@esempio.it"
ADMIN_PASSWORD_HASH="<output di:  docker run --rm node:20 npx -y bcryptjs ...>"
AUTH_SECRET="<openssl rand -base64 32>"
SITE_URL="https://www.scuolabulgaramilano.it"
```

Per l'hash della password (in locale dove hai le dipendenze):

```bash
npm run hash -- "la-tua-password-robusta"
```

## 3. Build & run con Docker

```bash
docker compose up -d --build
```

- L'app gira su `127.0.0.1:3000`.
- Lo schema del DB viene applicato all'avvio; i contenuti iniziali nelle 3
  lingue vengono creati automaticamente alla prima visita.
- Database e immagini sono salvati nel volume `qb-data` (persistono fra i deploy).

Aggiornamenti futuri:

```bash
git pull && docker compose up -d --build
```

## 4. nginx + lingua per IP (importante)

La selezione automatica della lingua usa il **paese** del visitatore. Il modo
consigliato su VPS è il modulo **GeoIP2** di nginx, che imposta l'header
`X-Country` letto dall'app.

```bash
apt install -y libnginx-mod-http-geoip2
mkdir -p /etc/nginx/geoip
# Scarica GeoLite2-Country.mmdb (account MaxMind gratuito) in /etc/nginx/geoip/
```

Aggiungi **dentro `http { }`** in `/etc/nginx/nginx.conf`:

```nginx
geoip2 /etc/nginx/geoip/GeoLite2-Country.mmdb {
    auto_reload 60m;
    $geoip2_country_code country iso_code;
}
```

Copia il server block di esempio e attivalo:

```bash
cp nginx/scuolabulgaramilano.conf /etc/nginx/sites-available/scuolabulgaramilano
ln -s /etc/nginx/sites-available/scuolabulgaramilano /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

> **Alternativa senza MaxMind:** metti **Cloudflare** (gratuito) davanti al
> dominio. Cloudflare invia `CF-IPCountry`, che l'app legge automaticamente —
> in quel caso puoi rimuovere la riga `proxy_set_header X-Country …`.
> Senza nessuno dei due, l'app ripiega sulla lingua del browser.

## 5. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d scuolabulgaramilano.it -d www.scuolabulgaramilano.it
```

## 6. Accesso all'amministrazione

`https://il-tuo-dominio/admin` → login con `ADMIN_EMAIL` e la password scelta.

Da lì puoi:
- modificare tutti i testi del sito nelle tre lingue,
- caricare e gestire le immagini,
- mostrare/nascondere sezioni,
- leggere le richieste inviate dal modulo contatti.

## Backup

Tutto lo stato sta nel volume `qb-data` (DB SQLite + immagini):

```bash
docker run --rm -v qb-data:/data -v $PWD:/backup alpine \
  tar czf /backup/qb-backup-$(date +%F).tar.gz -C /data .
```

## Note operative

- **Geo-test:** `curl -H "X-Country: BG" https://tuo-dominio/` → redirect a `/bg`.
- La lingua scelta manualmente è salvata nel cookie `qb_lang` e ha priorità sull'IP.
- Le immagini caricate sono servite da `/uploads/...` (puoi farle servire
  direttamente da nginx per più velocità — vedi il commento nel file di esempio).
