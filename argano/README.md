# Argano — scelta e verifica dell'argano geared nella sostituzione

Software per installatori (B2B, Italia): verifica l'argano offerto per la sostituzione, oppure ne
propone uno, e produce la relazione di calcolo per il fascicolo tecnico. Profilo normativo
italiano: DPR 162/1999 e s.m.i., UNI EN 81-20:2020, UNI EN 81-50:2020, UNI 10411-1:2024.
Ricerca: `research/argano-geared/`.

## Stato

Fase 1 — motore di calcolo in TypeScript (`src/calc/`), identico numero per numero al
calcolatore prototipo pubblicato per Panev Ascensori (versione 12), con i test e il registro delle
voci normative. L'applicazione web (account, progetti, relazione di calcolo) è la fase successiva.

## Verifica normativa

`docs/lista-verifica-normativa.xlsx` (e `.md`) elenca ogni valore usato dal software con il
documento e la clausola da controllare. 27 voci vengono da fonti secondarie e vanno confrontate
con i testi vigenti; il risultato della verifica aggiorna il registro (`src/calc/norme.ts`) e con
esso motore, lista e relazione. Finché la lista non è firmata da un ingegnere, i risultati sono
indicativi.

## Comandi

```bash
npm install && npm run lint && npm run typecheck && npm test
npm run lista
```

Created and Designed by [Carbon Stealth VCC](https://carbonstealth.eu).
