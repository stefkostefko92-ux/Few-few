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
- **Documentale** — fatture attive/passive, DDT completi dei requisiti dell'art. 1,
  comma 3, D.P.R. 472/1996 (data e **ora di inizio del trasporto** compresa, con
  controllo dei requisiti mancanti a video), documenti di cantiere.
- **Avvisi di scadenza per e-mail** — il controllo notturno mette in coda un
  messaggio per ogni soglia raggiunta (impianti a 90/60/30 giorni, automezzi in
  rosso, fatture scadute, preventivi decaduti); un automatismo separato lo invia.
  Nel messaggio finiscono matricola, tipo di scadenza, data e un collegamento —
  mai nomi di persone né importi. Funzione facoltativa: senza server di posta
  configurato la coda resta piena e nulla va perso.
- **Assistenza di un modello linguistico** (facoltativa, chiave del Cliente) —
  legge un documento e propone i valori dei campi, oppure riformula gli appunti
  del tecnico in una descrizione di preventivo o in un riepilogo per il cliente.
  Sempre una **proposta**, modificabile, che una persona conferma.
- **Dashboard personalizzabile** — widget con scelta di fonte dati, tipo di grafico
  (barre/linee/area/anello), colori validati per l'accessibilità, larghezza e ordine.
- **Sicurezza** — 7 livelli di accesso verificati dal server a ogni richiesta,
  blocco account dopo 5 tentativi, sessioni JWT + refresh token con rotazione,
  registro operazioni immutabile firmato HMAC-SHA256, rate limiting.

## Stack

Next.js 15 · React 19 · TypeScript strict · Prisma ORM · PostgreSQL 16 ·
Tailwind CSS · Zod · Recharts. Schema: 40 tabelle, 26 enumerazioni.

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
- Invio degli avvisi (ogni 15 minuti): `npm run notifiche`. Separato dal controllo
  perché un server di posta non raggiungibile non deve far fallire l'aggiornamento
  delle scadenze.
- Consegna dei webhook (ogni 5 minuti): `npm run webhook`.
- Ricalcolo totali a ogni modifica delle voci; storico stati a ogni transizione;
  audit a ogni operazione — non disattivabili.
