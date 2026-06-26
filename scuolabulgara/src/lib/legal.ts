import type { Locale } from "./i18n";

export type LegalSection = { h: string; p?: string[]; list?: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };
export type LegalKind = "privacy" | "cookie" | "termini";

export const LEGAL_UPDATED = "25/06/2026";

const CONTROLLER = {
  name: "Associazione Qui Bulgaria",
  address: "Via Giovanni Battista Piazzetta, 20138 Milano (MI), Italia",
  email: "centroquibulgaria@gmail.com",
};

export const LEGAL: Record<LegalKind, Record<Locale, LegalDoc>> = {
  privacy: {
    it: {
      title: "Informativa sulla privacy",
      intro:
        "La presente informativa descrive come l’Associazione «Qui Bulgaria» tratta i dati personali degli utenti del sito, ai sensi del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003.",
      sections: [
        { h: "Titolare del trattamento", p: [`${CONTROLLER.name}, ${CONTROLLER.address}. Email: ${CONTROLLER.email}.`] },
        { h: "Dati che raccogliamo", list: [
          "Dati forniti volontariamente tramite il modulo di contatto: nome e cognome, email, oggetto della richiesta e messaggio.",
          "Dati tecnici di navigazione (es. indirizzo IP, data e ora, pagine visitate) raccolti dai sistemi e dal provider di hosting per finalità di sicurezza e funzionamento.",
        ] },
        { h: "Finalità e base giuridica", list: [
          "Rispondere alle richieste e fornire informazioni su corsi e attività — esecuzione di misure precontrattuali su richiesta dell’interessato e legittimo interesse a riscontrare i messaggi (art. 6.1.b e 6.1.f GDPR).",
          "Garantire sicurezza, integrità e corretto funzionamento del sito — legittimo interesse (art. 6.1.f GDPR).",
        ] },
        { h: "Conservazione dei dati", p: ["I dati del modulo sono conservati per il tempo necessario a gestire la richiesta e gli eventuali adempimenti conseguenti. I log tecnici sono conservati per periodi limitati e proporzionati alle finalità di sicurezza."] },
        { h: "Comunicazione dei dati", p: ["I dati non sono venduti né diffusi. Possono essere trattati, per nostro conto, da fornitori tecnici nominati responsabili del trattamento: il provider di hosting (server in UE) e il servizio di posta elettronica/SMTP usato per inoltrare i messaggi del modulo. Il plugin di Facebook viene caricato solo previo consenso e comporta un trattamento da parte di Meta Platforms Ireland Ltd. (e Meta Platforms, Inc. negli USA) secondo la sua informativa; l’eventuale trasferimento negli Stati Uniti avviene sulla base del EU-US Data Privacy Framework e/o di clausole contrattuali standard."] },
        { h: "Diritti dell’interessato", p: ["Puoi esercitare i diritti di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità scrivendo a " + CONTROLLER.email + ". Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali."] },
        { h: "Minori", p: ["I corsi rivolti ai bambini sono gestiti con il coinvolgimento e il consenso dei genitori o di chi ne esercita la responsabilità genitoriale."] },
        { h: "Modifiche", p: ["Ci riserviamo di aggiornare la presente informativa. Le modifiche saranno pubblicate su questa pagina con la relativa data."] },
      ],
    },
    bg: {
      title: "Политика за поверителност",
      intro:
        "Тази политика описва как Асоциация „Qui Bulgaria“ обработва личните данни на потребителите на сайта съгласно Регламент (ЕС) 2016/679 (GDPR).",
      sections: [
        { h: "Администратор на данните", p: [`${CONTROLLER.name}, ${CONTROLLER.address}. Имейл: ${CONTROLLER.email}.`] },
        { h: "Какви данни събираме", list: [
          "Данни, предоставени доброволно чрез формата за контакт: име и фамилия, имейл, тема и съобщение.",
          "Технически данни за навигацията (напр. IP адрес, дата и час, посетени страници), събирани от системите и хостинг доставчика за целите на сигурността и функционирането.",
        ] },
        { h: "Цели и правно основание", list: [
          "Да отговаряме на запитвания и да предоставяме информация за курсове и дейности — преддоговорни мерки по искане на субекта и легитимен интерес да отговорим на съобщенията (чл. 6.1.b и 6.1.f GDPR).",
          "Да гарантираме сигурността и правилното функциониране на сайта — легитимен интерес (чл. 6.1.f GDPR).",
        ] },
        { h: "Срок на съхранение", p: ["Данните от формата се съхраняват за времето, необходимо за обработка на запитването и свързаните задължения. Техническите логове се пазят за ограничени периоди, пропорционални на целите за сигурност."] },
        { h: "Предоставяне на данни", p: ["Данните не се продават и не се разпространяват. Могат да се обработват от наше име от технически доставчици в качеството им на обработващи: хостинг доставчикът (сървъри в ЕС) и услугата за електронна поща/SMTP, чрез която препращаме съобщенията от формата. Плъгинът на Facebook се зарежда само след съгласие и води до обработка от страна на Meta Platforms Ireland Ltd. (и Meta Platforms, Inc. в САЩ) съгласно нейната политика; евентуалното предаване към САЩ се основава на Рамката ЕС–САЩ за поверителност на данните (EU-US Data Privacy Framework) и/или на стандартни договорни клаузи."] },
        { h: "Права на субекта на данни", p: ["Можете да упражните правата си на достъп, коригиране, изтриване, ограничаване, възражение и преносимост, като пишете на " + CONTROLLER.email + ". Имате право и да подадете жалба до надзорния орган за защита на личните данни."] },
        { h: "Непълнолетни", p: ["Курсовете за деца се организират с участието и съгласието на родителите или настойниците."] },
        { h: "Промени", p: ["Запазваме си правото да актуализираме тази политика. Промените се публикуват на тази страница с посочена дата."] },
      ],
    },
    en: {
      title: "Privacy Policy",
      intro:
        "This policy explains how the “Qui Bulgaria” Association processes the personal data of website users in accordance with Regulation (EU) 2016/679 (GDPR).",
      sections: [
        { h: "Data controller", p: [`${CONTROLLER.name}, ${CONTROLLER.address}. Email: ${CONTROLLER.email}.`] },
        { h: "Data we collect", list: [
          "Data you provide voluntarily through the contact form: full name, email, subject and message.",
          "Technical browsing data (e.g. IP address, date and time, pages visited) collected by our systems and hosting provider for security and operational purposes.",
        ] },
        { h: "Purposes and legal basis", list: [
          "To answer enquiries and provide information about courses and activities — pre-contractual measures at your request and our legitimate interest in replying to messages (Art. 6.1.b and 6.1.f GDPR).",
          "To ensure the security and proper functioning of the site — legitimate interest (Art. 6.1.f GDPR).",
        ] },
        { h: "Data retention", p: ["Form data is kept for as long as necessary to handle the request and any related obligations. Technical logs are kept for limited periods proportionate to security purposes."] },
        { h: "Disclosure of data", p: ["Data is never sold or disclosed. It may be processed on our behalf by technical providers acting as processors: the hosting provider (servers in the EU) and the email/SMTP service used to forward contact-form messages. The Facebook plugin loads only after consent and entails processing by Meta Platforms Ireland Ltd. (and Meta Platforms, Inc. in the USA) under its own policy; any transfer to the United States relies on the EU-US Data Privacy Framework and/or standard contractual clauses."] },
        { h: "Your rights", p: ["You may exercise your rights of access, rectification, erasure, restriction, objection and portability by writing to " + CONTROLLER.email + ". You also have the right to lodge a complaint with the competent data protection authority."] },
        { h: "Minors", p: ["Courses for children are managed with the involvement and consent of parents or legal guardians."] },
        { h: "Changes", p: ["We may update this policy. Changes will be published on this page with the relevant date."] },
      ],
    },
  },
  cookie: {
    it: {
      title: "Cookie policy",
      intro: "Questo sito utilizza un numero minimo di cookie. Di seguito spieghiamo quali e perché.",
      sections: [
        { h: "Cosa sono i cookie", p: ["I cookie sono piccoli file di testo che i siti salvano sul dispositivo per memorizzare informazioni, ad esempio le preferenze dell’utente."] },
        { h: "Cookie tecnici che usiamo", list: [
          "qb_lang — memorizza la lingua scelta (funzionale).",
          "qb_admin — sessione di accesso, solo per gli amministratori del sito.",
          "qb-cookie-ack e qb-fb-consent — salvano le tue scelte (avviso cookie e consenso Facebook); sono memorizzati nel browser (localStorage).",
        ] },
        { h: "Cookie di terze parti", p: ["Il plugin della pagina Facebook viene caricato solo dopo il tuo consenso esplicito e può impostare cookie di Meta Platforms, secondo l’informativa di Facebook."] },
        { h: "Nessuna profilazione", p: ["Non utilizziamo cookie pubblicitari né strumenti di analisi con profilazione dell’utente."] },
        { h: "Gestione dei cookie", p: ["Puoi bloccare o eliminare i cookie dalle impostazioni del browser. La disattivazione dei cookie tecnici può limitare alcune funzioni, come il ricordo della lingua."] },
        { h: "Aggiornamenti", p: ["Questa pagina può essere aggiornata; la data di revisione è indicata in alto."] },
      ],
    },
    bg: {
      title: "Политика за бисквитките",
      intro: "Този сайт използва минимален брой бисквитки. По-долу обясняваме кои и защо.",
      sections: [
        { h: "Какво представляват бисквитките", p: ["Бисквитките са малки текстови файлове, които сайтовете запазват на устройството, за да съхраняват информация, например предпочитанията на потребителя."] },
        { h: "Технически бисквитки, които използваме", list: [
          "qb_lang — запазва избрания език (функционална).",
          "qb_admin — сесия за вход, само за администраторите на сайта.",
          "qb-cookie-ack и qb-fb-consent — запазват вашия избор (известие за бисквитки и съгласие за Facebook); съхраняват се в браузъра (localStorage).",
        ] },
        { h: "Бисквитки на трети страни", p: ["Плъгинът на страницата във Facebook се зарежда само след вашето изрично съгласие и може да зададе бисквитки на Meta Platforms съгласно политиката на Facebook."] },
        { h: "Без профилиране", p: ["Не използваме рекламни бисквитки, нито аналитични инструменти с профилиране на потребителя."] },
        { h: "Управление на бисквитките", p: ["Можете да блокирате или изтриете бисквитките от настройките на браузъра. Изключването на техническите бисквитки може да ограничи някои функции, като запомнянето на езика."] },
        { h: "Актуализации", p: ["Тази страница може да бъде актуализирана; датата на ревизия е посочена най-горе."] },
      ],
    },
    en: {
      title: "Cookie Policy",
      intro: "This website uses a minimal number of cookies. Below we explain which ones and why.",
      sections: [
        { h: "What cookies are", p: ["Cookies are small text files that websites store on your device to remember information, such as user preferences."] },
        { h: "Technical cookies we use", list: [
          "qb_lang — stores your chosen language (functional).",
          "qb_admin — login session, only for site administrators.",
          "qb-cookie-ack and qb-fb-consent — store your choices (cookie notice and Facebook consent); kept in your browser (localStorage).",
        ] },
        { h: "Third-party cookies", p: ["The Facebook page plugin loads only after your explicit consent and may set cookies from Meta Platforms, in accordance with Facebook’s policy."] },
        { h: "No profiling", p: ["We do not use advertising cookies or analytics tools that profile users."] },
        { h: "Managing cookies", p: ["You can block or delete cookies from your browser settings. Disabling technical cookies may limit some features, such as remembering your language."] },
        { h: "Updates", p: ["This page may be updated; the revision date is shown at the top."] },
      ],
    },
  },
  termini: {
    it: {
      title: "Termini e condizioni",
      intro: "Le presenti condizioni regolano l’uso del sito dell’Associazione «Qui Bulgaria».",
      sections: [
        { h: "Titolare", p: [`${CONTROLLER.name}, ${CONTROLLER.address}. Email: ${CONTROLLER.email}.`] },
        { h: "Oggetto del sito", p: ["Il sito ha finalità informativa e culturale. Le iscrizioni a corsi e attività si perfezionano solo con conferma da parte dell’Associazione e secondo le modalità comunicate."] },
        { h: "Proprietà intellettuale", p: ["I testi, il logo e il nome «Qui Bulgaria» sono di proprietà dell’Associazione e non possono essere riprodotti senza autorizzazione. La fotografia della rosa bulgara è di Edal Anton Lefterov, distribuita con licenza CC BY-SA 3.0 tramite Wikimedia Commons."] },
        { h: "Uso del sito", p: ["L’utente si impegna a un uso lecito e corretto del sito, astenendosi da attività che ne pregiudichino il funzionamento o la sicurezza."] },
        { h: "Link esterni", p: ["Il sito può contenere collegamenti a risorse di terzi (es. Facebook). Non siamo responsabili dei contenuti e delle pratiche di tali siti."] },
        { h: "Limitazione di responsabilità", p: ["Le informazioni sono fornite con la massima cura ma “così come sono”. Non garantiamo l’assenza di errori o l’ininterrotta disponibilità del servizio."] },
        { h: "Legge applicabile e foro", p: ["Le presenti condizioni sono regolate dalla legge italiana. Per ogni controversia è competente il Foro di Milano."] },
      ],
    },
    bg: {
      title: "Общи условия",
      intro: "Настоящите условия уреждат използването на сайта на Асоциация „Qui Bulgaria“.",
      sections: [
        { h: "Администратор", p: [`${CONTROLLER.name}, ${CONTROLLER.address}. Имейл: ${CONTROLLER.email}.`] },
        { h: "Предмет на сайта", p: ["Сайтът има информационна и културна цел. Записванията за курсове и дейности се финализират само след потвърждение от Асоциацията и по обявения ред."] },
        { h: "Интелектуална собственост", p: ["Текстовете, логото и името „Qui Bulgaria“ са собственост на Асоциацията и не могат да се възпроизвеждат без разрешение. Снимката на българската роза е на Edal Anton Lefterov, разпространявана с лиценз CC BY-SA 3.0 чрез Wikimedia Commons."] },
        { h: "Използване на сайта", p: ["Потребителят се задължава да използва сайта законосъобразно и коректно, като се въздържа от действия, които вредят на функционирането или сигурността му."] },
        { h: "Външни връзки", p: ["Сайтът може да съдържа връзки към ресурси на трети страни (напр. Facebook). Не носим отговорност за съдържанието и практиките на тези сайтове."] },
        { h: "Ограничаване на отговорността", p: ["Информацията се предоставя с максимална грижа, но „такава, каквато е“. Не гарантираме липсата на грешки или непрекъснатата наличност на услугата."] },
        { h: "Приложимо право и подсъдност", p: ["Настоящите условия се уреждат от италианското право. За всеки спор е компетентен съдът в Милано."] },
      ],
    },
    en: {
      title: "Terms & Conditions",
      intro: "These terms govern the use of the website of the “Qui Bulgaria” Association.",
      sections: [
        { h: "Owner", p: [`${CONTROLLER.name}, ${CONTROLLER.address}. Email: ${CONTROLLER.email}.`] },
        { h: "Purpose of the site", p: ["The site is informational and cultural in nature. Enrolment in courses and activities is completed only upon confirmation by the Association and according to the communicated procedures."] },
        { h: "Intellectual property", p: ["The texts, logo and name “Qui Bulgaria” are owned by the Association and may not be reproduced without permission. The photograph of the Bulgarian rose is by Edal Anton Lefterov, distributed under the CC BY-SA 3.0 licence via Wikimedia Commons."] },
        { h: "Use of the site", p: ["Users agree to lawful and proper use of the site, refraining from any activity that impairs its operation or security."] },
        { h: "External links", p: ["The site may contain links to third-party resources (e.g. Facebook). We are not responsible for the content or practices of those sites."] },
        { h: "Limitation of liability", p: ["Information is provided with the utmost care but “as is”. We do not guarantee the absence of errors or uninterrupted availability of the service."] },
        { h: "Governing law and jurisdiction", p: ["These terms are governed by Italian law. The Court of Milan has jurisdiction over any dispute."] },
      ],
    },
  },
};
