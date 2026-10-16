# Условия v6 — предложение (само предложение, нищо не е приложено)

Кръг 48. Този файл **не** създава `legal/terms/6/` и **не** сменя `TERMS_VERSION`: действащите условия са v5
(`legal/terms/5/it.txt`, `TERMS_EFFECTIVE` 2026-11-16). Долу: какво и защо да се смени, точните италиански изречения
(сега → предложение, с номера на реда в `legal/terms/5/it.txt`), решенията, които са на собственика, и процедурата.
Правният извод тук не е правен съвет — преди приемане текстът се сверява с юрист (италианско право, B2B).

## 1. Защо v6 и кога

- **Register S.p.A.** вече е в информацията за получателите (ред 25: „custodisce la casella info@carbonstealth.eu“), но
  не е в списъка на подобработващите по чл. 9 (ред 83) — там са само Hetzner и Brevo. Щом през info@ минават данни, за
  които фирмата е администратор (сигнали, искания по чл. 9, писма със снимки от обекти), Register е подобработващ за
  тях: трябва да е в списъка и с договор по чл. 28 (`docs/terms-changes.md`, „Какво още решава собственикът“ — още
  предстои). Нов подобработващ = писмо 30 дни преди (чл. 9, ал. 3 на текста; `docs/terms-changes.md` §3).
- **Stripe:** американското дружество, на което Stripe Payments Europe може да предава данни, днес е **Stripe, LLC**
  (политиката на Stripe по Data Privacy Framework: „Stripe, Inc., now known as Stripe, LLC“; версиите от 2026 г.
  назовават направо Stripe, LLC). Преди v6 — провери името в списъка на dataprivacyframework.gov.
- **Бетата и сигналите:** от кръг 48 приложението има „Segnala un problema“ (таблицата `Feedback`); текстът на чл. 1
  казва само „a info@carbonstealth.eu“, а информацията за поверителност не назовава сигналите от приложението.
- **Таванът на отговорността (чл. 8):** днес е „importo pagato … nei 12 mesi precedenti“ — през безплатната бета това е
  **0 €**, т.е. практически пълно изключване извън умисъла и грубата небрежност. Изключване, представено като таван,
  рискува да бъде прочетено като такова (чл. 1229 c.c.) и да се оспорва; фиксиран минимум прави клаузата съразмерна и
  по-защитима. Клаузата е сред одобряваните изрично (`register.clauses`, чл. „liability“).

**Кога:** v6 обвързва вече регистрираните фирми не по-рано от 30 дни след писмото (`legal:notice`) и не по-рано от
`TERMS_EFFECTIVE`. Докато v5 още не обвързва старите фирми (до 16.11.2026), нова версия трупа втора поредица писма и
два различни дни на влизане в сила за едни и същи фирми — обърква и рискува фирма да бъде „само за четене“ заради
версия, за която едва е научила. **Препоръка:** v6 се публикува след 16.11.2026 (когато v5 обвързва всички уведомени),
а дотогава нужното се прави без нова версия: договорът с Register се сключва, Hetzner/Brevo — както в чеклиста.
Изключение: ако собственикът реши, че Register трябва да е в списъка веднага, v6 с 30 дни предизвестие може да тръгне и
сега — тогава резюмето на промените (`mail.termsNoticeChanges`) казва и v5, и v6.

## 2. Изреченията (сега → предложение)

### 2.1 Чл. 9 — подобработващите (ред 83)

Сега:
> Sub-responsabili autorizzati in via generale: Hetzner Online GmbH (Germania, server a Norimberga) e Sendinblue SAS — Brevo (Francia, e-mail di servizio).

Предложение:
> Sub-responsabili autorizzati in via generale: Hetzner Online GmbH (Germania, server a Norimberga), Sendinblue SAS — Brevo (Francia, e-mail di servizio) e Register S.p.A. (Italia, custodisce la casella info@carbonstealth.eu, dove arrivano le richieste e le segnalazioni delle aziende).

Същото в `legal.dpaText`, `legal.recipientsText`, страницата `/data` (`dataPage.*`) и `docs/ropa.md`.

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

**Решение на собственика:** колко дълго се пазят сигналите (сега няма срок в текста). Предложение за ред 34:
«Le segnalazioni inviate dall’applicazione sono conservate per 24 mesi dalla loro chiusura.» — или по-кратко.

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
   `mail.termsNoticeChanges` („Che cosa cambia rispetto alla versione 5:“ + натрупаното от по-старите).
2. `TERMS_VERSION` = 6, `TERMS_DATE` = денят на публикуването, `TERMS_EFFECTIVE` ≥ 30 дни след него (+ няколко дни за
   деплоя); `TERMS_HISTORY` += 6.
3. `npm run legal:archive` → `legal/terms/6/it.txt`; `npm test` (`legal.test.ts`, `legal-archive.test.ts`).
4. Деплой (`DEPLOY.md`), веднага след него `docker exec liftpilot-app-1 npm run legal:notice`, после `-- --send`. Фирма без
   писмо не се обвързва никога; от деня на влизане в сила, докато Titolare не приеме, фирмата е само за четене.
5. Отказ поради новата версия — връщане на неизползваната част (§1, т. 7).
