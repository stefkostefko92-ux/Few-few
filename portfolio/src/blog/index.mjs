// blog/index.mjs — статиите (BG е източникът, EN/IT са преводи). Всяка статия: факти със източник (sources),
// автор = студиото (Organization), дата на публикуване и на последна промяна (видими + Article JSON-LD),
// въпроси като H2 (AEO) и директен отговор в първото изречение. Никакви измислени статистики.
export const AUTHOR = { name: "Carbon Stealth VCC", url: "https://carbonstealth.eu" };

export const ARTICLES = [
  {
    id: "kolko-struva-sait-2026", date: "2026-09-18", updated: "2026-09-18", cover: "/img/previews/bg/avtoservis.webp",
    slug: { bg: "kolko-struva-sait-2026", en: "how-much-does-a-website-cost-2026", it: "quanto-costa-un-sito-web-2026" },
    keywords: { bg: ["колко струва сайт 2026", "цена за изработка на сайт", "цена лендинг страница", "цена онлайн магазин", "цена фирмен сайт"], en: ["website cost 2026", "how much does a website cost", "landing page price", "online shop price", "business website price"], it: ["quanto costa un sito web 2026", "prezzo sito web", "prezzo landing page", "costo e-commerce", "prezzo sito aziendale"] },
    sources: [
      { name: "Carbon Stealth — цени и пазарно проучване (11 публични източника, BG/IT/ЕС)", url: "https://portfolio.carbonstealth.eu/bg/ceni/" },
      { name: "saitami.bg — Колко струва сайт в България през 2026", url: "https://saitami.bg/kolko-struva-sait-2026" },
      { name: "webars.at — Website costs in Europe 2026", url: "https://webars.at/en/blog/website-cost-europe" },
    ],
    t: {
      bg: {
        title: "Колко струва сайт през 2026 г.? Реални цени за България и Италия",
        metaTitle: "Колко струва сайт през 2026? Реални цени | Carbon Stealth", metaDesc: "Лендинг от 790 €, фирмен сайт от 1 890 €, магазин от 2 190 € с ДДС — и какво влиза в цената. Сравнение с пазарните диапазони в България, Италия и ЕС.",
        desc: "Лендинг от 790 €, фирмен сайт от 1 890 €, онлайн магазин от 2 190 € с ДДС — и какво реално влиза в цената. Сравнение с пазарните диапазони в България, Италия и ЕС.",
        lede: "Кратък отговор: през 2026 г. лендинг страница струва между 800 и 1 200 € при агенциите в България, фирмен сайт — между 1 500 и 3 500 €, онлайн магазин — от 2 000 € нагоре. Нашите цени са поне 15% под тези диапазони и са крайни, с ДДС.",
        sections: [
          { h: "Какво определя цената на един сайт?", p: ["Три неща: обхватът (брой страници и функции), езиците и това кой пише текстовете и прави снимките. Дизайнът сам по себе си рядко е най-скъпата част — по-скъпо е всичко, което се прави два пъти, защото не е било уточнено в началото.", "Затова офертата ни е с фиксирана цена и обхват: до 8 страници за фирмен сайт, два езика, блог, пълна SEO основа. Каквото е извън обхвата, е добавка с публична цена — допълнителен език 350 €, страница 120 €, копирайтинг 90 € на страница."] },
          { h: "Колко струват лендинг, фирмен сайт и магазин при нас?", p: ["Лендинг страница „Старт“ — 790 € с ДДС, готова за 5–7 работни дни. Фирмен сайт „Бизнес“ — 1 890 €, 10–15 дни. Онлайн магазин — 2 190 €, с кошница, карта/Stripe плащания и фактури, готови за ДДС. „Премиум“ с три езика и админ панел — 4 290 €.", "Всеки пакет включва хостинг в ЕС за 12 месеца, SSL, структурирани данни за Google, регистрация в търсачките и обучение за поддръжка. Фирми от ЕС извън България не плащат български ДДС (обратно начисляване)."] },
          { h: "Какво не е включено и колко струва?", p: ["Домейнът — около 15 € на година, регистрира се на ваше име. Професионална фотография и текстове, ако нямате свои: копирайтинг 90 € на страница. Хостингът след първата година — 15 € на месец, или 69 € с поддръжка, ъпдейти и до 2 часа дребни промени месечно.", "Скритите разходи при готовите платформи са абонаментът, който не спира, и фактът, че сайтът не е ваш. При нас кодът, домейнът и данните са ваши от първия ден."] },
          { h: "Как да сравните две оферти?", p: ["Питайте за три неща: какъв е обхватът в страници и езици, включен ли е хостингът и за колко време, и чий е кодът след плащане. Ако някой от отговорите е „ще видим“, цената не е крайна.", "Най-бързият начин да видите какво ще платите е конфигураторът на оферта — избирате пакет и добавки и сумата е веднага, с ДДС по вашия случай."] },
        ],
      },
      en: {
        title: "How much does a website cost in 2026? Real prices for Bulgaria and Italy",
        metaTitle: "How much does a website cost in 2026? | Carbon Stealth", metaDesc: "Landing page from €658, business website from €1,575, shop from €1,825 excl. VAT — and what goes into the price. Compared with BG, IT and EU market ranges.",
        desc: "Landing page from €658, business website from €1,575, online shop from €1,825 excl. VAT — and what actually goes into the price. Compared with market ranges in Bulgaria, Italy and the EU.",
        lede: "Short answer: in 2026 a landing page costs between €800 and €1,200 at agencies in Bulgaria, a business website between €1,500 and €3,500, an online shop from €2,000 upwards. Our prices are at least 15% below those ranges and fixed.",
        sections: [
          { h: "What determines the price of a website?", p: ["Three things: the scope (number of pages and features), the languages, and who writes the copy and takes the photos. Design itself is rarely the most expensive part — what costs is everything done twice because it was not specified at the start.", "That is why our quote has a fixed price and scope: up to 8 pages for a business website, two languages, a blog, a full SEO foundation. Anything beyond the scope is an add-on with a public price — an extra language €292, a page €100, copywriting €75 per page."] },
          { h: "How much do a landing page, a business website and a shop cost with us?", p: ["“Start” landing page — €658 excl. VAT, ready in 5–7 working days. “Business” website — €1,575, 10–15 days. Online shop — €1,825, with a cart, card/Stripe payments and VAT-ready invoices. “Premium” with three languages and an admin panel — €3,575.", "Every package includes 12 months of EU hosting, SSL, structured data for Google, search engine registration and training for maintenance. EU companies with a valid VAT number pay no Bulgarian VAT (reverse charge)."] },
          { h: "What is not included and what does it cost?", p: ["The domain — about €15 a year, registered in your name. Professional photography and copy if you have none: copywriting €75 per page. Hosting after the first year — €13 per month, or €58 with maintenance, updates and up to 2 hours of small changes a month.", "The hidden costs of ready-made platforms are the subscription that never stops and the fact that the site is not yours. With us the code, domain and data are yours from day one."] },
          { h: "How do you compare two quotes?", p: ["Ask three things: what the scope is in pages and languages, whether hosting is included and for how long, and who owns the code after payment. If any answer is “we'll see”, the price is not final.", "The fastest way to see what you would pay is the quote configurator — pick a package and add-ons and the total is instant, with VAT handled for your case."] },
        ],
      },
      it: {
        title: "Quanto costa un sito web nel 2026? Prezzi reali per Italia e Bulgaria",
        metaTitle: "Quanto costa un sito web nel 2026? | Carbon Stealth", metaDesc: "Landing da 658 €, sito aziendale da 1.575 €, e-commerce da 1.825 € IVA esclusa — e cosa entra nel prezzo. Confronto con le fasce di mercato IT, BG e UE.",
        desc: "Landing page da 658 €, sito aziendale da 1.575 €, e-commerce da 1.825 € IVA esclusa — e cosa entra davvero nel prezzo. Confronto con le fasce di mercato in Italia, Bulgaria e UE.",
        lede: "Risposta breve: nel 2026 una landing page costa tra 800 e 1.200 € presso le agenzie, un sito aziendale tra 1.500 e 3.500 €, un e-commerce da 2.000 € in su. I nostri prezzi sono almeno il 15% sotto queste fasce e sono fissi.",
        sections: [
          { h: "Cosa determina il prezzo di un sito?", p: ["Tre cose: l'ampiezza (numero di pagine e funzioni), le lingue e chi scrive i testi e fa le foto. Il design in sé raramente è la parte più cara — costa tutto ciò che si fa due volte perché non era stato definito all'inizio.", "Per questo il nostro preventivo ha prezzo e ampiezza fissi: fino a 8 pagine per un sito aziendale, due lingue, blog, base SEO completa. Tutto ciò che è fuori ampiezza è un extra con prezzo pubblico — una lingua in più 292 €, una pagina 100 €, copywriting 75 € a pagina."] },
          { h: "Quanto costano landing, sito aziendale e shop da noi?", p: ["Landing page «Start» — 658 € IVA esclusa, pronta in 5–7 giorni lavorativi. Sito «Business» — 1.575 €, 10–15 giorni. E-commerce — 1.825 €, con carrello, pagamenti carta/Stripe e fatture pronte per l'IVA. «Premium» con tre lingue e pannello admin — 3.575 €.", "Ogni pacchetto include 12 mesi di hosting in UE, SSL, dati strutturati per Google, registrazione sui motori e formazione per la manutenzione. Le aziende UE con partita IVA valida non pagano l'IVA bulgara (reverse charge)."] },
          { h: "Cosa non è incluso e quanto costa?", p: ["Il dominio — circa 15 € l'anno, registrato a tuo nome. Fotografia professionale e testi se non li hai: copywriting 75 € a pagina. Hosting dopo il primo anno — 13 € al mese, o 58 € con manutenzione, aggiornamenti e fino a 2 ore di piccole modifiche al mese.", "I costi nascosti delle piattaforme pronte sono l'abbonamento che non finisce mai e il fatto che il sito non è tuo. Da noi codice, dominio e dati sono tuoi dal primo giorno."] },
          { h: "Come confrontare due preventivi?", p: ["Chiedi tre cose: qual è l'ampiezza in pagine e lingue, se l'hosting è incluso e per quanto, e di chi è il codice dopo il pagamento. Se una risposta è «vedremo», il prezzo non è definitivo.", "Il modo più rapido per vedere cosa pagheresti è il configuratore di preventivo — scegli pacchetto ed extra e il totale è immediato, con l'IVA gestita per il tuo caso."] },
        ],
      },
    },
  },
  {
    id: "reverse-charge-dds-es", date: "2026-09-18", updated: "2026-09-18", cover: "/img/previews/bg/schetovodstvo.webp",
    slug: { bg: "reverse-charge-dds-firmi-ot-es", en: "reverse-charge-vat-eu-companies", it: "reverse-charge-iva-aziende-ue" },
    keywords: { bg: ["обратно начисляване ДДС", "reverse charge", "ДДС услуги от ЕС", "чл. 21 ЗДДС", "фактура без ДДС ЕС фирма"], en: ["reverse charge VAT", "VAT on services from Bulgaria", "EU B2B services VAT", "Article 196 VAT Directive", "invoice without VAT EU company"], it: ["reverse charge IVA", "IVA servizi dalla Bulgaria", "servizi B2B UE IVA", "articolo 196 direttiva IVA", "fattura senza IVA azienda UE"] },
    sources: [
      { name: "Директива 2006/112/ЕО за ДДС — чл. 44 и чл. 196 (EUR-Lex)", url: "https://eur-lex.europa.eu/eli/dir/2006/112/oj" },
      { name: "Закон за данък върху добавената стойност — чл. 21, ал. 2 (lex.bg)", url: "https://lex.bg/laws/ldoc/2135533201" },
      { name: "VIES — проверка на ДДС номер в ЕС (Европейска комисия)", url: "https://ec.europa.eu/taxation_customs/vies/" },
    ],
    t: {
      bg: {
        title: "Reverse charge: кога фирма от ЕС не плаща български ДДС за сайт",
        metaTitle: "Reverse charge: ДДС за фирми от ЕС | Carbon Stealth", metaDesc: "Фирма от ЕС с валиден ДДС номер получава фактура без български ДДС (чл. 196 Дир. 2006/112/ЕО). Частните лица плащат 20%. Не е данъчен съвет.",
        desc: "Фирма от ЕС с валиден ДДС номер получава фактура без български ДДС (обратно начисляване по чл. 196 от Директива 2006/112/ЕО). Частните лица плащат 20%. Не е данъчен съвет.",
        lede: "Кратък отговор: ако сте фирма в друга държава от ЕС с валиден ДДС номер, фактурата ви за уеб услуги от България е без ДДС — данъкът се начислява от вас във вашата държава. Частните лица и българските фирми плащат 20%.",
        sections: [
          { h: "Какво е обратно начисляване (reverse charge)?", p: ["Механизъм, при който получателят на услугата, а не доставчикът, начислява и декларира ДДС. За услуги между фирми в различни държави от ЕС мястото на изпълнение е там, където е установен получателят (чл. 44 от Директива 2006/112/ЕО), а данъкът се дължи от него (чл. 196).", "В българския закон това е чл. 21, ал. 2 от ЗДДС. На фактурата пише „обратно начисляване“ и вашият ДДС номер; ДДС ред няма."] },
          { h: "Кой плаща 20% ДДС?", p: ["Всеки клиент в България — фирма или частно лице. Частни лица в други държави от ЕС също плащат ДДС, защото механизмът важи само между данъчно задължени лица. Клиенти извън ЕС не дължат български ДДС.", "Затова показваме цените така: българската версия на сайта е с включен 20% ДДС, английската и италианската — без ДДС, с бележка кога се начислява."] },
          { h: "Какво ви трябва, за да получите фактура без ДДС?", p: ["Валиден ДДС номер, който проверяваме в системата VIES на Европейската комисия преди издаване на фактурата, и данните на фирмата. Ако номерът е невалиден или липсва, начисляваме 20%.", "Проверката отнема минута и я правим ние. Вие само пращате номера заедно с поръчката."] },
          { h: "Пример със сумите", p: ["Фирмен сайт „Бизнес“: 1 890 € с ДДС за българска фирма; 1 575 € без ДДС за фирма в Италия с валиден ДДС номер, която сама начислява италианския ДДС по своята ставка; 1 890 € за частно лице в Италия.", "Конфигураторът на оферта прави сметката за вашия случай автоматично. Това не е данъчен съвет — при съмнение попитайте счетоводителя си."] },
        ],
      },
      en: {
        title: "Reverse charge: when an EU company pays no Bulgarian VAT for a website",
        metaTitle: "Reverse charge VAT for EU companies | Carbon Stealth", metaDesc: "An EU company with a valid VAT number gets an invoice without Bulgarian VAT (Art. 196 Directive 2006/112/EC). Private individuals pay 20%. Not tax advice.",
        desc: "An EU company with a valid VAT number gets an invoice without Bulgarian VAT (reverse charge under Art. 196 of Directive 2006/112/EC). Private individuals pay 20%. Not tax advice.",
        lede: "Short answer: if you are a company in another EU country with a valid VAT number, your invoice for web services from Bulgaria carries no VAT — you account for the tax in your own country. Private individuals and Bulgarian companies pay 20%.",
        sections: [
          { h: "What is the reverse charge?", p: ["A mechanism where the recipient of the service, not the supplier, accounts for VAT. For B2B services between different EU countries the place of supply is where the customer is established (Art. 44 of Directive 2006/112/EC) and the tax is due by the customer (Art. 196).", "In Bulgarian law this is Art. 21(2) of the VAT Act. The invoice says “reverse charge” and shows your VAT number; there is no VAT line."] },
          { h: "Who pays 20% VAT?", p: ["Every customer in Bulgaria — company or private individual. Private individuals in other EU countries also pay VAT, because the mechanism applies only between taxable persons. Customers outside the EU owe no Bulgarian VAT.", "That is why we show prices this way: the Bulgarian version of the site includes 20% VAT, the English and Italian versions exclude it, with a note on when it applies."] },
          { h: "What do you need for an invoice without VAT?", p: ["A valid VAT number, which we check in the European Commission's VIES system before issuing the invoice, and your company details. If the number is invalid or missing, we charge 20%.", "The check takes a minute and we do it. You only send the number with your order."] },
          { h: "An example with the numbers", p: ["“Business” website: €1,890 incl. VAT for a Bulgarian company; €1,575 without VAT for a company in Italy with a valid VAT number, which accounts for Italian VAT at its own rate; €1,890 for a private individual in Italy.", "The quote configurator does the maths for your case automatically. This is not tax advice — when in doubt, ask your accountant."] },
        ],
      },
      it: {
        title: "Reverse charge: quando un'azienda UE non paga l'IVA bulgara per un sito",
        metaTitle: "Reverse charge IVA per aziende UE | Carbon Stealth", metaDesc: "Un'azienda UE con partita IVA valida riceve fattura senza IVA bulgara (art. 196 Dir. 2006/112/CE). I privati pagano il 20%. Non è consulenza fiscale.",
        desc: "Un'azienda UE con partita IVA valida riceve una fattura senza IVA bulgara (reverse charge, art. 196 Direttiva 2006/112/CE). I privati pagano il 20%. Non è una consulenza fiscale.",
        lede: "Risposta breve: se sei un'azienda in un altro paese UE con partita IVA valida, la fattura per servizi web dalla Bulgaria è senza IVA — l'imposta la assolvi tu nel tuo paese. Privati e aziende bulgare pagano il 20%.",
        sections: [
          { h: "Cos'è il reverse charge?", p: ["Un meccanismo in cui è il destinatario del servizio, non il fornitore, ad assolvere l'IVA. Per i servizi B2B tra paesi UE diversi il luogo della prestazione è dove è stabilito il committente (art. 44 Direttiva 2006/112/CE) e l'imposta è dovuta da lui (art. 196).", "Nella legge bulgara è l'art. 21, c. 2 della legge IVA. In fattura compare «reverse charge» e la tua partita IVA; la riga IVA non c'è."] },
          { h: "Chi paga il 20% di IVA?", p: ["Ogni cliente in Bulgaria — azienda o privato. Anche i privati negli altri paesi UE pagano l'IVA, perché il meccanismo vale solo tra soggetti passivi. I clienti fuori UE non devono l'IVA bulgara.", "Per questo mostriamo i prezzi così: la versione bulgara del sito include il 20% di IVA, quella inglese e italiana la escludono, con una nota su quando si applica."] },
          { h: "Cosa serve per una fattura senza IVA?", p: ["Una partita IVA valida, che verifichiamo nel sistema VIES della Commissione europea prima di emettere la fattura, e i dati dell'azienda. Se la partita IVA è invalida o manca, applichiamo il 20%.", "La verifica richiede un minuto e la facciamo noi. Tu mandi solo il numero insieme all'ordine."] },
          { h: "Un esempio con le cifre", p: ["Sito «Business»: 1.890 € IVA inclusa per un'azienda bulgara; 1.575 € senza IVA per un'azienda italiana con partita IVA valida, che assolve l'IVA italiana alla propria aliquota; 1.890 € per un privato in Italia.", "Il configuratore di preventivo fa i conti per il tuo caso in automatico. Non è una consulenza fiscale — nel dubbio chiedi al tuo commercialista."] },
        ],
      },
    },
  },
  {
    id: "lighthouse-95-kakvo-oznachava", date: "2026-09-18", updated: "2026-09-18", cover: "/img/previews/bg/hotel.webp",
    slug: { bg: "lighthouse-95-kakvo-oznachava", en: "lighthouse-95-what-it-means", it: "lighthouse-95-cosa-significa" },
    keywords: { bg: ["Lighthouse 95", "Core Web Vitals", "скорост на сайт", "LCP CLS INP", "бърз сайт SEO"], en: ["Lighthouse 95", "Core Web Vitals", "website speed", "LCP CLS INP", "fast website SEO"], it: ["Lighthouse 95", "Core Web Vitals", "velocità sito web", "LCP CLS INP", "sito veloce SEO"] },
    sources: [
      { name: "web.dev — Web Vitals (праговете LCP 2,5 s · INP 200 ms · CLS 0,1)", url: "https://web.dev/articles/vitals" },
      { name: "Chrome for Developers — Lighthouse performance scoring", url: "https://developer.chrome.com/docs/lighthouse/performance/performance-scoring" },
      { name: "web.dev — Best practices for fonts", url: "https://web.dev/articles/font-best-practices" },
    ],
    t: {
      bg: {
        title: "Lighthouse 95+: какво означава и как го постигаме на всеки сайт",
        metaTitle: "Lighthouse 95+: какво означава | Carbon Stealth", metaDesc: "Lighthouse оценява скоростта от 0 до 100 по LCP, TBT, CLS и FCP. Праговете на Google и петте неща, които правим, за да стигне сайтът до 95+.",
        desc: "Lighthouse оценява скоростта от 0 до 100 по LCP, TBT, CLS и FCP. Обясняваме праговете на Google (LCP 2,5 s, CLS 0,1, INP 200 ms) и петте неща, които правим, за да стигне сайтът до 95+.",
        lede: "Кратък отговор: Lighthouse е инструментът на Google, който оценява една страница от 0 до 100; над 90 е „зелено“. Резултатът идва от четири измервания — колко бързо се появява най-голямото съдържание, колко време страницата е блокирана от скриптове, колко скачат елементите и кога се появява първият текст.",
        sections: [
          { h: "Какво измерва Lighthouse?", p: ["Largest Contentful Paint (LCP) — кога се появява най-големият елемент; Google смята под 2,5 секунди за добро. Cumulative Layout Shift (CLS) — колко „скачат“ елементите при зареждане; добро е под 0,1. Total Blocking Time — колко дълго скриптовете блокират страницата; на живо му съответства INP, с праг 200 ms. First Contentful Paint — първият текст или картинка.", "Оценката е претеглена: LCP и CLS са по 25%, блокирането — 30%, първото изчертаване — 10%, Speed Index — 10%. Затова един тежък скрипт или едно скачащо заглавие могат да свалят иначе бърза страница под 90."] },
          { h: "Защо това има значение за бизнеса?", p: ["Скоростта е част от класирането в Google от години, а праговете на Core Web Vitals са публични. По-важното е поведението на хората: бавен сайт на телефон се затваря, преди да е зареден, и парите за реклама отиват в празно.", "Затова измерваме, не предполагаме. На всяко демо в портфолиото има лабораторен резултат за телефон и компютър — медиана от три измервания в същия Chromium и по същите криви, които ползва Lighthouse."] },
          { h: "Какво правим, за да стигне сайтът до 95+?", p: ["Пет неща. Статичен HTML без тежки рамки — страницата е готова още от сървъра. Снимки в WebP с точни размери и lazy loading, за да няма скачане. Шрифтове, хоствани от нас, с font-display: optional и preload — текстът не се преначертава, когато шрифтът пристигне. Скриптове с defer и без външни библиотеки. Nginx с компресия и дълъг кеш за всичко, което не се променя.", "Последното е дисциплина: измерваме преди всеки деплой и не пускаме страница, която е паднала под прага."] },
          { h: "Лабораторен резултат и реални потребители — една и съща ли са?", p: ["Не. Лабораторният резултат е измерване в контролирана среда (емулиран телефон, забавена мрежа). Реалните данни (CrUX) идват от истински потребители на Chrome за 28 дни и съществуват едва след като сайтът е на живо и има трафик.", "Лабораторното число е ранното предупреждение; полевото е присъдата. Добър сайт минава и двете, а ние показваме кое от двете гледате."] },
        ],
      },
      en: {
        title: "Lighthouse 95+: what it means and how we get there on every site",
        metaTitle: "Lighthouse 95+: what it means | Carbon Stealth", metaDesc: "Lighthouse scores speed from 0 to 100 with LCP, TBT, CLS and FCP. Google's thresholds and the five things we do to get a site to 95+.",
        desc: "Lighthouse scores speed from 0 to 100 using LCP, TBT, CLS and FCP. We explain Google's thresholds (LCP 2.5 s, CLS 0.1, INP 200 ms) and the five things we do to get a site to 95+.",
        lede: "Short answer: Lighthouse is Google's tool that scores a page from 0 to 100; above 90 is “green”. The score comes from four measurements — how fast the largest content appears, how long scripts block the page, how much elements jump around and when the first text shows up.",
        sections: [
          { h: "What does Lighthouse measure?", p: ["Largest Contentful Paint (LCP) — when the largest element appears; Google considers under 2.5 seconds good. Cumulative Layout Shift (CLS) — how much elements “jump” while loading; good is under 0.1. Total Blocking Time — how long scripts block the page; its field counterpart is INP, with a 200 ms threshold. First Contentful Paint — the first text or image.", "The score is weighted: LCP and CLS are 25% each, blocking 30%, first paint 10%, Speed Index 10%. So one heavy script or one jumping headline can push an otherwise fast page below 90."] },
          { h: "Why does it matter for a business?", p: ["Speed has been part of Google's ranking for years and the Core Web Vitals thresholds are public. More important is how people behave: a slow site on a phone gets closed before it loads, and the advertising money goes nowhere.", "That is why we measure instead of assuming. Every demo in the portfolio carries a lab score for phone and desktop — the median of three runs in the same Chromium and with the same curves Lighthouse uses."] },
          { h: "What do we do to get a site to 95+?", p: ["Five things. Static HTML without heavy frameworks — the page is ready straight from the server. WebP images with exact dimensions and lazy loading, so nothing jumps. Fonts hosted by us with font-display: optional and preload — text is not redrawn when the font arrives. Scripts with defer and no external libraries. Nginx with compression and long caching for everything that does not change.", "The last thing is discipline: we measure before every deploy and do not ship a page that has dropped below the threshold."] },
          { h: "Are the lab score and real users the same thing?", p: ["No. The lab score is a measurement in a controlled environment (emulated phone, throttled network). Field data (CrUX) comes from real Chrome users over 28 days and exists only once the site is live and has traffic.", "The lab number is the early warning; the field number is the verdict. A good site passes both, and we tell you which of the two you are looking at."] },
        ],
      },
      it: {
        title: "Lighthouse 95+: cosa significa e come ci arriviamo su ogni sito",
        metaTitle: "Lighthouse 95+: cosa significa | Carbon Stealth", metaDesc: "Lighthouse valuta la velocità da 0 a 100 con LCP, TBT, CLS e FCP. Le soglie di Google e le cinque cose che facciamo per portare un sito a 95+.",
        desc: "Lighthouse valuta la velocità da 0 a 100 con LCP, TBT, CLS e FCP. Spieghiamo le soglie di Google (LCP 2,5 s, CLS 0,1, INP 200 ms) e le cinque cose che facciamo per portare un sito a 95+.",
        lede: "Risposta breve: Lighthouse è lo strumento di Google che valuta una pagina da 0 a 100; sopra 90 è «verde». Il punteggio viene da quattro misure — quanto in fretta appare il contenuto più grande, quanto gli script bloccano la pagina, quanto saltano gli elementi e quando compare il primo testo.",
        sections: [
          { h: "Cosa misura Lighthouse?", p: ["Largest Contentful Paint (LCP) — quando appare l'elemento più grande; Google considera buono sotto 2,5 secondi. Cumulative Layout Shift (CLS) — quanto «saltano» gli elementi durante il caricamento; buono sotto 0,1. Total Blocking Time — quanto gli script bloccano la pagina; sul campo corrisponde a INP, con soglia 200 ms. First Contentful Paint — il primo testo o immagine.", "Il punteggio è pesato: LCP e CLS il 25% ciascuno, blocco 30%, prima pittura 10%, Speed Index 10%. Perciò uno script pesante o un titolo che salta possono portare sotto 90 una pagina altrimenti veloce."] },
          { h: "Perché conta per un'attività?", p: ["La velocità fa parte del ranking di Google da anni e le soglie dei Core Web Vitals sono pubbliche. Più importante è il comportamento delle persone: un sito lento da telefono viene chiuso prima di caricarsi, e i soldi della pubblicità finiscono nel vuoto.", "Per questo misuriamo invece di supporre. Ogni demo del portfolio ha un punteggio di laboratorio per telefono e computer — mediana di tre misure nello stesso Chromium e con le stesse curve che usa Lighthouse."] },
          { h: "Cosa facciamo per portare un sito a 95+?", p: ["Cinque cose. HTML statico senza framework pesanti — la pagina è pronta già dal server. Immagini WebP con dimensioni esatte e lazy loading, così nulla salta. Font ospitati da noi con font-display: optional e preload — il testo non viene ridisegnato quando arriva il font. Script con defer e senza librerie esterne. Nginx con compressione e cache lunga per tutto ciò che non cambia.", "L'ultima cosa è disciplina: misuriamo prima di ogni deploy e non pubblichiamo una pagina scesa sotto la soglia."] },
          { h: "Punteggio di laboratorio e utenti reali sono la stessa cosa?", p: ["No. Il punteggio di laboratorio è una misura in ambiente controllato (telefono emulato, rete rallentata). I dati sul campo (CrUX) vengono da utenti Chrome reali su 28 giorni ed esistono solo quando il sito è online e ha traffico.", "Il numero di laboratorio è l'allarme precoce; quello sul campo è il verdetto. Un buon sito supera entrambi, e noi ti diciamo quale dei due stai guardando."] },
        ],
      },
    },
  },
  {
    id: "statichen-sait-zashto", date: "2026-09-18", updated: "2026-09-18", cover: "/img/previews/bg/advokati.webp",
    slug: { bg: "statichen-sait-bez-wordpress", en: "static-website-instead-of-wordpress", it: "sito-statico-invece-di-wordpress" },
    keywords: { bg: ["статичен сайт", "сайт без WordPress", "сигурен сайт", "сайт без плъгини", "бърз сайт за малък бизнес"], en: ["static website", "website without WordPress", "secure website", "website without plugins", "fast small business website"], it: ["sito statico", "sito senza WordPress", "sito sicuro", "sito senza plugin", "sito veloce piccola impresa"] },
    sources: [
      { name: "OWASP — Vulnerable and Outdated Components (Top 10, A06)", url: "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/" },
      { name: "MDN — HTTP caching", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching" },
    ],
    t: {
      bg: {
        title: "Защо правим статични сайтове, а не WordPress",
        metaTitle: "Статични сайтове вместо WordPress | Carbon Stealth", metaDesc: "Статичен сайт е готови HTML файлове зад Nginx: без база данни, без плъгини, без вход за пробиване. По-бърз, по-евтин за хостване и ваш. Кога трябва CMS.",
        desc: "Статичен сайт е готови HTML файлове зад Nginx: няма база данни, няма плъгини за ъпдейт, няма вход за пробиване. По-бърз, по-евтин за хостване и ваш. Кога все пак ви трябва CMS.",
        lede: "Кратък отговор: статичният сайт е набор от готови файлове, които сървърът праща директно — без база данни и без код, който се изпълнява при всяка заявка. Затова е по-бърз, по-труден за пробиване и по-евтин за хостване. Съдържанието се сменя през админ панел, който генерира файловете наново.",
        sections: [
          { h: "Какво означава „статичен сайт“?", p: ["Всяка страница е готов HTML файл, а снимките, стиловете и скриптовете са файлове до него. Nginx ги сервира с кеш и компресия. Няма PHP, няма MySQL, няма нищо, което да се изпълнява на сървъра при вашето посещение.", "Всичките ни демота са точно такива: генерираме ги от едно описание на съдържанието на три езика, а резултатът е папка с файлове."] },
          { h: "Защо е по-сигурен?", p: ["Няма какво да се пробие. При WordPress най-честият проблем са остарели плъгини и теми — категорията „уязвими и остарели компоненти“ е в челото на OWASP Top 10. Статичният сайт няма плъгини, няма вход за администратор на публичния адрес и няма база, която да изтече.", "Админ панелът, който получавате с пакетите Премиум и Магазин, живее на отделен адрес с парола и роли, а публичният сайт остава само файлове."] },
          { h: "Защо е по-бърз и по-евтин?", p: ["Файл от кеша на Nginx се изпраща за милисекунди, без да се изчаква база данни. Затова демотата ни имат лабораторен резултат 95+ и без CDN. Хостингът е малък VPS в ЕС вместо „управляван WordPress“ хостинг, и това е цената, която виждате: 15 € на месец след първата година.", "Няма и месечни ъпдейти на плъгини, които чупят сайта в петък вечер."] },
          { h: "Кога все пак ви трябва CMS или магазин?", p: ["Когато съдържанието се сменя всеки ден от няколко души, или когато има поръчки, плащания и наличности. Тогава правим сайта с админ панел и база данни (Prisma + PostgreSQL), но публичната част остава бърза и кеширана.", "Ако не сте сигурни кое ви трябва, отговорът е прост: започнете със статичен сайт и добавете магазин, когато има какво да се продава."] },
        ],
      },
      en: {
        title: "Why we build static websites, not WordPress",
        metaTitle: "Why we build static websites, not WordPress | Carbon Stealth", metaDesc: "A static website is ready HTML files behind Nginx: no database, no plugins, no login to break into. Faster, cheaper to host and yours. When you need a CMS.",
        desc: "A static website is ready HTML files behind Nginx: no database, no plugins to update, no login to break into. Faster, cheaper to host and yours. When you still need a CMS.",
        lede: "Short answer: a static website is a set of ready files the server sends directly — no database and no code executed on every request. That makes it faster, harder to break into and cheaper to host. Content is changed through an admin panel that regenerates the files.",
        sections: [
          { h: "What does “static website” mean?", p: ["Every page is a ready HTML file, and the images, styles and scripts are files next to it. Nginx serves them with caching and compression. No PHP, no MySQL, nothing executed on the server when you visit.", "All our demos are exactly that: we generate them from one description of the content in three languages, and the result is a folder of files."] },
          { h: "Why is it more secure?", p: ["There is nothing to break into. With WordPress the most common problem is outdated plugins and themes — the “vulnerable and outdated components” category sits near the top of the OWASP Top 10. A static site has no plugins, no admin login on the public address and no database to leak.", "The admin panel you get with the Premium and Shop packages lives on a separate address with a password and roles, and the public site stays files only."] },
          { h: "Why is it faster and cheaper?", p: ["A file from Nginx's cache is sent in milliseconds, without waiting for a database. That is why our demos score 95+ in the lab even without a CDN. Hosting is a small EU VPS instead of “managed WordPress” hosting, and that is the price you see: €13 per month after the first year.", "There are also no monthly plugin updates that break the site on a Friday evening."] },
          { h: "When do you still need a CMS or a shop?", p: ["When content changes every day by several people, or when there are orders, payments and stock. Then we build the site with an admin panel and a database (Prisma + PostgreSQL), but the public part stays fast and cached.", "If you are not sure what you need, the answer is simple: start with a static site and add a shop when there is something to sell."] },
        ],
      },
      it: {
        title: "Perché facciamo siti statici e non WordPress",
        metaTitle: "Siti statici invece di WordPress | Carbon Stealth", metaDesc: "Un sito statico è HTML pronto dietro Nginx: niente database, niente plugin, nessun login da violare. Più veloce, più economico e tuo. Quando serve un CMS.",
        desc: "Un sito statico è un insieme di file HTML pronti dietro Nginx: niente database, niente plugin da aggiornare, nessun login da violare. Più veloce, più economico da ospitare e tuo. Quando serve comunque un CMS.",
        lede: "Risposta breve: un sito statico è un insieme di file pronti che il server invia direttamente — senza database e senza codice eseguito a ogni richiesta. Per questo è più veloce, più difficile da violare e più economico da ospitare. I contenuti si cambiano da un pannello admin che rigenera i file.",
        sections: [
          { h: "Cosa vuol dire «sito statico»?", p: ["Ogni pagina è un file HTML pronto, e immagini, stili e script sono file accanto. Nginx li serve con cache e compressione. Niente PHP, niente MySQL, nulla che venga eseguito sul server quando visiti.", "Tutte le nostre demo sono esattamente così: le generiamo da una descrizione dei contenuti in tre lingue, e il risultato è una cartella di file."] },
          { h: "Perché è più sicuro?", p: ["Non c'è nulla da violare. Con WordPress il problema più comune sono plugin e temi obsoleti — la categoria «componenti vulnerabili e obsoleti» è in cima alla OWASP Top 10. Un sito statico non ha plugin, non ha login admin sull'indirizzo pubblico e non ha un database che possa trapelare.", "Il pannello admin che ricevi con i pacchetti Premium e Shop vive su un indirizzo separato con password e ruoli, e il sito pubblico resta solo file."] },
          { h: "Perché è più veloce ed economico?", p: ["Un file dalla cache di Nginx viene inviato in millisecondi, senza aspettare un database. Per questo le nostre demo hanno un punteggio di laboratorio 95+ anche senza CDN. L'hosting è un piccolo VPS in UE invece di un hosting «WordPress gestito», ed è il prezzo che vedi: 13 € al mese dopo il primo anno.", "E non ci sono aggiornamenti mensili di plugin che rompono il sito il venerdì sera."] },
          { h: "Quando serve comunque un CMS o uno shop?", p: ["Quando i contenuti cambiano ogni giorno per mano di più persone, o quando ci sono ordini, pagamenti e magazzino. Allora facciamo il sito con pannello admin e database (Prisma + PostgreSQL), ma la parte pubblica resta veloce e in cache.", "Se non sei sicuro di cosa ti serve, la risposta è semplice: parti da un sito statico e aggiungi lo shop quando c'è qualcosa da vendere."] },
        ],
      },
    },
  },
  {
    id: "hosting-es-gdpr", date: "2026-09-18", updated: "2026-09-18", cover: "/img/previews/bg/klinika.webp",
    slug: { bg: "hosting-v-es-i-gdpr", en: "eu-hosting-and-gdpr", it: "hosting-in-ue-e-gdpr" },
    keywords: { bg: ["хостинг в ЕС", "GDPR сайт", "договор за обработка на данни", "бисквитки съгласие", "сигурност на сайт"], en: ["EU hosting", "GDPR website", "data processing agreement", "cookie consent", "website security"], it: ["hosting in UE", "GDPR sito web", "accordo trattamento dati", "consenso cookie", "sicurezza sito"] },
    sources: [
      { name: "Регламент (ЕС) 2016/679 (GDPR) — чл. 28 (обработващ) и глава V (предаване извън ЕС), EUR-Lex", url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj" },
      { name: "Hetzner — центрове за данни в Германия и Финландия", url: "https://www.hetzner.com/" },
    ],
    t: {
      bg: {
        title: "Хостинг в ЕС и GDPR: петте въпроса, които собственикът на сайт трябва да зададе",
        metaTitle: "Хостинг в ЕС и GDPR: 5 въпроса | Carbon Stealth", metaDesc: "Къде са сървърите, има ли договор по чл. 28 GDPR, какви бисквитки има, кой има достъп и какво става при прекратяване. Отговорите ни за всеки сайт.",
        desc: "Къде са сървърите, има ли договор за обработка на данни (чл. 28 GDPR), какви бисквитки има, кой има достъп и какво става при прекратяване. Отговорите ни за всеки сайт, който правим.",
        lede: "Кратък отговор: ако сайтът ви събира и едно име от форма, вие сте администратор на лични данни, а хостингът ви е обработващ. GDPR иска писмен договор с него (чл. 28) и внимание при предаване на данни извън ЕС (глава V). Ето петте въпроса и как ги решаваме.",
        sections: [
          { h: "Къде физически са сървърите?", p: ["Нашите — в центрове за данни на Hetzner в Германия и Финландия. Данните не напускат Европейския съюз, значи не ви трябват допълнителни гаранции за предаване към трети държави.", "При „облачни“ платформи извън ЕС трябва да питате изрично: къде се съхраняват данните, къде се правят бекъпите и през чии сървъри минават формите."] },
          { h: "Има ли договор за обработка на данни?", p: ["Чл. 28 от GDPR изисква администраторът и обработващият да имат писмен договор с конкретно съдържание: предмет, срок, вид данни, задължения за сигурност, подизпълнители. Даваме такъв договор (DPA) при поискване към всеки пакет с хостинг.", "Ако доставчикът ви не може да покаже такъв документ, това е отговор само по себе си."] },
          { h: "Какви бисквитки и проследяване има?", p: ["По подразбиране — никакви. Демотата и портфолиото нямат бисквитки, нямат Google Analytics и нямат външни скриптове; затова и нямат банер за съгласие. Ако искате аналитика, предлагаме приватностно решение, което не иска съгласие, или класическо с коректен банер.", "Правилото е просто: не събирай, каквото не ти трябва, и няма да имаш какво да губиш."] },
          { h: "Кой има достъп до сървъра и как?", p: ["Достъпът е само по SSH ключ, без пароли, от ограничен кръг хора, с fail2ban срещу автоматизирани опити. Обновяванията на системата са автоматични, бекъпите — ежедневни, пазени 30 дни на отделен сървър.", "Това са конкретните мерки по чл. 32 (сигурност на обработването), които можете да опишете и в собствения си регистър на дейностите."] },
          { h: "Какво става, ако прекратите?", p: ["Получавате целия код и данните в архив, без такса, и сайтът може да работи навсякъде. Данните на сървъра се изтриват след потвърждение от вас, бекъпите изтичат по график.", "Това не е правен съвет — за собствения ви регистър и политики се консултирайте с юрист. Ние даваме техническата част и документите за нея."] },
        ],
      },
      en: {
        title: "EU hosting and GDPR: the five questions a website owner should ask",
        metaTitle: "EU hosting and GDPR: five questions to ask | Carbon Stealth", metaDesc: "Where the servers are, whether there is an Art. 28 GDPR agreement, which cookies exist, who has access and what happens on termination. Our answers.",
        desc: "Where the servers are, whether there is a data processing agreement (Art. 28 GDPR), which cookies exist, who has access and what happens on termination. Our answers for every site we build.",
        lede: "Short answer: if your site collects even one name from a form, you are a controller of personal data and your host is a processor. The GDPR requires a written contract with the processor (Art. 28) and care when transferring data outside the EU (Chapter V). Here are the five questions and how we handle them.",
        sections: [
          { h: "Where are the servers physically?", p: ["Ours — in Hetzner data centres in Germany and Finland. Data never leaves the European Union, so you need no additional safeguards for transfers to third countries.", "With “cloud” platforms outside the EU you must ask explicitly: where data is stored, where backups are made and whose servers the forms pass through."] },
          { h: "Is there a data processing agreement?", p: ["Art. 28 of the GDPR requires the controller and the processor to have a written contract with specific content: subject matter, duration, types of data, security obligations, sub-processors. We provide such an agreement (DPA) on request with every hosting package.", "If your provider cannot show such a document, that is an answer in itself."] },
          { h: "Which cookies and tracking are there?", p: ["By default — none. The demos and the portfolio have no cookies, no Google Analytics and no external scripts; that is why they have no consent banner either. If you want analytics, we offer a privacy-first option that needs no consent, or the classic one with a proper banner.", "The rule is simple: do not collect what you do not need, and you will have nothing to lose."] },
          { h: "Who has access to the server and how?", p: ["Access is by SSH key only, no passwords, for a limited circle of people, with fail2ban against automated attempts. System updates are automatic, backups daily, kept for 30 days on a separate server.", "These are the concrete measures under Art. 32 (security of processing) that you can also describe in your own record of processing activities."] },
          { h: "What happens if you terminate?", p: ["You get all code and data as an archive, free of charge, and the site can run anywhere. Data on the server is deleted after your confirmation; backups expire on schedule.", "This is not legal advice — for your own records and policies consult a lawyer. We provide the technical part and the documents for it."] },
        ],
      },
      it: {
        title: "Hosting in UE e GDPR: le cinque domande che il titolare di un sito deve fare",
        metaTitle: "Hosting in UE e GDPR: 5 domande | Carbon Stealth", metaDesc: "Dove sono i server, se c'è un accordo art. 28 GDPR, quali cookie ci sono, chi ha accesso e cosa succede alla disdetta. Le nostre risposte.",
        desc: "Dove sono i server, se c'è un accordo sul trattamento dei dati (art. 28 GDPR), quali cookie ci sono, chi ha accesso e cosa succede alla disdetta. Le nostre risposte per ogni sito che realizziamo.",
        lede: "Risposta breve: se il tuo sito raccoglie anche un solo nome da un modulo, sei titolare del trattamento e il tuo hosting è responsabile del trattamento. Il GDPR richiede un contratto scritto con lui (art. 28) e attenzione al trasferimento di dati fuori UE (capo V). Ecco le cinque domande e come le gestiamo.",
        sections: [
          { h: "Dove sono fisicamente i server?", p: ["I nostri — nei data center Hetzner in Germania e Finlandia. I dati non lasciano mai l'Unione Europea, quindi non servono garanzie aggiuntive per trasferimenti verso paesi terzi.", "Con le piattaforme «cloud» fuori UE devi chiedere esplicitamente: dove sono conservati i dati, dove si fanno i backup e da quali server passano i moduli."] },
          { h: "C'è un accordo sul trattamento dei dati?", p: ["L'art. 28 del GDPR richiede che titolare e responsabile abbiano un contratto scritto con contenuti precisi: oggetto, durata, tipi di dati, obblighi di sicurezza, sub-responsabili. Forniamo questo accordo (DPA) su richiesta con ogni pacchetto hosting.", "Se il tuo fornitore non può mostrare un documento simile, è già una risposta."] },
          { h: "Quali cookie e tracciamenti ci sono?", p: ["Di default — nessuno. Le demo e il portfolio non hanno cookie, non hanno Google Analytics e non hanno script esterni; per questo non hanno nemmeno il banner di consenso. Se vuoi le statistiche, proponiamo una soluzione privacy-first che non richiede consenso, oppure quella classica con un banner corretto.", "La regola è semplice: non raccogliere ciò che non ti serve, e non avrai nulla da perdere."] },
          { h: "Chi ha accesso al server e come?", p: ["L'accesso è solo con chiave SSH, senza password, per una cerchia ristretta di persone, con fail2ban contro i tentativi automatici. Gli aggiornamenti di sistema sono automatici, i backup giornalieri, conservati 30 giorni su un server separato.", "Sono le misure concrete dell'art. 32 (sicurezza del trattamento) che puoi descrivere anche nel tuo registro dei trattamenti."] },
          { h: "Cosa succede se disdici?", p: ["Ricevi tutto il codice e i dati in un archivio, gratis, e il sito può funzionare ovunque. I dati sul server vengono cancellati dopo la tua conferma; i backup scadono secondo il calendario.", "Non è una consulenza legale — per il tuo registro e le tue policy consulta un avvocato. Noi forniamo la parte tecnica e i documenti relativi."] },
        ],
      },
    },
  },
];
