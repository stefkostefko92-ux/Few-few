# 🛗 Panev Ascensori — Sito Web + E-commerce (v2.0)

Sito istituzionale + negozio online per **Panev Ascensori SAS**, produttore italiano di staffe brevettate UIBM N. 202023000002112 per porte di ascensori e montacarichi.

**v2.0 breaking changes rispetto alla v1**:
- ✅ Admin panel ora **server-side** (JWT httpOnly cookie + bcrypt) — niente più bypass via DevTools
- ✅ Dati persistenti in **SQLite** — niente più `localStorage` per prodotti/ordini/messaggi
- ✅ CRUD completa via REST API autenticata
- ✅ Stripe webhook salva gli ordini direttamente sul server (idempotente)
- ✅ Fix critico: syntax error JS nella homepage
- ✅ UI carrello: "Richiedi Preventivo" invece di "Paga" (allineata al flow B2B)

---

## 📁 Struttura

```
panevascensori/
├── server.js               ← Express + API + Stripe
├── package.json
├── .env.example            ← Variabili d'ambiente
├── lib/
│   ├── db.js               ← Schema + prepared statements (SQLite)
│   └── auth.js             ← JWT + bcrypt + brute-force DB-persisted
├── scripts/
│   └── seed.js             ← Crea admin + 27 prodotti seed
├── data/                   ← SQLite DB (.db) — NON committare
├── index.html              ← Homepage
├── brevetto.html           ← Pagina brevetto UIBM
├── catalogo.html           ← Catalogo tecnico + PDF
├── servizi.html            ← Installazione / manutenzione
├── prodotti.html           ← Shop (27 staffe)
├── chi-siamo.html
├── contatti.html           ← Form contatto → /api/contact
├── carrello.html           ← Quote request → /api/contact
├── success.html
├── privacy.html / cookie.html / termini.html
├── css/
│   ├── style.css           ← Design system pubblico
│   └── admin.css
├── js/
│   ├── app.js              ← Cart (localStorage) + Products (API cache)
│   ├── admin.js            ← Tutto via API, JWT cookie
│   ├── cookies.js          ← Consenso GDPR
│   └── ga4.js              ← GA4 config
├── admin/
│   ├── login.html          ← POST /api/admin/login
│   ├── index.html          ← Dashboard
│   ├── prodotti.html       ← CRUD prodotti via API
│   ├── ordini.html         ← CRUD ordini via API
│   ├── messaggi.html       ← CRUD messaggi via API
│   └── impostazioni.html   ← Cambio password, backup
├── img/                    ← 80+ immagini prodotti + OG
├── favicon.ico
├── robots.txt
├── sitemap.xml
├── security.txt
└── llms.txt
```

---

## 🚀 Deploy (zero-config, una linea)

### Su VPS vergine (Ubuntu 22.04 / 24.04)

```bash
# 1. Copia lo zip e estrai
scp panevascensori_v2.zip root@178.104.77.242:/var/www/
ssh root@178.104.77.242 "cd /var/www && unzip -o panevascensori_v2.zip"

# 2. SSH e lancia il bootstrap (UN comando — fa TUTTO)
ssh root@178.104.77.242
cd /var/www/panevascensori
bash scripts/bootstrap-vps.sh
```

Il bootstrap installa automaticamente: **Node.js 20, PM2, Nginx, Certbot, UFW**, genera un JWT_SECRET casuale, crea il `.env`, seed del database, configura reverse proxy e SSL Let's Encrypt, apre le porte firewall.

Alla fine avrai il sito live su **https://www.panevascensori.it** senza aver toccato nessun file di configurazione.

### Re-deploy dopo modifiche

```bash
cd /var/www/panevascensori
bash deploy.sh    # (o: bash scripts/deploy.sh)
```

---

## 🚀 Avvio locale (sviluppo)

### Prerequisiti
- Node.js ≥ 18 (testato su 20)
- Account Stripe (opzionale — senza Stripe, il modulo pagamento è disabilitato e funziona solo il flow preventivi)

### 1. Install + configurazione
```bash
npm install
cp .env.example .env

# Genera un JWT_SECRET forte:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copia l'output in JWT_SECRET dentro .env
```

### 2. Seed iniziale (solo la prima volta)
```bash
npm run db:seed
```
Questo crea:
- Admin `info@panevascensori.it` / `<impostare ADMIN_PASSWORD>` (**da cambiare al primo login**)
- 27 staffe seed (10 brevettate + 17 contrapeso)

### 3. Avvia il server
```bash
# Produzione
npm start

# Sviluppo (auto-reload)
npm run dev
```

Il sito è disponibile su **http://localhost:3000** (o sulla `PORT` configurata in `.env`).

---

## 🌐 Deploy in produzione (VPS 178.104.77.242 Hetzner)

### Porta suggerita
Usare **porta 4102** (libera nella mappa porte Carbon Stealth):
```
PORT=4102
BASE_URL=https://www.panevascensori.it
NODE_ENV=production
```

### PM2
```bash
# Come utente (non root):
cd /var/www/panevascensori
npm install --omit=dev
cp .env.example .env
nano .env                         # configura JWT_SECRET, STRIPE_*, etc.
npm run db:seed                   # seed iniziale
pm2 start server.js --name panev-web
pm2 save
pm2 startup
```

### Nginx (reverse proxy + SSL con Certbot)
```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name panevascensori.it www.panevascensori.it;

    ssl_certificate     /etc/letsencrypt/live/panevascensori.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panevascensori.it/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 2M;

    # Webhook Stripe ha bisogno del raw body — non bufferizzare
    location = /api/webhook {
        proxy_pass http://127.0.0.1:4102;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Admin: extra protezioni a livello Nginx (opzionale)
    location /admin/ {
        proxy_pass http://127.0.0.1:4102;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        # HSTS + noindex a livello proxy
        add_header X-Robots-Tag "noindex, nofollow" always;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    location / {
        proxy_pass http://127.0.0.1:4102;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection '';
    }
}

# HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name panevascensori.it www.panevascensori.it;
    return 301 https://www.panevascensori.it$request_uri;
}
```

### Certbot
```bash
certbot --nginx -d panevascensori.it -d www.panevascensori.it
```

---

## 💳 Stripe

### Modalità test
`sk_test_...` / `pk_test_...` — usa la carta `4242 4242 4242 4242`, qualunque data futura, qualunque CVC.

### Webhook produzione
Dashboard Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://www.panevascensori.it/api/webhook`
- Eventi: `checkout.session.completed`, `payment_intent.payment_failed`
- Copia il `whsec_...` in `STRIPE_WEBHOOK_SECRET` nel `.env`

### Nota sul flusso attuale
Il carrello attualmente invia **richieste di preventivo** (B2B-friendly per staffe). L'integrazione Stripe è pronta lato server (`/api/create-checkout-session` + webhook idempotente che salva l'ordine) ma il bottone nel carrello è configurato per il preventivo. Per attivare il pagamento diretto, modificare `carrello.html` nel `startQuoteRequest()` e sostituire la chiamata `/api/contact` con `/api/create-checkout-session`.

---

## 🔐 Pannello Admin

- **URL:** `https://www.panevascensori.it/admin/login.html`
- **Email:** `info@panevascensori.it`
- **Password default:** `<impostare ADMIN_PASSWORD>` — **cambiarla dal primo accesso** (Impostazioni → Cambia Password)

Protezioni attive:
- bcrypt 12 round per password
- JWT httpOnly cookie (SameSite=lax, Secure in prod)
- Brute-force: 5 tentativi, poi lock 15 min per IP (persistito in DB)
- Auto-logout dopo 30 min di inattività (client-side reset timer)
- Admin password non è mai nel localStorage, non è base64 — è bcrypt hash

---

## 📦 API Reference (sintesi)

Tutti gli endpoint sotto `/api/admin/*` richiedono JWT cookie (ottenuto via `POST /api/admin/login`).

### Pubblici
| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/api/products` | Lista prodotti disponibili |
| GET | `/api/products/:id` | Singolo prodotto |
| POST | `/api/contact` | Form contatto / richiesta preventivo |
| POST | `/api/create-checkout-session` | Avvia checkout Stripe |
| GET | `/api/session-status?session_id=...` | Verifica stato pagamento |
| POST | `/api/webhook` | Webhook Stripe (raw body) |

### Admin
| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/api/admin/login` | Login (email + password) |
| POST | `/api/admin/logout` | Logout |
| GET | `/api/admin/me` | Info sessione corrente |
| POST | `/api/admin/password` | Cambio password |
| GET / POST / PUT / DELETE | `/api/admin/products[/:id]` | CRUD prodotti |
| GET / PUT / DELETE | `/api/admin/orders[/:id]` | Gestione ordini |
| GET / PUT / DELETE | `/api/admin/messages[/:id]` | Gestione messaggi |
| GET | `/api/admin/backup` | Dump completo in JSON |
| GET | `/api/admin/stats` | Statistiche aggregate |

---

## 🧪 Test rapido post-deploy

```bash
# Health check
curl https://www.panevascensori.it/api/products | jq '.count'
# Deve restituire 27

# Login
curl -c /tmp/cookies -X POST https://www.panevascensori.it/api/admin/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"info@panevascensori.it","password":"<impostare ADMIN_PASSWORD>"}'
# Deve restituire {"ok":true,"user":{...}}

# Admin area
curl -b /tmp/cookies https://www.panevascensori.it/api/admin/me
```

---

## 📞 Supporto tecnico

- Sviluppatore: **Carbon Stealth VCC** — info@carbonstealth.eu
- Sito cliente: **Panev Ascensori SAS** — info@panevascensori.it
