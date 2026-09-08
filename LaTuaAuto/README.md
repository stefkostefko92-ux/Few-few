# LaTuaAuto

Chat civile con il proprietario di un'auto tramite **targa** (senza telefono,
senza GPS) + **scadenze auto** italiane che si compilano da sole: revisione,
RCA, bollo regionale, gomme invernali, patente, multe (−30% entro 5 giorni,
ricorso 30/60 giorni).

Adattamento per il mercato italiano del modello KolataTi (BG). Ricerca,
analisi legale e roadmap: [`research/targa-italia/README.md`](../research/targa-italia/README.md).

## Sviluppo

```bash
npm install
cp .env.example .env   # compila DATABASE_URL, SESSION_SECRET, PLATE_PEPPER
npm run dev            # http://localhost:3000 → redirect alla lingua del browser
```

Quality gate: `npm run lint && npm run typecheck && npm test && npm run build`.

## Stato

- ✅ Sito pubblico it/en/de: home, come funziona, sicurezza, calcolatore scadenze
  (client-side, nulla viene salvato), FAQ (FAQPage JSON-LD), contatti, privacy/
  termini/cookie (bozze in revisione legale).
- ✅ Dominio testato: targhe italiane, revisione, gomme, patente, multa.
- ✅ Schema Prisma completo (verifica possesso, chat a template, DSA, promemoria).
- ⏳ Auth, garage, chat, push, OCR libretto — prossime fasi (vedi `CLAUDE.md`).

Created and Designed by [Carbon Stealth VCC](https://carbonstealth.eu).
