#!/usr/bin/env python3
"""Generate localized GEO landing pages (it/en/bg) + hub pages + sitemap-geo.xml.

Usage: python3 scripts/generate-geo.py   (run from repo root; writes into public/)
Each city gets unique local copy to avoid thin/doorway pages.
"""
import os, html

BASE = "https://carbonstealth.eu"
LASTMOD = "2026-06-15"

CITIES = [
 # slug, country, region, lat, lon, names{it,en,bg}
 dict(slug="sofia", country="BG", region="BG-22", lat=42.6977, lon=23.3219,
  name=dict(it="Sofia", en="Sofia", bg="София"),
  hook=dict(
   it="Sofia è la capitale e il principale hub tecnologico della Bulgaria: fintech, startup e outsourcing IT. Aiutiamo le aziende di Sofia a lanciare siti, e-commerce e software con costi competitivi e qualità da mercato occidentale.",
   en="Sofia is Bulgaria's capital and its main tech hub — fintech, startups and IT outsourcing. We help Sofia businesses launch websites, e-commerce and software with competitive pricing and western-market quality.",
   bg="София е столицата и основният технологичен център на България — финтех, стартъпи и IT аутсорсинг. Помагаме на бизнеса в София да стартира сайтове, онлайн магазини и софтуер на конкурентни цени и западно качество."),
  local=dict(
   it="Lavoriamo con aziende di Sofia da remoto e in presenza: la nostra sede di Bobov Dol è a circa un'ora dalla capitale. Conosciamo il mercato locale, i fornitori di hosting bulgari e i requisiti di fatturazione del paese.",
   en="We work with Sofia companies both remotely and on-site — our Bobov Dol HQ is about an hour from the capital. We know the local market, Bulgarian hosting providers and the country's invoicing requirements.",
   bg="Работим с фирми от София дистанционно и на място — офисът ни в Бобов дол е на около час от столицата. Познаваме местния пазар, българските хостинг доставчици и изискванията за фактуриране.")),
 dict(slug="plovdiv", country="BG", region="BG-16", lat=42.1354, lon=24.7453,
  name=dict(it="Plovdiv", en="Plovdiv", bg="Пловдив"),
  hook=dict(
   it="Plovdiv è la seconda città della Bulgaria e sede della Trakia Economic Zone: manifattura, logistica e industria leggera. Costruiamo siti vetrina, cataloghi B2B e sistemi ERP per le aziende della regione.",
   en="Plovdiv is Bulgaria's second city and home of the Trakia Economic Zone — manufacturing, logistics and light industry. We build company sites, B2B catalogs and ERP systems for businesses in the region.",
   bg="Пловдив е вторият по големина град в България и дом на Тракия икономическа зона — производство, логистика и лека промишленост. Изграждаме фирмени сайтове, B2B каталози и ERP системи за бизнеса в региона."),
  local=dict(
   it="Per i produttori della zona industriale di Plovdiv offriamo ERP con moduli magazzino e produzione, già in uso presso costruttori italiani. Incontri in presenza su appuntamento.",
   en="For manufacturers in Plovdiv's industrial zones we offer ERP with warehouse and production modules, already used by Italian manufacturers. On-site meetings by appointment.",
   bg="За производителите в индустриалните зони на Пловдив предлагаме ERP със складови и производствени модули, вече използвани от италиански производители. Срещи на място по уговорка.")),
 dict(slug="varna", country="BG", region="BG-03", lat=43.2141, lon=27.9147,
  name=dict(it="Varna", en="Varna", bg="Варна"),
  hook=dict(
   it="Varna è il principale porto bulgaro sul Mar Nero, con turismo, industria marittima e una scena IT in crescita. Realizziamo siti per hotel, sistemi di prenotazione ed e-commerce per le aziende della costa.",
   en="Varna is Bulgaria's main Black Sea port, with tourism, maritime industry and a growing IT scene. We build hotel websites, booking systems and e-commerce for businesses on the coast.",
   bg="Варна е най-голямото черноморско пристанище на България — туризъм, морска индустрия и растяща IT сцена. Изработваме сайтове за хотели, системи за резервации и онлайн магазини за бизнеса по морето."),
  local=dict(
   it="Per il settore turistico di Varna sviluppiamo siti multilingue (bulgaro, inglese, russo, tedesco) con prenotazioni online e pagamenti Stripe. Supporto remoto in giornata.",
   en="For Varna's tourism sector we develop multilingual sites (Bulgarian, English, Russian, German) with online booking and Stripe payments. Same-day remote support.",
   bg="За туристическия сектор във Варна разработваме многоезични сайтове (български, английски, руски, немски) с онлайн резервации и Stripe плащания. Дистанционна поддръжка в рамките на деня.")),
 dict(slug="burgas", country="BG", region="BG-02", lat=42.5048, lon=27.4626,
  name=dict(it="Burgas", en="Burgas", bg="Бургас"),
  hook=dict(
   it="Burgas unisce un grande porto, il petrolchimico e il turismo del Mar Nero meridionale. Sviluppiamo e-commerce, siti aziendali e dashboard logistiche per le imprese della regione.",
   en="Burgas combines a major port, petrochemicals and southern Black Sea tourism. We develop e-commerce, corporate sites and logistics dashboards for companies in the region.",
   bg="Бургас съчетава голямо пристанище, нефтохимия и туризъм по южното Черноморие. Разработваме онлайн магазини, фирмени сайтове и логистични табла за компаниите в региона."),
  local=dict(
   it="Per le attività stagionali di Burgas e Sunny Beach garantiamo lanci rapidi: un sito completo in 1-2 settimane, pronto prima della stagione estiva.",
   en="For seasonal businesses in Burgas and Sunny Beach we guarantee fast launches: a complete website in 1-2 weeks, ready before the summer season.",
   bg="За сезонния бизнес в Бургас и Слънчев бряг гарантираме бърз старт: завършен сайт за 1-2 седмици, готов преди летния сезон.")),
 dict(slug="ruse", country="BG", region="BG-18", lat=43.8356, lon=25.9657,
  name=dict(it="Ruse", en="Ruse", bg="Русе"),
  hook=dict(
   it="Ruse è il principale porto bulgaro sul Danubio e la porta verso la Romania: commercio transfrontaliero, manifattura e logistica. Creiamo siti multilingue e sistemi gestionali per le aziende esportatrici.",
   en="Ruse is Bulgaria's main Danube port and the gateway to Romania — cross-border trade, manufacturing and logistics. We create multilingual sites and management systems for exporters.",
   bg="Русе е главното дунавско пристанище на България и врата към Румъния — трансграничен бизнес, производство и логистика. Създаваме многоезични сайтове и системи за управление за фирми износители."),
  local=dict(
   it="Per chi lavora con il mercato rumeno realizziamo siti anche in rumeno e integriamo corrieri e pagamenti locali di entrambi i paesi.",
   en="For companies working with the Romanian market we build sites in Romanian too and integrate couriers and payments for both countries.",
   bg="За фирми, работещи с румънския пазар, правим сайтове и на румънски и интегрираме куриери и разплащания за двете държави.")),
 dict(slug="stara-zagora", country="BG", region="BG-24", lat=42.4258, lon=25.6345,
  name=dict(it="Stara Zagora", en="Stara Zagora", bg="Стара Загора"),
  hook=dict(
   it="Stara Zagora è il cuore energetico della Bulgaria e un centro agro-industriale. Sviluppiamo cataloghi B2B, ERP e siti aziendali per produttori e fornitori della regione.",
   en="Stara Zagora is Bulgaria's energy heartland and an agro-industrial center. We develop B2B catalogs, ERP and corporate sites for manufacturers and suppliers in the region.",
   bg="Стара Загора е енергийното сърце на България и агро-индустриален център. Разработваме B2B каталози, ERP и фирмени сайтове за производители и доставчици в региона."),
  local=dict(
   it="Digitalizziamo i processi cartacei: offerte, ordini e magazzino in un unico sistema, con formazione del personale in bulgaro inclusa.",
   en="We digitalize paper processes: quotes, orders and warehouse in one system, with staff training in Bulgarian included.",
   bg="Дигитализираме хартиените процеси: оферти, поръчки и склад в една система, с включено обучение на персонала на български.")),
 dict(slug="veliko-tarnovo", country="BG", region="BG-04", lat=43.0757, lon=25.6172,
  name=dict(it="Veliko Tarnovo", en="Veliko Tarnovo", bg="Велико Търново"),
  hook=dict(
   it="Veliko Tarnovo, antica capitale e città universitaria, vive di turismo, artigianato e servizi. Realizziamo siti per hotel, ristoranti e tour operator con prenotazioni online.",
   en="Veliko Tarnovo, the old capital and a university city, runs on tourism, crafts and services. We build sites for hotels, restaurants and tour operators with online booking.",
   bg="Велико Търново — старата столица и университетски град — живее с туризъм, занаяти и услуги. Правим сайтове за хотели, ресторанти и туроператори с онлайн резервации."),
  local=dict(
   it="Ottimizziamo per le ricerche turistiche internazionali: schede Google Business, SEO locale e contenuti in più lingue per attirare visitatori stranieri.",
   en="We optimize for international tourist searches: Google Business profiles, local SEO and multilingual content to attract foreign visitors.",
   bg="Оптимизираме за международни туристически търсения: Google Business профили, локално SEO и многоезично съдържание за чуждестранни гости.")),
 dict(slug="blagoevgrad", country="BG", region="BG-01", lat=42.0209, lon=23.0943,
  name=dict(it="Blagoevgrad", en="Blagoevgrad", bg="Благоевград"),
  hook=dict(
   it="Blagoevgrad è una città universitaria (AUBG) e lo snodo del sud-ovest bulgaro verso la Grecia. Supportiamo PMI, studi professionali e attività commerciali con siti moderni e SEO locale.",
   en="Blagoevgrad is a university city (AUBG) and the hub of southwest Bulgaria towards Greece. We support SMEs, professional practices and retail with modern websites and local SEO.",
   bg="Благоевград е университетски град (АУБ) и център на Югозападна България към Гърция. Подкрепяме МСП, професионални практики и търговски обекти с модерни сайтове и локално SEO."),
  local=dict(
   it="Siamo a meno di un'ora di distanza: incontri in presenza senza problemi e supporto rapido per le aziende della valle dello Struma.",
   en="We're less than an hour away: easy on-site meetings and fast support for businesses along the Struma valley.",
   bg="Намираме се на по-малко от час път — лесни срещи на място и бърза поддръжка за бизнеса по долината на Струма.")),
 dict(slug="kyustendil", country="BG", region="BG-10", lat=42.2839, lon=22.6911,
  name=dict(it="Kyustendil", en="Kyustendil", bg="Кюстендил"),
  hook=dict(
   it="Kyustendil è la nostra provincia: terra di frutteti, terme e piccole imprese. Siamo l'agenzia digitale locale — supporto in presenza, prezzi onesti e nessun intermediario.",
   en="Kyustendil is our home province — orchards, spa tourism and small businesses. We are the local digital agency: on-site support, honest pricing and no middlemen.",
   bg="Кюстендил е нашата област — овощни градини, СПА туризъм и малък бизнес. Ние сме местната дигитална агенция: поддръжка на място, честни цени и без посредници."),
  local=dict(
   it="Sede a Bobov Dol, nella provincia di Kyustendil: possiamo incontrarci di persona in giornata, anche per piccoli progetti.",
   en="Headquartered in Bobov Dol, Kyustendil province: we can meet in person the same day, even for small projects.",
   bg="Седалището ни е в Бобов дол, област Кюстендил — можем да се срещнем лично още същия ден, дори за малки проекти.")),
 dict(slug="dupnitsa", country="BG", region="BG-10", lat=42.2649, lon=23.1149,
  name=dict(it="Dupnitsa", en="Dupnitsa", bg="Дупница"),
  hook=dict(
   it="Dupnitsa è a venti minuti dalla nostra sede: industria farmaceutica, manifattura e commercio. Siti web, e-commerce e software gestionale con assistenza davvero locale.",
   en="Dupnitsa is twenty minutes from our HQ — pharmaceuticals, manufacturing and retail. Websites, e-commerce and business software with truly local support.",
   bg="Дупница е на двадесет минути от офиса ни — фармацевтика, производство и търговия. Сайтове, онлайн магазини и бизнес софтуер с истинска местна поддръжка."),
  local=dict(
   it="Per le aziende di Dupnitsa offriamo sopralluoghi gratuiti e formazione del personale in sede. Il vostro partner IT più vicino.",
   en="For Dupnitsa businesses we offer free on-site visits and staff training at your office. Your nearest IT partner.",
   bg="За фирмите в Дупница предлагаме безплатни огледи и обучение на персонала на място. Вашият най-близък IT партньор.")),
 dict(slug="milano", country="IT", region="IT-MI", lat=45.4642, lon=9.19,
  name=dict(it="Milano", en="Milan", bg="Милано"),
  hook=dict(
   it="Milano è la capitale economica d'Italia: moda, fintech, design e servizi. Offriamo alle aziende milanesi sviluppo web premium e software su misura a tariffe da nearshoring, con project management in italiano.",
   en="Milan is Italy's business capital — fashion, fintech, design and services. We give Milanese companies premium web development and custom software at nearshoring rates, with project management in Italian.",
   bg="Милано е бизнес столицата на Италия — мода, финтех, дизайн и услуги. Предлагаме на миланските фирми премиум уеб разработка и софтуер по поръчка на конкурентни цени, с комуникация на италиански."),
  local=dict(
   it="Numero italiano dedicato (+39), fatturazione UE con partita IVA bulgara valida per il reverse charge e call in orario italiano: lavorare con noi è semplice come con un fornitore locale.",
   en="Dedicated Italian phone number (+39), EU invoicing with a Bulgarian VAT number valid for reverse charge, and calls on Italian hours — working with us is as easy as with a local supplier.",
   bg="Имаме италиански телефонен номер (+39), европейско фактуриране с валиден ДДС номер и разговори в италианско работно време — работата с нас е лесна като с местен доставчик.")),
 dict(slug="roma", country="IT", region="IT-RM", lat=41.9028, lon=12.4964,
  name=dict(it="Roma", en="Rome", bg="Рим"),
  hook=dict(
   it="Roma concentra istituzioni, turismo e servizi professionali. Realizziamo siti istituzionali, portali multilingue e prenotazioni online per hotel, studi e associazioni della capitale.",
   en="Rome concentrates institutions, tourism and professional services. We build institutional sites, multilingual portals and online booking for hotels, firms and associations in the capital.",
   bg="Рим съсредоточава институции, туризъм и професионални услуги. Изграждаме институционални сайтове, многоезични портали и онлайн резервации за хотели, кантори и асоциации в столицата."),
  local=dict(
   it="Per il settore turistico romano: siti in 4+ lingue, dati strutturati schema.org per hotel e tour, integrazione con Booking e canali OTA.",
   en="For Rome's tourism sector: sites in 4+ languages, schema.org structured data for hotels and tours, integration with Booking and OTA channels.",
   bg="За туристическия сектор в Рим: сайтове на 4+ езика, schema.org структурирани данни за хотели и турове, интеграция с Booking и OTA канали.")),
 dict(slug="torino", country="IT", region="IT-TO", lat=45.0703, lon=7.6869,
  name=dict(it="Torino", en="Turin", bg="Торино"),
  hook=dict(
   it="Torino è la città dell'automotive e dell'industria: una tradizione manifatturiera che oggi chiede digitalizzazione. Sviluppiamo ERP, portali B2B e cataloghi tecnici per le aziende piemontesi.",
   en="Turin is Italy's automotive and industrial city — a manufacturing tradition that now demands digitalization. We develop ERP, B2B portals and technical catalogs for Piedmont companies.",
   bg="Торино е градът на автомобилната и тежката индустрия — производствена традиция, която днес изисква дигитализация. Разработваме ERP, B2B портали и технически каталози за фирмите в Пиемонт."),
  local=dict(
   it="Il nostro ERP è già in produzione presso un costruttore italiano di ascensori: moduli produzione, magazzino e fatturazione conformi alle esigenze italiane.",
   en="Our ERP already runs in production at an Italian elevator manufacturer: production, warehouse and invoicing modules built for Italian requirements.",
   bg="Нашата ERP система вече работи при италиански производител на асансьори: модули за производство, склад и фактуриране според италианските изисквания.")),
 dict(slug="firenze", country="IT", region="IT-FI", lat=43.7696, lon=11.2558,
  name=dict(it="Firenze", en="Florence", bg="Флоренция"),
  hook=dict(
   it="Firenze vive di artigianato, moda e turismo internazionale. Portiamo online gli artigiani e le boutique toscane con e-commerce multilingue e storytelling visivo di qualità.",
   en="Florence runs on craftsmanship, fashion and international tourism. We bring Tuscan artisans and boutiques online with multilingual e-commerce and quality visual storytelling.",
   bg="Флоренция живее от занаяти, мода и международен туризъм. Извеждаме тосканските занаятчии и бутици онлайн с многоезична електронна търговия и качествен визуален разказ."),
  local=dict(
   it="E-commerce con Stripe e spedizioni internazionali per vendere il made in Florence nel mondo, più SEO in inglese per intercettare i turisti.",
   en="E-commerce with Stripe and international shipping to sell 'made in Florence' worldwide, plus English SEO to capture tourist searches.",
   bg="Електронна търговия със Stripe и международни доставки за продажба на 'made in Florence' по света, плюс SEO на английски за туристите.")),
 dict(slug="napoli", country="IT", region="IT-NA", lat=40.8518, lon=14.2681,
  name=dict(it="Napoli", en="Naples", bg="Неапол"),
  hook=dict(
   it="Napoli è il motore commerciale del Sud: porto, food, turismo e una nuova generazione di imprese digitali. Siti web ed e-commerce veloci, concreti e dal prezzo giusto.",
   en="Naples is the commercial engine of southern Italy — port, food, tourism and a new generation of digital businesses. Fast, practical, fairly priced websites and e-commerce.",
   bg="Неапол е търговският двигател на Южна Италия — пристанище, храни, туризъм и ново поколение дигитален бизнес. Бързи, практични и на справедлива цена сайтове и онлайн магазини."),
  local=dict(
   it="Per ristoranti, pizzerie e food brand napoletani: menu digitali, ordini online e schede Google ottimizzate per le ricerche locali.",
   en="For Neapolitan restaurants, pizzerias and food brands: digital menus, online ordering and Google profiles optimized for local searches.",
   bg="За неаполитански ресторанти, пицарии и хранителни брандове: дигитални менюта, онлайн поръчки и оптимизирани Google профили за локални търсения.")),
 dict(slug="bologna", country="IT", region="IT-BO", lat=44.4949, lon=11.3426,
  name=dict(it="Bologna", en="Bologna", bg="Болоня"),
  hook=dict(
   it="Bologna è il cuore della packaging valley e dell'automazione industriale, oltre che città universitaria. Sviluppiamo software B2B, ERP e portali tecnici per la meccanica emiliana.",
   en="Bologna is the heart of the packaging valley and industrial automation, as well as a university city. We develop B2B software, ERP and technical portals for Emilia's machinery sector.",
   bg="Болоня е сърцето на 'packaging valley' и индустриалната автоматизация, както и университетски град. Разработваме B2B софтуер, ERP и технически портали за машиностроенето на Емилия."),
  local=dict(
   it="Integriamo gestionali esistenti, file CAD e listini complessi in portali web B2B con aree riservate per rivenditori e agenti.",
   en="We integrate existing management systems, CAD files and complex price lists into B2B web portals with reserved areas for dealers and agents.",
   bg="Интегрираме съществуващи системи, CAD файлове и сложни ценови листи в B2B уеб портали със защитени зони за дилъри и агенти.")),
 dict(slug="verona", country="IT", region="IT-VR", lat=45.4384, lon=10.9916,
  name=dict(it="Verona", en="Verona", bg="Верона"),
  hook=dict(
   it="Verona è uno snodo logistico europeo (Quadrante Europa) e capitale del vino italiano. Cataloghi export multilingue, e-commerce vinicoli e siti per la logistica.",
   en="Verona is a European logistics hub (Quadrante Europa) and the capital of Italian wine. Multilingual export catalogs, wine e-commerce and logistics websites.",
   bg="Верона е европейски логистичен възел (Quadrante Europa) и столица на италианското вино. Многоезични експортни каталози, винени онлайн магазини и сайтове за логистика."),
  local=dict(
   it="Per cantine ed esportatori: e-commerce B2B e B2C, contenuti in inglese e tedesco per i mercati esteri, spedizioni internazionali integrate.",
   en="For wineries and exporters: B2B and B2C e-commerce, English and German content for foreign markets, integrated international shipping.",
   bg="За винарни и износители: B2B и B2C онлайн магазини, съдържание на английски и немски за външните пазари, интегрирани международни доставки.")),
 dict(slug="genova", country="IT", region="IT-GE", lat=44.4056, lon=8.9463,
  name=dict(it="Genova", en="Genoa", bg="Генуа"),
  hook=dict(
   it="Genova è il primo porto d'Italia: shipping, logistica e blue economy. Sviluppiamo dashboard operative, portali documentali e siti per le aziende della filiera marittima.",
   en="Genoa is Italy's largest port — shipping, logistics and the blue economy. We develop operational dashboards, document portals and websites for the maritime supply chain.",
   bg="Генуа е най-голямото пристанище на Италия — корабоплаване, логистика и синя икономика. Разработваме оперативни табла, документни портали и сайтове за морския сектор."),
  local=dict(
   it="Software su misura per spedizionieri e agenzie marittime: tracking, documenti di trasporto e reportistica in tempo reale.",
   en="Custom software for freight forwarders and maritime agencies: tracking, transport documents and real-time reporting.",
   bg="Софтуер по поръчка за спедитори и морски агенции: проследяване, транспортни документи и отчети в реално време.")),
 dict(slug="bari", country="IT", region="IT-BA", lat=41.1171, lon=16.8719,
  name=dict(it="Bari", en="Bari", bg="Бари"),
  hook=dict(
   it="Bari guida la crescita digitale della Puglia: agroalimentare, turismo e un distretto tech in espansione. Siti web, e-commerce e SEO per il Mezzogiorno che innova.",
   en="Bari leads Puglia's digital growth — agrifood, tourism and an expanding tech district. Websites, e-commerce and SEO for an innovating southern Italy.",
   bg="Бари води дигиталния растеж на Пулия — хранителна индустрия, туризъм и разширяващ се технологичен район. Сайтове, електронна търговия и SEO за иновативния италиански юг."),
  local=dict(
   it="Per i produttori agroalimentari pugliesi: e-commerce con spedizioni refrigerate, etichette multilingue e vendita diretta ai mercati del Nord Europa.",
   en="For Puglia's agrifood producers: e-commerce with refrigerated shipping, multilingual labels and direct sales to northern European markets.",
   bg="За хранителните производители от Пулия: онлайн магазини с хладилни доставки, многоезични етикети и директни продажби към Северна Европа.")),
 dict(slug="padova", country="IT", region="IT-PD", lat=45.4064, lon=11.8768,
  name=dict(it="Padova", en="Padua", bg="Падуа"),
  hook=dict(
   it="Padova è il cuore delle PMI venete: meccanica, termoidraulica, fiere e commercio. Portali B2B, configuratori di prodotto e siti aziendali che generano richieste di preventivo.",
   en="Padua is the heart of Veneto's SMEs — machinery, plumbing and heating, trade fairs and commerce. B2B portals, product configurators and corporate sites that generate quote requests.",
   bg="Падуа е сърцето на МСП във Венето — машиностроене, термохидравлика, панаири и търговия. B2B портали, продуктови конфигуратори и фирмени сайтове, които генерират запитвания."),
  local=dict(
   it="Configuratori di prodotto su misura: il cliente compone l'articolo, il sistema calcola prezzo e distinta base, l'ordine arriva già pronto nel gestionale.",
   en="Custom product configurators: the customer builds the item, the system calculates price and BOM, and the order lands ready-made in your ERP.",
   bg="Продуктови конфигуратори по поръчка: клиентът сглобява артикула, системата изчислява цена и спецификация, а поръчката пристига готова в ERP.")),
]

# ── Per-language strings ─────────────────────────────────────────
L = {
 "it": dict(
  prefix="", urlbase="/geo/", og="og/og-geo.png", locale="it_IT",
  nav=[("/", "HOME"), ("/chi-siamo/", "CHI SIAMO"), ("/servizi/sviluppo-siti-web/", "SERVIZI"), ("/portfolio/", "PORTFOLIO"), ("/contatti/", "CONTATTI")],
  home="/", contact="/contatti/", hub_name="Dove Lavoriamo",
  h1="Siti Web {name}",
  title="Siti Web {name} — Sviluppo Siti, E-commerce e SEO | Carbon Stealth",
  desc="Sviluppo siti web, e-commerce e software per aziende di {name}. Da €800, preventivo gratuito in 24 ore. Parliamo italiano.",
  tag="// GEO — {NAME}", cta="RICHIEDI PREVENTIVO GRATUITO",
  h2_services="Servizi per le aziende di {name}",
  h2_local="Perché sceglierci a {name}",
  h2_faq="Domande frequenti",
  h2_nearby="Serviamo anche",
  intro2="Realizziamo siti web a {name} che caricano in meno di 2 secondi, ottimizzati per Google e per i motori AI (ChatGPT, Perplexity, Gemini). Ogni progetto è su misura: niente template preconfezionati, codice pulito, prestazioni reali e design che converte i visitatori in clienti.",
  h2_process="Come lavoriamo con le aziende di {name}",
  process=["Analisi e preventivo gratuito entro 24 ore — definiamo obiettivi, target e budget.","Design e prototipo interattivo che approvi prima di scrivere codice.","Sviluppo con React, Next.js o WordPress, con test su dispositivi reali.","Lancio, SEO on-page completo e 3 mesi di supporto gratuito."],
  h2_tech="Tecnologie e risultati",
  tech="Costruiamo con React, Next.js, Node.js e PostgreSQL, hosting su infrastruttura europea (Hetzner) con SSL, CDN e uptime 99,9%. Punteggio Google PageSpeed 90+ e dati strutturati Schema.org per la massima visibilità su Google.",
  services=[("/servizi/sviluppo-siti-web/", "Sviluppo Siti Web", "da €800"), ("/servizi/ecommerce/", "E-Commerce", "da €1.200"), ("/servizi/sviluppo-software/", "Software su Misura", "da €2.000"), ("/servizi/erp/", "Sistemi ERP", "da €5.000"), ("/servizi/app-mobile/", "App Mobile", "da €3.000"), ("/servizi/seo/", "SEO / GEO / AEO", "da €500/mese"), ("/servizi/hosting/", "Hosting Cloud", "da €29/mese")],
  bullets=["Team full-stack con oltre 50 progetti consegnati", "Prezzi competitivi senza compromessi sulla qualità", "Supporto in italiano, inglese e bulgaro", "Consegna puntuale con 3 mesi di supporto gratuito"],
  svc_name="Siti Web {name}",
  faq_cost=("Quanto costa un sito web a {name}?", "Un sito vetrina professionale parte da €800, un e-commerce da €1.200, software su misura da €2.000. Preventivo gratuito e dettagliato entro 24 ore."),
  faq_onsite_IT=("Lavorate anche in presenza a {name}?", "Lavoriamo da remoto in tutta Italia con call in italiano in orario italiano (+39 379 296 9699); incontri in presenza organizzabili per progetti su misura."),
  faq_onsite_BG=("Lavorate anche in presenza a {name}?", "Sì: la nostra sede è a Bobov Dol, Bulgaria, e organizziamo incontri in presenza in tutto il paese. Supporto remoto quotidiano via call e chat."),
  faq_invoice=("Come funziona la fatturazione?", "Emettiamo regolare fattura UE con partita IVA bulgara (BG208725180): per le aziende italiane si applica il reverse charge. Pagamenti via bonifico, carta o Stripe."),
  faq_timeline=("Quanto tempo serve per un sito web a {name}?", "Un sito vetrina richiede 1-2 settimane, un e-commerce 3-6 settimane, software ed ERP 2-6 mesi. Concordiamo una timeline precisa nel preventivo gratuito."),
  faq_lang=("In che lingua lavorate con i clienti di {name}?", "Italiano, inglese e bulgaro. Tutta la comunicazione, la documentazione e l'assistenza sono nella lingua che preferisci."),
  ft_links=[("/privacy/", "Privacy"), ("/cookie/", "Cookie"), ("/termini/", "Termini")],
  hub_title="Dove Lavoriamo — Sviluppo Web in Italia e Bulgaria | Carbon Stealth",
  hub_desc="Sviluppo web, e-commerce e software in tutta Italia e Bulgaria: Milano, Roma, Torino, Napoli, Sofia, Plovdiv, Varna e altre città. Preventivo in 24 ore.",
  hub_h1="Dove Lavoriamo", hub_it="Italia", hub_bg="Bulgaria",
  hub_intro="Lavoriamo da remoto in tutta Europa, con focus su Italia e Bulgaria. Scegli la tua città per scoprire i servizi dedicati alle aziende locali.",
 ),
 "en": dict(
  prefix="/en", urlbase="/en/geo/", og="og/og-geo.png", locale="en_US",
  nav=[("/en/", "HOME"), ("/en/about/", "ABOUT"), ("/en/services/web-development/", "SERVICES"), ("/en/portfolio/", "PORTFOLIO"), ("/en/contact/", "CONTACT")],
  home="/en/", contact="/en/contact/", hub_name="Where We Work",
  h1="Web Development {name}",
  title="Web Development {name} — Websites, E-commerce, SEO | Carbon Stealth",
  desc="Websites, e-commerce and custom software for {name} businesses. From €800, free quote within 24 hours.",
  tag="// GEO — {NAME}", cta="REQUEST A FREE QUOTE",
  h2_services="Services for {name} businesses",
  h2_local="Why choose us in {name}",
  h2_faq="Frequently asked questions",
  h2_nearby="We also serve",
  intro2="We build websites in {name} that load in under 2 seconds, optimized for Google and AI search engines (ChatGPT, Perplexity, Gemini). Every project is bespoke: no off-the-shelf templates, clean code, real performance and design that turns visitors into customers.",
  h2_process="How we work with {name} businesses",
  process=["Free analysis and quote within 24 hours — we define goals, audience and budget.","Design and an interactive prototype you approve before any code is written.","Development in React, Next.js or WordPress, tested on real devices.","Launch, full on-page SEO and 3 months of free support."],
  h2_tech="Technology and results",
  tech="We build with React, Next.js, Node.js and PostgreSQL, hosted on European infrastructure (Hetzner) with SSL, CDN and 99.9% uptime. Google PageSpeed 90+ and Schema.org structured data for maximum visibility on Google.",
  services=[("/en/services/web-development/", "Web Development", "from €800"), ("/en/services/ecommerce/", "E-Commerce", "from €1,200"), ("/en/services/software-development/", "Custom Software", "from €2,000"), ("/en/services/erp/", "ERP Systems", "from €5,000"), ("/en/services/mobile-apps/", "Mobile Apps", "from €3,000"), ("/en/services/seo/", "SEO / GEO / AEO", "from €500/mo"), ("/en/services/hosting/", "Cloud Hosting", "from €29/mo")],
  bullets=["Full-stack team with 50+ delivered projects", "Competitive pricing without quality compromise", "Support in Italian, English and Bulgarian", "On-time delivery with 3 months of free support"],
  svc_name="Web Development {name}",
  faq_cost=("How much does a website cost in {name}?", "A professional company website starts at €800, e-commerce at €1,200, custom software at €2,000. Free detailed quote within 24 hours."),
  faq_onsite_IT=("Do you work on-site in {name}?", "We work remotely across Italy with calls in Italian during Italian business hours (+39 379 296 9699); on-site meetings can be arranged for larger projects."),
  faq_onsite_BG=("Do you work on-site in {name}?", "Yes — we are headquartered in Bobov Dol, Bulgaria, and arrange on-site meetings across the country. Day-to-day support is remote via calls and chat."),
  faq_invoice=("How does invoicing work?", "We issue standard EU invoices with our Bulgarian VAT number (BG208725180) — reverse charge applies for EU businesses. Payment by bank transfer, card or Stripe."),
  faq_timeline=("How long does a website in {name} take?", "A company website takes 1-2 weeks, e-commerce 3-6 weeks, software and ERP 2-6 months. We agree a precise timeline in the free quote."),
  faq_lang=("What language do you work in with {name} clients?", "Italian, English and Bulgarian. All communication, documentation and support is in the language you prefer."),
  ft_links=[("/en/privacy/", "Privacy"), ("/en/cookie/", "Cookie"), ("/en/terms/", "Terms")],
  hub_title="Where We Work — Web Development in Italy and Bulgaria | Carbon Stealth",
  hub_desc="Web development, e-commerce and software across Italy and Bulgaria: Milan, Rome, Turin, Naples, Sofia, Plovdiv, Varna and more. Quote within 24 hours.",
  hub_h1="Where We Work", hub_it="Italy", hub_bg="Bulgaria",
  hub_intro="We work remotely across Europe, with a focus on Italy and Bulgaria. Pick your city to see services dedicated to local businesses.",
 ),
 "bg": dict(
  prefix="/bg", urlbase="/bg/geo/", og="og/og-geo.png", locale="bg_BG",
  nav=[("/bg/", "ГЛАВНА"), ("/bg/za-nas/", "ЗА НАС"), ("/bg/uslugi/web-razrabotka/", "УСЛУГИ"), ("/bg/portfolio/", "ПОРТФОЛИО"), ("/bg/kontakti/", "КОНТАКТИ")],
  home="/bg/", contact="/bg/kontakti/", hub_name="Къде Работим",
  h1="Изработка на Сайт {name}",
  title="Изработка на Сайт {name} — Уеб Дизайн, Онлайн Магазини, SEO | Carbon Stealth",
  desc="Изработка на сайтове, онлайн магазини и софтуер за фирми в {name}. От €800, безплатна оферта до 24 часа.",
  tag="// GEO — {NAME}", cta="ЗАЯВИ БЕЗПЛАТНА ОФЕРТА",
  h2_services="Услуги за бизнеса в {name}",
  h2_local="Защо да изберете нас в {name}",
  h2_faq="Често задавани въпроси",
  h2_nearby="Работим също в",
  intro2="Изработваме сайтове в {name}, които зареждат под 2 секунди и са оптимизирани за Google и за AI търсачки (ChatGPT, Perplexity, Gemini). Всеки проект е по поръчка: без готови шаблони, чист код, реална производителност и дизайн, който превръща посетителите в клиенти.",
  h2_process="Как работим с бизнеса в {name}",
  process=["Безплатен анализ и оферта до 24 часа — дефинираме цели, аудитория и бюджет.","Дизайн и интерактивен прототип, който одобрявате преди да напишем код.","Разработка с React, Next.js или WordPress, тествана на реални устройства.","Пускане, пълно on-page SEO и 3 месеца безплатна поддръжка."],
  h2_tech="Технологии и резултати",
  tech="Изграждаме с React, Next.js, Node.js и PostgreSQL, хостинг на европейска инфраструктура (Hetzner) със SSL, CDN и 99.9% uptime. Google PageSpeed 90+ и Schema.org структурирани данни за максимална видимост в Google.",
  services=[("/bg/uslugi/web-razrabotka/", "Уеб Разработка", "от €800"), ("/bg/uslugi/ecommerce/", "Онлайн Магазини", "от €1200"), ("/bg/uslugi/softuer/", "Софтуер по Поръчка", "от €2000"), ("/bg/uslugi/erp/", "ERP Системи", "от €5000"), ("/bg/uslugi/mobilni-prilozheniya/", "Мобилни Приложения", "от €3000"), ("/bg/uslugi/seo/", "SEO / GEO / AEO", "от €500/мес"), ("/bg/uslugi/hosting/", "Облачен Хостинг", "от €29/мес")],
  bullets=["Full-stack екип с над 50 завършени проекта", "Конкурентни цени без компромис с качеството", "Поддръжка на италиански, английски и български", "Навременна доставка с 3 месеца безплатна поддръжка"],
  svc_name="Изработка на Сайт {name}",
  faq_cost=("Колко струва изработката на сайт в {name}?", "Професионален фирмен сайт започва от €800, онлайн магазин от €1200, софтуер по поръчка от €2000. Безплатна подробна оферта до 24 часа."),
  faq_onsite_IT=("Работите ли на място в {name}?", "Работим дистанционно в цяла Италия с разговори на италиански (+39 379 296 9699); срещи на място се организират за по-големи проекти."),
  faq_onsite_BG=("Работите ли на място в {name}?", "Да — седалището ни е в Бобов дол и организираме срещи на място в цялата страна. Ежедневната поддръжка е дистанционна по телефон и чат."),
  faq_invoice=("Как се издава фактура?", "Издаваме редовна фактура с български ДДС номер (BG208725180). Плащане по банков път, с карта или Stripe."),
  faq_timeline=("За колко време се изработва сайт в {name}?", "Фирмен сайт отнема 1-2 седмици, онлайн магазин 3-6 седмици, софтуер и ERP 2-6 месеца. Договаряме точен срок в безплатната оферта."),
  faq_lang=("На какъв език работите с клиенти от {name}?", "Италиански, английски и български. Цялата комуникация, документация и поддръжка са на езика, който предпочитате."),
  ft_links=[("/bg/privacy/", "Поверителност"), ("/bg/cookie/", "Бисквитки"), ("/bg/usloviya/", "Условия")],
  hub_title="Изработка на Сайт — Уеб Агенция за България и Италия | Carbon Stealth",
  hub_desc="Изработка на сайтове, онлайн магазини и софтуер в цяла България и Италия: София, Пловдив, Варна, Бургас, Милано, Рим и още. Оферта до 24 часа.",
  hub_h1="Къде Работим", hub_it="Италия", hub_bg="България",
  hub_intro="Работим дистанционно в цяла Европа, с фокус върху България и Италия. Изберете вашия град, за да видите услугите за местния бизнес.",
 ),
}

STYLE = "*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#ccc;font-family:'Space Mono',monospace;font-size:13px;line-height:2;padding:0}a{color:#00e5ff;text-decoration:none}.w{max-width:900px;margin:0 auto;padding:40px 20px}h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:2.5rem;color:#f5f5f0;margin-bottom:16px;letter-spacing:-.03em;line-height:1.1}h2{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1.2rem;color:#00e5ff;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em}h3{color:#f5f5f0;font-size:1rem;margin:20px 0 8px}p,li{margin-bottom:10px;line-height:1.9}ul{padding-left:20px}.nav{position:fixed;top:0;width:100%;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,229,255,.1);padding:12px 20px;z-index:1000;display:flex;justify-content:space-between;align-items:center}.nav a{color:#ccc;font-size:10px;letter-spacing:.2em;margin:0 10px}.nav img{height:24px}.hero-s{padding:120px 20px 60px;border-bottom:1px solid rgba(0,229,255,.1)}.tag{font-size:9px;color:#00e5ff;letter-spacing:.4em;margin-bottom:12px}.cta{display:inline-block;padding:14px 32px;border:1px solid #00e5ff;color:#00e5ff;font-size:11px;letter-spacing:.25em;margin-top:24px}.ft{border-top:1px solid rgba(245,245,240,.06);padding:30px 20px;text-align:center;font-size:9px;color:#666;margin-top:60px}.price{display:inline-block;padding:2px 10px;border:1px solid rgba(0,229,255,.2);color:#00e5ff;font-size:11px;margin-left:8px}.faq-item{border-bottom:1px solid rgba(245,245,240,.06);padding:16px 0}.faq-q{font-family:'Inter Tight',sans-serif;font-weight:700;font-size:1rem;color:#f5f5f0;margin-bottom:6px}.faq-a{font-size:12px;color:#ccc}.cities{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.cities a{padding:6px 14px;border:1px solid rgba(0,229,255,.2);font-size:11px}"

import json

def jld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "</script>"

def head_common(lang, title, desc, canon, slugpath, og, locale, region, placename):
    alts = "".join(
        f'<link rel="alternate" hreflang="{l}" href="{BASE}{(L[l]["prefix"])}{slugpath}"/>'
        for l in ("it", "en", "bg")
    ) + f'<link rel="alternate" hreflang="x-default" href="{BASE}{slugpath}"/>'
    return f"""<!DOCTYPE html><html lang="{lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc, quote=True)}">
<link rel="canonical" href="{canon}">
{alts}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Carbon Stealth VCC">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(desc, quote=True)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{BASE}/{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title, quote=True)}">
<meta name="twitter:description" content="{html.escape(desc, quote=True)}">
<meta name="twitter:image" content="{BASE}/{og}">
<meta name="geo.region" content="{region}">
<meta name="geo.placename" content="{html.escape(placename, quote=True)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#00e5ff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>{STYLE}</style>
"""

def nav_html(lang):
    s = L[lang]
    links = "".join(f'<a href="{u}">{t}</a>' for u, t in s["nav"])
    return f'<nav class="nav"><a href="{s["home"]}"><img src="/logo.png" alt="Carbon Stealth VCC"></a><div>{links}</div></nav>'

def footer_html(lang):
    s = L[lang]
    links = " &middot; ".join(f'<a href="{u}">{t}</a>' for u, t in s["ft_links"])
    return f'<div class="ft"><p>&copy; 2025-2026 Carbon Stealth VCC &middot; EIK BG208725180 &middot; Bobov Dol, Bulgaria</p><p>{links}</p></div>'

def city_page(city, lang):
    s = L[lang]
    name = city["name"][lang]
    slugpath = f"/geo/{city['slug']}/"
    canon = BASE + s["prefix"] + slugpath
    title = s["title"].format(name=name)
    desc = s["desc"].format(name=name)
    phone = "+39-379-296-9699" if city["country"] == "IT" else "+359-877-414-874"
    onsite = s["faq_onsite_IT"] if city["country"] == "IT" else s["faq_onsite_BG"]
    faqs = [
        (s["faq_cost"][0].format(name=name), s["faq_cost"][1]),
        (s["faq_timeline"][0].format(name=name), s["faq_timeline"][1]),
        (onsite[0].format(name=name), onsite[1]),
        (s["faq_lang"][0].format(name=name), s["faq_lang"][1]),
        (s["faq_invoice"][0], s["faq_invoice"][1]),
    ]
    # NOTE: no per-city LocalBusiness node — the company has one physical HQ
    # (Bobov Dol). Claiming a LocalBusiness "in Milano" with no street address
    # is a doorway/NAP-inconsistency pattern Google penalizes. We model the
    # city pages honestly as a Service with areaServed = the city.
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "Service", "@id": f"{canon}#service", "name": s["svc_name"].format(name=name),
         "serviceType": "Web development, e-commerce, custom software, SEO",
         "provider": {"@id": f"{BASE}/#organization"},
         "areaServed": {"@type": "City", "name": city["name"]["en"]},
         "url": canon, "image": f"{BASE}/{s['og']}",
         "availableChannel": {"@type": "ServiceChannel", "serviceUrl": BASE + s["contact"]}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "/")},
            {"@type": "ListItem", "position": 2, "name": s["hub_name"], "item": BASE + s["prefix"] + "/geo/"},
            {"@type": "ListItem", "position": 3, "name": name, "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]},
    ]}
    services = "".join(f'<li><a href="{u}">{t}</a><span class="price">{p}</span></li>' for u, t, p in s["services"])
    bullets = "".join(f"<li>{b}</li>" for b in s["bullets"])
    process = "".join(f'<li><strong>{i+1}.</strong> {html.escape(step)}</li>' for i, step in enumerate(s["process"]))
    faq_html = "".join(f'<div class="faq-item"><div class="faq-q">{html.escape(q)}</div><div class="faq-a">{html.escape(a)}</div></div>' for q, a in faqs)
    same = [c for c in CITIES if c["country"] == city["country"] and c["slug"] != city["slug"]]
    other = [c for c in CITIES if c["country"] != city["country"]][:4]
    nearby = "".join(f'<a href="{s["prefix"]}/geo/{c["slug"]}/">{c["name"][lang]}</a>' for c in same + other)
    hub_link = f'<a href="{s["prefix"]}/geo/">{s["hub_name"]} →</a>'
    return (head_common(lang, title, desc, canon, slugpath, s["og"], s["locale"], city["region"], city["name"]["en"])
        + jld(graph) + "\n</head><body>\n" + nav_html(lang)
        + f'<div class="hero-s"><div class="w"><div class="tag">{s["tag"].format(NAME=name.upper())}</div><h1>{s["h1"].format(name=name)}</h1><p>{city["hook"][lang]}</p><a href="{s["contact"]}" class="cta">{s["cta"]}</a></div></div>'
        + f'<div class="w"><p style="font-size:14px;color:#ddd;line-height:1.9">{s["intro2"].format(name=name)}</p>'
        + f'<h2>{s["h2_services"].format(name=name)}</h2><ul>{services}</ul>'
        + f'<h2>{s["h2_local"].format(name=name)}</h2><p>{city["local"][lang]}</p><ul>{bullets}</ul>'
        + f'<h2>{s["h2_process"].format(name=name)}</h2><ul class="proc">{process}</ul>'
        + f'<h2>{s["h2_tech"]}</h2><p>{s["tech"]}</p>'
        + f'<h2>{s["h2_faq"]}</h2>{faq_html}'
        + f'<h2>{s["h2_nearby"]}</h2><div class="cities">{nearby}</div><p>{hub_link}</p>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a></div>'
        + footer_html(lang) + "</body></html>\n")

def hub_page(lang):
    s = L[lang]
    slugpath = "/geo/"
    canon = BASE + s["prefix"] + slugpath
    it_cities = [c for c in CITIES if c["country"] == "IT"]
    bg_cities = [c for c in CITIES if c["country"] == "BG"]
    def city_links(cs):
        return "".join(f'<a href="{s["prefix"]}/geo/{c["slug"]}/">{c["name"][lang]}</a>' for c in cs)
    graph = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": f"{canon}#page", "url": canon, "name": s["hub_h1"],
         "description": s["hub_desc"], "inLanguage": lang, "isPartOf": {"@id": f"{BASE}/#website"}},
        {"@type": "ItemList", "name": s["hub_h1"], "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": c["name"][lang], "url": f"{BASE}{s['prefix']}/geo/{c['slug']}/"}
            for i, c in enumerate(CITIES)]},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE + (s["prefix"] or "/")},
            {"@type": "ListItem", "position": 2, "name": s["hub_name"], "item": canon}]},
    ]}
    return (head_common(lang, s["hub_title"], s["hub_desc"], canon, slugpath, s["og"], s["locale"],
                        "BG-10", "Bobov Dol")
        + jld(graph) + "\n</head><body>\n" + nav_html(lang)
        + f'<div class="hero-s"><div class="w"><div class="tag">// GEO</div><h1>{s["hub_h1"]}</h1><p>{s["hub_intro"]}</p></div></div>'
        + f'<div class="w"><h2>{s["hub_bg"]}</h2><div class="cities">{city_links(bg_cities)}</div>'
        + f'<h2>{s["hub_it"]}</h2><div class="cities">{city_links(it_cities)}</div>'
        + f'<a href="{s["contact"]}" class="cta">{s["cta"]}</a></div>'
        + footer_html(lang) + "</body></html>\n")

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    n = 0
    for lang in ("it", "en", "bg"):
        prefix = L[lang]["prefix"].lstrip("/")
        root = os.path.join("public", prefix) if prefix else "public"
        write(os.path.join(root, "geo", "index.html"), hub_page(lang))
        n += 1
        for city in CITIES:
            write(os.path.join(root, "geo", city["slug"], "index.html"), city_page(city, lang))
            n += 1
    # sitemap-geo.xml
    urls = []
    for lang in ("it", "en", "bg"):
        urls.append(f"{BASE}{L[lang]['prefix']}/geo/")
    for city in CITIES:
        for lang in ("it", "en", "bg"):
            urls.append(f"{BASE}{L[lang]['prefix']}/geo/{city['slug']}/")
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>")
    sm.append("</urlset>")
    write(os.path.join("public", "sitemap-geo.xml"), "\n".join(sm) + "\n")
    print(f"wrote {n} geo pages + sitemap-geo.xml ({len(urls)} urls)")

if __name__ == "__main__":
    main()
