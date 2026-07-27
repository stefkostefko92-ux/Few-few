# Procedura in caso di violazione di dati personali (data breach)

> **ЧЕРНОВА ЗА ЮРИСТ.** Процедурата описва **нашето** задължение като
> обработващ: чл. 33(2) — уведомяваме АДМИНИСТРАТОРА, не Garante. Уведомяването
> на надзорния орган и на субектите е на клиента. Часовникът обаче тръгва от
> НАШЕТО узнаване, затова забавяне у нас изяжда неговия срок.

---

## 0. Правилото, което решава всичко останало

**Съобщавай рано и непълно, а не късно и подредено.** Чл. 33(4) изрично
позволява информацията да се подава на етапи. Всеки час, изгубен в „да проверим
първо“, е час от 72-те на клиента.

Съобщаването без забавяне **никога** не води до дисциплинарна последица — дори
когато си причината. Премълчаването води.

---

## 1. Che cosa è una violazione

Ai sensi dell'art. 4 n. 12 GDPR: qualunque violazione di sicurezza che comporti
**accidentalmente o in modo illecito** la distruzione, la perdita, la modifica,
la divulgazione non autorizzata o l'accesso ai dati personali.

Rientrano quindi, a titolo di esempio:

| Evento | È violazione? |
|---|---|
| Credenziali di un utente compromesse | **Sì** — riservatezza |
| Backup non cifrato smarrito o accessibile | **Sì** — riservatezza |
| Dati di un'azienda visibili a un'altra | **Sì** — riservatezza |
| Base dati persa senza backup ripristinabile | **Sì** — disponibilità |
| Ransomware, anche senza esfiltrazione | **Sì** — disponibilità |
| Fermo del servizio con dati intatti e ripristino nei tempi | **No**, ma è incidente SLA |
| Modifica non autorizzata di dati | **Sì** — integrità |

Nel dubbio **si tratta come violazione**: la qualificazione si può correggere
dopo, il ritardo no.

## 2. Fasi

### Fase 1 — Rilevazione e blocco *(immediata)*

Chiunque rilevi l'evento avvisa **subito** il referente privacy ai recapiti
dell'art. 5, senza attendere conferme.

Azioni immediate, nell'ordine:

1. **fermare l'emorragia** — revocare le sessioni, ruotare le credenziali
   compromesse, isolare il sistema;
2. **preservare le prove** — non cancellare log, non ripristinare sopra lo stato
   compromesso prima di averne una copia;
3. annotare **ora e fonte** della rilevazione: da qui decorrono i termini.

> **Non modificare il registro delle operazioni.** È firmato con HMAC
> concatenato: qualunque intervento ne rompe la catena e distrugge l'unico
> elemento che dimostra che cosa è accaduto.

### Fase 2 — Qualificazione *(entro 12 ore)*

Il referente privacy accerta:

- quali **titolari** (clienti) sono coinvolti;
- categorie e numero approssimativo di **interessati** e di **registrazioni**;
- categorie di dati;
- se vi è stata **esfiltrazione** o solo accesso;
- conseguenze probabili.

Strumenti: registro immodificabile delle operazioni, log applicativi (privi di
dati personali per progetto), log dell'infrastruttura, metriche.

### Fase 3 — Comunicazione al titolare *(entro 24 ore dalla conoscenza)*

Per ogni cliente coinvolto, comunicazione scritta a PEC e e-mail indicate nel
DPA, contenente:

1. natura della violazione;
2. categorie e numero approssimativo di interessati e registrazioni;
3. recapito del referente presso di noi;
4. conseguenze probabili;
5. misure adottate e proposte per attenuarne gli effetti;
6. **ora della conoscenza** — è il dato da cui il titolare calcola le sue 72 ore.

Le informazioni non ancora disponibili sono indicate come tali e trasmesse
successivamente **senza ulteriore ritardo**.

> **Non si comunica al Garante né agli interessati.** Sono adempimenti del
> titolare (artt. 33 par. 1 e 34). Un'iniziativa autonoma da parte nostra
> confonde le responsabilità e può pregiudicare la valutazione del titolare.

### Fase 4 — Contenimento e ripristino

Rimozione della causa, ripristino dei dati ove necessario, verifica
dell'integrità del registro delle operazioni, conferma scritta al titolare.

### Fase 5 — Registrazione interna *(obbligatoria, sempre)*

Ogni violazione — **anche quella non comunicata perché ritenuta improbabile che
presenti un rischio** — è annotata nel registro interno di cui all'art. 4.
L'art. 33 par. 5 richiede la documentazione di **tutte** le violazioni.

### Fase 6 — Analisi a posteriori *(entro 15 giorni)*

Analisi senza ricerca di colpe: che cosa è accaduto, perché la difesa non ha
retto, quale misura tecnica lo rende impossibile la prossima volta. L'esito
diventa una modifica del prodotto o della procedura, con un test che la
verifica. Un'analisi che non produce né l'una né l'altro non è conclusa.

## 3. Termini — sintesi

| Momento | Termine | Soggetto |
|---|---|---|
| Segnalazione interna | immediata | chiunque rilevi |
| Qualificazione | 12 ore | referente privacy |
| Comunicazione al titolare | **24 ore** dalla conoscenza | responsabile |
| Notifica al Garante | 72 ore | **titolare** |
| Comunicazione agli interessati | senza ingiustificato ritardo, se rischio elevato | **titolare** |
| Analisi a posteriori | 15 giorni | responsabile |

## 4. Registro interno delle violazioni

| N. | Data e ora della conoscenza | Descrizione | Titolari coinvolti | Interessati (n. appross.) | Comunicata il | Misure | Esito analisi |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Conservazione: **5 anni**.

## 5. Recapiti

| Ruolo | Nome | Telefono | E-mail | PEC |
|---|---|---|---|---|
| Referente privacy | «…» | «…» | «…» | «…» |
| Sostituto | «…» | «…» | «…» | «…» |
| Amministratore di sistema di turno | «…» | «…» | «…» | — |

## 6. Prova della procedura

La procedura è **provata almeno una volta l'anno** con una simulazione
(credenziali compromesse di un utente), cronometrando le fasi 1–3. Una procedura
mai provata non è una procedura.

| Anno | Data della prova | Scenario | Tempo fase 1→3 | Correzioni |
|---|---|---|---|---|
| «…» | «…» | «…» | «…» | «…» |
