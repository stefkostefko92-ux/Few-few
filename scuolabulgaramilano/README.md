# Qui Bulgaria — Scuola bulgara di Milano

Sito **multilingue** (🇮🇹 Italiano · 🇧🇬 Български · 🇬🇧 English) con **pannello di
amministrazione** per l'Associazione Qui Bulgaria — centro linguistico e culturale
che promuove lingua, cultura e danza tradizionale bulgara a Milano.

Costruito come applicazione **Next.js** full-stack, pensata per essere ospitata
su un **VPS** (es. Hetzner) con Docker. Nessun servizio esterno obbligatorio:
database **SQLite** su file e immagini salvate su disco.

## Funzionalità

- 🌍 **3 lingue con selezione automatica via IP**
  - IP italiani → Italiano · IP bulgari → Български · tutti gli altri → English
  - Rilevamento dal paese (header `X-Country` di nginx GeoIP / Cloudflare), con
    fallback su `Accept-Language`. Selettore manuale che ricorda la scelta.
- 🛠️ **Pannello admin professionale** (`/admin`)
  - Login con email + password (impostate da te)
  - Editor dei contenuti per ogni sezione, con schede IT / BG / EN
  - **Caricamento immagini** (drag & drop) con libreria media
  - Mostra/nascondi sezioni, gestione delle richieste dal modulo contatti
- 🎨 Design su misura: palette del logo, ricami tradizionali (*shevitsa*),
  animazioni, tipografia editoriale — totalmente responsive e accessibile.
- ⚡ SEO (metadati, `hreflang`, Open Graph, JSON-LD), PWA-ready, sicurezza
  (sessioni firmate, header di sicurezza, validazione upload).

## Stack

| Ambito | Scelta |
|--------|--------|
| Framework | Next.js 14 (App Router, output standalone) |
| Database | SQLite via Prisma (file su disco) |
| Auth | Sessione JWT firmata (`jose`) + bcrypt |
| Immagini | Disco locale + ottimizzazione `sharp` |
| Deploy | Docker / docker-compose dietro nginx |

## Avvio in locale

```bash
cp .env.example .env          # poi modifica i valori
npm install
npm run setup                 # crea il DB SQLite e i contenuti iniziali
npm run dev                   # http://localhost:3000
```

Genera l'hash della password admin:

```bash
npm run hash -- "la-tua-password"   # copia il risultato in ADMIN_PASSWORD_HASH
```

## Struttura

```
src/
  app/
    (site)/[locale]/      # sito pubblico, una lingua per URL (/it /bg /en)
    (admin)/admin/        # pannello di amministrazione
    api/                  # login, contatti, contenuti, media
    uploads/[...path]/    # serve le immagini caricate dal disco
  components/             # header, form, editor, media manager…
  lib/                    # i18n, geo, auth, db, contenuti, storage
prisma/schema.prisma      # modello dati (Content, Media, Lead…)
src/lib/defaults.ts       # contenuti iniziali nelle 3 lingue
```

## Deploy in produzione

Vedi **[DEPLOY.md](./DEPLOY.md)** per la guida passo-passo su Hetzner
(Docker, volume persistente, nginx + GeoIP per la lingua, HTTPS).

---

Creato e disegnato da **Carbon Stealth VCC** — <https://carbonstealth.eu>
