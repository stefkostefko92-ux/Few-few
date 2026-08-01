import type { Locale } from '@/i18n/config';

/**
 * Съдържанието на страниците „Екип“, „Въпроси“, „Контакти“ и „Подкрепи“.
 * Български източник, английски превод — както навсякъде.
 *
 * ВАЖНО: тук НЕ се измислят хора. Екипът е юридическото лице зад проекта плюс
 * ролите, които реално търсим; имена влизат само когато има кой да ги потвърди.
 */
export type PageBlock = { h?: string; p?: string; ul?: string[] };
export type SimplePage = { title: string; description: string; intro: string; blocks: PageBlock[] };
export type FaqEntry = { id: string; q: string; a: string };

export type PagesBundle = {
  team: SimplePage;
  contact: SimplePage;
  support: SimplePage;
  faq: { title: string; description: string; intro: string; entries: FaqEntry[] };
};

const bg: PagesBundle = {
  team: {
    title: 'Екипът зад FiveM BG',
    description: 'Кой поддържа директорията, как се модерира и как да се включиш.',
    intro:
      'Проектът се поддържа от Carbon Stealth VCC. Не е сървър и не е общност — директория е, затова екипът е малък, а работата му е видима: модерация, проверка на данните и поддръжка на списъка.',
    blocks: [
      { h: 'Кой стои зад проекта' },
      {
        p: 'Издател и администратор на данните е Carbon Stealth VCC (пълни реквизити в импресума). Директорията не е свързана със сървър, не приема пари за оценки и не участва в спорове между сървъри.',
      },
      { h: 'Какво прави екипът' },
      {
        ul: [
          'Преглежда всяка заявка за листване и всяко ревю преди публикуване.',
          'Проверява сигналите по чл. 16 DSA и отговаря на подателя.',
          'Поддържа автоматичното откриване на сървъри и живия статус.',
          'Пише и обновява правилата и туториалите.',
        ],
      },
      { h: 'Търсим доброволци' },
      {
        p: 'Ако играеш активно и познаваш българската FiveM сцена, търсим модератори за опашката с ревюта и хора, които да поддържат туториалите актуални. Пиши ни в Discord или на посочения имейл — интересува ни колко познаваш сцената, не колко часа имаш.',
      },
    ],
  },
  contact: {
    title: 'Контакти',
    description: 'Как да се свържеш с екипа на FiveM BG — Discord, имейл и официални точки за контакт.',
    intro: 'Най-бързият път е Discord. За правни въпроси и сигнали ползвай имейла — той се завежда.',
    blocks: [
      { h: 'Кой канал за какво' },
      {
        ul: [
          'Discord — въпроси, предложения, проблем с листинг, помощ за начинаещи.',
          'Имейл — сигнали по DSA, въпроси за лични данни, правни запитвания, партньорства.',
          'Формата „Добави сървър“ — за листване; не пиши заявки в Discord, губят се.',
          'Формата за сигнали — за незаконно съдържание; тя завежда сигнала официално.',
        ],
      },
      { h: 'Срокове' },
      {
        p: 'Заявките за листване се преглеждат до 7 работни дни. Сигналите по DSA получават потвърждение веднага и решение възможно най-бързо. За искания по ОРЗД срокът е един месец.',
      },
    ],
  },
  support: {
    title: 'Подкрепи проекта',
    description: 'Как да подкрепиш FiveM BG — без реклами и без платени оценки.',
    intro:
      'Директорията е безплатна за играчите и за сървърите. Разходите са хостинг и време. Подкрепата е доброволна и не купува нищо — нито оценка, нито място в подредбата.',
    blocks: [
      { h: 'Какво НЕ се продава' },
      {
        ul: [
          'Оценки и ревюта. Никога, за никакви пари.',
          'Скриване на чуждо ревю или на сървър.',
          'Място в подредбата извън обозначеното платено промотиране.',
        ],
      },
      { h: 'Какво се продава' },
      {
        p: 'Платено промотиране: сървърът стои по-нагоре в списъка и носи значка „промотиран (платено)“ и в списъка, и на страницата си. Параметрите на класирането са описани в Общите условия. Всичко останало в директорията е безплатно.',
      },
      { h: 'Как да помогнеш без пари' },
      {
        ul: [
          'Подай сървъра си или поправи данните на вече листнат.',
          'Напиши честно ревю — включително когато е критично.',
          'Съобщи за мъртъв сървър, счупен линк или сгрешена рамка.',
          'Преведи или допълни туториал, ако видиш пропуск.',
        ],
      },
      { h: 'Парична подкрепа' },
      {
        p: 'Каналите за дарения още не са отворени. Когато бъдат, ще се появят тук заедно с условията — дарение не е покупка и не подлежи на връщане, а всичко над прага за търговска дейност минава през фактура. До тогава най-полезната подкрепа е попълнен и верен листинг.',
      },
    ],
  },
  faq: {
    title: 'Чести въпроси',
    description: 'Отговори за играчи и за собственици на сървъри — вход, правила, листване, ревюта и данни.',
    intro: 'Ако въпросът ти не е тук, питай в Discord.',
    entries: [
      {
        id: 'what-is-fivem',
        q: 'Какво е FiveM и трябва ли ми GTA V?',
        a: 'FiveM е мултиплейър платформа, която върви върху твоето собствено копие на GTA V. Нужна е легално купена игра през Steam, Epic Games или Rockstar Games Launcher. Клиентът се тегли само от fivem.net.',
      },
      {
        id: 'gta-online',
        q: 'Ще ме банят ли в GTA Online, ако играя FiveM?',
        a: 'Не. FiveM работи на отделни сървъри и не докосва прогреса ти в GTA Online. Проблем има само ако пренасяш инструменти от едното в другото — там това е нарушение с последици за акаунта.',
      },
      {
        id: 'how-to-join',
        q: 'Как влизам в сървър от този сайт?',
        a: 'Отваряш страницата на сървъра и натискаш „Влез в сървъра“. Линкът cfx.re/join отваря клиента и те свързва. Ако не се отвори, копирай кода или ползвай connect <адрес> в конзолата (F8).',
      },
      {
        id: 'server-offline',
        q: 'Защо сървър пише „офлайн“, а приятел ми казва, че играе?',
        a: 'Две причини. Или статусът е скрит от собственика (sv_requestParanoia) — тогава пише „статусът е скрит“, а не „офлайн“. Или сървърът е спрял да отговаря между две наши проверки; статусът се опреснява периодично, не в реално време.',
      },
      {
        id: 'framework-unknown',
        q: 'Защо рамката пише „Неизвестна“?',
        a: 'Рамката се разпознава по ядрото в списъка с ресурси на сървъра. Ако сървърът не го споделя публично или ползва собствена рамка, не гадаем — по-добре празно, отколкото грешен етикет.',
      },
      {
        id: 'how-to-list',
        q: 'Как да листна сървъра си?',
        a: 'През формата „Добави сървър“. Основното листване е безплатно и минава през ръчна проверка. Нужен е cfx.re код или адрес host:port и имейл за връзка.',
      },
      {
        id: 'discovered',
        q: 'Сървърът ми се появи тук, без да го подавам. Защо?',
        a: 'Част от сървърите се откриват автоматично от публичния списък на Cfx.re и са обозначени с „открит автоматично“. Ако представляваш сървъра, можеш да поемеш листинга и да го редактираш или да поискаш сваляне — пиши ни.',
      },
      {
        id: 'remove-listing',
        q: 'Искам сървърът ми да не е в директорията.',
        a: 'Пиши ни от имейл, свързан със сървъра, и го сваляме. Не искаме обяснение.',
      },
      {
        id: 'ranking',
        q: 'Как се подреждат сървърите?',
        a: 'Платено промотиране, после онлайн статус, после брой играчи, после азбучен ред. Оценките от ревюта не влияят на подредбата, а промотирането е винаги обозначено.',
      },
      {
        id: 'reviews-fake',
        q: 'Проверявате ли ревютата?',
        a: 'Преглеждаме ги ръчно и махаме обиди, лични данни, реклама и очевидно фалшивите. Но не проверяваме дали авторът наистина е играл на сървъра — затова ревютата не са проверени отзиви и не са класация. Ние не пишем ревюта и не възлагаме писането им.',
      },
      {
        id: 'delete-review',
        q: 'Как да изтрия ревюто си?',
        a: 'Ревютата са анонимни — не пазим име, имейл или IP. Пиши ни, като цитираш текста и датата, и ще намерим записа.',
      },
      {
        id: 'data',
        q: 'Какви данни събирате за мен?',
        a: 'Няма бисквитки за проследяване, аналитика или профилиране. При заявка за листване пазим имейла ти за отговор; при ревю — само оценката, текста и псевдонима. Списъците с играчи на сървърите не се четат изобщо.',
      },
    ],
  },
};

const en: PagesBundle = {
  team: {
    title: 'The team behind FiveM BG',
    description: 'Who maintains the directory, how moderation works, and how to join in.',
    intro:
      'The project is maintained by Carbon Stealth VCC. It is not a server and not a community — it is a directory, so the team is small and its work is visible: moderation, data checks and keeping the list alive.',
    blocks: [
      { h: 'Who is behind it' },
      {
        p: 'The publisher and data controller is Carbon Stealth VCC (full details in the legal notice). The directory is not affiliated with any server, does not take money for ratings, and does not take sides in disputes between servers.',
      },
      { h: 'What the team does' },
      {
        ul: [
          'Reviews every listing submission and every review before it is published.',
          'Handles Art. 16 DSA reports and replies to the reporter.',
          'Maintains the automatic server discovery and the live status.',
          'Writes and updates the rules and tutorials.',
        ],
      },
      { h: 'We are looking for volunteers' },
      {
        p: 'If you play actively and know the Bulgarian FiveM scene, we are looking for moderators for the review queue and people to keep the tutorials current. Write to us on Discord or by email — we care how well you know the scene, not how many hours you have.',
      },
    ],
  },
  contact: {
    title: 'Contact',
    description: 'How to reach the FiveM BG team — Discord, email and official points of contact.',
    intro: 'Discord is the fastest route. For legal matters and reports use email — it is formally logged.',
    blocks: [
      { h: 'Which channel for what' },
      {
        ul: [
          'Discord — questions, suggestions, a problem with a listing, help for beginners.',
          'Email — DSA reports, data protection questions, legal enquiries, partnerships.',
          'The “Add a server” form — for listings; do not send submissions on Discord, they get lost.',
          'The report form — for illegal content; it logs the report officially.',
        ],
      },
      { h: 'Response times' },
      {
        p: 'Listing submissions are reviewed within 7 working days. DSA reports get an immediate confirmation and a decision as soon as possible. GDPR requests are answered within one month.',
      },
    ],
  },
  support: {
    title: 'Support the project',
    description: 'How to support FiveM BG — no ads and no paid ratings.',
    intro:
      'The directory is free for players and for servers. The costs are hosting and time. Support is voluntary and buys nothing — neither a rating nor a place in the ordering.',
    blocks: [
      { h: 'What is NOT for sale' },
      {
        ul: [
          'Ratings and reviews. Never, for any amount.',
          'Hiding someone’s review or a server.',
          'A place in the ordering beyond the clearly marked paid promotion.',
        ],
      },
      { h: 'What is for sale' },
      {
        p: 'Paid promotion: the server sits higher in the list and carries a “promoted (paid)” badge, both in the list and on its page. The ranking parameters are described in the Terms. Everything else in the directory is free.',
      },
      { h: 'How to help without money' },
      {
        ul: [
          'Submit your server, or fix the data on an existing listing.',
          'Write an honest review — including a critical one.',
          'Report a dead server, a broken link or a wrong framework.',
          'Translate or extend a tutorial if you spot a gap.',
        ],
      },
      { h: 'Financial support' },
      {
        p: 'Donation channels are not open yet. When they are, they will appear here together with the terms — a donation is not a purchase and is not refundable, and anything above the commercial-activity threshold goes through an invoice. Until then, the most useful support is a complete and accurate listing.',
      },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    description: 'Answers for players and server owners — joining, rules, listings, reviews and data.',
    intro: 'If your question is not here, ask on Discord.',
    entries: [
      {
        id: 'what-is-fivem',
        q: 'What is FiveM, and do I need GTA V?',
        a: 'FiveM is a multiplayer platform that runs on your own copy of GTA V. You need the game legally purchased through Steam, Epic Games or the Rockstar Games Launcher. The client is downloaded only from fivem.net.',
      },
      {
        id: 'gta-online',
        q: 'Will I get banned in GTA Online if I play FiveM?',
        a: 'No. FiveM runs on separate servers and does not touch your GTA Online progress. There is a problem only if you carry tools from one into the other — there it is a violation with consequences for your account.',
      },
      {
        id: 'how-to-join',
        q: 'How do I join a server from this site?',
        a: 'Open the server page and press “Join the server”. The cfx.re/join link opens the client and connects you. If it does not open, copy the code or use connect <address> in the console (F8).',
      },
      {
        id: 'server-offline',
        q: 'Why does a server say “offline” when a friend says they are playing?',
        a: 'Two reasons. Either the owner hid the status (sv_requestParanoia) — then it says “status hidden”, not “offline”. Or the server stopped responding between two of our checks; the status refreshes periodically, not in real time.',
      },
      {
        id: 'framework-unknown',
        q: 'Why does the framework say “Unknown”?',
        a: 'The framework is detected from the core in the server’s resource list. If the server does not share it publicly or runs a custom framework, we do not guess — better empty than a wrong label.',
      },
      {
        id: 'how-to-list',
        q: 'How do I list my server?',
        a: 'Through the “Add a server” form. The basic listing is free and goes through a manual check. You need a cfx.re code or a host:port address and a contact email.',
      },
      {
        id: 'discovered',
        q: 'My server appeared here without me submitting it. Why?',
        a: 'Some servers are discovered automatically from the public Cfx.re list and are marked “found automatically”. If you represent the server you can claim the listing and edit it, or ask for removal — write to us.',
      },
      {
        id: 'remove-listing',
        q: 'I want my server out of the directory.',
        a: 'Write to us from an email connected to the server and we remove it. We do not ask for a reason.',
      },
      {
        id: 'ranking',
        q: 'How are servers ordered?',
        a: 'Paid promotion, then online status, then player count, then alphabetical. Review ratings do not affect the ordering, and promotion is always marked.',
      },
      {
        id: 'reviews-fake',
        q: 'Do you verify reviews?',
        a: 'We check them by hand and remove insults, personal data, advertising and the obviously fake ones. But we do not verify whether the author actually played on the server — so reviews are not verified feedback and not a ranking. We do not write reviews and do not commission them.',
      },
      {
        id: 'delete-review',
        q: 'How do I delete my review?',
        a: 'Reviews are anonymous — we do not keep a name, email or IP. Write to us quoting the text and the date and we will find the record.',
      },
      {
        id: 'data',
        q: 'What data do you collect about me?',
        a: 'No tracking cookies, no analytics, no profiling. For a listing submission we keep your email to reply; for a review, only the rating, the text and the nickname. Servers’ player lists are not read at all.',
      },
    ],
  },
};

const PAGES: Record<Locale, PagesBundle> = { bg, en };

export function getPages(locale: Locale): PagesBundle {
  return PAGES[locale];
}
