// Карта „ръководство (slug) → екрани“. Картинките са фотореалистични пресъздавания на
// интерфейса на приложенията (екран на телефон със снимки CC0/PDM, карти © OpenStreetMap,
// банкноти и монети — образци на ЕЦБ). Файловете са в public/kak-da/ и се генерират от
// scripts/howto-mockups/*.js. Това е чисто добавъчен слой — не пипа базата.

export type Illustration = { src: string; alt: string };

const MAP: Record<string, Illustration[]> = {
  // ── Viber ──
  "app-viber-tekst": [
    { src: "/kak-da/viber-pisane.webp", alt: "Екран на Viber: чат с подчертан бутон за изпращане (стрелка)" },
  ],
  "app-viber-glasovo": [
    { src: "/kak-da/viber-glasovo.webp", alt: "Екран на Viber с подчертан бутон микрофон за гласово съобщение" },
  ],
  "app-viber-grupa": [
    { src: "/kak-da/viber-grupa.webp", alt: "Екран на Viber „Нова група“ с избор на участници" },
  ],
  "app-viber-lokaciya": [
    { src: "/kak-da/viber-prikachi.webp", alt: "Меню за прикачване във Viber с подчертани „Локация“ и „Контакт“" },
  ],
  "app-viber-kontakt": [
    { src: "/kak-da/viber-prikachi.webp", alt: "Меню за прикачване във Viber с подчертани „Контакт“ и „Локация“" },
  ],
  "app-viber-blokiram": [
    { src: "/kak-da/viber-blok.webp", alt: "Екран с информация за контакт във Viber и подчертан бутон „Блокирай“" },
  ],
  "app-viber-iztriya-sub": [
    { src: "/kak-da/viber-iztrij.webp", alt: "Меню при задържане на съобщение с подчертано „Изтрий“" },
  ],
  "app-viber-procheteno": [
    { src: "/kak-da/viber-procheteno.webp", alt: "Обяснение на отметките във Viber: изпратено, доставено, прочетено" },
  ],
  "app-emoji-stikeri": [
    { src: "/kak-da/viber-emoji.webp", alt: "Viber: панел с емоджи под полето за писане, подчертан е бутонът с усмихнатото лице" },
  ],
  "app-zaglushi-chat": [
    { src: "/kak-da/viber-zaglushi.webp", alt: "Прозорец за заглушаване на известията от група" },
  ],
  // ── Messenger ──
  "app-messenger-glasovo": [
    { src: "/kak-da/messenger.webp", alt: "Екран на Messenger с подчертан бутон микрофон" },
  ],
  // ── WhatsApp ──
  "app-whatsapp": [
    { src: "/kak-da/whatsapp.webp", alt: "Чат във WhatsApp със съобщения, снимка на лалета и зелен бутон за гласово съобщение" },
    { src: "/kak-da/whatsapp-registraciya.webp", alt: "Регистрация в WhatsApp с въвеждане на телефонен номер" },
  ],
  // ── Снимки от чат ──
  "ph-zapazya-ot-chat": [
    { src: "/kak-da/chat-zapazi.webp", alt: "Снимка в чат с подчертан бутон за запазване в галерията" },
  ],
  // ── Facebook ──
  "fb-kakvo-e": [
    { src: "/kak-da/fb-feed.webp", alt: "Началният екран на Facebook с поле „Какво Ви се случва?“ и публикации; подчертани са лупата и Messenger" },
  ],
  "fb-publikuvai": [
    { src: "/kak-da/fb-publikuvai.webp", alt: "Създаване на публикация във Facebook с подчертан бутон „Публикувай“" },
  ],
  "fb-haresai-komentar": [
    { src: "/kak-da/fb-haresai.webp", alt: "Публикация във Facebook с подчертан бутон „Харесвам“" },
  ],
  "fb-nameri-priyatel": [
    { src: "/kak-da/fb-priatel.webp", alt: "Търсене на човек във Facebook с бутон „Добави приятел“" },
  ],
  "fb-poveritelnost": [
    { src: "/kak-da/fb-poveritelnost.webp", alt: "Избор на аудитория във Facebook: избрано е „Приятели“" },
  ],
  "safe-falshiv-profil-fb": [
    { src: "/kak-da/fb-falshiv.webp", alt: "Фалшив профил във Facebook: нов, с малко приятели и снимки, без снимка на лице" },
  ],
  "akaunt-zabravena-parola-fb": [
    { src: "/kak-da/fb-parola.webp", alt: "Екран за възстановяване на забравена парола за Facebook" },
  ],

  // ── Обаждания и контакти ──
  "kak-da-otgovorya-na-obazhdane": [
    { src: "/kak-da/call-incoming.webp", alt: "Входящо обаждане: зелен бутон за приемане, червен за отказ" },
  ],
  "kak-da-zapisha-nov-kontakt": [
    { src: "/kak-da/contact-new.webp", alt: "Екран за запис на нов контакт с поле за име и телефон" },
  ],
  "kak-da-se-obadya-na-kontakt": [
    { src: "/kak-da/dial-contact.webp", alt: "Списък с контакти в приложение „Телефон“ с подчертан контакт „Мария Петрова“" },
  ],
  "kak-da-napisha-sms": [
    { src: "/kak-da/sms-new.webp", alt: "Писане на SMS с подчертан бутон за изпращане" },
  ],
  "set-propusnati": [
    { src: "/kak-da/call-missed.webp", alt: "Списък с обаждания, пропуснатото е в червено" },
  ],

  // ── Имейл (Gmail) ──
  "mail-otvarya": [
    { src: "/kak-da/mail-inbox.webp", alt: "Входяща кутия на Gmail със списък писма" },
  ],
  "mail-pisha": [
    { src: "/kak-da/mail-compose.webp", alt: "Писане на имейл с подчертан бутон за изпращане" },
  ],
  "mail-otgovor": [
    { src: "/kak-da/mail-compose.webp", alt: "Отговор на имейл с бутон за изпращане" },
  ],
  "mail-prikachi": [
    { src: "/kak-da/mail-attach.webp", alt: "Прикачване на снимка към имейл (кламер)" },
  ],
  "mail-spam": [
    { src: "/kak-da/mail-spam.webp", alt: "Подозрително писмо за „награда“ в Gmail; менюто с три точки е отворено и „Докладване на спам“ е подчертано" },
  ],

  // ── Банкомат, карта, е-услуги ──
  "kak-da-izteglya-pari-bankomat": [
    { src: "/kak-da/atm.webp", alt: "Екран на банкомат „Изберете сума“ със суми в евро; бутонът до 50 € е подчертан" },
  ],
  "bezopasnost-na-bankomata": [
    { src: "/kak-da/atm-safe.webp", alt: "Ръка прикрива клавиатурата на банкомат, докато на екрана се въвежда ПИН" },
  ],
  "kakvo-da-ne-pravya-s-karta-pin": [
    { src: "/kak-da/atm-safe.webp", alt: "Ръка прикрива клавиатурата на банкомат при въвеждане на ПИН" },
  ],
  "kak-da-plashtam-s-karta-magazin": [
    { src: "/kak-da/pos.webp", alt: "Банкова карта, допряна до ПОС терминал; на екрана е сумата 24,80 €" },
  ],
  "izgubih-kartata-kakvo-da-pravya": [
    { src: "/kak-da/card-lost.webp", alt: "Спешни стъпки при изгубена карта и обаждане до банката" },
  ],
  "shop-porchka": [
    { src: "/kak-da/shop-order.webp", alt: "Онлайн магазин: страница на продукт с бутони „Добави в количката“ и „Купи сега“" },
  ],
  "shop-prosledya-pratka": [
    { src: "/kak-da/shop-track.webp", alt: "Проследяване на пратка по номер на товарителница в сайт на куриер" },
  ],
  "docs-egov": [
    { src: "/kak-da/egov.webp", alt: "Примерна страница „Електронни услуги“ с търсене на услуга и бутон „Вход“" },
  ],
  "docs-zdravno-dosie": [
    { src: "/kak-da/health-record.webp", alt: "Електронно здравно досие с рецепти и прегледи" },
  ],
  "docs-elektronna-recepta": [
    { src: "/kak-da/health-record.webp", alt: "Електронни рецепти в здравното досие" },
  ],
  "docs-noi-pensiya": [
    { src: "/kak-da/noi-pension.webp", alt: "Проверка на пенсията онлайн (НОИ)" },
  ],
  "docs-pik-nap": [
    { src: "/kak-da/pik-nap.webp", alt: "Вход в НАП с персонален идентификационен код (ПИК)" },
  ],

  // ── Настройки и достъпност ──
  "set-wifi-toggle": [
    { src: "/kak-da/quick-wifi.webp", alt: "Бърз панел с включване на Wi-Fi" },
  ],
  "kak-da-uvelicha-shrifta": [
    { src: "/kak-da/font-size.webp", alt: "Плъзгач за увеличаване на шрифта" },
  ],
  "kak-da-usilya-namalya-zvuka": [
    { src: "/kak-da/volume.webp", alt: "Промяна на силата на звука със страничните бутони" },
  ],
  "set-ne-bezpokoy": [
    { src: "/kak-da/dnd.webp", alt: "Включване на режим „Не безпокойте“" },
  ],
  "set-tih-rezhim": [
    { src: "/kak-da/dnd.webp", alt: "Тих режим в настройките за звук" },
  ],
  "set-screenshot": [
    { src: "/kak-da/screenshot.webp", alt: "Правене на снимка на екрана с двата бутона" },
  ],
  "acc-uvelichenie-ekran": [
    { src: "/kak-da/magnifier.webp", alt: "Настройка „Увеличение“ в „Достъпност“ с лупа върху дребен текст" },
  ],
  "day-lupa": [
    { src: "/kak-da/camera-magnifier.webp", alt: "Камерата на телефона, приближена 3× към дребен текст на листовка; два пръста се раздалечават по екрана" },
  ],
  "acc-subtitri": [
    { src: "/kak-da/captions.webp", alt: "Включване на субтитри при видео (бутон CC)" },
  ],
  "acc-svetkavica-zvunene": [
    { src: "/kak-da/flash-alerts.webp", alt: "Светване на светкавицата при звънене" },
  ],
  "acc-chetene-na-glas": [
    { src: "/kak-da/screen-reader.webp", alt: "Четене на глас на това, което е на екрана" },
  ],
  "acc-po-golemi-ikoni": [
    { src: "/kak-da/big-icons.webp", alt: "По-големи икони и менюта" },
  ],
  "acc-kontrast": [
    { src: "/kak-da/contrast.webp", alt: "Висок контраст и удебелен текст за по-добра четимост" },
  ],

  // ── Клавиатура ──
  "kb-kopiram-tekst": [
    { src: "/kak-da/kb-copy.webp", alt: "Копиране на маркиран текст от менюто" },
  ],
  "kb-markiram-tekst": [
    { src: "/kak-da/kb-copy.webp", alt: "Маркиране на част от текст" },
  ],
  "kb-postavya-tekst": [
    { src: "/kak-da/kb-paste.webp", alt: "Поставяне на копиран текст" },
  ],
  "kb-smenya-klaviatura": [
    { src: "/kak-da/kb-lang.webp", alt: "Смяна на езика на клавиатурата с глобусчето" },
  ],
  "kb-kirilica": [
    { src: "/kak-da/kb-lang.webp", alt: "Писане на кирилица и смяна на езика" },
  ],
  "kb-cifri-znaci": [
    { src: "/kak-da/kb-numbers.webp", alt: "Бутон „?123“ за цифри и знаци на клавиатурата" },
  ],
  "kb-diktovka": [
    { src: "/kak-da/kb-dictate.webp", alt: "Диктуване на текст с микрофона на клавиатурата" },
  ],

  // ── Интернет и браузър ──
  "net-otvarya-sayt": [
    { src: "/kak-da/browser-url.webp", alt: "Въвеждане на адрес в лентата на браузъра" },
  ],
  "net-siguren-sayt": [
    { src: "/kak-da/browser-secure.webp", alt: "Катинарче за сигурен сайт в адресната лента" },
  ],
  "net-youtube-gledam": [
    { src: "/kak-da/youtube-watch.webp", alt: "Гледане на видео в YouTube с бутон за пускане" },
  ],
  "fun-muzika-youtube": [
    { src: "/kak-da/youtube-watch.webp", alt: "Слушане на музика през YouTube" },
  ],
  "net-youtube-tarsya": [
    { src: "/kak-da/youtube-search.webp", alt: "Търсене на видео или песен в YouTube" },
  ],

  // ── Карти и навигация ──
  "map-adres": [
    { src: "/kak-da/maps-search.webp", alt: "Търсене на адрес в Google Карти" },
  ],
  "map-upatvane": [
    { src: "/kak-da/maps-directions.webp", alt: "Упътване до място със синя линия и бутон „Старт“" },
  ],
  "map-apteka": [
    { src: "/kak-da/maps-nearby.webp", alt: "Аптеки и болници наблизо в Google Карти" },
  ],

  // ── Всекидневни помощници ──
  "day-vremeto": [
    { src: "/kak-da/weather.webp", alt: "Прогноза за времето за днес и следващите дни" },
  ],
  "day-budilnik": [
    { src: "/kak-da/alarm.webp", alt: "Настройка на будилник" },
  ],
  "day-napomnyane": [
    { src: "/kak-da/reminder.webp", alt: "Напомняне за лекарства в определен час" },
  ],
  "day-qr": [
    { src: "/kak-da/qr.webp", alt: "Сканиране на QR код с камерата" },
  ],
  "day-kalkulator": [
    { src: "/kak-da/calculator.webp", alt: "Калкулатор на телефона" },
  ],

  // ── Снимки и галерия ──
  "ph-dokument": [
    { src: "/kak-da/camera.webp", alt: "Правене на снимка с бутона на камерата" },
  ],
  "ph-izrezha": [
    { src: "/kak-da/photo-crop.webp", alt: "Изрязване на снимка чрез дърпане на ъглите" },
  ],
  "ph-zavartya": [
    { src: "/kak-da/photo-rotate.webp", alt: "Завъртане на снимка" },
  ],
  "ph-mnogo-snimki": [
    { src: "/kak-da/photo-multi.webp", alt: "Избор и изпращане на няколко снимки наведнъж" },
  ],

  // ── Телефонни основи ──
  "kak-da-vklyucha-izklyucha-telefona": [{ src: "/kak-da/power.webp", alt: "Изключване на телефона чрез задържане на бутона" }],
  "kak-da-zaklyucha-otklyucha-ekrana": [{ src: "/kak-da/lock-screen.webp", alt: "Заключен екран — плъзнете нагоре за отключване" }],
  "kak-da-promenya-zvuka-na-zvunene": [{ src: "/kak-da/ringer-volume.webp", alt: "Плъзгач за силата на звънене" }],
  "kak-da-uvelicha-yarkostta": [{ src: "/kak-da/brightness.webp", alt: "Плъзгач за яркост на екрана в бързия панел" }],
  "kak-da-polzvam-glasovo-tarsene": [{ src: "/kak-da/voice-search.webp", alt: "Гласово търсене с микрофон" }],
  "kak-da-vklyucha-fenercheto": [{ src: "/kak-da/flashlight.webp", alt: "Включване на фенерчето от бързия панел" }],
  "kak-da-zaredya-bateriyata": [{ src: "/kak-da/battery.webp", alt: "Батерия и пестене на заряд" }],

  // ── Настройки на телефона ──
  "set-samoleten-rezhim": [{ src: "/kak-da/airplane.webp", alt: "Самолетен режим в бързия панел" }],
  "set-mobilni-danni": [{ src: "/kak-da/mobile-data.webp", alt: "Включване на мобилните данни" }],
  "set-bluetooth": [{ src: "/kak-da/bluetooth.webp", alt: "Свързване на слушалки или колона по Bluetooth" }],
  "set-premestya-ikona": [{ src: "/kak-da/move-icon.webp", alt: "Преместване на икона на началния екран" }],
  "set-papka-prilozheniya": [{ src: "/kak-da/app-folder.webp", alt: "Папка с приложения" }],
  "set-iztriya-prilozhenie": [{ src: "/kak-da/uninstall.webp", alt: "Деинсталиране на приложение" }],
  "set-obnovya-prilozhenie": [{ src: "/kak-da/update-app.webp", alt: "Обновяване на приложение в Google Play" }],
  "set-tarsya-prilozhenie": [{ src: "/kak-da/find-app.webp", alt: "Намиране на приложение чрез търсене" }],
  "set-avto-zavartane": [{ src: "/kak-da/auto-rotate.webp", alt: "Автоматично завъртане на екрана" }],
  "set-smenya-tapeta": [{ src: "/kak-da/wallpaper.webp", alt: "Смяна на фона (тапета)" }],
  "set-data-chas": [{ src: "/kak-da/date-time.webp", alt: "Настройка на дата и час" }],
  "set-smenya-ezik": [{ src: "/kak-da/phone-language.webp", alt: "Смяна на езика на телефона" }],
  "set-prastov-otpechatak": [{ src: "/kak-da/fingerprint.webp", alt: "Отключване с пръстов отпечатък" }],
  "set-otklyuchvane-lice": [{ src: "/kak-da/face-unlock.webp", alt: "Отключване с лице" }],
  "set-smenya-pin": [{ src: "/kak-da/change-pin.webp", alt: "Смяна на ПИН код за отключване" }],
  "set-izkl-izvestiya": [{ src: "/kak-da/app-notifications.webp", alt: "Изключване на известията от приложение" }],
  "set-vibraciya": [{ src: "/kak-da/vibration.webp", alt: "Включване и изключване на вибрацията" }],
  "set-blokiram-nomer": [{ src: "/kak-da/block-number.webp", alt: "Блокиране на нежелан телефонен номер" }],
  "set-nasilstven-restart": [{ src: "/kak-da/force-restart.webp", alt: "Рестартиране на заседнал телефон с двата бутона" }],
  "set-usilya-slushalka": [{ src: "/kak-da/call-volume.webp", alt: "Усилване на звука по време на разговор" }],
  "set-data-usage": [{ src: "/kak-da/data-usage.webp", alt: "Проверка на изхарчените мобилни данни" }],

  // ── Клавиатура и достъпност ──
  "kb-iztriya-duma": [{ src: "/kak-da/kb-backspace.webp", alt: "Триене на буква с бутона backspace" }],
  "kb-golemi-bukvi": [{ src: "/kak-da/kb-caps.webp", alt: "Писане с главни букви чрез стрелката Shift" }],
  "kb-avtokorekciya": [{ src: "/kak-da/kb-autocorrect.webp", alt: "Включване и изключване на автоматичната корекция" }],
  "kb-po-golyama-klaviatura": [{ src: "/kak-da/kb-bigger.webp", alt: "По-големи клавиши на клавиатурата" }],
  "kb-redaktiram-izprateno": [{ src: "/kak-da/kb-edit.webp", alt: "Поправяне на текст чрез поставяне на курсора" }],
  "acc-ednoruchen": [{ src: "/kak-da/one-hand.webp", alt: "Режим за ползване с една ръка" }],
  "acc-namali-yarkost-avto": [{ src: "/kak-da/auto-brightness.webp", alt: "Автоматична яркост на екрана" }],

  // ── Интернет и браузър ──
  "net-otmetka-zapazya": [{ src: "/kak-da/bookmark-add.webp", alt: "Запазване на сайт в любими със звездичката" }],
  "net-otvarya-otmetki": [{ src: "/kak-da/bookmarks-list.webp", alt: "Списък със запазени отметки (любими сайтове)" }],
  "net-nov-tab": [{ src: "/kak-da/new-tab.webp", alt: "Отваряне на нов раздел (таб) в браузъра" }],
  "net-zatvarya-tab": [{ src: "/kak-da/close-tab.webp", alt: "Затваряне на раздел с хиксчето" }],
  "net-osvezha": [{ src: "/kak-da/refresh.webp", alt: "Презареждане на страницата" }],
  "net-uvelicha-tekst": [{ src: "/kak-da/zoom-page.webp", alt: "Уголемяване на текста на уеб страница с два пръста" }],
  "net-prevod-stranica": [{ src: "/kak-da/translate-page.webp", alt: "Превод на чужда страница на български" }],
  "net-izteglya-snimka": [{ src: "/kak-da/save-image.webp", alt: "Запазване на снимка от интернет" }],
  "net-iztriya-istoriya": [{ src: "/kak-da/clear-history.webp", alt: "Изчистване на историята на браузъра" }],
  "net-svali-fayl": [{ src: "/kak-da/downloads.webp", alt: "Списък с изтеглени файлове и снимки" }],

  // ── Имейл (Gmail) ──
  "mail-iztriya": [{ src: "/kak-da/mail-delete.webp", alt: "Изтриване на имейл с кошчето" }],
  "mail-izprateni": [{ src: "/kak-da/mail-sent.webp", alt: "Менюто на Gmail с подчертана папка „Изпратени“" }],
  "mail-tarsya": [{ src: "/kak-da/mail-search.webp", alt: "Търсене на стар имейл" }],
  "mail-prepratya": [{ src: "/kak-da/mail-forward.webp", alt: "Препращане на имейл на друг човек" }],
  "mail-kontakt": [{ src: "/kak-da/mail-add-contact.webp", alt: "Добавяне на човек в контактите на имейла" }],

  // ── Карти и навигация ──
  "map-moya-lokaciya": [{ src: "/kak-da/my-location.webp", alt: "Показване къде се намирате сега (синя точка)" }],
  "map-share": [{ src: "/kak-da/share-location.webp", alt: "Споделяне на местоположението с близък" }],
  "map-transport": [{ src: "/kak-da/transit.webp", alt: "Разписание на автобус до съседен град" }],

  // ── Всекидневни помощници ──
  "day-belezhka": [{ src: "/kak-da/notes.webp", alt: "Записване на бележка" }],
  "day-kalendar": [{ src: "/kak-da/calendar-event.webp", alt: "Добавяне на събитие в календара" }],
  "day-taymer": [{ src: "/kak-da/timer.webp", alt: "Таймер за готвене" }],
  "day-hronometar": [{ src: "/kak-da/stopwatch.webp", alt: "Хронометър за измерване на време" }],
  "day-prevod-duma": [{ src: "/kak-da/translate-word.webp", alt: "Превод на дума или изречение" }],
  "day-namerya-telefon-doma": [{ src: "/kak-da/ring-phone.webp", alt: "Звънване на телефона, за да го намерите вкъщи" }],
  "day-nosht-rezhim": [{ src: "/kak-da/night-mode.webp", alt: "Нощен режим — по-щадящ за очите екран" }],
  "day-spisak-pazar": [{ src: "/kak-da/shopping-list.webp", alt: "Списък за пазаруване с чек-боксове" }],

  // ── Безопасност и пари ──
  "safe-namerya-izguben-telefon": [{ src: "/kak-da/find-device.webp", alt: "Намиране на изгубен телефон отдалеч" }],
  "safe-otkradnat-telefon": [{ src: "/kak-da/find-device.webp", alt: "Заключване на изгубен или откраднат телефон" }],
  "safe-dvufaktorna": [{ src: "/kak-da/2fa.webp", alt: "Двуфакторна защита — код по SMS освен паролата" }],
  "safe-falshiva-pechalba": [{ src: "/kak-da/fake-prize.webp", alt: "Фалшива печалба/лотария — измама, която да затворите" }],
  "money-smetka-barcode": [{ src: "/kak-da/bill-barcode.webp", alt: "Плащане на сметка на каса с баркод" }],
  "money-balans-prilozhenie": [{ src: "/kak-da/bank-balance.webp", alt: "Проверка на баланса в банковото приложение" }],
  "money-prevod-blizak": [{ src: "/kak-da/bank-transfer.webp", alt: "Превод на пари на близък през банковото приложение" }],

  // ── Онлайн пазаруване и забавление ──
  "shop-varna-stoka": [{ src: "/kak-da/return-item.webp", alt: "Поръчка с бутон „Заяви връщане“ и срок за връщане" }],
  "shop-sravnya-ceni": [{ src: "/kak-da/compare-prices.webp", alt: "Сравняване на цени на един продукт" }],
  "shop-garanciya": [{ src: "/kak-da/receipt-warranty.webp", alt: "Снимане и пазене на касова бележка за гаранция" }],
  "fun-radio-online": [{ src: "/kak-da/radio.webp", alt: "Слушане на радио онлайн" }],
  "fun-audiokniga": [{ src: "/kak-da/audiobook.webp", alt: "Слушане на аудиокнига или подкаст" }],
  "fun-tv-online": [{ src: "/kak-da/tv-online.webp", alt: "Гледане на български телевизии онлайн" }],
  "fun-recepti": [{ src: "/kak-da/recipes.webp", alt: "Намиране на рецепти за готвене" }],
  "fun-pasians": [{ src: "/kak-da/solitaire.webp", alt: "Игра на пасианс" }],
  "fun-kniga-telefon": [{ src: "/kak-da/ebook.webp", alt: "Четене на книга на телефона" }],
  "fun-stari-filmi": [{ src: "/kak-da/movies.webp", alt: "Гледане на стари филми онлайн" }],
  "fun-snimki-vnuci": [{ src: "/kak-da/photo-timer.webp", alt: "Обща снимка с таймер на камерата" }],
  "fun-grupov-video": [{ src: "/kak-da/group-video.webp", alt: "Видео разговор с няколко души едновременно" }],

  // ── Снимки и галерия ──
  "ph-iztriya-snimka": [{ src: "/kak-da/photo-delete.webp", alt: "Изтриване на снимка" }],
  "ph-fon": [{ src: "/kak-da/set-wallpaper.webp", alt: "Задаване на снимка за фон на телефона" }],
  "ph-album": [{ src: "/kak-da/create-album.webp", alt: "Създаване на албум със снимки" }],
  "ph-vazstanovya": [{ src: "/kak-da/photo-restore.webp", alt: "Връщане на изтрита по грешка снимка от кошчето" }],
  "ph-slideshow": [{ src: "/kak-da/slideshow.webp", alt: "Гледане на снимките като слайдшоу" }],
  "ph-spodelya": [{ src: "/kak-da/photo-share.webp", alt: "Споделяне на снимка към приложение" }],
  "ph-uvelicha": [{ src: "/kak-da/photo-zoom.webp", alt: "Приближаване (увеличаване) на снимка с два пръста" }],

  // ── Измами (примерни екрани с подчертани червени флагове) ──
  "iz-sms-s-link": [{ src: "/kak-da/scam-parcel-sms.webp", alt: "Фалшив SMS за пратка с искане да платите по линк" }],
  "s-falshiv-kurier-sms": [{ src: "/kak-da/scam-parcel-sms.webp", alt: "Фалшив куриерски SMS — измама" }],
  "falshivi-sms-primeri": [{ src: "/kak-da/scam-fake-sms.webp", alt: "Фалшив SMS, че сметката е блокирана — измама" }],
  "iz-falshivo-obazhdane-banka": [{ src: "/kak-da/scam-bank-call.webp", alt: "Фалшиво обаждане „от банката“, което иска кодове" }],
  "s-falshiv-zvun-banka": [{ src: "/kak-da/scam-bank-call.webp", alt: "Фалшиво обаждане от името на банка — измама" }],
  "telefonni-izmami-falshiv-policay": [{ src: "/kak-da/scam-police-call.webp", alt: "Фалшиво обаждане „от полицай/прокурор“ — измама" }],
  "iz-telefonna-izmama-vnuche": [{ src: "/kak-da/scam-grandchild.webp", alt: "Измама „внук в беда“, който иска пари спешно" }],
  "izmama-vnuk-rodnina-v-beda": [{ src: "/kak-da/scam-grandchild.webp", alt: "Съобщение от уж близък в беда, който иска пари — измама" }],
  "s-falshiv-profil-rodnina": [{ src: "/kak-da/scam-grandchild.webp", alt: "Фалшив профил на роднина, който иска пари — измама" }],
  "t2-kakvo-e-otp-kod": [{ src: "/kak-da/scam-otp.webp", alt: "SMS с еднократен код (OTP), който не бива да давате на никого" }],
  "x-falshiva-bankova-stranica": [{ src: "/kak-da/scam-phishing-bank.webp", alt: "Фалшива страница на банка без катинарче и с грешен адрес" }],
  "iz-falshivi-saytove": [{ src: "/kak-da/scam-fake-shop.webp", alt: "Фалшив онлайн магазин с нереална цена и само предплащане" }],
  "x-izmama-investicii": [{ src: "/kak-da/scam-investment.webp", alt: "Измама с „инвестиция“, обещаваща бързи печалби" }],
  "m-vnimanie-investicii2": [{ src: "/kak-da/scam-investment.webp", alt: "Измамна инвестиционна схема с гарантирана печалба" }],
  "x-izmama-lyubov": [{ src: "/kak-da/scam-love.webp", alt: "Измама „любов онлайн“ — непознат, който иска пари" }],
  "s-remote-dostap-izmama": [{ src: "/kak-da/scam-remote.webp", alt: "Страница на приложение за отдалечен достъп в магазина — не го инсталирайте по чужда молба" }],
  "iz-proveri-obazhdane": [{ src: "/kak-da/scam-verify.webp", alt: "Бележка с четири стъпки за проверка на съмнително обаждане или SMS" }],
  "money-falshiva-banknota": [{ src: "/kak-da/fake-banknote.webp", alt: "Банкнота 50 евро (образец на ЕЦБ) с белези: релеф, воден знак, портретен прозорец, изумрудено число, нишка" }],
  "m-falshiva-banknota2": [{ src: "/kak-da/fake-banknote.webp", alt: "Банкнота 50 евро (образец на ЕЦБ) със защитните белези" }],
  "iz-falshiva-nagrada": [{ src: "/kak-da/fake-prize.webp", alt: "Фалшива печалба/награда — измама" }],
  "s-falshiva-pechalba-link": [{ src: "/kak-da/fake-prize.webp", alt: "Фалшива печалба с линк — измама" }],
  "x-falshiva-pechalba-mreja": [{ src: "/kak-da/fake-prize.webp", alt: "Фалшива печалба онлайн — измама" }],

  // ── Еврото (нагледни помагала) ──
  "e-dvoyni-ceni-ot-koga": [{ src: "/kak-da/euro-dual-price.webp", alt: "Етикети на рафт с две цени — в лева и в евро: 1,20 лв = 0,61 €" }],
  "e-zashto-dve-ceni": [{ src: "/kak-da/euro-dual-price.webp", alt: "Защо цените се показват и в лева, и в евро" }],
  "e-poskapvane": [{ src: "/kak-da/euro-dual-price.webp", alt: "Двойни цени — курсът е фиксиран, не губите пари" }],
  "e-zakraglyane": [{ src: "/kak-da/euro-receipt.webp", alt: "Касова бележка с обща сума 6,49 € и равностойност в лева по фиксирания курс" }],
  "e-resto": [{ src: "/kak-da/euro-receipt.webp", alt: "Касова бележка: платено 10,00 €, ресто 3,51 €" }],
  "e-gruba-smetka": [{ src: "/kak-da/euro-rate.webp", alt: "Конвертор на телефона: 1 евро = 1,95583 лева, с таблица за 10, 50, 100, 500 и 1000 лева" }],
  "e-banknoti": [{ src: "/kak-da/euro-banknotes.webp", alt: "Евробанкноти от 5 до 200 евро, лицева страна — образци на ЕЦБ" }],
  "e-moneti": [{ src: "/kak-da/euro-coins.webp", alt: "Евромонети от 1 цент до 2 евро — общата и българската страна" }],
  "e-stotinki": [{ src: "/kak-da/euro-coins.webp", alt: "Евроцентове (стотинки) — монети" }],
  "e-bg-moneti": [{ src: "/kak-da/euro-coins.webp", alt: "Български евромонети с Мадарския конник, св. Иван Рилски и Паисий Хилендарски" }],
  "e-bankomat-evro": [{ src: "/kak-da/euro-atm.webp", alt: "Екран на банкомат, който дава евро: суми в € и надпис „Сумите са в евро (€)“" }],
  "e-kurs": [{ src: "/kak-da/euro-rate.webp", alt: "Фиксиран курс на екрана на телефона: 1 евро = 1,95583 лева" }],
  "e-kak-presmiatam": [{ src: "/kak-da/euro-rate.webp", alt: "Таблица на телефона: 10, 50, 100 лева в евро (деление на 1,95583)" }],
  "e-kolko-struva": [{ src: "/kak-da/euro-rate.webp", alt: "Таблица: колко евро са 10, 50, 100, 500 и 1000 лева" }],
  // „e-leva-do-koga“ и „e-leva-vkashti“ нямат картинка: старата
  // (euro-dual-period, махната) говореше за двойното обращение и безплатната
  // обмяна в банки като за предстоящи, а те приключиха (1.02 и 30.06.2026).
  "e-falshivo-evro": [{ src: "/kak-da/fake-banknote.webp", alt: "Банкнота 50 евро (образец на ЕЦБ) със защитните белези за разпознаване" }],

  // ── Още телефонни действия и приложения ──
  "kak-da-namerya-snimkite": [{ src: "/kak-da/gallery.webp", alt: "Галерия със снимките, подредени по дата" }],
  "kak-da-zasnema-video": [{ src: "/kak-da/video-record.webp", alt: "Заснемане на видео с червения бутон" }],
  "kak-da-napravya-snimka": [{ src: "/kak-da/camera.webp", alt: "Правене на снимка с бутона на камерата" }],
  "e2-selfi-po-dobro": [{ src: "/kak-da/camera.webp", alt: "Селфи с предната камера" }],
  "kak-da-se-obadya-viber-messenger": [{ src: "/kak-da/viber-call.webp", alt: "Безплатно обаждане по Viber през интернет" }],
  "kak-da-se-video-obadya-viber-messenger": [{ src: "/kak-da/video-call.webp", alt: "Видео обаждане с превключване на камерата" }],
  "kak-da-izpratya-snimka-klip-viber-messenger": [{ src: "/kak-da/viber-prikachi.webp", alt: "Меню за прикачване във Viber: Галерия, Камера, GIF, Файл, Локация, Контакт" }],
  "kak-da-izpratya-link": [{ src: "/kak-da/share-link.webp", alt: "Копиране и изпращане на линк на сайт" }],
  "kak-da-kopiram-link": [{ src: "/kak-da/share-link.webp", alt: "Копиране на линк на сайт" }],
  "kak-da-postavya-link": [{ src: "/kak-da/share-link.webp", alt: "Поставяне на копиран линк" }],
  "e2-barzo-nabirane": [{ src: "/kak-da/speed-dial.webp", alt: "Любими контакти за бързо обаждане" }],
  "e2-snimka-na-kontakt": [{ src: "/kak-da/contact-photo.webp", alt: "Слагане на снимка на контакт" }],
  "e2-pryak-pat-sayt": [{ src: "/kak-da/home-shortcut.webp", alt: "Пряк път към сайт на началния екран" }],
  "e2-glasova-belezhka": [{ src: "/kak-da/voice-memo.webp", alt: "Запис на гласова бележка" }],
  "e2-chete-sms-na-glas": [{ src: "/kak-da/screen-reader.webp", alt: "Четене на съобщенията на глас" }],
  "e2-avtomatichno-zakliuchvane": [{ src: "/kak-da/auto-lock.webp", alt: "Автоматично заключване на екрана" }],
  "e2-spri-izskachashti-reklami": [{ src: "/kak-da/block-popups.webp", alt: "Спиране на изскачащите реклами в браузъра" }],
  "e2-namali-danni-youtube": [{ src: "/kak-da/data-saver.webp", alt: "Намаляване на разхода на данни при видео" }],
  "kak-da-zaredya-telefon-vaucher": [{ src: "/kak-da/recharge-voucher.webp", alt: "Зареждане на предплатен телефон с ваучер" }],

  // ── Е-услуги и документи ──
  "c-proverya-globi-kat": [{ src: "/kak-da/check-fines.webp", alt: "Проверка на глоби от КАТ онлайн" }],
  "c-proveria-izbiratelna-sekciya2": [{ src: "/kak-da/polling-station.webp", alt: "Проверка на избирателната секция по ЕГН" }],
  "c-kopiya-dokumenti": [{ src: "/kak-da/scan-document.webp", alt: "Сканиране на документ с камерата" }],
  "c-udostoverenie-online": [{ src: "/kak-da/egov.webp", alt: "Издаване на удостоверение онлайн през e-услуги" }],
  "c-proveria-zadalzheniya-nap": [{ src: "/kak-da/pik-nap.webp", alt: "Проверка на данъчни задължения в НАП" }],
  "c-zdravno-dosie2": [{ src: "/kak-da/health-record.webp", alt: "Електронно здравно досие" }],
  "pn-proveri-pensiya": [{ src: "/kak-da/noi-pension.webp", alt: "Проверка на размера на пенсията (НОИ)" }],
  "x-povtorna-recepta": [{ src: "/kak-da/health-record.webp", alt: "Повторна електронна рецепта от здравното досие" }],
  "x-plati-smetka-prilozhenie": [{ src: "/kak-da/bill-barcode.webp", alt: "Плащане на сметка през приложение/баркод" }],
  "iz-bezopasno-teglene-pari": [{ src: "/kak-da/atm.webp", alt: "Безопасно теглене на пари от банкомат" }],

  // ── Транспорт ──
  "c-bilet-gradski": [{ src: "/kak-da/transit-ticket.webp", alt: "Билет за градски транспорт в телефона" }],
  "c-bilet-avtobus-mezhdugradski": [{ src: "/kak-da/transit-ticket.webp", alt: "Билет за междуградски автобус" }],
  "c-taksi-bezopasno": [{ src: "/kak-da/taxi.webp", alt: "Поръчка на такси през приложение" }],

  // ── Интернет безопасност ──
  "i-namerya-oficialen-sayt": [{ src: "/kak-da/browser-secure.webp", alt: "Разпознаване на официален сайт по адреса и катинарчето" }],
  "i-chete-adres-url": [{ src: "/kak-da/browser-secure.webp", alt: "Разчитане на адреса (URL) на сайт" }],
  "i-recognize-secure-payment": [{ src: "/kak-da/browser-secure.webp", alt: "Сигурна страница за плащане (катинарче)" }],
  "i-izlizam-chuzhdo-ustroistvo": [{ src: "/kak-da/logout-device.webp", alt: "Изход от акаунта на чуждо устройство" }],

  // ── Здраве, спешност и безопасност ──
  "x-telemedicina": [{ src: "/kak-da/telemedicine.webp", alt: "Видео преглед при лекар (телемедицина)" }],
  "x-sos-buton": [{ src: "/kak-da/sos-button.webp", alt: "SOS бутон за спешна помощ" }],
  "x-speshen-kontakt-zaklyuchen": [{ src: "/kak-da/emergency-contact-lock.webp", alt: "Спешен контакт на заключения екран" }],

  // ── Поддръжка на телефона ──
  "x-zaklyuchi-prilozhenie": [{ src: "/kak-da/lock-app.webp", alt: "Заключване на приложение с пръст/ПИН" }],
  "x-osvobodi-myasto-snimki": [{ src: "/kak-da/free-space.webp", alt: "Освобождаване на място в паметта" }],
  "t2-osvobodi-myasto2": [{ src: "/kak-da/free-space.webp", alt: "Освобождаване на място на телефона" }],
  "x-prehvarli-nov-telefon": [{ src: "/kak-da/transfer-phone.webp", alt: "Прехвърляне на данни към нов телефон" }],

  // ── Нови екрани (gen-7): настройки и действия ──
  "t2-svurzia-telefon-tv": [{ src: "/kak-da/screen-cast.webp", alt: "Прехвърляне на екрана на телефона към телевизор" }],
  "net-hotspot": [{ src: "/kak-da/hotspot.webp", alt: "Мобилна точка за достъп (hotspot) в настройките" }],
  "x-backup-telefon": [{ src: "/kak-da/phone-backup.webp", alt: "Резервно копие (backup) на телефона в облака" }],
  "x-spri-avtomatichni-pokupki": [{ src: "/kak-da/app-subscriptions.webp", alt: "Списък с платени абонаменти и бутон за спиране" }],
  "mem-zatvarya-prilozheniya": [{ src: "/kak-da/recent-apps.webp", alt: "Екран „скорошни приложения“ — затваряне на работещи отзад" }],
  "t2-kakvo-e-rouming": [{ src: "/kak-da/roaming.webp", alt: "Превключвател за роуминг в чужбина в настройките" }],
  "x-uvelichi-zvuk-uvedomleniya": [{ src: "/kak-da/notif-volume.webp", alt: "Плъзгачи за сила на звука на известията и звъненето" }],

  // ── Повторно използване на съществуващи екрани ──
  // Известия, звук, „Не безпокойте“
  "x-nochno-bezpokoene": [{ src: "/kak-da/dnd.webp", alt: "Режим „Не безпокойте“ за тишина през нощта" }],
  "e2-tih-nochem-vazhni": [{ src: "/kak-da/dnd.webp", alt: "„Не безпокойте“ с изключения за важни контакти" }],
  "x-skrij-izvestiya-zaklyuchen": [{ src: "/kak-da/lock-screen.webp", alt: "Скриване на съдържанието на известията на заключен екран" }],
  "t2-kakvo-e-izvestie": [{ src: "/kak-da/app-notifications.webp", alt: "Известие (нотификация) от приложение" }],
  // Свързване
  "t2-svurzia-slushalki": [{ src: "/kak-da/bluetooth.webp", alt: "Свързване на безжични (Bluetooth) слушалки" }],
  "t2-kakvo-e-bluetooth2": [{ src: "/kak-da/bluetooth.webp", alt: "Bluetooth в настройките на телефона" }],
  "day-kolonka-muzika": [{ src: "/kak-da/bluetooth.webp", alt: "Свързване на Bluetooth колонка за музика" }],
  "net-obshtestven-wifi": [{ src: "/kak-da/quick-wifi.webp", alt: "Свързване с Wi-Fi мрежа" }],
  "t2-wifi-vs-danni": [{ src: "/kak-da/mobile-data.webp", alt: "Wi-Fi и мобилни данни в настройките" }],
  // Поддръжка на телефона
  "t2-grizha-bateria": [{ src: "/kak-da/battery.webp", alt: "Батерия и пестене на заряд в настройките" }],
  "mem-osvobodya-myasto": [{ src: "/kak-da/free-space.webp", alt: "Освобождаване на място в паметта" }],
  "mem-proverya-myasto": [{ src: "/kak-da/free-space.webp", alt: "Проверка на свободното място в телефона" }],
  "mem-cache": [{ src: "/kak-da/force-restart.webp", alt: "Рестарт при засичащо приложение" }],
  "t2-restart-pomaga": [{ src: "/kak-da/power.webp", alt: "Изключване и рестарт на телефона" }],
  "t2-kakvo-e-update": [{ src: "/kak-da/update-app.webp", alt: "Обновяване (update) на приложение" }],
  "t2-zashtita-krazhba-telefon": [{ src: "/kak-da/find-device.webp", alt: "„Намери устройството ми“ при кражба или загуба" }],
  "t2-kakvo-e-tamen-rezhim": [{ src: "/kak-da/night-mode.webp", alt: "Тъмен режим в настройките" }],
  "t2-kakvo-e-samoleten": [{ src: "/kak-da/airplane.webp", alt: "Самолетен режим" }],
  "t2-kakvo-e-screenshot2": [{ src: "/kak-da/screenshot.webp", alt: "Снимка на екрана (screenshot)" }],
  "t2-kakvo-e-glasov-asistent": [{ src: "/kak-da/voice-search.webp", alt: "Гласов асистент (Google/Siri)" }],
  // Акаунти и сигурност
  "akaunt-izlizam": [{ src: "/kak-da/logout-device.webp", alt: "Изход (logout) от акаунт или устройство" }],
  "akaunt-dve-stapki": [{ src: "/kak-da/2fa.webp", alt: "Защита в две стъпки (код по SMS)" }],
  "s-zashtita-dve-stapki2": [{ src: "/kak-da/2fa.webp", alt: "Защита в две стъпки за акаунта" }],
  // Пенсии, документи, пари
  "m-noi-pensiya2": [{ src: "/kak-da/noi-pension.webp", alt: "Проверка на пенсия и осигуряване (НОИ)" }],
  "pn-kak-poluchavam-pensiya": [{ src: "/kak-da/noi-pension.webp", alt: "Пенсия (НОИ)" }],
  "docs-pik-noi": [{ src: "/kak-da/noi-pension.webp", alt: "ПИК на НОИ за справки онлайн" }],
  "m-pik-noi2": [{ src: "/kak-da/noi-pension.webp", alt: "ПИК на НОИ" }],
  "c-pik-nap-kakvo": [{ src: "/kak-da/pik-nap.webp", alt: "ПИК на НАП за е-услуги" }],
  "docs-kat-globi": [{ src: "/kak-da/check-fines.webp", alt: "Проверка на глоби от КАТ онлайн" }],
  "money-iban": [{ src: "/kak-da/bank-transfer.webp", alt: "IBAN и банков превод" }],
  "m-iban-prevod2": [{ src: "/kak-da/bank-transfer.webp", alt: "Банков превод по IBAN" }],
  "money-online-bankirane": [{ src: "/kak-da/bank-balance.webp", alt: "Онлайн банкиране — преглед на сметката" }],
  "money-proverya-dvizheniya": [{ src: "/kak-da/bank-balance.webp", alt: "Движения и разписки по сметката" }],
  "m-plati-smetka-easypay": [{ src: "/kak-da/bill-barcode.webp", alt: "Плащане на сметка на каса по баркод" }],
  "m-sravniavam-ceni": [{ src: "/kak-da/compare-prices.webp", alt: "Сравняване на цени преди покупка" }],
  "m-vrashtane-stoka-prava": [{ src: "/kak-da/return-item.webp", alt: "Връщане на стока" }],
  "m-garanciya-prava": [{ src: "/kak-da/receipt-warranty.webp", alt: "Гаранция и касова бележка" }],
  // Пазаруване и доставка
  "k-dostavka-hrana": [{ src: "/kak-da/shop-order.webp", alt: "Поръчка на храна с доставка" }],
  "h-porchka-lekarstva": [{ src: "/kak-da/shop-order.webp", alt: "Поръчка на лекарства с доставка" }],
  "k-spisak-pazaruvane2": [{ src: "/kak-da/shopping-list.webp", alt: "Списък за пазаруване" }],
  "shop-bezopasno": [{ src: "/kak-da/scam-fake-shop.webp", alt: "Разпознаване на фалшив онлайн магазин" }],
  "i-pazaruvane-online-bezopasno2": [{ src: "/kak-da/scam-fake-shop.webp", alt: "Безопасно онлайн пазаруване" }],
  // Здраве и спешност
  "x-podgotovka-video-pregled": [{ src: "/kak-da/telemedicine.webp", alt: "Видео преглед при лекар (телемедицина)" }],
  "h-speshen-profil": [{ src: "/kak-da/emergency-contact-lock.webp", alt: "Спешен профил на заключен екран" }],
  "g-speshen-profil-blizak": [{ src: "/kak-da/emergency-contact-lock.webp", alt: "Спешен профил на телефона на близък" }],
  "h-zapisha-stoynosti": [{ src: "/kak-da/health-record.webp", alt: "Записване на здравни стойности" }],
  "h-spisak-lekarstva": [{ src: "/kak-da/health-record.webp", alt: "Списък с приеманите лекарства" }],
  "h-napomnyane-kravno": [{ src: "/kak-da/reminder.webp", alt: "Напомняне за измерване на кръвно/захар" }],
  "h-voda-napomnyane": [{ src: "/kak-da/reminder.webp", alt: "Напомняне за пиене на вода" }],
  "h-dezhurna-apteka": [{ src: "/kak-da/maps-nearby.webp", alt: "Намиране на дежурна аптека наблизо" }],
  // Транспорт
  "t-prilozhenie-taksi": [{ src: "/kak-da/taxi.webp", alt: "Поръчка на такси през приложение" }],
  "t-bilet-vlak-online": [{ src: "/kak-da/transit-ticket.webp", alt: "Билет за влак онлайн" }],
  "t-razpisanie-avtobus": [{ src: "/kak-da/transit.webp", alt: "Разписание на автобус или влак" }],
  "t-spirka-nablizo": [{ src: "/kak-da/maps-nearby.webp", alt: "Автобусна спирка наблизо" }],
  "t-parking-sms": [{ src: "/kak-da/sms-new.webp", alt: "Плащане на паркиране със SMS" }],
  // Свободно време
  "z-radio-online2": [{ src: "/kak-da/radio.webp", alt: "Слушане на радио онлайн" }],
  "z-audiokniga2": [{ src: "/kak-da/audiobook.webp", alt: "Аудиокниги и подкасти" }],
  "z-knigi-telefon2": [{ src: "/kak-da/ebook.webp", alt: "Четене на книги с едри букви" }],
  "z-recepti-video2": [{ src: "/kak-da/recipes.webp", alt: "Рецепти с видео стъпки" }],
  "z-stari-filmi2": [{ src: "/kak-da/movies.webp", alt: "Гледане на филми на телефона" }],
  "z-televiziya-online2": [{ src: "/kak-da/tv-online.webp", alt: "Българска телевизия онлайн" }],
  "z-igri-pamet": [{ src: "/kak-da/solitaire.webp", alt: "Игри за ума (пасианс, судоку)" }],
  "z-prognoza-zanimaniya": [{ src: "/kak-da/weather.webp", alt: "Проверка на времето преди разходка" }],
  "z-rakodelie-video": [{ src: "/kak-da/youtube-watch.webp", alt: "Видео уроци по ръкоделие" }],
  "z-bezplatni-kursove": [{ src: "/kak-da/youtube-watch.webp", alt: "Безплатни видео уроци" }],
  "z-snimki-album-spomeni": [{ src: "/kak-da/create-album.webp", alt: "Албум със спомени от снимките" }],
  // Общност и ежедневие
  "o-grupov-video-semeystvo": [{ src: "/kak-da/group-video.webp", alt: "Групов видео разговор със семейството" }],
  "o-zapisha-rozhdeni-dni": [{ src: "/kak-da/calendar-event.webp", alt: "Рождени дни и важни дати в календара" }],
  "o-vremeto-planiram-den": [{ src: "/kak-da/notes.webp", alt: "Планиране на деня и задачите" }],
  "day-zadachi": [{ src: "/kak-da/notes.webp", alt: "Списък със задачи" }],
  "o-napisha-pismo": [{ src: "/kak-da/mail-compose.webp", alt: "Писане и изпращане на писмо/имейл" }],
  "day-procent": [{ src: "/kak-da/calculator.webp", alt: "Сметка на отстъпка с калкулатора" }],
};

export function getIllustrations(slug: string): Illustration[] {
  return MAP[slug] ?? [];
}
