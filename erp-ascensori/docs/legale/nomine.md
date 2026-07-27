# Nomine: autorizzati al trattamento e amministratori di sistema

> **ЧЕРНОВА ЗА ЮРИСТ.** Два различни документа с две различни основания, които
> често се бъркат. Първият важи за ВСЕКИ наш човек с достъп до данни на клиент;
> вторият — само за тези с MASTER/системен достъп, и иска **годишна проверка**.

---

# A. Designazione di persona autorizzata al trattamento

*(art. 29 GDPR; art. 2-quaterdecies D.Lgs. 196/2003)*

**Carbon Stealth VCC**, responsabile del trattamento per conto dei propri
clienti, designa

**«Nome Cognome»**, «qualifica»,

quale **persona autorizzata al trattamento** dei dati personali ai quali abbia
accesso nell'esercizio delle proprie mansioni.

## 1. Ambito

L'autorizzazione è limitata ai trattamenti descritti nel registro di cui
all'art. 30 par. 2 GDPR e ai soli dati necessari alle mansioni assegnate.

## 2. Istruzioni

L'autorizzato:

1. tratta i dati **esclusivamente su istruzione** del responsabile e, per suo
   tramite, del titolare;
2. **non accede** ai dati di un cliente se non su richiesta scritta di
   quest'ultimo o per un incidente di sicurezza che richieda intervento
   immediato; in entrambi i casi l'accesso resta tracciato nel registro
   immodificabile delle operazioni;
3. **non estrae, non copia e non trasferisce** dati su supporti o servizi non
   autorizzati, inclusi servizi di intelligenza artificiale, archiviazione
   personale e messaggistica;
4. utilizza credenziali **personali**, non condivise, protette da secondo
   fattore ove disponibile;
5. non tenta di aggirare i controlli di accesso né di elevare i propri
   privilegi;
6. segnala **immediatamente** al referente privacy ogni evento che possa
   costituire una violazione di dati personali, anche solo sospetta, anche se
   causata da sé stesso. **La segnalazione tempestiva non comporta conseguenze
   disciplinari**; l'omessa segnalazione sì;
7. mantiene la riservatezza anche **dopo** la cessazione del rapporto.

## 3. Formazione

L'autorizzato riceve formazione iniziale e aggiornamento almeno annuale su:
protezione dei dati, sicurezza delle credenziali, riconoscimento del phishing,
procedura in caso di violazione. La partecipazione è registrata.

## 4. Durata

La designazione vale per la durata del rapporto e cessa automaticamente con
esso. Alla cessazione le utenze sono **disattivate lo stesso giorno**.

Data «…» · Il responsabile «…» · Per accettazione, l'autorizzato «…»

---

# B. Designazione ad amministratore di sistema

*(Provvedimento del Garante 27.11.2008, in vigore ex art. 22 comma 4 D.Lgs.
101/2018)*

**Carbon Stealth VCC** designa

**«Nome Cognome»**, «qualifica»,

quale **amministratore di sistema** con riferimento a: «server di produzione /
base dati / gestionale ERP Ascensori — livello MASTER».

## 1. Valutazione dei requisiti

La designazione è preceduta dalla valutazione individuale di esperienza,
capacità e affidabilità, documentata agli atti in data «…».

## 2. Ambito e limiti

| Sistema | Privilegio | Motivazione |
|---|---|---|
| Server di produzione | accesso amministrativo | manutenzione, aggiornamenti, ripristino |
| Base dati | ruolo applicativo, **non superutente** | il superutente aggira le policy di isolamento tra aziende |
| Gestionale, livello MASTER | livello del fornitore | assistenza e configurazione |

**Il ruolo applicativo della base dati non deve essere superutente.** Un
superutente scavalca incondizionatamente la row-level security, anche con
`FORCE ROW LEVEL SECURITY`, rendendo ornamentale il secondo livello di
isolamento. Lo stato effettivo è verificabile su `GET /api/readyz`, campo
`rls`.

## 3. Registrazione degli accessi

Gli accessi dell'amministratore di sistema sono registrati. Le registrazioni:

- hanno caratteristiche di **completezza, inalterabilità e verificabilità**;
- comprendono i riferimenti temporali e la descrizione dell'evento;
- sono conservate per un periodo **non inferiore a sei mesi**.

Il registro delle operazioni del gestionale, firmato con HMAC concatenato, non
prevede alcuna rotta di modifica o cancellazione e la sua integrità è
verificabile crittograficamente su richiesta.

## 4. Verifica annuale

L'operato dell'amministratore di sistema è sottoposto a **verifica almeno
annuale**, allo scopo di controllarne la rispondenza alle misure organizzative,
tecniche e di sicurezza. L'esito è documentato agli atti.

| Anno | Data della verifica | Esito | Verificato da |
|---|---|---|---|
| «…» | «…» | «…» | «…» |

## 5. Trasparenza verso i clienti

L'elenco degli amministratori di sistema che possono accedere ai dati di un
cliente è **comunicato al cliente su sua richiesta**, in adempimento
dell'art. 28 par. 3 lett. h GDPR.

## 6. Cessazione

Alla cessazione del rapporto o della designazione, le utenze amministrative sono
revocate **lo stesso giorno** e le chiavi di accesso ruotate.

Data «…» · Il responsabile «…» · Per accettazione, l'amministratore «…»

---

## Registro delle designazioni in essere

| Persona | Autorizzato art. 29 | Amministratore di sistema | Dal | Al | Ultima verifica |
|---|---|---|---|---|---|
| «…» | ☐ | ☐ | «…» | «…» | «…» |
