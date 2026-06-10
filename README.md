# ERP Ascensori Enterprise

Gestionale completo per aziende di manutenzione e installazione impianti elevatori: impianti, **contratti di manutenzione**, **visite programmate e verifiche periodiche DPR 162/99**, condomini, amministratori, dipendenti, automezzi, cottimisti, magazzino, preventivi, programma lavori, ordini di lavoro, buoni di lavoro, fatturazione, DDT, documenti, audit log e assistente AI.

**Conformità DPR 162/99:** registro contratti con periodicità visite (minimo 2/anno), giri di manutenzione programmata con esiti e anomalie, registro delle verifiche biennali dell'Organismo Abilitato con prescrizioni — tutto integrato nello scadenzario automatico (alert a 90/60/30 giorni).

**Stack:** React 18 + Vite + Tailwind (frontend) · Node.js + Express + Prisma + PostgreSQL + Redis + Socket.IO (backend) · Docker Compose (deploy)

---

## ✨ AI: lettura documenti e compilazione automatica (GRATIS con Gemini)

Il sistema usa **Google Gemini** (piano gratuito) per:

- 📄 **Compila da documento** — in ogni modulo (impianti, condomini, fatture, buoni di lavoro…) carichi un **PDF, una foto o un CSV** e l'AI legge il documento e compila automaticamente i campi del form.
- ✍️ **Generazione testi** — descrizioni tecniche, testi preventivi, cartelli fuori servizio, verbali di cantiere (pagina "AI Assistant").

### Come ottenere la API key gratuita (1 minuto, nessuna carta di credito)

1. Vai su **<https://aistudio.google.com/apikey>**
2. Accedi con un account Google e clicca **"Create API key"**
3. Copia la key (inizia con `AIzaSy...`)
4. Nel gestionale: **Impostazioni → Configurazione AI → Google Gemini API Key** → incolla e **Salva**
5. Clicca **"Testa AI"** per verificare

In alternativa, sul server imposta nel file `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash   # opzionale
```

> Supportati anche Anthropic Claude (`ANTHROPIC_API_KEY`) e OpenAI GPT-4o (`OPENAI_API_KEY`, senza lettura PDF). Gemini è il default perché il piano free copre lettura PDF/immagini e generazione testi.

**Formati supportati per la lettura documenti:** PDF, PNG, JPG, WEBP, GIF, CSV, TXT, JSON, Markdown (max 14 MB).

---

## 🚀 Avvio rapido con Docker

```bash
cp .env.example .env        # poi modifica le password/chiavi
docker compose up -d --build
```

| Servizio  | URL                          |
|-----------|------------------------------|
| Frontend  | http://localhost:3100        |
| API       | http://localhost:4100/api    |
| Postgres  | localhost:5434               |
| Redis     | localhost:6380               |

Al primo avvio il database viene migrato e popolato automaticamente con dati demo.

**Credenziali demo:**

| Ruolo   | Email                       | Password    |
|---------|-----------------------------|-------------|
| MASTER  | admin@erp-ascensori.it      | admin2025   |
| TECNICO | tecnico@erp-ascensori.it    | tecnico2025 |

---

## 🛠 Sviluppo locale

Prerequisiti: Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
# Backend
cd backend
npm install
export DATABASE_URL="postgresql://erp_admin:password@localhost:5432/erp_ascensori"
npx prisma migrate deploy
npx tsx src/seed.ts          # dati demo (salta se il DB è già popolato)
npm run dev                  # API su http://localhost:4000

# Frontend (altro terminale)
cd frontend
npm install
npm run dev                  # http://localhost:3000 (proxy /api → :4000)
```

---

## 📁 Struttura

```
backend/
  prisma/            # schema + migrazioni PostgreSQL
  src/
    routes/ai.ts     # Gemini/Claude/GPT: generate, chat, extract (lettura documenti)
    routes/...       # auth, crud, dashboard, ordini, magazzino
    services/        # pdf, email, fatturaPA, scadenze, audit
frontend/
  src/App.jsx        # SPA completa (moduli CRUD, AI auto-fill, impostazioni)
nginx/               # config reverse-proxy per VPS
scripts/             # deploy, backup, restore
docker-compose.yml
```

## 🔌 API AI

| Endpoint              | Descrizione                                                        |
|-----------------------|--------------------------------------------------------------------|
| `POST /api/ai/extract`| Legge un documento (base64) ed estrae i campi richiesti in JSON    |
| `POST /api/ai/generate`| Genera un testo professionale dal prompt                          |
| `POST /api/ai/chat`   | Chat multi-turno con l'assistente                                  |
| `GET /api/ai/config`  | Stato configurazione provider                                      |
| `POST /api/ai/save-config` | Aggiorna provider/chiavi a runtime (solo ADMIN)              |

## ⚙️ Variabili d'ambiente principali

| Variabile           | Default            | Note                                        |
|---------------------|--------------------|---------------------------------------------|
| `AI_PROVIDER`       | `gemini`           | `gemini` \| `anthropic` \| `openai`         |
| `GEMINI_API_KEY`    | —                  | Key gratuita da aistudio.google.com/apikey  |
| `GEMINI_MODEL`      | `gemini-2.5-flash` | Modello Gemini                              |
| `DATABASE_URL`      | —                  | PostgreSQL                                  |
| `JWT_SECRET`        | —                  | Cambiare in produzione!                     |
| `SMTP_*`            | —                  | Invio email (opzionale)                     |

Vedi `.env.example` per l'elenco completo.

---

## ✅ Launch checklist

Prima di andare in produzione:

1. `cp .env.example .env` e compila: `JWT_SECRET`/`JWT_REFRESH_SECRET`/`HMAC_SECRET` (casuali!), `DB_PASSWORD`, `GEMINI_API_KEY`, `AZIENDA_*`, `SMTP_*` — oppure usa `scripts/deploy-vps.sh` che genera i segreti e la password admin automaticamente
2. In produzione il server **rifiuta di partire** con segreti JWT deboli o mancanti
3. Il ruolo CLIENTE non può accedere (login e refresh rifiutati)
4. Backup giornalieri automatici in `./backups/` (rotazione 14); ripristino con `scripts/restore.sh`
5. Verifica post-deploy: login admin → Impostazioni → Configurazione AI → "Testa AI"

Verificato end-to-end (suite da 56 controlli): autenticazione e lockout brute-force, matrice permessi su CRUD/PDF/email/workflow per ogni ruolo, cicli contratto→visite→fattura e segnalazione→ordine→chiusura, transizioni stato ordini, upload con whitelist, generazione PDF (fattura/preventivo/rendiconto), FatturaPA, scadenzario.
