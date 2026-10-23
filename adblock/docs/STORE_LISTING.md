# Chrome Web Store listing

## Name
Supreme AdBlock

## Summary (132 chars max)
Blocks ads everywhere: YouTube video ads, banners, pop-ups, trackers, cookie prompts and anti-adblock walls.

## Category
Privacy & Security

## Detailed description

Supreme AdBlock is an ad blocker for Chrome: it removes ads and trackers from the pages you visit, without watching what you do. It works as soon as it is installed, with no account and nothing to set up.

WHAT IT BLOCKS
- YouTube ad blocker: video ads (pre-roll & mid-roll) are taken out of the player's data before they load, plus feed and search ads
- Banners, pop-ups, pop-unders and sponsored-content widgets, and sponsored posts on Facebook, Instagram and Threads
- Trackers, third-party tracking cookies, crypto-miners and tracking parameters in links (utm_*, fbclid, gclid, ...)
- Cookie and consent banners: it presses Reject when the banner offers it, clears the leftover blur and scroll lock, and never presses a sign-in, OAuth or payment button
- Anti-adblock walls that try to break a page, with the uBlock Origin scriptlet syntax (39 routines, fixed in the package)
- Ad slots no filter list knows yet, found by their shape (Smart Detection)

FILTER LISTS THAT KEEP UP
- EasyList, EasyPrivacy and the uBlock Origin filters built in, plus 31 regional lists; the one for your browser's language turns on by itself
- Signed, data-only filter updates about twice a day, so a new ad network can be handled within hours
- Malware protection (URLhaus), on by default: a known malware site opens a warning page instead, and what pages load from such sites is blocked; plus subscriptions to any filter list by URL

YOU STAY IN CONTROL
- From the popup, allow a site you want to support, or turn off element hiding on one site if its layout breaks; undo what you hid with one click
- Site broken? A repair page fixes it in one click (or allows ads there for just an hour), or prepares a report you read and send yourself
- Switching from uBlock Origin, AdGuard or Adblock Plus? Import your allowed sites and your own filters from its backup file
- Keyboard shortcuts for blocking on this site, pause and the element picker
- “Connections on this page” in the popup: the other sites a page loaded something from, each one blockable on that site with one click
- Element picker and your own filters, including procedural selectors
- Focus mode: hide chat bubbles, newsletter pop-ups, notification prompts, AI pop-ups and YouTube Shorts
- "Blocked on this page" shows how much each filter list stopped, with live counters for data and time saved and a chart of the last 30 days
- Dark and light themes; the interface is available in 70 languages

PRIVACY
Your browsing data never leaves your device: no account, no analytics, no telemetry. The browser's own ad-targeting features (Topics, interest groups, attribution reporting) are switched off on every page, and Global Privacy Control asks every site not to sell or share your data. We take no money from advertisers and let no ad through for a fee.

HOW IT WORKS
Built on Manifest V3, Chrome's current extension platform. Requests are blocked with declarativeNetRequest, so the browser does the filtering without the extension seeing your traffic. All code ships inside the package and none of it is minified; what arrives over the network is data only (hostnames and CSS selectors), never code. The code is MIT licensed; the bundled filter lists keep their own licences.

## Detailed description, localised (Edge requires one per packaged locale, ≥250 chars)

The long versions for bg / it / de are below. For every other language packaged in
`_locales`, use `docs/listing/<locale>.txt` (the short store description, translated).

**bg**

Supreme AdBlock е блокер на реклами за Chrome: маха рекламите и тракерите от страниците, които отваряте, без да следи какво правите. Работи веднага след инсталиране, без акаунт и без настройване.

КАКВО БЛОКИРА
- Рекламите в YouTube: видеорекламите (pre-roll и mid-roll) се махат от данните на плейъра, преди да заредят, както и рекламите във feed-а и търсенето
- Банери, изскачащи прозорци, pop-under-и и джаджи със спонсорирано съдържание, както и спонсорираните публикации във Facebook, Instagram и Threads
- Тракери, проследяващи бисквитки на трети страни, крипто-копачи и проследяващи параметри в линковете (utm_*, fbclid, gclid, …)
- Банери за бисквитки: натиска „Отхвърли“, когато го има, маха останалия блър и заключения скрол и никога не натиска бутон за вход, OAuth или плащане
- Анти-адблок стени, които се опитват да счупят страницата — със синтаксиса на скриптлетите на uBlock Origin (39 рутини, фиксирани в пакета)
- Рекламни полета, които никой лист още не познава — хваща ги по формата им (Smart Detection)

ФИЛТЪР-ЛИСТИ, КОИТО НЕ ОСТАРЯВАТ
- Вградени EasyList, EasyPrivacy и филтрите на uBlock Origin, плюс 31 регионални листа — този за езика на браузъра се включва сам
- Подписани ъпдейти на филтрите, само с данни, около два пъти на ден — нова рекламна мрежа може да се добави за часове
- Защита от зловредни домейни (URLhaus), включена по подразбиране: известен зловреден сайт отваря страница-предупреждение вместо себе си, а това, което страниците зареждат от такива сайтове, се блокира; плюс абонамент за всеки филтър-лист по URL

ВИЕ РЕШАВАТЕ
- От popup-а разрешавате сайт, който искате да подкрепите, или спирате скриването на елементи само на един сайт, ако оформлението се счупи; връщате скритото с едно кликване
- Сайтът е счупен? Страница за поправка го оправя с едно кликване (или разрешава рекламите там само за час) или подготвя доклад, който четете и изпращате сами
- Минавате от uBlock Origin, AdGuard или Adblock Plus? Внесете разрешените сайтове и собствените си филтри от резервното му копие
- Клавишни комбинации за блокирането на този сайт, паузата и избора на елемент
- „Връзки на страницата“ в popup-а: другите сайтове, от които страницата е заредила нещо, всеки блокируем на този сайт с едно кликване
- Избор на елемент и собствени филтри, включително процедурни селектори
- Режим „Фокус“: скрива чат балончета, прозорци за бюлетини, покани за известия, AI прозорци и YouTube Shorts
- „Блокирано на тази страница“ показва колко е спрял всеки филтър-лист, с броячи на спестените данни и време и графика за последните 30 дни
- Тъмна и светла тема, интерфейс на 70 езика

ПОВЕРИТЕЛНОСТ
Данните ви от сърфирането не напускат устройството ви: без акаунт, без аналитика, без телеметрия. Рекламните функции на самия браузър (Topics, interest groups, attribution reporting) се изключват на всяка страница, а Global Privacy Control моли всеки сайт да не продава и да не споделя данните ви. Не вземаме пари от рекламодатели и не пропускаме реклами срещу заплащане.

КАК РАБОТИ
Създаден върху Manifest V3, текущата платформа за разширения на Chrome. Заявките се блокират с declarativeNetRequest, така че филтрира самият браузър, без разширението да вижда трафика ви. Целият код е в пакета и нищо не е минифицирано; от мрежата идват само данни (хостове и CSS селектори), никога код. Кодът е с лиценз MIT; вградените филтър-листи запазват своите лицензи.

**it**

Supreme AdBlock è un ad blocker per Chrome: toglie annunci e tracker dalle pagine che visiti, senza osservare cosa fai. Funziona appena installato, senza account e senza nulla da configurare.

COSA BLOCCA
- Gli annunci di YouTube: gli annunci video (pre-roll e mid-roll) vengono tolti dai dati del player prima che si carichino, oltre agli annunci nel feed e nella ricerca
- Banner, pop-up, pop-under e widget di contenuti sponsorizzati, e i post sponsorizzati su Facebook, Instagram e Threads
- Tracker, cookie di tracciamento di terze parti, cryptominer e parametri di tracciamento nei link (utm_*, fbclid, gclid, …)
- Banner dei cookie: preme «Rifiuta» quando c'è, toglie la sfocatura e il blocco dello scorrimento rimasti e non preme mai un pulsante di accesso, OAuth o pagamento
- I muri anti-adblock che provano a rompere una pagina, con la sintassi degli scriptlet di uBlock Origin (39 routine, fisse nel pacchetto)
- Gli spazi pubblicitari che nessuna lista conosce ancora, riconosciuti dalla loro forma (Smart Detection)

LISTE DI FILTRI SEMPRE AGGIORNATE
- EasyList, EasyPrivacy e i filtri di uBlock Origin integrati, più 31 liste regionali: quella per la lingua del browser si attiva da sola
- Aggiornamenti dei filtri firmati, composti solo da dati, circa due volte al giorno: una nuova rete pubblicitaria può essere aggiunta in poche ore
- Protezione dai domini malevoli (URLhaus), attiva di serie: un sito noto per il malware apre al suo posto una pagina di avviso, e ciò che le pagine caricano da questi siti viene bloccato; più l'iscrizione a qualsiasi lista di filtri tramite URL

DECIDI TU
- Dal popup consenti un sito che vuoi sostenere, oppure disattivi l'occultamento degli elementi su un solo sito se il layout si rompe; annulli ciò che hai nascosto con un clic
- Sito rotto? Una pagina di riparazione lo sistema con un clic (o consente gli annunci lì solo per un'ora), oppure prepara una segnalazione che leggi e invii tu
- Arrivi da uBlock Origin, AdGuard o Adblock Plus? Importa i siti consentiti e i tuoi filtri dal suo file di backup
- Scorciatoie da tastiera per il blocco su questo sito, la pausa e il selettore di elementi
- «Connessioni di questa pagina» nel popup: gli altri siti da cui la pagina ha caricato qualcosa, ognuno bloccabile su quel sito con un clic
- Selettore di elementi e filtri personali, anche con selettori procedurali
- Modalità Focus: nasconde bolle di chat, pop-up delle newsletter, richieste di notifiche, pop-up IA e YouTube Shorts
- «Bloccato in questa pagina» mostra quanto ha fermato ogni lista di filtri, con i contatori di dati e tempo risparmiati e un grafico degli ultimi 30 giorni
- Tema scuro e chiaro, interfaccia in 70 lingue

PRIVACY
I tuoi dati di navigazione non lasciano mai il dispositivo: nessun account, nessuna analitica, nessuna telemetria. Le funzioni pubblicitarie del browser stesso (Topics, interest groups, attribution reporting) vengono disattivate su ogni pagina, e Global Privacy Control chiede a ogni sito di non vendere né condividere i tuoi dati. Non prendiamo denaro dagli inserzionisti e nessun annuncio passa a pagamento.

COME FUNZIONA
Costruito su Manifest V3, l'attuale piattaforma delle estensioni di Chrome. Le richieste sono bloccate con declarativeNetRequest: filtra il browser stesso, senza che l'estensione veda il tuo traffico. Tutto il codice è nel pacchetto e nulla è minificato; dalla rete arrivano solo dati (nomi host e selettori CSS), mai codice. Il codice ha licenza MIT; le liste di filtri incluse mantengono le proprie licenze.

**de**

Supreme AdBlock ist ein Werbeblocker für Chrome: Er entfernt Werbung und Tracker von den Seiten, die Sie besuchen, ohne zu beobachten, was Sie tun. Er arbeitet direkt nach der Installation, ohne Konto und ohne Einrichtung.

WAS ER BLOCKIERT
- YouTube-Werbung: Videoanzeigen (Pre-Roll und Mid-Roll) werden aus den Daten des Players entfernt, bevor sie laden, dazu Anzeigen im Feed und in der Suche
- Banner, Pop-ups, Pop-under und Widgets mit gesponserten Inhalten sowie gesponserte Beiträge auf Facebook, Instagram und Threads
- Tracker, Tracking-Cookies von Drittanbietern, Krypto-Miner und Tracking-Parameter in Links (utm_*, fbclid, gclid, …)
- Cookie-Banner: drückt „Ablehnen“, wenn angeboten, entfernt zurückgebliebene Unschärfe und Scroll-Sperren und drückt nie eine Anmelde-, OAuth- oder Zahlungsschaltfläche
- Anti-Adblock-Sperren, die eine Seite unbrauchbar machen wollen – mit der Scriptlet-Syntax von uBlock Origin (39 Routinen, fest im Paket)
- Werbeflächen, die noch keine Liste kennt, erkannt an ihrer Form (Smart Detection)

FILTERLISTEN, DIE AKTUELL BLEIBEN
- EasyList, EasyPrivacy und die uBlock-Origin-Filter integriert, dazu 31 regionale Listen – die für die Sprache Ihres Browsers schaltet sich selbst ein
- Signierte Filter-Updates, die nur Daten enthalten, etwa zweimal täglich: Ein neues Werbenetzwerk kann in Stunden ergänzt werden
- Schutz vor Malware-Domains (URLhaus), standardmäßig an: Eine bekannte Malware-Website öffnet stattdessen eine Warnseite, und was Seiten von solchen Websites laden, wird blockiert; dazu das Abonnement beliebiger Filterlisten per URL

SIE BEHALTEN DIE KONTROLLE
- Im Popup erlauben Sie eine Seite, die Sie unterstützen möchten, oder schalten das Ausblenden von Elementen auf einer einzelnen Seite ab, falls das Layout bricht; Ausgeblendetes holen Sie mit einem Klick zurück
- Seite kaputt? Eine Reparaturseite behebt es mit einem Klick (oder erlaubt Werbung dort nur für eine Stunde) oder bereitet eine Meldung vor, die Sie lesen und selbst senden
- Sie wechseln von uBlock Origin, AdGuard oder Adblock Plus? Übernehmen Sie erlaubte Websites und eigene Filter aus dessen Sicherungsdatei
- Tastenkombinationen für die Blockierung auf dieser Website, die Pause und den Element-Picker
- „Verbindungen dieser Seite“ im Popup: die anderen Websites, von denen die Seite etwas geladen hat, jede mit einem Klick auf dieser Website blockierbar
- Element-Picker und eigene Filter, auch mit prozeduralen Selektoren
- Fokusmodus: blendet Chat-Blasen, Newsletter-Pop-ups, Benachrichtigungs-Aufforderungen, KI-Pop-ups und YouTube Shorts aus
- „Auf dieser Seite blockiert“ zeigt, wie viel jede Filterliste gestoppt hat, mit Zählern für gesparte Daten und Zeit und einer Grafik der letzten 30 Tage
- Dunkles und helles Design, Oberfläche in 70 Sprachen

DATENSCHUTZ
Ihre Browsing-Daten verlassen nie Ihr Gerät: kein Konto, keine Analyse, keine Telemetrie. Die Werbefunktionen des Browsers selbst (Topics, Interest Groups, Attribution Reporting) werden auf jeder Seite abgeschaltet, und Global Privacy Control bittet jede Website, Ihre Daten nicht zu verkaufen oder weiterzugeben. Wir nehmen kein Geld von Werbetreibenden und lassen keine Werbung gegen Bezahlung durch.

SO FUNKTIONIERT ES
Gebaut auf Manifest V3, der aktuellen Erweiterungsplattform von Chrome. Anfragen werden mit declarativeNetRequest blockiert: Der Browser filtert selbst, ohne dass die Erweiterung Ihren Datenverkehr sieht. Der gesamte Code steckt im Paket, nichts ist minifiziert; aus dem Netz kommen nur Daten (Hostnamen und CSS-Selektoren), nie Code. Der Code steht unter MIT-Lizenz; die enthaltenen Filterlisten behalten ihre eigenen Lizenzen.

## Privacy
Single purpose: content blocker — blocks ads, trackers and page annoyances (pop-ups,
cookie prompts, distracting widgets) on the pages you visit.
The extension collects no personal data. The only automatic request to us is a
data-only filter update from adblock.carbonstealth.eu about twice a day (no user
data sent, no code executed). Lists the user chooses to add — a subscription by
URL, or one of four regional lists hosted by their authors — are fetched from
their own address. Full text and the permission justifications: docs/SUBMISSION.md.

Privacy Policy URL: https://adblock.carbonstealth.eu/privacy

## Permission justifications
See docs/SUBMISSION.md §5 (the single source; the store kit is built from it).

## Support / homepage
https://adblock.carbonstealth.eu/support
