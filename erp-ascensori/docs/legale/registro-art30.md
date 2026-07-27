# Registro delle attività di trattamento — responsabile (art. 30 par. 2 GDPR)

> **ЧЕРНОВА ЗА ЮРИСТ.** Регистърът е **наш** (като обработващ), не на клиента.
> Изключението по чл. 30(5) **не важи**: обработката не е инцидентна — тя е
> предметът на услугата. Актуализира се при всяка промяна: нов клиент, нов
> подобработващ, нова категория данни.

**Titolare del registro (responsabile del trattamento):** Carbon Stealth VCC
**Recapito:** «…» · **PEC:** «…» · **Referente privacy:** «…»
**Rappresentante ex art. 27:** non necessario (stabilimento nell'Unione)
**Responsabile della protezione dei dati (DPO):** non designato — vedi nota 1

**Ultimo aggiornamento:** «data» · **Aggiornato da:** «…»

---

## Attività 1 — Erogazione del gestionale ERP Ascensori Enterprise

### a) Titolari per conto dei quali si tratta

| Titolare | P.IVA | Contratto | DPA sottoscritto il |
|---|---|---|---|
| «Ragione sociale» | «…» | «rif.» | «data» |

*(una riga per ogni cliente; il registro non contiene dati personali degli
interessati, solo la mappa dei trattamenti)*

### b) Categorie di trattamenti effettuati per conto del titolare

1. **Anagrafica e gestione impianti** — censimento degli impianti, dei
   condomini, degli amministratori e dei referenti.
2. **Gestione degli interventi** — ordini di lavoro, assegnazione ai tecnici,
   rapportini di intervento con firma del referente, materiali impiegati.
3. **Gestione documentale e contabile** — preventivi, ordini, DDT, fatture,
   pagamenti, solleciti; predisposizione del file XML FatturaPA.
4. **Scadenzario normativo** — verifiche periodiche (art. 13 D.P.R. 162/1999),
   scadenze degli automezzi, scadenze contrattuali e avvisi.
5. **Gestione degli accessi** — account, ruoli, autenticazione, secondo fattore,
   sessioni.
6. **Registro immodificabile delle operazioni** — tracciabilità delle azioni
   compiute nel gestionale.
7. **Assistenza tecnica** — accesso ai dati su richiesta scritta del titolare o
   in caso di incidente.
8. *(eventuale, se attivata)* **Compilazione assistita da modello linguistico** —
   invio a un fornitore terzo di un documento caricato dall'utente per proporre
   valori di campo.

### c) Categorie di interessati e di dati

| Interessati | Dati |
|---|---|
| Dipendenti e collaboratori del titolare | identificativi, contatti, qualifica, costo orario, assegnazioni, ore lavorate |
| Amministratori di condominio e loro personale | identificativi, contatti, P.IVA, codice fiscale, indirizzo |
| Referenti di condominio / clienti | identificativi, contatti, firma in calce al rapportino |
| Utenti del gestionale | e-mail, hash della password, ruolo, sessioni, momento e IP del solo accesso |

**Categorie particolari (art. 9) e dati giudiziari (art. 10): non trattati.**
Il servizio non li prevede e il titolare si obbliga contrattualmente a non
inserirli.

### d) Trasferimenti verso paesi terzi

**Nessuno.** Infrastruttura, backup e assistenza sono interamente nell'Unione
europea.

Se il titolare attiva la funzione facoltativa di compilazione assistita e il
fornitore del modello è extra-UE, il trasferimento va documentato qui con lo
strumento del Capo V applicabile. **Alla data odierna la funzione è
disattivata.**

### e) Termini di cancellazione

| Dato | Termine |
|---|---|
| Registro accessi (login/logout) | 6 mesi |
| Tracce riferite a entità contabili e fiscali | 10 anni (art. 2220 c.c.) |
| Ogni altra traccia operativa | 24 mesi |
| Telemetria tecnica | 90 giorni |
| Dati del titolare dopo la cessazione del contratto | 60 giorni, poi cancellazione |
| Backup | 31 giorni di rotazione |

L'applicazione è **automatica** (automatismo di retention settimanale), non
discrezionale.

### f) Misure di sicurezza (art. 32 par. 1)

Descritte nell'allegato tecnico `SECURITY.md`. In sintesi: cifratura in
transito; controllo degli accessi su sette livelli verificato lato server;
secondo fattore; isolamento tra aziende su due livelli (filtro applicativo +
row-level security con `FORCE ROW LEVEL SECURITY`); registro immodificabile con
firma HMAC concatenata; minimizzazione nei log; backup giornaliero con verifica
mediante ripristino reale; cancellazione automatica per decorso dei termini;
politica di sicurezza dei contenuti stringente; test automatici delle misure a
ogni modifica del software.

### g) Sub-responsabili

| Sub-responsabile | Servizio | Ubicazione | Contratto art. 28 |
|---|---|---|---|
| «Fornitore infrastruttura» | hosting | «Stato UE» | «rif.» |

---

## Note

1. **DPO non designato.** Non ricorrono le condizioni dell'art. 37 par. 1: non
   siamo autorità pubblica; l'attività principale non consiste in trattamenti
   che richiedono monitoraggio regolare e sistematico su larga scala di
   interessati (i dati sono di personale e controparti dei clienti, in numero
   limitato e per finalità gestionali); non trattiamo su larga scala categorie
   particolari. **Da rivalutare** al crescere del numero di clienti.

2. **Amministratori di sistema.** Le persone con privilegi di amministrazione
   sono designate per iscritto e verificate annualmente
   ([`nomine.md`](nomine.md)), ai sensi del Provvedimento del Garante del
   27.11.2008, tuttora in vigore per effetto dell'art. 22 comma 4 D.Lgs.
   101/2018.

3. **Aggiornamento.** Il registro va aggiornato entro 30 giorni da: nuovo
   cliente, cessazione di un cliente, nuovo sub-responsabile, nuova categoria di
   dati, attivazione della funzione di intelligenza artificiale presso un
   cliente, trasferimento extra-UE.
