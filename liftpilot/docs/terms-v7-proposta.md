# Условия v7 — предложение (само предложение, нищо не е приложено)

Кръг 48. Този файл **не** създава `legal/terms/7/` и **не** сменя `TERMS_VERSION`. До кръг 49 се казваше
`terms-v6-proposta.md`; номер 6 взе версията на кръг 49 (2026-10-21), която добави само данните на relazione tecnica di
modifica — качените документи и данните на техниците, които я пишат и проверяват (чл. 9), документите и издадените
relazioni в износа (чл. 10) и в регистъра на дейността — и излезе **без писмо** (решение на собственика: няма фирми за
уведомяване). Действащите условия са v6 (`legal/terms/6/it.txt`); фирма, приела v5, остава на v5. Номерата на редовете
долу са на `legal/terms/5/it.txt` и са същите в `legal/terms/6/it.txt` (v6 смени само редове 2, 13, 81 и 88 — нито един
от цитираните тук). Долу: какво и защо да се смени, точните италиански изречения (сега → предложение), решенията, които
са на собственика, и процедурата. Правният извод тук не е правен съвет — преди приемане текстът се сверява с юрист
(италианско право, B2B).

## 1. Защо v7 и кога

- **Register S.p.A.** вече е в информацията за получателите (ред 25: „custodisce la casella info@carbonstealth.eu“), но
  не е в списъка на подобработващите по чл. 9 (ред 83) — там са само Hetzner и Brevo. Щом през info@ минават данни, за
  които фирмата е администратор (сигнали, искания по чл. 9, писма със снимки от обекти), Register е подобработващ за
  тях: трябва да е в списъка и с договор по чл. 28 (`docs/terms-changes.md`, „Какво още решава собственикът“ — още
  предстои). **Това не чака v7:** чл. 9 от v5 дава общо разрешение („autorizzati in via generale“, ред 83) с писмо до
  Titolare 30 дни преди всяко добавяне (чл. 28, пар. 2 ОРЗД) — Register се добавя **сега** по `docs/terms-changes.md`
  §3 (договор по чл. 28, писмото, `/data`, `docs/ropa.md`). v7 само го вписва в списъка на чл. 9 (§2.1).
- **Stripe:** американското дружество, на което Stripe Payments Europe може да предава данни, днес е **Stripe, LLC**
  (политиката на Stripe по Data Privacy Framework: „Stripe, Inc., now known as Stripe, LLC“; версиите от 2026 г.
  назовават направо Stripe, LLC). Преди v7 — провери името в списъка на dataprivacyframework.gov.
- **Бетата и сигналите:** от кръг 48 приложението има „Segnala un problema“ (таблицата `Feedback`); текстът на чл. 1
  казва само „a info@carbonstealth.eu“, а информацията за поверителност не назовава сигналите от приложението.
- **Таванът на отговорността (чл. 8):** днес е „importo pagato … nei 12 mesi precedenti“ — през безплатната бета това е
  **0 €**, т.е. практически пълно изключване извън умисъла и грубата небрежност. Договорът е по **българското право**
  (чл. 15 от условията): чл. 94 ЗЗД забранява предварителното изключване или ограничаване на отговорността само за
  умисъл и груба небрежност — а те вече са извън тавана (чл. 8, ред 76). Ако италиански съд приложи италианското право,
  същото казва чл. 1229, ал. 1 c.c. Таван 0 € при лека небрежност в безплатна бета изглежда допустим и по двете права:
  **минимумът е избор за съразмерност** (по-ясна и по-лесна за защита клауза, по-добро отношение с тестерите), не
  правна необходимост. Клаузата е сред одобряваните изрично (`register.clauses`, чл. „liability“).
- **Google Cloud Vertex AI (кръг 50):** автоматичното четене на схиците на рилевото е готово и **изключено**. Ако
  собственикът го включи преди v7 (по `docs/terms-changes.md` §3 — писмото 30 дни преди, CDPA, без логване на заявките),
  v7 вписва Google в чл. 9, в „Natura e finalità“ (четенето по искане на потребителя), в мерките (сървърът в Германия;
  четенето — в регион на Google Cloud в ЕС) и в `legal.recipientsText` (§2.1). Ако не е включено — нищо от това.

**Кога:** v7 обвързва вече регистрираните фирми не по-рано от 30 дни след писмото (`legal:notice`) и не по-рано от
`TERMS_EFFECTIVE`. Докато v5 още не обвързва старите фирми (до 16.11.2026), нова версия трупа втора поредица писма и
два различни дни на влизане в сила за едни и същи фирми — обърква и рискува фирма да бъде „само за четене“ заради
версия, за която едва е научила. **Препоръка:** v7 се публикува след 16.11.2026 (когато v5 обвързва всички уведомени; v6 не обвързва никоя стара фирма — писмо за нея няма),
а дотогава нужното се прави без нова версия: Register — сега, по чл. 9 от v5 и `docs/terms-changes.md` §3 (договор +
писмо 30 дни преди), Hetzner/Brevo — както в чеклиста. v7 само отразява в текста вече направеното.

## 2. Изреченията (сега → предложение)

### 2.1 Чл. 9 — подобработващите (ред 83)

Сега:
> Sub-responsabili autorizzati in via generale: Hetzner Online GmbH (Germania, server a Norimberga) e Sendinblue SAS — Brevo (Francia, e-mail di servizio).

Предложение:
> Sub-responsabili autorizzati in via generale: Hetzner Online GmbH (Germania, server a Norimberga), Sendinblue SAS — Brevo (Francia, e-mail di servizio) e Register S.p.A. (Italia, custodisce la casella info@carbonstealth.eu, dove arrivano le richieste e le segnalazioni delle aziende).

Ако четенето на схиците е включено преди v7 (§1), към списъка се добавя:
> …; Google Cloud EMEA Limited — Google Cloud Vertex AI (Irlanda; il modello Claude di Anthropic nella regione UE di Google Cloud), solo per la lettura degli schizzi di rilievo chiesta dall’utente.

(Името на дружеството — по CDPA, приет в конзолата; провери го там преди v7.) И в „Natura e finalità“ на чл. 9: „…,
lettura assistita degli schizzi di rilievo su richiesta dell’utente“.

Същото в `legal.dpaText` и `legal.recipientsText`; страницата `/data` (`dataPage.*`) и `docs/ropa.md` се обновяват още при
добавянето по чл. 9 от v5 (§1), без да чакат v7.

### 2.2 Трансфери — Stripe (ред 26)

Сега:
> Stripe può trasferire dati a Stripe, Inc. negli Stati Uniti, certificata nel Data Privacy Framework UE–USA …

Предложение:
> Stripe può trasferire dati a Stripe, LLC negli Stati Uniti, certificata nel Data Privacy Framework UE–USA …

(останалото от изречението — без промяна).

### 2.3 Чл. 1 — бетата и сигналите (ред 45)

Сега:
> Il servizio è in versione beta: le funzioni sono complete ma ancora in collaudo, possono cambiare e possono avere errori; segnalaci ogni problema a info@carbonstealth.eu.

Предложение:
> Il servizio è in versione beta: le funzioni sono complete ma ancora in collaudo, possono cambiare e possono avere errori; segnalaci ogni problema con «Segnala un problema» nell’applicazione oppure a info@carbonstealth.eu.

И в информацията за поверителност, „Quali dati trattiamo e perché?“, ред 14 („E-mail e corrispondenza“), сега:
> … i messaggi che ci scrivi, per rispondere (art. 6(1)(b) e (f) GDPR).

Предложение:
> … i messaggi che ci scrivi e le segnalazioni inviate con «Segnala un problema» (testo, pagina da cui la invii, data e account che la invia), per rispondere e correggere il servizio (art. 6(1)(b) e (f) GDPR).

Получателите на сигнала — нов ред след ред 14 („Segnalazioni“), предложение:
> Segnalazioni: le segnalazioni inviate con «Segnala un problema» le leggono gli amministratori della piattaforma (Carbon Stealth VCC), che le trattano come titolari del trattamento per rispondere e correggere il servizio (art. 6(1)(b) e (f) GDPR). L’azienda vede nel registro attività che una segnalazione è stata inviata, da chi e di che tipo, e il testo della segnalazione è nell’esportazione dei dati dell’azienda, che scaricano il Titolare e i colleghi con il permesso di esportare: non scrivere nella segnalazione quello che non vuoi che l’azienda legga, né dati personali dei clienti se non servono.

Срокът (ред 34, „Per quanto tempo li conserviamo?“) — кодът вече трие обработения сигнал 24 месеца след
обработването (`FEEDBACK_KEEP_MONTHS`, `src/lib/purge.ts`), и с фирмата. Предложение:
> Le segnalazioni inviate dall’applicazione sono cancellate 24 mesi dopo la loro chiusura, o prima con l’azienda.

По-кратък срок — **решение на собственика**, и тогава първо кодът (константата), после текстът.

Поканите за бетата (`BetaInvite`, от кръг 48) — нов ред след ред 11 („Inviti alla beta“), предложение:
> Inviti alla beta: se chiedi di partecipare alla beta, conserviamo il tuo indirizzo e-mail, una nota interna sulla tua richiesta (data e oggetto del messaggio) e le date dell’invito, per mandarti il link che apre la registrazione per quell’indirizzo (art. 6(1)(b) GDPR, misure precontrattuali su tua richiesta). La nota la leggono solo gli amministratori della piattaforma; puoi chiederne copia (art. 15 GDPR).

И в срока (ред 32), предложение:
> Un invito alla beta non usato è cancellato 30 giorni dopo la scadenza del link; quello usato, con l’azienda che hai creato.

(Писмото на поканата вече го казва — `mail.betaInvitePrivacy`; това е редът в политиката, към която то води.)

### 2.3а Чл. 2 — сключването на договора (ред 47)

От кръг 48 изричното одобрение на клаузите става на страницата на линка от писмото, с паролата
(`docs/terms-changes.md` §1в). Текстът на чл. 2 описва само потвърждението на адреса. Сега:
> Il contratto si conclude quando il Titolare, dopo aver accettato queste condizioni nel modulo di registrazione, conferma il proprio indirizzo e-mail; …

Предложение:
> Il contratto si conclude quando il Titolare, dopo aver accettato queste condizioni nel modulo di registrazione, conferma il proprio indirizzo dal link dell’e-mail e, con la password, approva specificamente le clausole indicate (artt. 1341–1342 c.c.); …

(останалото от изречението — без промяна).

### 2.4 Чл. 8 — таван на отговорността (ред 76)

Сега:
> Nei limiti consentiti dalla legge, Carbon Stealth VCC risponde dei danni causati dal servizio, per l’insieme dei fatti dannosi, solo fino all’importo pagato dall’azienda per l’abbonamento nei 12 mesi precedenti il primo fatto, e non risponde di danni indiretti, …

Предложение (един от трите варианта — **решение на собственика**):
> Nei limiti consentiti dalla legge, Carbon Stealth VCC risponde dei danni causati dal servizio, per l’insieme dei fatti dannosi, solo fino al maggiore fra l’importo pagato dall’azienda per l’abbonamento nei 12 mesi precedenti il primo fatto e **[A] 500 euro / [B] 1.000 euro / [C] 2.500 euro**, e non risponde di danni indiretti, …

- **A — 500 €:** символичен минимум; отговаря на месечна цена от порядъка на десетки евро; най-нисък риск, най-слаб като
  аргумент за съразмерност.
- **B — 1.000 €:** средно; близо до годишния абонамент на малка фирма с пакет места.
- **C — 2.500 €:** по-защитим при оспорване; струва си, ако застраховката „професионална отговорност“ (чеклистът)
  го покрива.

Защо минимум (§1): по българското право на договора (чл. 15) — чл. 94 ЗЗД, по италианското, ако съд го приложи —
чл. 1229, ал. 1 c.c.; и двете забраняват ограничаването само при умисъл и груба небрежност, които тук и без това са
извън тавана. Минимумът не е правно задължителен — той е избор за съразмерност; кой вариант — решение на собственика.

Останалото от чл. 8 (умисъл, груба небрежност, вреди на личността, продуктова отговорност — без таван; манлевата) —
без промяна. `register.clauses` назовава чл. „limiti di responsabilità e manleva“ — текстът му не се мени, но новата
версия се одобрява наново с паролата (`docs/terms-changes.md` §1в).

### 2.5 Клаузи за бетата по избор — всяка е **решение на собственика**

- **Лиценз върху обратната връзка** (нова алинея в чл. 6):
  > Le segnalazioni e i suggerimenti inviati durante l’uso del servizio possono essere usati liberamente da Carbon Stealth VCC per migliorare LiftPilot, senza compenso e senza obblighi di riservatezza; restano esclusi i dati personali e i dati degli impianti che contengono, trattati secondo l’art. 9.

  Защо: без нея идея от тестер, вградена в продукта, може да породи спор за авторство. Цена: някои фирми не я обичат.
- **Без реални данни на клиенти, освен ако не трябват** (нова алинея в чл. 1, след бетата):
  > Durante la beta l’azienda inserisce dati reali di clienti, proprietari e impianti solo quando servono al proprio lavoro; per le prove usa dati di esempio.

  Защо: намалява личните данни в бетата (минимизация, чл. 5(1)(в) ОРЗД). Цена: тестерите, които работят по истински
  обекти, ще ги въвеждат така или иначе — алинеята е препоръка, не забрана.

## 3. Процедурата, когато собственикът реши (`docs/terms-changes.md` §1)

1. Текстовете в `messages/it.json` (`legal.*`, `dataPage.*`), на ръка със същата версия: `register.clauses` (сверка) и
   `mail.termsNoticeChanges` („Che cosa cambia rispetto alla versione 6:“ + натрупаното от по-старите).
2. `TERMS_VERSION` = 7, `TERMS_DATE` = денят на публикуването, `TERMS_EFFECTIVE` ≥ 30 дни след него (+ няколко дни за
   деплоя); `TERMS_HISTORY` += 7.
3. `npm run legal:archive` → `legal/terms/7/it.txt`; `npm test` (`legal.test.ts`, `legal-archive.test.ts`).
4. Деплой (`DEPLOY.md`), веднага след него `docker exec liftpilot-app-1 npm run legal:notice`, после `-- --send`. Фирма без
   писмо не се обвързва никога; от деня на влизане в сила, докато Titolare не приеме, фирмата е само за четене.
5. Отказ поради новата версия — връщане на неизползваната част (§1, т. 7).
