# ERP Ascensori Enterprise

Gestionale completo per aziende di installazione e manutenzione ascensori.
Interfaccia interamente in **italiano**. Un prodotto **Carbon Stealth VCC**.

## Funzionalità

- **Impianti** — anagrafica completa (matricola, marca/modello, portata, fermate),
  allegati, scadenze di legge con avvisi automatici a 90/60/30 giorni, tecnici assegnati.
- **Anagrafiche** — condomìni, amministratori (dati fiscali per la fattura
  elettronica), dipendenti con specializzazioni, automezzi con stato a semaforo,
  cottimisti e squadre.
- **Magazzino** — articoli con soglia di riordino, movimenti tracciati
  (la giacenza non si tocca mai a mano), avvisi sotto scorta.
- **Ciclo attivo** — preventivi con voci e totali ricalcolati automaticamente,
  ordini di lavoro con workflow a 9 stati e transizioni controllate, storico completo.
- **Documentale** — fatture attive/passive, DDT (D.P.R. 472/1996), documenti di cantiere.
- **Dashboard personalizzabile** — widget con scelta di fonte dati, tipo di grafico
  (barre/linee/area/anello), colori validati per l'accessibilità, larghezza e ordine.
- **Sicurezza** — 7 livelli di accesso verificati dal server a ogni richiesta,
  blocco account dopo 5 tentativi, sessioni JWT + refresh token con rotazione,
  registro operazioni immutabile firmato HMAC-SHA256, rate limiting.

## Stack

Next.js 15 · React 19 · TypeScript strict · Prisma ORM · PostgreSQL 16 ·
Tailwind CSS · Zod · Recharts. Schema v3.0: 24 tabelle, 13 enumerazioni.

## Avvio rapido

```bash
cp .env.example .env       # compilare DATABASE_URL, SESSION_SECRET, AUDIT_HMAC_KEY
npm install
npx prisma db push
npm run db:seed            # dati dimostrativi in italiano
npm run dev
```

Accesso demo: `master@erp-ascensori.local` / `Ascensori!2026`
(un utente per ciascuno dei 7 livelli, stessa password).

## Qualità

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Automatismi

- Controllo scadenze (ogni 24 ore): `npm run scadenze:check` (cron) o
  `POST /api/scadenze/check` dall'interfaccia.
- Ricalcolo totali a ogni modifica delle voci; storico stati a ogni transizione;
  audit a ogni operazione — non disattivabili.
