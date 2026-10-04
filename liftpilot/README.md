# LiftPilot — scelta e verifica dell'argano geared nella sostituzione

Software per installatori (B2B, Italia): verifica l'argano offerto per la sostituzione, oppure ne
propone uno, e produce la relazione di calcolo per il fascicolo tecnico. Profilo normativo
italiano: DPR 162/1999 e s.m.i., UNI EN 81-20:2020, UNI EN 81-50:2020, UNI 10411-1:2024.
Ricerca: `research/argano-geared/`. Storia dello sviluppo, giro per giro: `CHANGELOG.md` (in bulgaro).

## Che cosa c'è

- **Motore di calcolo** (`src/calc/`): TypeScript puro, identico numero per numero al calcolatore
  prototipo pubblicato per Panev Ascensori (versione 12), con il registro delle voci normative.
- **Applicazione web** (Next.js 15): aziende e utenti con ruoli distinti (titolare, progettista, commerciale, tecnico), impianti, calcolatore con i
  risultati in tempo reale, calcoli salvati come snapshot immutabili con impronta SHA-256 (il server
  ricalcola sempre, non si fida del browser), visto interno dell'ingegnere, registro attività.
- **Relazione di calcolo in PDF** (in italiano) da ogni calcolo salvato: dati, verifiche con le
  clausole, tutti i casi di aderenza, tabelle di dettaglio, sensibilità, stato delle voci normative,
  avvertenza e spazio per la firma. Resta una bozza finché il tecnico incaricato non la firma.
- **Account senza amministratore:** l'azienda si registra da sola (il titolare conferma l'indirizzo con
  il link dell'e-mail e la sua password) e chi dimentica la password ne sceglie una nuova con un link.
  E-mail tramite Brevo; informativa privacy e condizioni d'uso in `/privacy`.
- Interfaccia in italiano, inglese e bulgaro; pagina pubblica senza indicizzazione fino
  all'approvazione. Indirizzo: https://liftpilot.carbonstealth.eu.

## Verifica normativa

`docs/lista-verifica-normativa.xlsx` (e `.md`) elenca ogni valore usato dal software con il
documento e la clausola da controllare. 27 voci vengono da fonti secondarie e vanno confrontate
con i testi vigenti; il risultato della verifica aggiorna il registro (`src/calc/norme.ts`) e con
esso motore, lista e relazione. Finché la lista non è firmata da un ingegnere, i risultati sono
indicativi.

## Comandi

```bash
npm install
npm run lint && npm run typecheck && npm test && npm run build
npm run dev                                   # sviluppo (serve un PostgreSQL e .env, vedi .env.example)
ADMIN_PASSWORD=… npm run admin:create         # amministratore della piattaforma
BASE_URL=… ADMIN_PASSWORD=… npm run smoke     # prova completa nel browser contro un'istanza avviata
                                              # (MAILBOX_PORT=…: anche registrazione e nuova password, vedi scripts/mail-sink.mjs)
python3 scripts/brand-assets.py              # logo, icone e anteprime social da brand/liftpilot-logo.webp
npm run lista                                 # lista di verifica dal registro
```

Pubblicazione sul server: `DEPLOY.md`.

Created and Designed by [Carbon Stealth VCC](https://carbonstealth.eu).
