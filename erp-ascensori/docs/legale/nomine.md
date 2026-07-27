# Nomine: autorizzati al trattamento e amministratori di sistema

> **ЧЕРНОВА ЗА ЮРИСТ.** Два различни документа с две различни основания, които
> често се бъркат. Първият важи за ВСЕКИ наш човек с достъп до данни на клиент;
> вторият — само за тези с MASTER/системен достъп, и иска **годишна проверка**.
>
> **Състояние към днес: един човек държи и двете роли** — собственикът и
> законен представител на Carbon Stealth VCC (решение Б3). Това променя как се
> четат двата документа и е разписано в § 0 по-долу.

---

## § 0. Кой какво държи днес

| Роля | Кой | Основание |
|---|---|---|
| Referente privacy | собственикът, законен представител на Carbon Stealth VCC | вътрешно решение; не е DPO (виж по-долу) |
| Amministratore di sistema | същият | Provv. Garante 27.11.2008 |
| Autorizzato ex art. 29 | **никой** — още няма нает човек | чл. 29 ОРЗД |

**Документ А НЕ се подписва за собственика, и това не е пропуск.** Чл. 29 ОРЗД
говори за лица, които действат „под ръководството" на администратора или
обработващия. Законният представител не действа под ръководството на дружеството
— той Е неговият орган. Самоназначение по чл. 29 е документ, в който едно и също
лице дава указания на себе си; юридически той не добавя нищо, а на проверка
изглежда като неразбиране на нормата. Документ А остава като **бланка за първия
нает или външен сътрудник** и се подписва в деня, в който такъв получи достъп.

**Документ Б се подписва.** Тук положението е обратното: задължението по
Provv. Garante 27.11.2008 тежи върху ДЕЙНОСТТА (системно администриране на
данни на трети лица), не върху трудовото правоотношение. Дори когато няма кого
да назначиш, остават задълженията за **записване на достъпите** и за **годишна
проверка** — и точно втората е проблемна, когато човекът е един (§ 7).

> **Въпрос към юриста, поставен изрично.** Дали формалното „designazione" по
> Provv. 27.11.2008 се изисква, когато системният администратор е самият законен
> представител, е спорно: назначаването предполага отношение на подчиненост.
> Нашият прочит е, че **формалното назначение отпада, а придружаващите
> задължения — не**. Затова документът е попълнен и подписан: подписан документ,
> който се окаже излишен, не вреди; липсващ, който се окаже дължим, е глоба.

---

# A. Designazione di persona autorizzata al trattamento

*(art. 29 GDPR; art. 2-quaterdecies D.Lgs. 196/2003)*

> **Modello, non ancora sottoscritto da alcuno.** Alla data odierna nessun
> collaboratore ha accesso ai dati dei clienti. Si sottoscrive il giorno in cui
> il primo dipendente o collaboratore esterno riceve un'utenza — **prima**
> dell'attivazione dell'utenza, non dopo.

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

**«nome e cognome come da documento d'identità»**, socio e legale
rappresentante,

quale **amministratore di sistema** con riferimento a: server di produzione
(VPS Hetzner Online GmbH, Germania) · base dati PostgreSQL · gestionale ERP
Ascensori, livello MASTER.

**È l'unica persona con tali privilegi.** L'elenco comunicabile al cliente ex
art. 28 par. 3 lett. h GDPR (§ 5) contiene oggi un solo nome.

## 1. Valutazione dei requisiti

La designazione è preceduta dalla valutazione individuale di esperienza,
capacità e affidabilità, documentata agli atti in data «…».

Elementi valutati: progettazione e realizzazione del gestionale stesso;
amministrazione del server di produzione; assenza di precedenti incidenti di
sicurezza. **La valutazione è, in questo caso, un'autovalutazione** — se ne dà
atto apertamente qui anziché farla passare per un giudizio di terzi.

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

## 7. Un solo amministratore: che cosa non funziona, detto prima

Tre conseguenze discendono dall'avere una sola persona in entrambi i ruoli.
Nessuna impedisce di operare; tutte vanno decise consapevolmente.

**a) La verifica annuale non può essere indipendente.** Il § 4 chiede di
controllare l'operato dell'amministratore. Chi lo controlla, se è la stessa
persona che lo esercita? Due strade praticabili:

1. **verifica esterna** — commercialista, consulente informatico o revisore
   incaricato una volta l'anno, con esito agli atti. È l'unica che soddisfa lo
   spirito della norma;
2. **autovalutazione documentata** su lista di controllo (`readyz` verde, ruolo
   applicativo non superutente, integrità del registro verificata, ripristino
   del backup eseguito davvero, utenze cessate disattivate), **dichiarata come
   tale**. Non è indipendente e il documento lo dice.

Finché i clienti sono pochi la seconda è difendibile; **dal primo cliente con
più di qualche centinaio di impianti va presa la prima.**

**b) Non esiste una via di escalation.** La procedura in caso di violazione
prevede un sostituto ([`procedura-violazioni.md`](procedura-violazioni.md)).
Oggi non c'è. Se l'unica persona è irraggiungibile, il termine di 72 ore
dell'art. 33 par. 1 decorre comunque. **Indicare un sostituto di emergenza** —
anche esterno, anche solo con il compito di avvisare il cliente — è la misura
più economica contro questo rischio.

**c) Le chiavi hanno un solo custode.** `AUDIT_HMAC_KEY` rende verificabile il
registro delle operazioni; la chiave `age` del backup rende leggibili i dump.
Perse entrambe con la persona, restano dati senza prova di integrità e backup
illeggibili. **Custodia separata** (cassaforte, busta sigillata dal notaio, o
deposito presso il commercialista) non è burocrazia: è la differenza fra un
incidente e la fine dell'attività.

Data «…» · Per Carbon Stealth VCC «…» · Per accettazione, l'amministratore «…»

> Le due firme coincidono. Non è un errore di compilazione: la società
> sottoscrive nella persona del suo legale rappresentante, che è anche il
> designato. Va lasciato così, non nascosto.

---

## Registro delle designazioni in essere

| Persona | Autorizzato art. 29 | Amministratore di sistema | Dal | Al | Ultima verifica |
|---|---|---|---|---|---|
| «nome e cognome» — legale rappresentante | non applicabile (§ 0) | ☑ | «data» | in corso | «da eseguire entro 12 mesi» |

Alla data odierna il registro contiene **una sola riga**. Va aggiornato **prima**
che una nuova persona riceva un'utenza, non dopo.
