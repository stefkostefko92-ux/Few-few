# Deploy su VPS Hetzner

Guida per mettere online il sito con Docker, un volume persistente per
database e immagini, e nginx davanti per HTTPS e rilevamento della lingua via IP.

## 1. Prerequisiti sul server

```bash
# Ubuntu/Debian
apt update && apt install -y docker.io docker-compose-plugin nginx
systemctl enable --now docker
```

## 2. Deploy in un comando (consigliato)

```bash
git clone <repo> /opt/scuolabulgaramilano
cd /opt/scuolabulgaramilano/scuolabulgaramilano
./deploy.sh
```

Lo script:

- chiede **email** e **password** dell'amministratore (solo la prima volta),
- genera e salva automaticamente `AUTH_SECRET` (e converte la password in hash bcrypt all'avvio),
- crea il file `.env` (permessi 600), poi esegue `docker compose up -d --build`,
- applica lo schema del DB; i contenuti iniziali nelle 3 lingue sono creati alla prima visita.

Database e immagini sono salvati nel volume `qb-data` e persistono fra i deploy.

**Modalità non interattiva** (es. in uno script):

```bash
ADMIN_EMAIL="tu@esempio.it" ADMIN_PASSWORD="password-robusta" \
SITE_URL="https://www.scuolabulgaramilano.it" ./deploy.sh
```

Aggiornamenti futuri:

```bash
git pull && ./deploy.sh
```

## 3. Build & run manuale (alternativa)

```bash
cp .env.example .env   # imposta ADMIN_EMAIL e ADMIN_PASSWORD
docker compose up -d --build
```

> Suggerimento sicurezza: se preferisci non tenere la password in chiaro nel
> file `.env`, genera un hash con `npm run hash -- "password"` e impostalo in
> `ADMIN_PASSWORD_HASH` (lasciando vuoto `ADMIN_PASSWORD`).

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

## 5b. Notifiche email (facoltativo)

Per ricevere un'email a ogni richiesta dal modulo di contatto, imposta le
variabili SMTP nel file `.env` (es. con un account dedicato o un servizio come
Brevo/Mailgun):

```ini
SMTP_HOST="smtp.tuoprovider.it"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="sito@scuolabulgaramilano.it"
LEADS_NOTIFY_TO="centroquibulgaria@gmail.com"
```

Se le lasci vuote, le richieste restano comunque consultabili nel pannello
admin (sezione “Запитвания”).

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
