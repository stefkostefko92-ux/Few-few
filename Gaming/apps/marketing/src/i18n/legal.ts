/**
 * i18n dictionary for the four static legal pages (Terms, Privacy, Cookies,
 * Responsible Play). Bulgarian is the source of truth — the `bg` entries are
 * copied verbatim from the original page files; `en` and `it` are faithful
 * translations that preserve section numbers, headings, list items and links.
 *
 * Pages render these blocks generically. Inline markup is encoded as a small,
 * stable set of tokens that the page post-processes:
 *   - `{org}`              → link to the operator (Carbon Stealth VCC)
 *   - `**bold**`           → <strong> run (markdown-style)
 *   - `{begambleaware}`    → external link with visible text "BeGambleAware"
 *   - `{terms}` `{privacy}` `{cookies}` `{responsible}`
 *                         → localized internal cross-links (footer paragraph)
 * Known email addresses (legal@carbonstealth.eu, privacy@carbonstealth.eu) are
 * written inline as plain text and linkified by the page.
 */
import type { Locale } from "./locales";

export type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export interface LegalPage {
  metaTitle: string;
  metaDescription: string;
  /** "Последна актуализация" value; omitted on the Responsible page. */
  updated?: string;
  h1: string;
  blocks: Block[];
}

export interface LegalDict {
  terms: LegalPage;
  privacy: LegalPage;
  cookies: LegalPage;
  responsible: LegalPage;
}

export const LEGAL: Record<Locale, LegalDict> = {
  bg: {
    terms: {
      metaTitle: "Общи условия",
      metaDescription:
        "Общи условия за ползване на АСО — премиум браузърен портал за игри на карти и маса.",
      updated: "юни 2026 г.",
      h1: "Общи условия",
      blocks: [
        { type: "h2", text: "1. Кои сме ние" },
        {
          type: "p",
          text: "„АСО“ е браузърен портал за социални игри на карти и маса, предоставян от {org} („ние“, „нас“, „Операторът“). С достъпа до или използването на услугата приемате тези Общи условия.",
        },
        { type: "h2", text: "2. Възраст и допустимост" },
        {
          type: "p",
          text: "Услугата е предназначена за лица на възраст **18 години и повече**. С регистрацията декларирате, че сте навършили 18 години. Запазваме си правото да прекратим акаунти, за които има основание да смятаме, че принадлежат на непълнолетни.",
        },
        { type: "h2", text: "3. Социална игра — не е хазарт за реални пари" },
        {
          type: "p",
          text: "АСО е **социална игра**. Виртуалните чипове и скъпоценни камъни нямат парична стойност, не подлежат на осребряване, теглене или прехвърляне между играчи и служат единствено за игра в рамките на платформата. Игрите със залог се играят само с виртуални чипове. Това не е хазарт за реални пари.",
        },
        { type: "h2", text: "4. Акаунт" },
        {
          type: "p",
          text: "Отговаряте за поверителността на данните за вход и за всички действия чрез акаунта си. Уведомете ни незабавно при неоторизиран достъп. Един човек може да поддържа само един акаунт.",
        },
        { type: "h2", text: "5. Покупки и виртуални стоки" },
        {
          type: "p",
          text: "Платежите се обработват от Stripe. Купуват се само виртуални стоки (камъни, чипове, козметика) и VIP абонамент — за комфорт и облик, без предимство в играта („без плати, за да печелиш“). Виртуалните стоки се предоставят веднага след потвърдено плащане и **не подлежат на връщане**, освен ако законът не изисква друго. VIP е месечен абонамент, който се подновява автоматично до отказ.",
        },
        { type: "h2", text: "6. Правила за поведение" },
        {
          type: "p",
          text: "Забранено е: измама, ботове и автоматизация, колюзия, тормоз, реч на омраза, спам в чата, опити за заобикаляне на сигурността и всяка незаконна дейност. Нарушенията може да доведат до ограничения, заглушаване в чата или блокиране на акаунта.",
        },
        { type: "h2", text: "7. Честна игра" },
        {
          type: "p",
          text: "Игрите се изпълняват на сървъра с детерминистична логика и проверими разигравания. Откриваме съмнения за колюзия чрез автоматични сигнали, които се преглеждат от хора — никога автоматични банове.",
        },
        { type: "h2", text: "8. Прекратяване" },
        {
          type: "p",
          text: "Можете да изтриете акаунта си по всяко време от настройките. Може да ограничим или прекратим достъп при нарушение на тези условия. При прекратяване виртуалните стоки се губят без компенсация.",
        },
        { type: "h2", text: "9. Отговорност" },
        {
          type: "p",
          text: "Услугата се предоставя „както е“. В максималната позволена от закона степен не носим отговорност за непреки или случайни вреди, произтичащи от ползването на услугата.",
        },
        { type: "h2", text: "10. Промени и контакт" },
        {
          type: "p",
          text: "Може да актуализираме тези условия; съществените промени ще бъдат обявени в приложението. Въпроси: legal@carbonstealth.eu.",
        },
        {
          type: "p",
          text: "Вижте също {privacy}, {cookies} и {responsible}.",
        },
      ],
    },
    privacy: {
      metaTitle: "Политика за поверителност",
      metaDescription: "Как АСО събира, използва и защитава личните данни (GDPR).",
      updated: "юни 2026 г.",
      h1: "Политика за поверителност",
      blocks: [
        {
          type: "p",
          text: "Тази политика обяснява как {org} („администратор на лични данни“) обработва данните Ви в АСО, съгласно Общия регламент за защита на данните (GDPR).",
        },
        { type: "h2", text: "1. Какви данни събираме" },
        {
          type: "ul",
          items: [
            "**Акаунт:** имейл, име на играч, хеширана парола (argon2id).",
            "**Външен вход:** при вход с Google/Facebook — идентификатор и имейл от доставчика.",
            "**Игра и икономика:** рейтинг, нива, виртуални чипове и камъни, инвентар, история на мачове.",
            "**Плащания:** обработват се от Stripe; ние пазим само запис за покупката (без номера на карти).",
            "**Технически:** IP адрес и журнали за сигурност и предотвратяване на злоупотреби.",
          ],
        },
        { type: "h2", text: "2. Защо ги обработваме (основания)" },
        {
          type: "ul",
          items: [
            "**Изпълнение на договор:** предоставяне на акаунта, игрите и покупките.",
            "**Легитимен интерес:** сигурност, честна игра, предотвратяване на измами.",
            "**Съгласие:** незадължителни бисквитки/известия, където е приложимо.",
            "**Законово задължение:** счетоводни записи за покупки.",
          ],
        },
        { type: "h2", text: "3. Споделяне" },
        {
          type: "p",
          text: "Споделяме данни само с обработващи, необходими за услугата: Stripe (плащания), доставчик на имейли (потвърждение/възстановяване), хостинг инфраструктура. Не продаваме лични данни.",
        },
        { type: "h2", text: "4. Съхранение" },
        {
          type: "p",
          text: "Пазим данните на акаунта докато е активен. При изтриване анонимизираме личните данни; записите за покупки може да се запазят в анонимизиран вид за счетоводни цели за законоустановения срок.",
        },
        { type: "h2", text: "5. Вашите права" },
        {
          type: "p",
          text: "Имате право на достъп, коригиране, изтриване, преносимост и възражение. Директно от приложението можете да:",
        },
        {
          type: "ul",
          items: [
            "**изтеглите данните си** (Профил → Поверителност → Изтегли данните ми);",
            "**изтриете акаунта си** (Профил → Поверителност → Изтрий акаунта).",
          ],
        },
        {
          type: "p",
          text: "Можете да подадете и жалба до Комисията за защита на личните данни (КЗЛД).",
        },
        { type: "h2", text: "6. Сигурност" },
        {
          type: "p",
          text: "Паролите се хешират с argon2id; сесиите използват httpOnly бисквитки. Прилагаме технически и организационни мерки за защита на данните.",
        },
        { type: "h2", text: "7. Контакт" },
        {
          type: "p",
          text: "Запитвания за поверителност: privacy@carbonstealth.eu.",
        },
        {
          type: "p",
          text: "Вижте също {terms} и {cookies}.",
        },
      ],
    },
    cookies: {
      metaTitle: "Политика за бисквитки",
      metaDescription: "Как АСО използва бисквитки и подобни технологии.",
      updated: "юни 2026 г.",
      h1: "Политика за бисквитки",
      blocks: [
        {
          type: "p",
          text: "Използваме само строго необходими бисквитки, нужни за работата на услугата. Не използваме рекламни или проследяващи бисквитки на трети страни.",
        },
        { type: "h2", text: "Строго необходими" },
        {
          type: "ul",
          items: [
            "`aso_at`, `aso_rt` — httpOnly бисквитки за сесия (вход и подновяване на достъпа). Без тях не можете да останете вписани.",
            "Краткотрайна бисквитка за състояние при вход с Google/Facebook (CSRF защита).",
          ],
        },
        {
          type: "p",
          text: "Тъй като тези бисквитки са строго необходими, те не изискват съгласие. Можете да ги блокирате от браузъра си, но тогава входът няма да работи.",
        },
        { type: "h2", text: "Локално съхранение" },
        {
          type: "p",
          text: "Пазим дребни предпочитания (език, намалено движение, потвърждение на банера за бисквитки) в локалното хранилище на браузъра — те не напускат устройството Ви.",
        },
        { type: "h2", text: "Контакт" },
        {
          type: "p",
          text: "Въпроси: privacy@carbonstealth.eu. Вижте и {privacy}.",
        },
      ],
    },
    responsible: {
      metaTitle: "Отговорна игра",
      metaDescription:
        "АСО е социална игра. Съвети за здравословна и балансирана игра.",
      h1: "Отговорна игра",
      blocks: [
        {
          type: "p",
          text: "АСО е **социална игра** с виртуални чипове, които нямат парична стойност и не подлежат на осребряване. Дори без реални пари искаме играта да остава забавление, а не задължение.",
        },
        { type: "h2", text: "Нашите принципи" },
        {
          type: "ul",
          items: [
            "Само за лица над 18 години.",
            "Виртуалните чипове не са пари и не се теглят.",
            "Без „плати, за да печелиш“ — покупките дават само облик и комфорт.",
            "Безплатни чипове всеки ден — не е нужно да купуваш, за да играеш.",
          ],
        },
        { type: "h2", text: "Съвети за баланс" },
        {
          type: "ul",
          items: [
            "Задавай си времеви граници и прави почивки.",
            "Играй за удоволствие, не за да „наваксаш“ загуби.",
            "Не позволявай играта да измества сън, работа или близки.",
          ],
        },
        { type: "h2", text: "Нужна ли е помощ?" },
        {
          type: "p",
          text: "Ако усещаш, че играта (или хазартът като цяло) ти влияе негативно, потърси подкрепа от специалист или организация за помощ при хазартна зависимост във твоята държава. В чужбина можеш да започнеш от {begambleaware}.",
        },
        {
          type: "p",
          text: "Можеш да изтриеш акаунта си по всяко време от Профил → Поверителност. Вижте и {terms}.",
        },
      ],
    },
  },

  en: {
    terms: {
      metaTitle: "Terms of Service",
      metaDescription:
        "Terms of service for АСО — a premium browser portal for card and table games.",
      updated: "June 2026",
      h1: "Terms of Service",
      blocks: [
        { type: "h2", text: "1. Who we are" },
        {
          type: "p",
          text: "“АСО” is a browser portal for social card and table games, provided by {org} (“we”, “us”, “the Operator”). By accessing or using the service you accept these Terms of Service.",
        },
        { type: "h2", text: "2. Age and eligibility" },
        {
          type: "p",
          text: "The service is intended for persons aged **18 and over**. By registering you declare that you are at least 18 years old. We reserve the right to terminate accounts that we have reason to believe belong to minors.",
        },
        { type: "h2", text: "3. Social game — not real-money gambling" },
        {
          type: "p",
          text: "АСО is a **social game**. Virtual chips and gems have no monetary value, cannot be cashed out, withdrawn or transferred between players, and serve solely for play within the platform. Wagering games are played only with virtual chips. This is not real-money gambling.",
        },
        { type: "h2", text: "4. Account" },
        {
          type: "p",
          text: "You are responsible for keeping your login details confidential and for all activity through your account. Notify us immediately of any unauthorized access. One person may maintain only one account.",
        },
        { type: "h2", text: "5. Purchases and virtual goods" },
        {
          type: "p",
          text: "Payments are processed by Stripe. Only virtual goods (gems, chips, cosmetics) and the VIP subscription are sold — for comfort and appearance, with no in-game advantage (“no pay to win”). Virtual goods are delivered immediately after a confirmed payment and **are non-refundable**, unless the law requires otherwise. VIP is a monthly subscription that renews automatically until cancelled.",
        },
        { type: "h2", text: "6. Code of conduct" },
        {
          type: "p",
          text: "The following are prohibited: cheating, bots and automation, collusion, harassment, hate speech, chat spam, attempts to circumvent security and any unlawful activity. Violations may lead to restrictions, chat muting or account suspension.",
        },
        { type: "h2", text: "7. Fair play" },
        {
          type: "p",
          text: "Games run on the server with deterministic logic and verifiable hands. We detect suspected collusion through automated signals that are reviewed by humans — never automatic bans.",
        },
        { type: "h2", text: "8. Termination" },
        {
          type: "p",
          text: "You can delete your account at any time from the settings. We may restrict or terminate access in case of a breach of these terms. Upon termination, virtual goods are lost without compensation.",
        },
        { type: "h2", text: "9. Liability" },
        {
          type: "p",
          text: "The service is provided “as is”. To the maximum extent permitted by law, we are not liable for indirect or incidental damages arising from the use of the service.",
        },
        { type: "h2", text: "10. Changes and contact" },
        {
          type: "p",
          text: "We may update these terms; material changes will be announced in the app. Questions: legal@carbonstealth.eu.",
        },
        {
          type: "p",
          text: "See also {privacy}, {cookies} and {responsible}.",
        },
      ],
    },
    privacy: {
      metaTitle: "Privacy Policy",
      metaDescription: "How АСО collects, uses and protects personal data (GDPR).",
      updated: "June 2026",
      h1: "Privacy Policy",
      blocks: [
        {
          type: "p",
          text: "This policy explains how {org} (“data controller”) processes your data in АСО, in accordance with the General Data Protection Regulation (GDPR).",
        },
        { type: "h2", text: "1. What data we collect" },
        {
          type: "ul",
          items: [
            "**Account:** email, player name, hashed password (argon2id).",
            "**External sign-in:** when signing in with Google/Facebook — identifier and email from the provider.",
            "**Game and economy:** rating, levels, virtual chips and gems, inventory, match history.",
            "**Payments:** processed by Stripe; we keep only a record of the purchase (no card numbers).",
            "**Technical:** IP address and logs for security and abuse prevention.",
          ],
        },
        { type: "h2", text: "2. Why we process it (legal bases)" },
        {
          type: "ul",
          items: [
            "**Performance of a contract:** providing the account, the games and the purchases.",
            "**Legitimate interest:** security, fair play, fraud prevention.",
            "**Consent:** optional cookies/notifications, where applicable.",
            "**Legal obligation:** accounting records for purchases.",
          ],
        },
        { type: "h2", text: "3. Sharing" },
        {
          type: "p",
          text: "We share data only with processors necessary for the service: Stripe (payments), an email provider (confirmation/recovery), hosting infrastructure. We do not sell personal data.",
        },
        { type: "h2", text: "4. Retention" },
        {
          type: "p",
          text: "We keep account data while the account is active. Upon deletion we anonymize personal data; purchase records may be retained in anonymized form for accounting purposes for the statutory period.",
        },
        { type: "h2", text: "5. Your rights" },
        {
          type: "p",
          text: "You have the right to access, rectification, erasure, portability and objection. Directly from the app you can:",
        },
        {
          type: "ul",
          items: [
            "**download your data** (Profile → Privacy → Download my data);",
            "**delete your account** (Profile → Privacy → Delete account).",
          ],
        },
        {
          type: "p",
          text: "You can also lodge a complaint with the Commission for Personal Data Protection (CPDP).",
        },
        { type: "h2", text: "6. Security" },
        {
          type: "p",
          text: "Passwords are hashed with argon2id; sessions use httpOnly cookies. We apply technical and organizational measures to protect data.",
        },
        { type: "h2", text: "7. Contact" },
        {
          type: "p",
          text: "Privacy enquiries: privacy@carbonstealth.eu.",
        },
        {
          type: "p",
          text: "See also {terms} and {cookies}.",
        },
      ],
    },
    cookies: {
      metaTitle: "Cookie Policy",
      metaDescription: "How АСО uses cookies and similar technologies.",
      updated: "June 2026",
      h1: "Cookie Policy",
      blocks: [
        {
          type: "p",
          text: "We use only strictly necessary cookies required for the service to work. We do not use advertising or third-party tracking cookies.",
        },
        { type: "h2", text: "Strictly necessary" },
        {
          type: "ul",
          items: [
            "`aso_at`, `aso_rt` — httpOnly session cookies (sign-in and access renewal). Without them you cannot stay signed in.",
            "A short-lived state cookie when signing in with Google/Facebook (CSRF protection).",
          ],
        },
        {
          type: "p",
          text: "Because these cookies are strictly necessary, they do not require consent. You can block them in your browser, but then sign-in will not work.",
        },
        { type: "h2", text: "Local storage" },
        {
          type: "p",
          text: "We keep small preferences (language, reduced motion, cookie banner acknowledgement) in the browser's local storage — they never leave your device.",
        },
        { type: "h2", text: "Contact" },
        {
          type: "p",
          text: "Questions: privacy@carbonstealth.eu. See also {privacy}.",
        },
      ],
    },
    responsible: {
      metaTitle: "Responsible Play",
      metaDescription:
        "АСО is a social game. Tips for healthy and balanced play.",
      h1: "Responsible Play",
      blocks: [
        {
          type: "p",
          text: "АСО is a **social game** with virtual chips that have no monetary value and cannot be cashed out. Even without real money, we want play to remain entertainment, not an obligation.",
        },
        { type: "h2", text: "Our principles" },
        {
          type: "ul",
          items: [
            "For persons over 18 only.",
            "Virtual chips are not money and cannot be withdrawn.",
            "No “pay to win” — purchases provide only appearance and comfort.",
            "Free chips every day — you don't need to buy in order to play.",
          ],
        },
        { type: "h2", text: "Tips for balance" },
        {
          type: "ul",
          items: [
            "Set yourself time limits and take breaks.",
            "Play for enjoyment, not to “chase” losses.",
            "Don't let play crowd out sleep, work or loved ones.",
          ],
        },
        { type: "h2", text: "Need help?" },
        {
          type: "p",
          text: "If you feel that play (or gambling in general) is affecting you negatively, seek support from a specialist or an organization that helps with gambling addiction in your country. Abroad you can start with {begambleaware}.",
        },
        {
          type: "p",
          text: "You can delete your account at any time from Profile → Privacy. See also {terms}.",
        },
      ],
    },
  },

  it: {
    terms: {
      metaTitle: "Termini di servizio",
      metaDescription:
        "Termini di servizio di АСО — portale browser premium per giochi di carte e da tavolo.",
      updated: "giugno 2026",
      h1: "Termini di servizio",
      blocks: [
        { type: "h2", text: "1. Chi siamo" },
        {
          type: "p",
          text: "«АСО» è un portale browser per giochi sociali di carte e da tavolo, fornito da {org} («noi», «ci», «l'Operatore»). Accedendo o utilizzando il servizio accetti i presenti Termini di servizio.",
        },
        { type: "h2", text: "2. Età e ammissibilità" },
        {
          type: "p",
          text: "Il servizio è destinato a persone di età pari o superiore a **18 anni**. Con la registrazione dichiari di aver compiuto 18 anni. Ci riserviamo il diritto di chiudere gli account che abbiamo motivo di ritenere appartenere a minorenni.",
        },
        { type: "h2", text: "3. Gioco sociale — non è gioco d'azzardo con denaro reale" },
        {
          type: "p",
          text: "АСО è un **gioco sociale**. Le fiche e le gemme virtuali non hanno valore monetario, non possono essere convertite in denaro, prelevate o trasferite tra giocatori e servono unicamente per giocare all'interno della piattaforma. I giochi con puntata si giocano solo con fiche virtuali. Questo non è gioco d'azzardo con denaro reale.",
        },
        { type: "h2", text: "4. Account" },
        {
          type: "p",
          text: "Sei responsabile della riservatezza dei dati di accesso e di tutte le attività svolte tramite il tuo account. Avvisaci immediatamente in caso di accesso non autorizzato. Una persona può mantenere un solo account.",
        },
        { type: "h2", text: "5. Acquisti e beni virtuali" },
        {
          type: "p",
          text: "I pagamenti sono elaborati da Stripe. Si acquistano solo beni virtuali (gemme, fiche, oggetti estetici) e l'abbonamento VIP — per comodità ed estetica, senza vantaggio nel gioco («niente pay to win»). I beni virtuali vengono forniti immediatamente dopo un pagamento confermato e **non sono rimborsabili**, salvo quanto diversamente richiesto dalla legge. Il VIP è un abbonamento mensile che si rinnova automaticamente fino alla disdetta.",
        },
        { type: "h2", text: "6. Regole di condotta" },
        {
          type: "p",
          text: "Sono vietati: imbroglio, bot e automazione, collusione, molestie, incitamento all'odio, spam in chat, tentativi di aggirare la sicurezza e qualsiasi attività illecita. Le violazioni possono comportare restrizioni, silenziamento in chat o blocco dell'account.",
        },
        { type: "h2", text: "7. Gioco corretto" },
        {
          type: "p",
          text: "I giochi vengono eseguiti sul server con logica deterministica e mani verificabili. Rileviamo i sospetti di collusione tramite segnalazioni automatiche che vengono esaminate da persone — mai ban automatici.",
        },
        { type: "h2", text: "8. Risoluzione" },
        {
          type: "p",
          text: "Puoi eliminare il tuo account in qualsiasi momento dalle impostazioni. Possiamo limitare o revocare l'accesso in caso di violazione dei presenti termini. In caso di risoluzione, i beni virtuali vengono persi senza compensazione.",
        },
        { type: "h2", text: "9. Responsabilità" },
        {
          type: "p",
          text: "Il servizio è fornito «così com'è». Nella misura massima consentita dalla legge non siamo responsabili per danni indiretti o incidentali derivanti dall'uso del servizio.",
        },
        { type: "h2", text: "10. Modifiche e contatti" },
        {
          type: "p",
          text: "Possiamo aggiornare i presenti termini; le modifiche sostanziali saranno annunciate nell'app. Domande: legal@carbonstealth.eu.",
        },
        {
          type: "p",
          text: "Vedi anche {privacy}, {cookies} e {responsible}.",
        },
      ],
    },
    privacy: {
      metaTitle: "Informativa sulla privacy",
      metaDescription:
        "Come АСО raccoglie, utilizza e protegge i dati personali (GDPR).",
      updated: "giugno 2026",
      h1: "Informativa sulla privacy",
      blocks: [
        {
          type: "p",
          text: "La presente informativa spiega come {org} («titolare del trattamento») tratta i tuoi dati in АСО, ai sensi del Regolamento generale sulla protezione dei dati (GDPR).",
        },
        { type: "h2", text: "1. Quali dati raccogliamo" },
        {
          type: "ul",
          items: [
            "**Account:** email, nome del giocatore, password con hash (argon2id).",
            "**Accesso esterno:** con l'accesso tramite Google/Facebook — identificatore ed email forniti dal provider.",
            "**Gioco ed economia:** punteggio, livelli, fiche e gemme virtuali, inventario, cronologia delle partite.",
            "**Pagamenti:** elaborati da Stripe; conserviamo solo un registro dell'acquisto (senza numeri di carta).",
            "**Tecnici:** indirizzo IP e log per la sicurezza e la prevenzione degli abusi.",
          ],
        },
        { type: "h2", text: "2. Perché li trattiamo (basi giuridiche)" },
        {
          type: "ul",
          items: [
            "**Esecuzione di un contratto:** fornitura dell'account, dei giochi e degli acquisti.",
            "**Interesse legittimo:** sicurezza, gioco corretto, prevenzione delle frodi.",
            "**Consenso:** cookie/notifiche facoltativi, ove applicabile.",
            "**Obbligo di legge:** registrazioni contabili degli acquisti.",
          ],
        },
        { type: "h2", text: "3. Condivisione" },
        {
          type: "p",
          text: "Condividiamo i dati solo con i responsabili del trattamento necessari per il servizio: Stripe (pagamenti), un provider email (conferma/recupero), infrastruttura di hosting. Non vendiamo dati personali.",
        },
        { type: "h2", text: "4. Conservazione" },
        {
          type: "p",
          text: "Conserviamo i dati dell'account finché è attivo. In caso di eliminazione anonimizziamo i dati personali; le registrazioni degli acquisti possono essere conservate in forma anonimizzata a fini contabili per il periodo previsto dalla legge.",
        },
        { type: "h2", text: "5. I tuoi diritti" },
        {
          type: "p",
          text: "Hai diritto di accesso, rettifica, cancellazione, portabilità e opposizione. Direttamente dall'app puoi:",
        },
        {
          type: "ul",
          items: [
            "**scaricare i tuoi dati** (Profilo → Privacy → Scarica i miei dati);",
            "**eliminare il tuo account** (Profilo → Privacy → Elimina account).",
          ],
        },
        {
          type: "p",
          text: "Puoi anche presentare un reclamo alla Commissione per la protezione dei dati personali (CPDP).",
        },
        { type: "h2", text: "6. Sicurezza" },
        {
          type: "p",
          text: "Le password sono sottoposte ad hashing con argon2id; le sessioni utilizzano cookie httpOnly. Applichiamo misure tecniche e organizzative per la protezione dei dati.",
        },
        { type: "h2", text: "7. Contatti" },
        {
          type: "p",
          text: "Richieste sulla privacy: privacy@carbonstealth.eu.",
        },
        {
          type: "p",
          text: "Vedi anche {terms} e {cookies}.",
        },
      ],
    },
    cookies: {
      metaTitle: "Informativa sui cookie",
      metaDescription: "Come АСО utilizza i cookie e tecnologie simili.",
      updated: "giugno 2026",
      h1: "Informativa sui cookie",
      blocks: [
        {
          type: "p",
          text: "Utilizziamo solo cookie strettamente necessari al funzionamento del servizio. Non utilizziamo cookie pubblicitari o di tracciamento di terze parti.",
        },
        { type: "h2", text: "Strettamente necessari" },
        {
          type: "ul",
          items: [
            "`aso_at`, `aso_rt` — cookie di sessione httpOnly (accesso e rinnovo dell'accesso). Senza di essi non puoi rimanere connesso.",
            "Un cookie di stato di breve durata per l'accesso tramite Google/Facebook (protezione CSRF).",
          ],
        },
        {
          type: "p",
          text: "Poiché questi cookie sono strettamente necessari, non richiedono il consenso. Puoi bloccarli dal tuo browser, ma in tal caso l'accesso non funzionerà.",
        },
        { type: "h2", text: "Archiviazione locale" },
        {
          type: "p",
          text: "Conserviamo piccole preferenze (lingua, movimento ridotto, conferma del banner dei cookie) nell'archiviazione locale del browser — non lasciano il tuo dispositivo.",
        },
        { type: "h2", text: "Contatti" },
        {
          type: "p",
          text: "Domande: privacy@carbonstealth.eu. Vedi anche {privacy}.",
        },
      ],
    },
    responsible: {
      metaTitle: "Gioco responsabile",
      metaDescription:
        "АСО è un gioco sociale. Consigli per un gioco sano ed equilibrato.",
      h1: "Gioco responsabile",
      blocks: [
        {
          type: "p",
          text: "АСО è un **gioco sociale** con fiche virtuali che non hanno valore monetario e non possono essere convertite in denaro. Anche senza denaro reale, vogliamo che il gioco resti un divertimento, non un obbligo.",
        },
        { type: "h2", text: "I nostri principi" },
        {
          type: "ul",
          items: [
            "Solo per persone di età superiore a 18 anni.",
            "Le fiche virtuali non sono denaro e non possono essere prelevate.",
            "Niente «pay to win» — gli acquisti offrono solo estetica e comodità.",
            "Fiche gratuite ogni giorno — non è necessario acquistare per giocare.",
          ],
        },
        { type: "h2", text: "Consigli per l'equilibrio" },
        {
          type: "ul",
          items: [
            "Imponiti dei limiti di tempo e fai delle pause.",
            "Gioca per piacere, non per «recuperare» le perdite.",
            "Non lasciare che il gioco tolga spazio al sonno, al lavoro o alle persone care.",
          ],
        },
        { type: "h2", text: "Hai bisogno di aiuto?" },
        {
          type: "p",
          text: "Se senti che il gioco (o il gioco d'azzardo in generale) ti sta influenzando negativamente, cerca supporto presso uno specialista o un'organizzazione di aiuto per la dipendenza dal gioco d'azzardo nel tuo paese. All'estero puoi iniziare da {begambleaware}.",
        },
        {
          type: "p",
          text: "Puoi eliminare il tuo account in qualsiasi momento da Profilo → Privacy. Vedi anche {terms}.",
        },
      ],
    },
  },
};
