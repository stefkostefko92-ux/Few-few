# Chrome Web Store listing

## Name
Supreme AdBlock

## Summary (132 chars max)
Blocks ads everywhere: YouTube video ads, banners, pop-ups, trackers, cookie prompts and anti-adblock walls.

## Category
Privacy & Security

## Detailed description

Supreme AdBlock removes ads and trackers from the pages you visit, without watching what you do.

- Blocks YouTube video ads (pre-roll & mid-roll) at the source, plus feed
  and search ads
- EasyList, EasyPrivacy and other open filter lists built in, plus the list for
  your language — 31 regional lists, the one for your browser's language on by itself
- Removes banners, pop-ups, pop-unders and native sponsored-content widgets
- Hides sponsored posts on Facebook & Instagram
- Stops trackers and behavioural analytics
- Blocks third-party tracking cookies and beacons at the network level
- Turns off the browser's ad-targeting APIs (Topics, interest groups,
  attribution reporting) on every page
- Strips tracking parameters (utm_*, fbclid, gclid, ...) from links
- Optional malware protection (URLhaus list)
- Handles cookie / consent banners: presses Reject when offered, clears the leftover
  blur and scroll lock, and never presses a sign-in, OAuth or payment button
- Keeps pages usable when an adblock detector tries to break them
- Focus mode: hide chat bubbles, newsletter pop-ups, notification prompts, social
  widgets, AI pop-ups, "Sign in with Google" pop-ups and YouTube Shorts
- Site broken? A repair page fixes it in one click, or you tell us, nothing is
  sent without you seeing it first
- Element picker, hide anything on a page with one click
- Advanced "My filters" with procedural selectors and anti-adblock scriptlets
- Per-site allowlist for sites you want to support, plus a per-site switch
  for cosmetic filtering if a layout ever breaks
- "Blocked on this page" in the popup: see how much each filter list stopped
- Subscribe to any filter list by URL (refreshed daily)
- Pop-under blocker: thousands of known pop-up domains can no longer open
  windows behind your back
- Strips third-party tracking cookies and blocks crypto-miners
- Signed (Ed25519), data-only filter updates twice a day, so blocking never goes stale
- Live stats: ads blocked, data saved, time saved
- Sleek Carbon Stealth theme (dark) with a light option
- Available in 73 languages

HOW IT WORKS

Built on Manifest V3, Chrome's current extension platform. Requests are blocked
with declarativeNetRequest, the API Chrome provides for it, so the browser does
the filtering without the extension seeing your traffic.

YouTube ads are stopped at the source, so videos simply play. YouTube's video
servers are never blocked; the ad entries are taken out of the player's data
before the player reads it.

Protection that does not go stale. Ad networks rotate domains daily, while a
store review takes days. Our filter data refreshes twice a day, Ed25519-signed
and version-locked, so a new ad network can be added within hours — and no new
code is shipped to do it.

No remote code. All logic ships inside the package, including the 19
anti-adblock routines and the sites they apply to. What arrives over the network
is data only: hostnames and CSS selectors. No eval, no Function(), no script
fetched from a server.

You can read every line. No bundler, no minifier: unzip the extension and the
code you audit is exactly the code that runs; the few generated files (rule sets,
scriptlet data) are readable and rebuilt by public scripts. Code MIT licensed;
the bundled filter lists keep their own licences (listed in the package).

Your browsing data never leaves your device. No account, no analytics, no telemetry, no
"anonymous usage statistics". We take no money from advertisers and no ad is
let through for a fee, so nothing is quietly unblocked behind your back.

It reaches the ads that rules alone cannot. Pop-unders are refused at the moment
a page calls window.open, for 2,700+ known hosts; anti-adblock walls are
neutralised; and ad slots no filter list names yet are caught by their
shape, not by a rule.

When a site breaks, you fix it in one click. Allow the site outright, or keep
network blocking and switch off only the element hiding — per site, from the
popup, with no config file.

You can see what it did. A per-page breakdown of what each filter list
blocked, live counters for data and time saved, and a health card in the
settings that confirms every part is actually running.

No account, no telemetry, no data collection: everything stays on your
device. The popup and settings have an optional donation link.

## Detailed description, localised (Edge requires one per packaged locale, ≥250 chars)

The long versions for bg / it / de are below. For every other language packaged in
`_locales`, use `docs/listing/<locale>.txt` (the short store description, translated).

**bg**

Supreme AdBlock маха рекламите и тракерите от страниците, които отваряте, без да следи какво правите.

- Блокира видеорекламите в YouTube (pre-roll и mid-roll) при източника, както и рекламите във feed-а и търсенето
- Вградени EasyList и EasyPrivacy (десетки хиляди правила)
- Маха банери, изскачащи прозорци, pop-under-и и „препоръчани“ native реклами
- Скрива спонсорираните публикации във Facebook и Instagram
- Спира тракери и поведенческа аналитика; блокира third-party проследяващи бисквитки и beacon-и на мрежово ниво
- Изключва рекламните API на браузъра (Topics, interest groups, attribution reporting) на всяка страница
- Чисти проследяващите параметри (utm_*, fbclid, gclid, …) от линковете
- Опционална защита от зловреден софтуер (списък URLhaus)
- Обработва банерите за бисквитки: натиска „Отхвърли“, когато го има, маха останалия блър и заключения скрол и никога не натиска бутон за вход, OAuth или плащане
- Още отворени филтър-листи и 31 регионални листа — този за езика на браузъра се включва сам
- Режим „Фокус“: скрива чат балончета, прозорци за бюлетини, покани за известия, социални джаджи, AI прозорци, „Вход с Google“ и YouTube Shorts
- Сайтът е счупен? Страница за поправка с едно кликване — или ни кажете; нищо не се изпраща, без първо да го видите
- Запазва страниците използваеми, когато детектор на адблокър се опита да ги счупи
- Избор на елемент — скрийте каквото и да е на страницата с един клик
- „Мои филтри“ с процедурни селектори и анти-адблок scriptlet-и; абонамент за всякакъв филтър-лист по URL (обновява се дневно)
- Allowlist по сайт за сайтовете, които искате да подкрепите, плюс превключвател „без козметика“ по сайт, ако оформлението се счупи
- „Блокирано на тази страница“ в popup-а — виждате колко е спрял всеки филтър-лист
- Подписани (Ed25519), само-данни ъпдейти на филтрите — блокирането не остарява
- Статистика на живо: блокирани реклами, спестени данни, спестено време
- Тема Carbon Stealth (тъмна) и светла опция; интерфейс на 73 езика

КАК РАБОТИ

Създаден върху Manifest V3, текущата платформа за разширения на Chrome. Заявките се блокират с declarativeNetRequest — API-то, което Chrome дава за това — така че филтрира самият браузър, без разширението да вижда трафика ви.

Рекламите в YouTube се спират при източника, затова видеата просто тръгват. Видео сървърите на YouTube никога не се блокират; рекламните записи се махат от данните на плейъра, преди той да ги прочете.

Защита, която не остарява. Рекламните мрежи сменят домейни всеки ден, а ревюто в магазина отнема дни. Филтърните ни данни се обновяват два пъти дневно, подписани с Ed25519 и заключени по версия — нова рекламна мрежа може да се добави за часове, без да се качва нов код.

Нула отдалечен код. Цялата логика е в пакета, включително 19-те анти-адблок рутини и сайтовете, за които важат. От мрежата идват само данни: хостове и CSS селектори. Без eval, без Function(), без скрипт, издърпан от сървър.

Можете да прочетете всеки ред. Няма билд стъпка и нищо не е минифицирано: разархивирайте разширението и кодът, който одитирате, е точно кодът, който се изпълнява. Лиценз MIT.

Данните ви от сърфирането не напускат устройството ви. Без акаунт, без аналитика, без телеметрия, без „анонимна статистика на употребата“. Не вземаме пари от рекламодатели и не пропускаме реклами срещу заплащане, значи нищо не се отпушва тихомълком зад гърба ви.

Стига до рекламите, до които само правилата не достигат. Pop-under прозорците се отказват в момента, в който страницата извика window.open — за над 2700 известни хоста; анти-адблок стените се неутрализират; а съвсем нови рекламни полета, които никой лист още не познава, се хващат по формата им, не по правило.

Ако сайт се счупи, оправяте го с едно кликване. Разрешете сайта изцяло или запазете мрежовото блокиране и изключете само скриването на елементи — за конкретния сайт, от popup-а, без конфигурационен файл.

Виждате какво е свършило. Разбивка по филтър-листи за всяка страница, броячи на живо за спестени данни и време, и карта за здравето на двигателя в настройките, която потвърждава, че всяка част наистина работи.

Без акаунт, без телеметрия, без събиране на данни — всичко остава на вашето устройство. В popup-а и настройките има незадължителен линк за дарение.

**it**

Supreme AdBlock toglie annunci e tracker dalle pagine che visiti, senza osservare cosa fai.

- Blocca gli annunci video di YouTube (pre-roll e mid-roll) alla fonte, oltre agli annunci nel feed e nella ricerca
- EasyList ed EasyPrivacy integrate (decine di migliaia di regole)
- Rimuove banner, pop-up, pop-under e annunci nativi «consigliati»
- Nasconde i post sponsorizzati su Facebook e Instagram
- Ferma tracker e analisi comportamentale; blocca cookie e beacon di tracciamento di terze parti a livello di rete
- Disattiva le API pubblicitarie del browser (Topics, interest groups, attribution reporting) su ogni pagina
- Elimina i parametri di tracciamento (utm_*, fbclid, gclid, …) dai link
- Protezione antimalware opzionale (lista URLhaus)
- Gestisce i banner dei cookie: preme «Rifiuta» quando c'è, toglie la sfocatura e il blocco dello scorrimento rimasti e non preme mai un pulsante di accesso, OAuth o pagamento
- Altre liste di filtri aperte e 31 liste regionali: quella per la lingua del browser si attiva da sola
- Modalità Focus: nasconde bolle di chat, pop-up delle newsletter, richieste di notifiche, widget social, pop-up IA, «Accedi con Google» e YouTube Shorts
- Sito rotto? Una pagina di riparazione lo sistema con un clic, oppure segnalacelo: nulla viene inviato senza che tu lo veda prima
- Mantiene le pagine utilizzabili quando un rilevatore di adblock prova a romperle
- Selettore di elementi: nascondi qualsiasi cosa in una pagina con un clic
- «I miei filtri» con selettori procedurali e scriptlet anti-adblock; iscrizione a qualsiasi lista di filtri tramite URL (aggiornata ogni giorno)
- Lista consentita per sito per i siti che vuoi sostenere, più un interruttore «senza cosmetici» per sito se il layout si rompe
- «Bloccato in questa pagina» nel popup: vedi quanto ha fermato ogni lista di filtri
- Aggiornamenti dei filtri firmati (Ed25519) e composti solo da dati: il blocco non invecchia
- Statistiche in tempo reale: annunci bloccati, dati risparmiati, tempo risparmiato
- Tema Carbon Stealth (scuro) con opzione chiara; interfaccia in 73 lingue

COME FUNZIONA

Costruito su Manifest V3, l'attuale piattaforma delle estensioni di Chrome. Le richieste sono bloccate con declarativeNetRequest, l'API che Chrome mette a disposizione per questo: filtra il browser stesso, senza che l'estensione veda il tuo traffico.

Gli annunci di YouTube vengono fermati alla fonte, così i video partono e basta. I server video di YouTube non vengono mai bloccati; le voci pubblicitarie vengono tolte dai dati del player prima che li legga.

Una protezione che non invecchia. Le reti pubblicitarie cambiano dominio ogni giorno, mentre una revisione dello store richiede giorni. I nostri dati dei filtri si aggiornano due volte al giorno, firmati con Ed25519 e vincolati alla versione: una nuova rete pubblicitaria può essere aggiunta in poche ore, senza distribuire nuovo codice.

Nessun codice remoto. Tutta la logica è nel pacchetto, comprese le 19 routine anti-adblock e i siti a cui si applicano. Dalla rete arrivano solo dati: nomi host e selettori CSS. Nessun eval, nessuna Function(), nessuno script scaricato da un server.

Puoi leggere ogni riga. Non c'è alcuna fase di build e nulla è minificato: decomprimi l'estensione e il codice che verifichi è esattamente quello che viene eseguito. Licenza MIT.

I tuoi dati di navigazione non lasciano mai il dispositivo. Nessun account, nessuna analitica, nessuna telemetria, nessuna «statistica d'uso anonima». Non prendiamo denaro dagli inserzionisti e nessun annuncio passa a pagamento, quindi nulla viene sbloccato di nascosto.

Raggiunge gli annunci che le sole regole non toccano. I pop-under vengono rifiutati nel momento in cui la pagina chiama window.open, per oltre 2.700 host noti; i muri anti-adblock vengono neutralizzati; e gli spazi pubblicitari nuovissimi, che nessuna lista conosce ancora, vengono individuati dalla loro forma, non da una regola.

Se un sito si rompe, lo sistemi con un clic. Consenti l'intero sito, oppure mantieni il blocco di rete e disattiva solo l'occultamento degli elementi — per quel sito, dal popup, senza file di configurazione.

Vedi cosa ha fatto. Per ogni pagina, quanto ha bloccato ciascuna lista di filtri, contatori in tempo reale di dati e tempo risparmiati e una scheda di stato nelle impostazioni che conferma che ogni componente è davvero attivo.

Nessun account, nessuna telemetria, nessuna raccolta di dati: tutto resta sul tuo dispositivo. Nel popup e nelle impostazioni c'è un link facoltativo per le donazioni.

**de**

Supreme AdBlock entfernt Werbung und Tracker von den Seiten, die Sie besuchen, ohne zu beobachten, was Sie tun.

- Blockiert YouTube-Videoanzeigen (Pre-Roll und Mid-Roll) an der Quelle sowie Anzeigen im Feed und in der Suche
- EasyList und EasyPrivacy integriert (Zehntausende Regeln)
- Entfernt Banner, Pop-ups, Pop-under und native „Empfohlen“-Anzeigen
- Blendet gesponserte Beiträge auf Facebook und Instagram aus
- Stoppt Tracker und Verhaltensanalyse; blockiert Tracking-Cookies und Beacons von Drittanbietern auf Netzwerkebene
- Schaltet die Werbe-APIs des Browsers (Topics, Interest Groups, Attribution Reporting) auf jeder Seite ab
- Entfernt Tracking-Parameter (utm_*, fbclid, gclid, …) aus Links
- Optionaler Malware-Schutz (URLhaus-Liste)
- Behandelt Cookie-Banner: drückt „Ablehnen“, wenn angeboten, entfernt zurückgebliebene Unschärfe und Scroll-Sperren und drückt nie eine Anmelde-, OAuth- oder Zahlungsschaltfläche
- Weitere offene Filterlisten und 31 regionale Listen – die für die Sprache Ihres Browsers schaltet sich selbst ein
- Fokusmodus: blendet Chat-Blasen, Newsletter-Pop-ups, Benachrichtigungs-Aufforderungen, Social-Widgets, KI-Pop-ups, „Mit Google anmelden“ und YouTube Shorts aus
- Seite kaputt? Eine Reparaturseite behebt es mit einem Klick – oder melden Sie es uns; nichts wird gesendet, ohne dass Sie es vorher sehen
- Hält Seiten nutzbar, wenn ein Adblock-Detektor sie zu stören versucht
- Element-Picker: Verbergen Sie alles auf einer Seite mit einem Klick
- „Meine Filter“ mit prozeduralen Selektoren und Anti-Adblock-Scriptlets; Abonnement beliebiger Filterlisten per URL (täglich aktualisiert)
- Positivliste pro Website für Seiten, die Sie unterstützen möchten, plus ein Schalter „ohne Kosmetik“ pro Website, falls das Layout bricht
- „Auf dieser Seite blockiert“ im Popup: Sie sehen, wie viel jede Filterliste gestoppt hat
- Signierte (Ed25519), reine Daten-Updates der Filter: das Blockieren veraltet nicht
- Live-Statistik: blockierte Anzeigen, gesparte Daten, gesparte Zeit
- Carbon-Stealth-Design (dunkel) mit heller Option; Oberfläche in 73 Sprachen

SO FUNKTIONIERT ES

Gebaut auf Manifest V3, der aktuellen Erweiterungsplattform von Chrome. Anfragen werden mit declarativeNetRequest blockiert, der dafür vorgesehenen Chrome-API: Der Browser filtert selbst, ohne dass die Erweiterung Ihren Datenverkehr sieht.

YouTube-Anzeigen werden an der Quelle gestoppt, deshalb laufen Videos einfach. Die Videoserver von YouTube werden nie blockiert; die Werbeeinträge werden aus den Daten des Players entfernt, bevor er sie liest.

Schutz, der nicht veraltet. Werbenetzwerke wechseln täglich die Domain, eine Store-Prüfung dauert Tage. Unsere Filterdaten aktualisieren sich zweimal täglich, Ed25519-signiert und versionsgebunden: Ein neues Werbenetzwerk kann in Stunden ergänzt werden — ohne neuen Code auszuliefern.

Kein Code aus dem Netz. Die gesamte Logik steckt im Paket, einschließlich der 19 Anti-Adblock-Routinen und der Seiten, für die sie gelten. Aus dem Netz kommen nur Daten: Hostnamen und CSS-Selektoren. Kein eval, kein Function(), kein vom Server geladenes Skript.

Sie können jede Zeile lesen. Es gibt keinen Build-Schritt und nichts ist minifiziert: Entpacken Sie die Erweiterung, und der Code, den Sie prüfen, ist genau der Code, der läuft. MIT-Lizenz.

Ihre Browsing-Daten verlassen nie Ihr Gerät. Kein Konto, keine Analyse, keine Telemetrie, keine „anonyme Nutzungsstatistik“. Wir nehmen kein Geld von Werbetreibenden und lassen keine Werbung gegen Bezahlung durch — es wird also nichts heimlich freigeschaltet.

Es erreicht die Werbung, an die Regeln allein nicht herankommen. Pop-under werden in dem Moment abgewiesen, in dem die Seite window.open aufruft — für über 2.700 bekannte Hosts; Anti-Adblock-Sperren werden neutralisiert; und brandneue Werbeflächen, die noch keine Liste kennt, werden an ihrer Form erkannt, nicht an einer Regel.

Wenn eine Seite kaputtgeht, reparieren Sie es mit einem Klick. Erlauben Sie die Seite ganz, oder behalten Sie die Netzwerksperre und schalten Sie nur das Ausblenden von Elementen ab — pro Seite, aus dem Popup, ohne Konfigurationsdatei.

Sie sehen, was es getan hat. Pro Seite, wie viel jede Filterliste blockiert hat, Live-Zähler für gesparte Daten und Zeit und eine Statuskarte in den Einstellungen, die bestätigt, dass jeder Teil wirklich läuft.

Kein Konto, keine Telemetrie, keine Datensammlung: Alles bleibt auf Ihrem Gerät. Popup und Einstellungen bieten einen optionalen Spendenlink.

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
https://adblock.carbonstealth.eu/#faq
