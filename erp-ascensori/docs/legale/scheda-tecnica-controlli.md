# Scheda tecnica dei controlli — ERP Ascensori Enterprise

**Allegato al contratto di fornitura · versione 1.1 · 26 luglio 2026**
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

### 1.5 Tempi di intervento (chiamate di emergenza e urgenti)

Su un ordine di lavoro con priorità `EMERGENZA` o `URGENTE` il sistema registra
tre marcature temporali:

| Campo | Che cosa segna | Chi lo compila |
|---|---|---|
| `segnalatoAt` | la chiamata o l'allarme | il tecnico dal telefono, o il dispatcher |
| `arrivoAt` | il tecnico è sul posto | idem |
| `ripristinoAt` | l'impianto è rimesso in servizio | idem |

Da queste marcature il sistema calcola due tempi (arrivo e ripristino) e li
confronta con le soglie **concordate nel contratto di manutenzione**
(`Contratto.slaInterventoMin`, `Contratto.slaRipristinoOre`). L'esito è
mostrato sull'ordine come «Rispettato» o «Fuori termine».

**Finalità:** dimostrare al committente il rispetto dei tempi promessi, e
riconoscere le penali dove previste. La misura è **per intervento**, non per
persona.

**Il sistema non produce** alcun indicatore individuale, media, classifica o
statistica per tecnico: non esiste una schermata, un'esportazione né un
endpoint che aggreghi questi tempi per lavoratore. La dichiarazione al § 2
(«nessuna misurazione della produttività») resta quindi valida — e se in futuro
una tale aggregazione venisse introdotta, **questo documento va riscritto prima
del codice**.

**Avvertenza al Cliente.** Questi dati sono comunque riconducibili al singolo
lavoratore. Il loro trattamento rientra nell'art. 4 L. 300/1970 e richiede al
Cliente, in qualità di titolare e datore di lavoro: accordo sindacale o
autorizzazione dell'Ispettorato dove necessario (comma 1), e in ogni caso
l'informativa preventiva sulle modalità d'uso e sui controlli (comma 3). Senza
l'informativa i dati **non sono utilizzabili a fini connessi al rapporto di
lavoro**.

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
> **Le dichiarazioni di questo paragrafo valgono con la funzione di lettura
> assistita dei documenti disattivata** (`AI_PROVIDER` non impostato, che è la
> configurazione predefinita). Con la funzione attiva vale in aggiunta il § 2-bis
> e il foglio d'installazione allegato, che riporta la configurazione reale alla
> data della firma.

- **Nessuna decisione automatizzata** ai sensi dell'art. 22 GDPR — vale in ogni
  configurazione: nessuna decisione che riguardi il lavoratore viene presa dal
  sistema, e la lettura assistita **propone** valori che una persona conferma.

---

## 2-bis. Lettura assistita dei documenti (disattivata per impostazione predefinita)

Il prodotto contiene una funzione facoltativa: l'operatore carica un documento
(per esempio una dichiarazione di conformità o un verbale) e un servizio di
terze parti ne estrae i campi, che vengono **proposti** nel modulo. Nessun
valore viene salvato senza conferma di una persona.

**Stato predefinito: disattivata.** Senza la variabile `AI_PROVIDER` il prodotto
funziona integralmente e nessun dato lascia il server.

**Quando è attiva, ed è la ragione per cui questo paragrafo esiste:**

- il documento caricato — con i dati personali che contiene — **viene inviato al
  fornitore del modello**, che diventa così responsabile del trattamento (art. 28
  GDPR) o sub-responsabile, secondo la configurazione;
- i fornitori supportati (Google, OpenAI, Anthropic) hanno endpoint **fuori
  dall'Unione europea**, salvo indicazione di un endpoint regionale tramite
  `AI_BASE_URL`. In tal caso il trasferimento richiede uno strumento dell'art. 46
  GDPR e va documentato nell'accordo;
- la scelta se attivarla, con quale fornitore e con quale chiave, è del
  **Cliente**: il fornitore del software non la attiva né la configura per conto
  suo.

Il prodotto mostra all'utente, **prima del caricamento**, a quale fornitore sarà
inviato il documento, e ne dà conto nella pagina «Diritti dell'interessato».

Per la valutazione d'impatto (art. 35 GDPR), il fornitore mette a disposizione
su richiesta la scheda «AI — input per la DPIA» con il dettaglio del flusso.

**Nessun trasferimento fuori dall'Unione europea** con la funzione disattivata:
l'installazione è su server nell'UE e non sono presenti sub-responsabili esterni
oltre all'hosting.

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
