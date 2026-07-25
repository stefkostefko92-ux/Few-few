# Scheda tecnica dei controlli — ERP Ascensori Enterprise

**Allegato al contratto di fornitura · versione 1.0 · 25 luglio 2026**
Carbon Stealth VCC — *fornitore del software*

---

## A cosa serve questo documento

Il gestionale registra **chi ha fatto cosa e quando**. In Italia questo tocca
l'art. 4 dello Statuto dei lavoratori (L. 300/1970) e il GDPR. Gli adempimenti
sono **del datore di lavoro** (il Cliente, titolare del trattamento); il
fornitore ha l'obbligo di assistenza previsto dall'art. 28(3)(f) GDPR.

Questo documento è quell'assistenza: descrive esattamente cosa il software
registra, cosa **non** registra, chi può leggerlo e per quanto tempo. Serve al
Cliente per:

- l'accordo sindacale con RSA/RSU o l'istanza all'Ispettorato territoriale del
  lavoro (art. 4, comma 1);
- l'informativa preventiva ai lavoratori (art. 4, comma 3) — **senza la quale i
  dati raccolti non sono utilizzabili a nessun fine connesso al rapporto di
  lavoro**, quindi nemmeno come prova;
- l'informativa sui sistemi automatizzati (art. 1-bis D.Lgs. 152/1997, come
  introdotto dall'art. 4 D.Lgs. 104/2022);
- la valutazione d'impatto (DPIA) ai sensi dell'art. 35 GDPR, richiesta
  dall'Allegato 1 al Provv. Garante n. 467 dell'11 ottobre 2018, punto 5.

---

## 1. Cosa viene registrato

### 1.1 Registro delle operazioni (`audit_log`)

Ogni operazione produce **una** riga con questi campi e nessun altro:

| Campo | Contenuto |
|---|---|
| `azione` | uno tra: `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `STATE_CHANGE`, `IMPORT` |
| `entita` | la tabella interessata (es. `impianti`, `fatture`) |
| `entitaId` | l'identificativo del record |
| `dettagli` | **i nomi dei campi modificati, non i valori** (vedi 1.2) |
| `utenteId` | l'utente che ha eseguito l'operazione |
| `tenantId` | l'azienda a cui appartengono i dati |
| `ip`, `userAgent` | **solo per `LOGIN` e `LOGOUT`**; `null` per tutto il resto |
| `createdAt` | data e ora |
| `hmac` | firma crittografica della riga |

### 1.2 Minimizzazione: i valori non vengono conservati

Per un'operazione di modifica il registro conserva **l'elenco dei campi
cambiati**, non il loro contenuto. Fanno eccezione pochi campi di stato tecnico
(`stato`, `ruolo`, `attivo`, `priorita`, `tipo`, `piano`), il cui valore è
necessario per ricostruire il flusso di lavoro.

Non entrano **mai** nel registro: password (nemmeno cifrate), token di sessione,
chiavi crittografiche.

### 1.3 Indirizzo IP

L'IP e il browser sono registrati **soltanto** all'accesso e all'uscita, come
misura di sicurezza. Per un'operazione di lavoro (“chi ha cambiato lo stato
dell'ordine 4711”) l'indirizzo di rete non aggiunge nulla e trasformerebbe il
registro operativo in un registro di presenza.

### 1.4 Dati di attività riconducibili al singolo lavoratore

Oltre al registro, questi dati permettono di ricostruire l'attività:

| Dove | Cosa |
|---|---|
| `assegnazioni_tecnici` | tecnico assegnato a un impianto, periodo |
| `ordini_lavoro` | `dataInizio` / `dataFine` effettivi, tecnico, squadra |
| `storico_stati` | ogni passaggio di stato, con autore e istante |

---

## 2. Cosa NON viene registrato

Dichiarazione esplicita, verificabile nel codice sorgente:

- **Nessuna geolocalizzazione.** Il software non raccoglie né elabora posizioni
  GPS, di alcun dispositivo.
- **Nessun controllo della postazione.** Nessuno screenshot, nessun keylogging,
  nessun monitoraggio di applicazioni o siti visitati, nessun accesso a webcam,
  microfono, rubrica o file del dispositivo.
- **Nessuna misurazione della produttività.** Il software non calcola indici di
  rendimento, non classifica i lavoratori, non produce graduatorie.
- **Nessuna decisione automatizzata** ai sensi dell'art. 22 GDPR. Nessuna
  decisione che riguardi il lavoratore viene presa dal sistema.
- **Nessuna intelligenza artificiale.** Il prodotto non contiene modelli di IA e
  non invia dati a servizi di IA.
- **Nessun trasferimento fuori dall'Unione europea.** L'installazione è su
  server nell'UE; alla data di questo documento non sono presenti
  sub-responsabili esterni oltre all'hosting.

---

## 3. Chi può leggere il registro

L'accesso è verificato **dal server a ogni richiesta**; nascondere un pulsante
nell'interfaccia non è una misura di sicurezza e non viene considerato tale.

| Livello | Accesso al registro |
|---|---|
| `MASTER` (fornitore) | tutte le aziende dell'installazione |
| `ADMIN` | solo la propria azienda |
| `DIREZIONE` e inferiori | **nessun accesso** |

Il registro è in **sola lettura**: non esiste alcuna funzione — di interfaccia o
di API — per modificarne o cancellarne una riga. L'unico modo in cui una riga
esce dal registro è la cancellazione automatica per scadenza dei termini (§ 4).

### 3.1 Integrità dimostrabile

Ogni riga è firmata con HMAC-SHA256. Una modifica effettuata direttamente sul
database rende la firma non valida e quindi **dimostrabile**. La verifica si
esegue dall'interfaccia (`Registro operazioni → Verifica integrità`).

Questa proprietà protegge anche il lavoratore: il registro non può essere
alterato a posteriori a suo danno senza che l'alterazione risulti.

---

## 4. Per quanto tempo

| Dato | Conservazione | Base |
|---|---|---|
| Accessi (`LOGIN`, `LOGOUT`) | 6 mesi | Provv. Garante 27 novembre 2008 sugli amministratori di sistema, tuttora efficace ai sensi dell'art. 22, comma 4, D.Lgs. 101/2018 |
| Operazioni su documenti fiscali | 10 anni | art. 2220 c.c.; art. 22 D.P.R. 600/1973 |
| Altre operazioni | 24 mesi | art. 5(1)(e) GDPR — limitazione della conservazione |
| Esecuzioni automatismi | 90 giorni | dato tecnico, non personale |

La cancellazione avviene tramite una procedura automatica settimanale, che lascia
a sua volta traccia della propria esecuzione.

---

## 5. Adempimenti a carico del Cliente

Il fornitore **non** può assolverli al posto del Cliente.

1. **Accordo sindacale** con RSA/RSU oppure autorizzazione dell'Ispettorato
   territoriale del lavoro (art. 4, comma 1, L. 300/1970). L'inosservanza è
   sanzionata penalmente (art. 38 L. 300/1970) e rende il trattamento illecito
   (art. 114 D.Lgs. 196/2003).
2. **Informativa preventiva** ai lavoratori sulle modalità d'uso degli strumenti
   e sull'effettuazione dei controlli (art. 4, comma 3). Senza di essa i dati
   **non sono utilizzabili a nessun fine** connesso al rapporto di lavoro.
3. **Informativa sui sistemi automatizzati** al lavoratore e alle
   rappresentanze sindacali (art. 1-bis D.Lgs. 152/1997).
4. **Informativa privacy** ai sensi degli artt. 13-14 GDPR.
5. **Valutazione d'impatto (DPIA)** ai sensi dell'art. 35 GDPR.
6. **Nomina degli amministratori di sistema** in forma scritta e individuale,
   con verifica almeno annuale (Provv. Garante 27 novembre 2008). Riguarda gli
   utenti con ruolo `ADMIN` e `MASTER`.

Il fornitore fornisce questo documento e ogni ulteriore informazione tecnica
necessaria, ai sensi dell'art. 28(3)(f) GDPR.

---

*Questo documento descrive il funzionamento del software. Non costituisce
consulenza legale: per la valutazione del caso concreto occorre un consulente
del lavoro e, per il trattamento dei dati, il DPO o un legale specializzato.*
