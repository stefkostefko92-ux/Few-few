import type { Locale } from '@/i18n/config';

/**
 * Правните текстове на двата езика. Българският е източникът; английският е
 * превод по СМИСЪЛ със запазени европейски препратки (ОРЗД/GDPR и DSA са едни
 * и същи актове). Това НЕ е машинен превод — правен текст не се пуска през
 * машина (правило на репото).
 *
 * Структурата е нарочно тъпа (заглавие · абзац · списък): така преводът се
 * сверява ред по ред и нищо не се губи между езиците.
 */
export type LegalBlock = { h?: string; p?: string; ul?: string[] };
export type LegalDoc = { title: string; description: string; blocks: LegalBlock[] };
export type LegalSet = { privacy: LegalDoc; terms: LegalDoc; impresumLabels: Record<string, string> };

const bg: LegalSet = {
  privacy: {
    title: 'Политика за поверителност',
    description:
      'Какви данни обработва FiveM BG, на какво основание, за колко време и кой още ги вижда. Без бисквитки за проследяване.',
    blocks: [
      {
        p: 'Не сме назначили длъжностно лице по защита на данните: обработването не изисква редовно и систематично мащабно наблюдение и не включва мащабна обработка на чувствителни данни.',
      },
      { h: 'Какво събираме, на какво основание и за колко' },
      {
        ul: [
          'Заявка за листване: име на сървъра, адрес/cfx код, Discord линк, имейл за връзка и бележката ти. Основание: чл. 6, ал. 1, б. „б“ и „е“ ОРЗД. Срок: 24 месеца. Имейлът е задължителен — без него не можем да отговорим, нито да изпратим мотивирано решение при отказ.',
          'Ревю: оценка, текст и избран псевдоним. Основание: чл. 6, ал. 1, б. „е“. Не искаме име, имейл или IP адрес към ревюто. Публикуваните се пазят, докато сървърът е в директорията; отхвърлените се изтриват след 6 месеца.',
          'Сигнал по DSA: име, имейл, адрес на съдържанието и обосновка. Основание: чл. 6, ал. 1, б. „в“ (правно задължение по Регламент (ЕС) 2022/2065). Срок: 24 месеца.',
          'Технически дневник на уеб сървъра: IP адрес, време, заявен адрес — само за сигурност и диагностика, чл. 6, ал. 1, б. „е“. Срок: 14 дни. Този дневник не се свързва с конкретно ревю или заявка.',
          'Брояч на опитите за вход в администраторския панел: НЕОБРАТИМ ХЕШ на IP адреса (не самият адрес), време и дали опитът е успешен. Единствената му цел е таванът на опитите да е по подател, а не общ — общият таван позволява един човек да заключи собственика. Основание: чл. 6, ал. 1, б. „е“. Срок: 24 часа, изтрива се автоматично.',
        ],
      },
      { h: 'Кой още вижда данните' },
      {
        p: 'Доставчикът на сървърна инфраструктура (хостинг в ЕС) и доставчикът на електронна поща — и двамата действат като обработващи по чл. 28 ОРЗД. Не продаваме и не предоставяме данни за реклама. Ако кореспонденцията минава през доставчик извън ЕС/ЕИП, преносът се извършва въз основа на решение за адекватно ниво на защита или на стандартни договорни клаузи по чл. 46 ОРЗД; копие се предоставя при поискване.',
      },
      { h: 'Какво НЕ събираме' },
      {
        ul: [
          'Няма бисквитки за проследяване, няма рекламни пиксели, няма аналитика, няма профилиране.',
          'Няма автоматизирано вземане на решения по чл. 22 ОРЗД. Всяка заявка, ревю и сигнал се преглеждат от човек.',
          'Не четем и не съхраняваме списъците с играчи на сървърите (players.json) — имената и идентификаторите (Steam, Discord, лиценз) на играчите не влизат при нас. Пазим само общия брой играчи.',
          'Не публикуваме IP адреса на листнат сървър.',
        ],
      },
      { h: 'Сървъри, открити автоматично' },
      {
        p: 'Част от сървърите в директорията са открити от публичния списък на Cfx.re, а не подадени от собствениците си. Данните за тях (име, брой играчи, адрес) са публични данни за услуга, а не лични данни. Сървър, който не желае да е в директорията, пише на посочения имейл и го сваляме.',
      },
      { h: 'Ревюта и данни на трети лица' },
      {
        p: 'Ревю, написано от посетител, може да назове администратор или играч по прякор. Тези данни не сме получили от самото лице (чл. 14 ОРЗД) — публикуваме ги на основание чл. 6, ал. 1, б. „е“ след преценка, че интересът на общността от информираност натежава над намесата, и след ръчен преглед. Уведомяването на всяко назовано лице поотделно би изисквало несъразмерни усилия, при което чл. 14, ал. 5, б. „б“ допуска информацията да бъде публикувана — това е тази секция.',
      },
      {
        p: 'Ревютата са анонимни и нямаме как да свържем автор с акаунт. Ако си автор и искаш изтриване, посочи текста и датата — ще намерим записа и ще го изтрием (чл. 11, ал. 2 ОРЗД).',
      },
      { h: 'Стриймъри — данни, които НЕ сме получили от вас' },
      {
        p: 'Страницата „Стриймъри“ показва канали, които излъчват публично български GTA V / FiveM roleplay. Каналите се откриват през официалните интерфейси на Twitch, Kick и YouTube; в TikTok няма публично откриване, затова там каналите се добавят на ръка. Зад канала стои физическо лице, значи това са лични данни, събрани НЕ от самото лице — задължителната информация по чл. 14 ОРЗД е тук.',
      },
      {
        ul: [
          'Категории данни: име на канала, показвано име, адрес на канала, заглавие на текущото предаване, брой зрители и обявеният от платформата език. Всичко това е публично изявено от самия стриймър в момента на излъчването.',
          'Източник: публичните интерфейси на Twitch (helix/streams), Kick (public/v1/livestreams) и YouTube (Data API v3), както и ръчно въвеждане от нас за TikTok.',
          'Основание: чл. 6, ал. 1, б. „е“ ОРЗД — законен интерес на общността да намери български roleplay съдържание, и на самите стриймъри да бъдат намерени. Обработваме само публично излъчена професионална изява, не поведение в частния живот.',
          'Не сваляме и не вграждаме профилни снимки. Причината е техническа и е в твоя полза: вградената снимка кара браузъра на всеки посетител да прави заявка към чуждия CDN, тоест платформата научава кой чете тази страница.',
          'Срок: 180 дни след последното засечено излъчване. За каналите от YouTube срокът е 30 дни — толкова допускат условията за разработчици на самата платформа (III.E.4.г), а те са по-строги от нашите. Ръчно добавените канали (TikTok) падат 365 дни след последната ни проверка. Изтриването е автоматично, всяка нощ.',
          'Не се прави профилиране и няма автоматизирано решение по чл. 22 ОРЗД. Канал, чийто език платформата не обявява като български, изобщо не се публикува автоматично — минава през човек. Заглавието на текущото предаване се показва едва след като човек е видял записа.',
          'Данните от YouTube идват през YouTube API Services. За тях важи и политиката за поверителност на Google: https://policies.google.com/privacy',
        ],
      },
      { h: 'Защо интересът натежава — преценката, накратко' },
      {
        p: 'Законният интерес по чл. 6, ал. 1, б. „е“ не е декларация, а преценка, затова е тук. ЗА: излъчването е публична професионална изява, направена нарочно видима, и списък кой излъчва български roleplay е в интерес и на зрителите, и на самите стриймъри. ПРОТИВ: данните не идват от лицето, а страницата ги събира на едно място и я подаваме за индексиране — това усилва видимостта отвъд разумните очаквания на един стриймър (Съобр. 47). Затова обхватът е стеснен до публично излъченото, няма аватари, няма профилиране, няма исторически архив на предаванията, а свалянето е безусловно и без обяснение. Ако си непълнолетен, кажи ни — при дете тежестта пада на другата страна (Съобр. 38) и махаме канала веднага.',
      },
      {
        p: 'Не уведомяваме всеки стриймър поотделно: каналите се откриват автоматично и нямаме адрес за връзка с тях. Информацията се предоставя публично тук, което чл. 14, ал. 5, б. „б“ допуска при несъразмерни усилия — а самата секция е налична преди първата публикация и при всяко нейно четене, тоест в срока по чл. 14, ал. 3. За ръчно добавените канали (TikTok) дерогацията е най-слаба, затова там се стремим да пишем и лично.',
      },
      {
        p: 'Право на възражение (чл. 21 ОРЗД): пиши ни на privacy@carbonstealth.eu и махаме канала до 72 часа в работни дни, без да искаме обяснение. Заедно с това запазваме минимален ЗАГЛУШАВАЩ запис — само платформата и името на канала — защото без него автоматичното откриване връща канала до 10 минути. Показваното име, адресът, заглавието на предаването и броят зрители се изтриват в момента на свалянето. Основанието на заглушаващия запис е чл. 6, ал. 1, б. „в“ във връзка с чл. 21, ал. 3 (изпълнение на самото възражение) и чл. 5, ал. 2 (отчетност); пази се, докато съществува автоматичното откриване.',
      },
      {
        p: 'Отделно водим одитен дневник кой какво е решил (действие, засегнат канал, дата) — включително свалянията. Основание: чл. 6, ал. 1, б. „в“ и б. „е“ (отчетност и защита от произволна модерация). Срок: 24 месеца.',
      },
      { h: 'Твоите права' },
      {
        p: 'Достъп, поправка, изтриване, ограничаване, възражение и преносимост (чл. 15–21 ОРЗД). Имаш право на жалба до Комисията за защита на личните данни (КЗЛД, cpdp.bg).',
      },
    ],
  },
  terms: {
    title: 'Общи условия',
    description:
      'Условия за ползване на директорията FiveM BG: листване, модерация, ревюта, класиране и сигнали за незаконно съдържание.',
    blocks: [
      {
        p: 'FiveM BG е независима директория на български FiveM сървъри. Проектът не е свързан с Rockstar Games, Take-Two Interactive Software, Inc. или Cfx.re и не предоставя игрови сървъри.',
      },
      { h: 'Листване на сървър' },
      {
        ul: [
          'Основното листване е безплатно и минава през ръчна модерация.',
          'Част от сървърите са добавени автоматично от публичния списък на Cfx.re и са обозначени като „открит автоматично“. Собственикът може да поеме листинга или да поиска сваляне.',
          'Предлагаме и платено промотиране — то само променя мястото в подредбата и е обозначено със значка „промотиран (платено)“ и в списъка, и на страницата на сървъра.',
          'Подателят декларира, че има право да представлява сървъра и че подадените текстове и линкове са негови или има разрешение за тях.',
          'Сървър, който не желае да е в директорията, пише на посочения имейл и го сваляме.',
        ],
      },
      { h: 'Как подреждаме сървърите' },
      {
        p: 'Подредбата в списъка се определя от четири параметъра, в този ред: платено промотиране (валидно и обозначено); онлайн статус, прочетен от публичните endpoint-и на сървъра; брой играчи в момента; азбучен ред при равенство. Оценките от ревюта не влияят на подредбата. Не приемаме плащане за оценка или за скриване на ревю.',
      },
      { h: 'Как модерираме' },
      {
        p: 'Всяка заявка, ревю и сигнал се преглеждат от човек — не ползваме автоматизирано вземане на решения. Отказваме или сваляме съдържание при: незаконно съдържание, продажба на чужда интелектуална собственост, реклама на читове, подвеждащи данни за сървъра, обиди и лични данни на трети лица. Обичайният срок за преглед е до 7 работни дни.',
      },
      {
        p: 'При отказ или сваляне на листинг изпращаме на подадения имейл мотивирано решение по чл. 17 от Регламент (ЕС) 2022/2065: какво е ограничението и обхватът му, фактите и обстоятелствата, дали е ползвано автоматизирано средство, кое правило или законово основание е приложено и как може да се оспори решението — с отговор до нас и с право на жалба до Комисията за регулиране на съобщенията като координатор на цифровите услуги и до съда.',
      },
      { h: 'Стриймъри' },
      {
        p: 'Страницата „Стриймъри“ се пълни АВТОМАТИЧНО от официалните интерфейси на Twitch, Kick и YouTube; каналите от TikTok се добавят на ръка. Тук ние сме издателят, не посредник — не хостваме подадено чуждо съдържание, а избираме какво да покажем. Затова: публично автоматично влиза само канал, чийто език самата платформа е обявила за български; заглавието на текущото предаване (свободен чужд текст) се показва едва след като човек е видял записа; всичко останало чака преглед. Канал се сваля по искане до 72 часа в работни дни, без обяснение — виж „Стриймъри“ в политиката за поверителност.',
      },
      {
        p: 'Twitch, Kick, YouTube и TikTok са марки на съответните им притежатели. Употребата на имената и знаците им тук е само за обозначаване на платформата, на която се излъчва; проектът не е свързан с тях и не е одобрен от тях. Данните от YouTube идват през YouTube API Services.',
      },
      { h: 'Ревюта' },
      {
        p: 'Ревютата са мнения на посетители и се публикуват след преглед. Не проверяваме дали авторът наистина е играл на сървъра — затова не са проверени отзиви и не са класация. Махаме обиди, лични данни, реклама и очевидно фалшиви оценки. Ние не пишем ревюта и не възлагаме писането им.',
      },
      {
        p: 'Сървър, за когото е публикувано ревю, може да поиска преглед или да публикува отговор; отговорът се показва под ревюто.',
      },
      { h: 'Сигнали за незаконно съдържание' },
      {
        p: 'Сигнал се подава през формата за сигнали (чл. 16 от Регламент (ЕС) 2022/2065). Изпращаме потвърждение за получаване, разглеждаме сигнала своевременно, добросъвестно и без произвол, и те уведомяваме за решението заедно с информация за възможностите за оспорване.',
      },
      { h: 'Отговорност' },
      {
        p: 'Статусът на сървърите се чете автоматично от техните публични endpoint-и и може да е неактуален или непълен. Не отговаряме за съдържанието, правилата или поведението на трети сървъри и за вреди от ползването им.',
      },
    ],
  },
  impresumLabels: {
    title: 'Импресум и контакти',
    lead: 'Задължителна информация по чл. 4 от Закона за електронната търговия (Директива 2000/31/ЕО).',
    publisher: 'Издател',
    legalName: 'Юридическо лице',
    address: 'Седалище и адрес',
    eik: 'ЕИК',
    eikNote: 'Търговски регистър при Агенцията по вписванията',
    vat: 'ДДС №',
    email: 'Имейл',
    phone: 'Телефон',
    dsaHeading: 'Точка за контакт по Регламент (ЕС) 2022/2065',
    dsaBody:
      'За органи по чл. 11 (Комисия за регулиране на съобщенията като координатор на цифровите услуги, Европейската комисия, Европейският съвет за цифрови услуги) и за получатели на услугата по чл. 12. Комуникацията не се обслужва изцяло от автоматизирани средства. Езици за комуникация:',
    dsaReport: 'Сигнал за незаконно съдържание се подава през формата за сигнали.',
    authorities: 'Контролни органи',
    odr: 'Платформа на ЕК за онлайн решаване на спорове:',
    trademarks: 'Марки',
  },
};

const en: LegalSet = {
  privacy: {
    title: 'Privacy policy',
    description:
      'What data FiveM BG processes, on what legal basis, for how long, and who else sees it. No tracking cookies.',
    blocks: [
      {
        p: 'We have not appointed a data protection officer: the processing does not require regular and systematic large-scale monitoring and does not involve large-scale processing of special categories of data.',
      },
      { h: 'What we collect, on what basis, and for how long' },
      {
        ul: [
          'Listing submission: server name, address/cfx code, Discord link, contact email and your note. Basis: Art. 6(1)(b) and (f) GDPR. Retention: 24 months. The email is mandatory — without it we cannot reply, nor send a statement of reasons if the listing is refused.',
          'Review: rating, text and chosen nickname. Basis: Art. 6(1)(f). We do not ask for a name, email or IP address with a review. Published reviews are kept while the server is listed; rejected ones are deleted after 6 months.',
          'DSA report: name, email, the content’s address and the explanation. Basis: Art. 6(1)(c) (legal obligation under Regulation (EU) 2022/2065). Retention: 24 months.',
          'Web server technical log: IP address, time, requested path — for security and diagnostics only, Art. 6(1)(f). Retention: 14 days. This log is not linked to a specific review or submission.',
          'Admin panel login counter: an IRREVERSIBLE HASH of the IP address (not the address itself), the time and whether the attempt succeeded. Its only purpose is to make the attempt limit per-sender rather than global — a global limit lets one person lock the owner out. Basis: Art. 6(1)(f). Retention: 24 hours, deleted automatically.',
        ],
      },
      { h: 'Who else sees the data' },
      {
        p: 'The server infrastructure provider (hosting in the EU) and the email provider — both acting as processors under Art. 28 GDPR. We do not sell or share data for advertising. If correspondence passes through a provider outside the EU/EEA, the transfer is based on an adequacy decision or standard contractual clauses under Art. 46 GDPR; a copy is available on request.',
      },
      { h: 'What we do NOT collect' },
      {
        ul: [
          'No tracking cookies, no advertising pixels, no analytics, no profiling.',
          'No automated decision-making under Art. 22 GDPR. Every submission, review and report is reviewed by a person.',
          'We do not read or store the servers’ player lists (players.json) — players’ names and identifiers (Steam, Discord, licence) never reach us. We keep only the total player count.',
          'We do not publish a listed server’s IP address.',
        ],
      },
      { h: 'Automatically discovered servers' },
      {
        p: 'Some servers in the directory were found in the public Cfx.re list rather than submitted by their owners. The data about them (name, player count, address) is public data about a service, not personal data. A server that does not want to be listed can write to the email below and we remove it.',
      },
      { h: 'Reviews and third parties’ data' },
      {
        p: 'A review written by a visitor may name an administrator or a player by nickname. We did not obtain that data from the person themselves (Art. 14 GDPR) — we publish it on the basis of Art. 6(1)(f), having weighed the community’s interest in being informed against the interference, and after a manual check. Notifying each named person individually would involve disproportionate effort, in which case Art. 14(5)(b) allows the information to be made publicly available — this section is that information.',
      },
      {
        p: 'Reviews are anonymous and we cannot link an author to an account. If you are an author and want your review deleted, quote the text and the date — we will find the record and delete it (Art. 11(2) GDPR).',
      },
      { h: 'Streamers — data we did NOT obtain from you' },
      {
        p: 'The “Streamers” page lists channels publicly broadcasting Bulgarian GTA V / FiveM roleplay. Channels are discovered through the official interfaces of Twitch, Kick and YouTube; TikTok offers no public discovery, so those channels are added by hand. A natural person stands behind each channel, so this is personal data not obtained from the data subject — the information required by Art. 14 GDPR is here.',
      },
      {
        ul: [
          'Categories of data: channel name, display name, channel URL, current stream title, viewer count and the language declared by the platform. All of it is made public by the streamer themselves at the moment of broadcasting.',
          'Source: the public interfaces of Twitch (helix/streams), Kick (public/v1/livestreams) and YouTube (Data API v3), plus manual entry by us for TikTok.',
          'Basis: Art. 6(1)(f) GDPR — the community’s legitimate interest in finding Bulgarian roleplay content, and the streamers’ own interest in being found. We process only publicly broadcast professional activity, not private-life behaviour.',
          'We neither download nor embed profile pictures. The reason is technical and in your favour: an embedded picture makes every visitor’s browser call the third-party CDN, which tells the platform who reads this page.',
          'Retention: 180 days after the last detected broadcast. For YouTube channels it is 30 days — that is what the platform’s own developer policies allow (III.E.4.d), and they are stricter than ours. Manually added channels (TikTok) are dropped 365 days after our last check. Deletion is automatic, every night.',
          'No profiling and no automated decision under Art. 22 GDPR. A channel whose language the platform does not declare as Bulgarian is never published automatically — a person reviews it. The current stream title is shown only once a person has looked at the record.',
          'Data from YouTube comes through the YouTube API Services. Google’s privacy policy applies to it as well: https://policies.google.com/privacy',
        ],
      },
      { h: 'Why the interest prevails — the assessment, in short' },
      {
        p: 'A legitimate interest under Art. 6(1)(f) is an assessment, not a declaration, so here it is. FOR: broadcasting is public professional activity, deliberately made visible, and a list of who streams Bulgarian roleplay serves both viewers and the streamers themselves. AGAINST: the data does not come from the person, this page gathers it in one place, and we submit that page for indexing — which amplifies visibility beyond a streamer’s reasonable expectations (Recital 47). That is why the scope is narrowed to what was publicly broadcast, with no avatars, no profiling and no historical archive of broadcasts, and why removal is unconditional and needs no reason. If you are a minor, tell us — where a child is concerned the balance tips the other way (Recital 38) and we remove the channel immediately.',
      },
      {
        p: 'We do not notify each streamer individually: channels are discovered automatically and we have no contact address for them. The information is instead made publicly available here, which Art. 14(5)(b) permits where individual notice would involve disproportionate effort — and this section exists before the first publication and at every reading of it, i.e. within the period set by Art. 14(3). For manually added channels (TikTok) the derogation is weakest, so there we also try to write personally.',
      },
      {
        p: 'Right to object (Art. 21 GDPR): write to privacy@carbonstealth.eu and the channel is removed within 72 hours on working days, no reason asked. Along with that we keep a minimal SUPPRESSION record — the platform and the channel name only — because without it automatic discovery brings the channel back within 10 minutes. The display name, URL, stream title and viewer count are erased at the moment of removal. The suppression record rests on Art. 6(1)(c) in conjunction with Art. 21(3) (giving effect to the objection itself) and Art. 5(2) (accountability); it is kept for as long as automatic discovery exists.',
      },
      {
        p: 'Separately we keep an audit log of who decided what (action, affected channel, date) — removals included. Basis: Art. 6(1)(c) and (f) (accountability and protection against arbitrary moderation). Retention: 24 months.',
      },
      { h: 'Your rights' },
      {
        p: 'Access, rectification, erasure, restriction, objection and portability (Art. 15–21 GDPR). You have the right to lodge a complaint with the Bulgarian Commission for Personal Data Protection (CPDP, cpdp.bg).',
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    description:
      'Terms for using the FiveM BG directory: listings, moderation, reviews, ranking and reports of illegal content.',
    blocks: [
      {
        p: 'FiveM BG is an independent directory of Bulgarian FiveM servers. The project is not affiliated with Rockstar Games, Take-Two Interactive Software, Inc. or Cfx.re and does not operate game servers.',
      },
      { h: 'Listing a server' },
      {
        ul: [
          'The basic listing is free and goes through manual moderation.',
          'Some servers are added automatically from the public Cfx.re list and are marked “found automatically”. The owner may claim the listing or request removal.',
          'We also offer paid promotion — it only changes the position in the ordering and is marked with a “promoted (paid)” badge, both in the list and on the server page.',
          'The submitter declares that they are entitled to represent the server and that the texts and links provided are theirs or that they have permission to use them.',
          'A server that does not want to be in the directory writes to the email below and we remove it.',
        ],
      },
      { h: 'How we order servers' },
      {
        p: 'The order in the list is determined by four parameters, in this order: paid promotion (valid and marked); online status read from the server’s public endpoints; current player count; alphabetical order on a tie. Review ratings do not affect the ordering. We do not accept payment for a rating or for hiding a review.',
      },
      { h: 'How we moderate' },
      {
        p: 'Every submission, review and report is reviewed by a person — we do not use automated decision-making. We refuse or remove content for: illegal content, selling someone else’s intellectual property, advertising cheats, misleading server data, insults, and third parties’ personal data. The usual review time is up to 7 working days.',
      },
      {
        p: 'If a listing is refused or removed, we send a statement of reasons to the email provided, under Art. 17 of Regulation (EU) 2022/2065: the restriction and its scope, the facts and circumstances, whether automated means were used, which rule or legal ground was applied, and how the decision can be challenged — by replying to us, and with the right to complain to the Bulgarian Communications Regulation Commission as Digital Services Coordinator and to seek judicial redress.',
      },
      { h: 'Streamers' },
      {
        p: 'The “Streamers” page fills AUTOMATICALLY from the official interfaces of Twitch, Kick and YouTube; TikTok channels are added by hand. Here we are the publisher, not an intermediary — we do not host submitted third-party content, we choose what to show. Therefore: only a channel whose language the platform itself has declared Bulgarian is published automatically; the current stream title (free third-party text) appears only once a person has seen the record; everything else waits for review. A channel is removed on request within 72 hours on working days, no reason asked — see “Streamers” in the privacy policy.',
      },
      {
        p: 'Twitch, Kick, YouTube and TikTok are trademarks of their respective owners. Their names and marks are used here solely to identify the platform being broadcast on; the project is not affiliated with them and is not endorsed by them. Data from YouTube comes through the YouTube API Services.',
      },
      { h: 'Reviews' },
      {
        p: 'Reviews are visitors’ opinions and are published after a check. We do not verify whether the author actually played on the server — so they are not verified reviews and not a ranking. We remove insults, personal data, advertising and obviously fake ratings. We do not write reviews and do not commission them.',
      },
      {
        p: 'A server that a review has been published about may request a re-check or publish a reply; the reply is shown under the review.',
      },
      { h: 'Reports of illegal content' },
      {
        p: 'Reports are submitted through the report form (Art. 16 of Regulation (EU) 2022/2065). We send a confirmation of receipt, review the report in a timely, diligent and non-arbitrary manner, and notify you of the decision together with information about the available redress.',
      },
      { h: 'Liability' },
      {
        p: 'Server status is read automatically from their public endpoints and may be out of date or incomplete. We are not responsible for the content, rules or conduct of third-party servers, nor for damages arising from using them.',
      },
    ],
  },
  impresumLabels: {
    title: 'Legal notice and contact',
    lead: 'Mandatory information under Art. 4 of the Bulgarian E-Commerce Act (Directive 2000/31/EC).',
    publisher: 'Publisher',
    legalName: 'Legal entity',
    address: 'Registered office and address',
    eik: 'Company number (EIK)',
    eikNote: 'Commercial Register at the Registry Agency',
    vat: 'VAT number',
    email: 'Email',
    phone: 'Phone',
    dsaHeading: 'Point of contact under Regulation (EU) 2022/2065',
    dsaBody:
      'For authorities under Art. 11 (the Bulgarian Communications Regulation Commission as Digital Services Coordinator, the European Commission, the European Board for Digital Services) and for recipients of the service under Art. 12. Communication is not handled exclusively by automated means. Languages:',
    dsaReport: 'Reports of illegal content are submitted through the report form.',
    authorities: 'Supervisory authorities',
    odr: 'European Commission online dispute resolution platform:',
    trademarks: 'Trademarks',
  },
};

const LEGAL: Record<Locale, LegalSet> = { bg, en };

export function getLegal(locale: Locale): LegalSet {
  return LEGAL[locale];
}
