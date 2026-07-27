# Registro delle attività di trattamento — responsabile (art. 30 par. 2 GDPR)

> **ЧЕРНОВА ЗА ЮРИСТ.** Регистърът е **наш** (като обработващ), не на клиента.
> Изключението по чл. 30(5) **не важи**: обработката не е инцидентна — тя е
> предметът на услугата. Актуализира се при всяка промяна: нов клиент, нов
> подобработващ, нова категория данни.

**Titolare del registro (responsabile del trattamento):** Carbon Stealth VCC
**Recapito:** «…» · **PEC:** «…»
**Referente privacy:** il socio e legale rappresentante — «nome e cognome».
È anche l'unico **amministratore di sistema** ([`nomine.md`](nomine.md) § 0).
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
   valori di campo, oppure di appunti scritti dall'operatore per riformularli in
   una descrizione o in un riepilogo. Sono due trattamenti distinti e vanno
   dichiarati come tali: nel primo esce un documento del cliente, nel secondo un
   testo scritto dal personale.
9. *(eventuale, se attivata)* **Avvisi di scadenza per posta elettronica** —
   invio, agli indirizzi indicati dal titolare, di un messaggio contenente
   matricola dell'impianto, tipo e data della scadenza, numero del documento e
   un collegamento al gestionale. **Non contiene dati identificativi di persone
   fisiche**: la minimizzazione è una proprietà del testo, verificata da test
   automatici, non una promessa organizzativa.

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

**Nessuno.** L'infrastruttura è un server virtuale in locazione presso Hetzner
Online GmbH, **in Germania**; backup e assistenza restano sulla stessa
macchina. Nessun dato lascia l'Unione europea.

Se il titolare attiva la funzione facoltativa di compilazione assistita, la
chiave e il contratto con il fornitore del modello sono **suoi**: il
trasferimento eventuale è un trattamento del titolare, non nostro, e va
documentato nel suo registro ex art. 30(1). **Alla data odierna la funzione è
disattivata su ogni installazione.**

### e) Termini di cancellazione

| Dato | Termine |
|---|---|
| Registro accessi (login/logout) | 6 mesi |
| Avvisi di scadenza inviati | 90 giorni (i non inviati restano: sono lavoro da fare) |
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
| Hetzner Online GmbH | server virtuale in locazione (hosting, alimentazione, rete) | Germania | «rif. DPA Hetzner» |

**Il server di posta non è nostro sub-responsabile.** Gli avvisi di scadenza
partono dal server del titolare attraverso il **suo** provider di posta, con le
**sue** credenziali, configurate sulla sua installazione: il rapporto con quel
provider è del titolare e va nel suo registro ex art. 30(1). Se il titolare non
configura alcun server, la funzione non invia nulla e gli avvisi restano nella
coda locale.

---

## Note

1. **DPO non designato.** La concentrazione di più ruoli in una persona **non**
   fa sorgere l'obbligo — l'art. 37 elenca condizioni oggettive, non un criterio
   di numerosità. Non ricorrono le condizioni dell'art. 37 par. 1: non
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

   **Oggi è una persona sola**, che è anche il legale rappresentante. Le
   registrazioni degli accessi richieste dal Provvedimento sono soddisfatte dal
   registro immodificabile del gestionale: completezza e inalterabilità sono
   garantite dalla firma HMAC concatenata, la conservazione è di sei mesi per
   gli eventi di accesso — il minimo richiesto. La **verifica annuale**, invece,
   non può essere indipendente finché la persona è una sola: il limite è
   dichiarato in [`nomine.md`](nomine.md) § 7 con le due strade per superarlo.

3. **Aggiornamento.** Il registro va aggiornato entro 30 giorni da: nuovo
   cliente, cessazione di un cliente, nuovo sub-responsabile, nuova categoria di
   dati, attivazione della funzione di intelligenza artificiale presso un
   cliente, trasferimento extra-UE.
