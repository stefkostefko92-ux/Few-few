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
  // ── Здраве, първа помощ и грижа за близък (картинки от scripts/howto-mockups/gen-zdrave.js) ──
  "g-dnevni-centrove": [{ src: "/kak-da/zdrave-dnevni-centrove-pitane.webp", alt: "Обаждане в общината/Социално подпомагане за дневен център" }],
  "g-dokumenti-na-blizak": [{ src: "/kak-da/zdrave-dokumenti-papka.webp", alt: "Папка с подредени на едно място документи на близък" }],
  "g-grizha-za-suprug": [{ src: "/kak-da/zdrave-dnevnik-sastoyanie.webp", alt: "Записки за състоянието на болния в приложението „Бележки“ на телефона" }],
  "g-lichen-asistent-blizak": [{ src: "/kak-da/zdrave-asistent-obazhdane.webp", alt: "Обаждане в Социално подпомагане за личен асистент" }],
  "g-organiz-lekarstva-blizak": [{ src: "/kak-da/zdrave-alarmi-lekarstva.webp", alt: "Аларми на телефона за всеки прием на лекарства" }],
  "g-patronazh-za-blizak": [{ src: "/kak-da/zdrave-patronazh-obazhdane.webp", alt: "Обаждане в общината за социален патронаж" }],
  "g-pochivka-grizheshtiya": [{ src: "/kak-da/zdrave-smeni-kalendar.webp", alt: "Календар със смени на близките за грижата" }],
  "g-proverka-izmami-blizak": [{ src: "/kak-da/zdrave-izmami-belezhka.webp", alt: "Бележка с правилата срещу телефонни измами, закачена на видно място" }],
  "h-chas-specialist-napravlenie": [{ src: "/kak-da/zdrave-napravlenie-specialist.webp", alt: "Направление към специалист със срок на валидност (примерен образец)" }],
  "h-krachki": [{ src: "/kak-da/zdrave-krachki-prilozhenie.webp", alt: "Стъпките за деня в приложението „Здраве“" }],
  "h-povikam-lineyka": [{ src: "/kak-da/zdrave-112-nabirane.webp", alt: "Набран номер 112 в клавиатурата на телефона" }],
  "h-pregled-podgotovka": [{ src: "/kak-da/zdrave-podgotovka-pregled.webp", alt: "Списък на масата: какво да носите на преглед при лекар" }],
  "h-speshni-telefoni": [{ src: "/kak-da/zdrave-speshno-zaklyuchen.webp", alt: "Спешно повикване 112 от заключен телефон" }],
  "h2-aptechka-doma": [{ src: "/kak-da/zdrave-aptechka.webp", alt: "Домашна аптечка — марля, лекарства и бележка да проверявате сроковете" }],
  "h2-dvizhenie-uprazhneniya": [{ src: "/kak-da/zdrave-uprazhneniya.webp", alt: "Пътека в парка и удобни обувки за ежедневна разходка" }],
  "h2-grip-vaksina": [{ src: "/kak-da/zdrave-grip-vaksina-chas.webp", alt: "Запазен в календара час при личния лекар за ваксина против грип" }],
  "h2-grizha-ochi": [{ src: "/kak-da/zdrave-ochi.webp", alt: "Очила за четене и добра светлина" }],
  "h2-grizha-sluh": [{ src: "/kak-da/zdrave-sluh.webp", alt: "Слухови апарати на масата" }],
  "h2-grizha-zubi": [{ src: "/kak-da/zdrave-zubi-protezi.webp", alt: "Четка за зъби в чаша" }],
  "h2-kak-da-vzimam-lekarstva": [{ src: "/kak-da/zdrave-lekarstva-pravilno.webp", alt: "Кутийка за лекарства по дни от седмицата" }],
  "h2-kakvo-da-pravia-padnal": [{ src: "/kak-da/zdrave-padnal-zvanene.webp", alt: "Списък „Любими“ в телефона с близък и номер 112 за повикване" }],
  "h2-kakvo-znachi-kravno": [{ src: "/kak-da/zdrave-kravno-chisla.webp", alt: "Числата на кръвното налягане и ориентирите към тях" }],
  "h2-koga-lekar-koga-112": [{ src: "/kak-da/zdrave-koga-lekar-koga-112.webp", alt: "Листовка на масата: кога на 112 и кога при личния лекар" }],
  "h2-krovotechenie-nos": [{ src: "/kak-da/zdrave-kravotechenie-nos.webp", alt: "Студен компрес, който може да сложите върху носа" }],
  "h2-malka-rana": [{ src: "/kak-da/zdrave-malka-rana.webp", alt: "Ръка с чиста марлена превръзка" }],
  "h2-malko-izgaryane": [{ src: "/kak-da/zdrave-izgaryane-ohlazhdane.webp", alt: "Ръце под течаща хладка вода при леко изгаряне" }],
  "h2-merya-kravno": [{ src: "/kak-da/zdrave-kravno-merene.webp", alt: "Измерване на кръвно с апарат: маншет на голата ръка и бутон „Старт“" }],
  "h2-merya-temperatura": [{ src: "/kak-da/zdrave-termometar.webp", alt: "Електронен термометър с число на екрана" }],
  "h2-padane-doma": [{ src: "/kak-da/zdrave-padane-doma.webp", alt: "Домашна баня и стабилни обувки — как да намалите риска от падане" }],
  "h2-pia-voda": [{ src: "/kak-da/zdrave-voda.webp", alt: "Чаша вода на масата — дръжте я на видно място като напомняне" }],
  "h2-priloshavane-pripadak": [{ src: "/kak-da/zdrave-priloshavane.webp", alt: "Листовка на масата: какво да правите, ако някому прилошее" }],
  "h2-priznaci-infarkt": [{ src: "/kak-da/zdrave-infarkt-priznaci.webp", alt: "Листовка на хладилника: признаци на инфаркт" }],
  "h2-priznaci-insult": [{ src: "/kak-da/zdrave-insult-lice-race-rech.webp", alt: "Листовка на хладилника: признаци на инсулт — лице, ръце, реч" }],
  "h2-profilaktichen-pregled2": [{ src: "/kak-da/zdrave-profilaktichen-pregled-chas.webp", alt: "Запазен в календара час за годишен профилактичен преглед" }],
  "h2-samota-nastroenie": [{ src: "/kak-da/zdrave-samota-video.webp", alt: "Видео разговор със семейството по телефона" }],
  "h2-san-bezsanie": [{ src: "/kak-da/zdrave-rezhim-san.webp", alt: "Режим за сън в телефона: лягане и ставане по едно и също време" }],
  "h2-srok-lekarstva": [{ src: "/kak-da/zdrave-srok-lekarstva.webp", alt: "Блистер със срок на годност, изписан с дата" }],
  "h2-toplina-stud-zimata": [{ src: "/kak-da/zdrave-studa-zimata.webp", alt: "Вълнени чорапи и термостат на радиатор — как да се пазите от студа" }],
  "h2-zaduxvane-pomosht": [{ src: "/kak-da/zdrave-zadavyane-hvatka.webp", alt: "Листовка на коркова дъска: какво да правите при задавяне" }],
  "h2-zdravosloven-rezhim": [{ src: "/kak-da/zdrave-navitsi.webp", alt: "Будилник, плодове и обувки за разходка — прости навици за здраве" }],
  "h2-zdravoslovno-hranene": [{ src: "/kak-da/zdrave-hranene.webp", alt: "Чиния със зеленчуци и купа с плодове — здравословно хранене" }],
  "h2-zhega-pregryavane": [{ src: "/kak-da/zdrave-zhega.webp", alt: "Вентилатор, лятна шапка и чаша вода — как да се пазите в жегата" }],
  "kak-da-zapazya-chas-pri-lichen-lekar-onlayn": [{ src: "/kak-da/zdrave-zapisvane-chas-onlayn.webp", alt: "Избор на свободен ден и час в онлайн записване при личен лекар (примерен сайт)" }],
  // ── Дом, безопасност и кухня (картинки от scripts/howto-mockups/gen-dom.js) ──
  "d-bezopasna-pechka": [{ src: "/kak-da/dom-pechka.webp", alt: "Електрически маслен радиатор с бележки как да го ползвате безопасно" }],
  "d-celeva-pomosht-otoplenie": [{ src: "/kak-da/dom-celeva-pomosht.webp", alt: "Примерна молба-декларация за целева помощ за отопление и документ за доходи; подчертан е срокът до 31 октомври" }],
  "d-detektor-dim": [{ src: "/kak-da/dom-detektor-dim.webp", alt: "Детектор за дим на тавана с подчертан бутон за тест" }],
  "d-elektro-bezopasnost": [{ src: "/kak-da/dom-elektro-razklonitel.webp", alt: "Разклонител с контакти; подчертана е бележка да не се претоварват контактите с много уреди" }],
  "d-grizha-domashen-lyubimets": [{ src: "/kak-da/dom-lyubimets.webp", alt: "Купа за храна и вода на куче; подчертана е бележка за прясна вода и подходяща храна всеки ден" }],
  "d-hlazgav-pod-banya": [{ src: "/kak-da/dom-hlazgav-banya.webp", alt: "Вана и противохлъзгаща постелка — как да се пазите от подхлъзване в банята" }],
  "d-lichen-asistent": [{ src: "/kak-da/dom-lichen-asistent.webp", alt: "Бележка със стъпките за личен асистент: условия, заявление, оценка на нуждите, одобрение" }],
  "d-miris-gaz": [{ src: "/kak-da/dom-miris-gaz.webp", alt: "Газов котлон с пламък и бележка: не палете огън, цигара или ключ за лампа" }],
  "d-namalia-smetka-tok": [{ src: "/kak-da/dom-smetka-tok.webp", alt: "Примерна сметка за ток с подчертан разход по месеци за сравнение" }],
  "d-ne-otvarjam-neznakomci": [{ src: "/kak-da/dom-neznakomci.webp", alt: "Верижка на врата с бележки: питайте кой е, без да отваряте, и разгледайте служебната карта през шпионката" }],
  "d-otchitam-elektromer": [{ src: "/kak-da/dom-elektromer.webp", alt: "Електромер на две тарифи с подчертани дневна и нощна стойност; червената цифра не се записва" }],
  "d-pazia-klyuchove": [{ src: "/kak-da/dom-klyuchove.webp", alt: "Купчина ключове; подчертани са ключовете с бележка да се дава резервен ключ на доверен близък, не под изтривалката" }],
  "d-pestia-otoplenie": [{ src: "/kak-da/dom-otoplenie.webp", alt: "Радиатор с терморегулатор; бележка да се отопляват основно обитаваните стаи и да се затварят вратите" }],
  "d-podgotovka-zima-burya": [{ src: "/kak-da/dom-zima-burya.webp", alt: "Фенерче с бележки: дръжте фенерче и резервни батерии, заредете телефона, пригответе топли дрехи и одеяла" }],
  "d-podredba-vazhni-dokumenti": [{ src: "/kak-da/dom-podredba-dokumenti.webp", alt: "Класьори с етикети: лични, здравни, имот, банка, сметки" }],
  "d-pomoshti-vazrastni": [{ src: "/kak-da/dom-pomoshti-vazrastni.webp", alt: "Бележка със записани въпроси към Социално подпомагане: целеви помощи, патронаж, домашен помощник, добавки при ТЕЛК" }],
  "d-pozhar-doma": [{ src: "/kak-da/dom-pozhar-doma.webp", alt: "Коридор със затворена врата и пожарогасител; бележки за изход, затваряне на врати, движение ниско и обаждане на 112" }],
  "d-smenia-krushka": [{ src: "/kak-da/dom-krushka.webp", alt: "Крушка в цокъл; подчертана е крушката, с бележки: изключете ключа и развийте старата крушка" }],
  "d-socialen-patronazh": [{ src: "/kak-da/dom-socialen-patronazh.webp", alt: "Бележка с въпроси за социален патронаж: условия, цена за хранене, заявление, доставка по домовете" }],
  "d-speshni-telefoni-doma": [{ src: "/kak-da/dom-speshni-telefoni.webp", alt: "Списък с важни телефони (112, личен лекар, аптека, роднина, съсед), закачен на хладилника" }],
  "d-spira-toka": [{ src: "/kak-da/dom-tablo-predpazitel.webp", alt: "Електрическо табло с предпазители; подчертан е редът с бутоните, от който се връща изключеният бутон нагоре" }],
  "d-stalba-bezopasnost": [{ src: "/kak-da/dom-stalba.webp", alt: "Сгъваема алуминиева стълба на равен под; подчертани са краката на стълбата, с бележки за безопасно качване" }],
  "d-techa-voda": [{ src: "/kak-da/dom-techa-kran.webp", alt: "Ръка до спирателен кран за вода; бележка да се намери главният спирателен кран и да се затвори" }],
  "d-tigan-olio-pozhar": [{ src: "/kak-da/dom-tigan-olio.webp", alt: "Тиган, подчертан с бележки: не заливайте с вода, покрийте с капак или мокра кърпа" }],
  "d-vaglerod-okis": [{ src: "/kak-da/dom-vaglerod-detektor.webp", alt: "Детектор за въглероден окис с бутон за тест; подчертан е целият уред" }],
  "d-zakliuchen-otvun": [{ src: "/kak-da/dom-zakliuchen.webp", alt: "Ключове на масата и бележки какво да правите, ако се заключите отвън" }],
  "d-zamraznali-trabi": [{ src: "/kak-da/dom-zamraznali-trabi.webp", alt: "Замръзнала външна тръба със сняг наоколо; бележка да се топлоизолират външните тръби" }],
  "k-bezopasen-nozh": [{ src: "/kak-da/dom-nozh.webp", alt: "Нож и картоф върху влажна кърпа на плота; бележка да се реже на стабилна дъска с влажна кърпа отдолу" }],
  "k-bezopasno-konservirane": [{ src: "/kak-da/dom-konservirane.webp", alt: "Чисти стъклени буркани с капачки; бележка да се ползват чисти, здрави буркани и капачки" }],
  "k-chete-etiket-hrana": [{ src: "/kak-da/dom-etiket-hrana.webp", alt: "Примерна таблица „Хранителна стойност“ на 100 г с подчертани захари, сол и списък на съставките" }],
  "k-higiena-kuhnia": [{ src: "/kak-da/dom-higiena-raze.webp", alt: "Ръка над мивка с подчертана бележка да се мият ръцете преди и след работа с храна" }],
  "k-kafe-chai-vecher": [{ src: "/kak-da/dom-kafe-vecher.webp", alt: "Чаша кафе; бележка да се ограничат кафето и силният чай след обяд" }],
  "k-merna-bez-kantar": [{ src: "/kak-da/dom-merki.webp", alt: "Лъжичка върху чиния и таблица с мерки: чаша 250 мл, супена лъжица 15 мл, чаена лъжичка 5 мл" }],
  "k-mikrovylnova-bezopasnost": [{ src: "/kak-da/dom-mikrovalnova.webp", alt: "Отворена микровълнова с подчертана вътрешност; бележка да не се слагат метал, фолио и съдове със златен кант" }],
  "k-namalia-razhitie-hrana": [{ src: "/kak-da/dom-razhitie-hladilnik.webp", alt: "Чекмеджета на хладилник със зеленчуци и плодове; бележка да се подрежда по-старото отпред" }],
  "k-pestia-gotvene": [{ src: "/kak-da/dom-gotvene-kapak.webp", alt: "Тенджера на котлона с бележка да се слага капак — вари по-бързо" }],
  "k-pia-dostatuchno-voda-hranene": [{ src: "/kak-da/dom-alarma-hranene.webp", alt: "Екран „Будилник“ на телефон с аларми за закуска, обяд, вечеря и вода" }],
  "k-podpravki-bez-sol": [{ src: "/kak-da/dom-podpravki.webp", alt: "Подправки и билки върху плот; бележка да се ползват подправки вместо сол" }],
  "k-prosta-supa": [{ src: "/kak-da/dom-supa.webp", alt: "Купа със супа, поднесена топла, с лъжица кисело мляко" }],
  "k-razmraziavane": [{ src: "/kak-da/dom-razmraziavane.webp", alt: "Фризер с бележка: най-безопасно е да преместите храната от фризера в хладилника предната вечер" }],
  "k-sahranenie-hrana": [{ src: "/kak-da/dom-hladilnik-hrana.webp", alt: "Хладилник с плодове и зеленчуци в опаковки; подчертани са продуктите, които се държат в хладилника" }],
  "k-srok-godnost-hrana": [{ src: "/kak-da/dom-srok-godnost.webp", alt: "Две опаковки с примерни надписи „Годен до“ и „Най-добър до“" }],
  "k-zamrazia-pravilno": [{ src: "/kak-da/dom-zamrazia.webp", alt: "Фризер с бутилки и форма за лед; бележка да се разделя на порции, да се слага в пликове/кутии и да се надписва с дата" }],
  // ── Еврото, пари, банкомат, пенсии и помощи (картинки от scripts/howto-mockups/gen-pari.js) ──
  "e-bnb-bezsrochno": [{ src: "/kak-da/pari-bnb-sayt.webp", alt: "Примерна страница за обмяна на левове в евро: безсрочно и безплатно, без ограничение на сумата" }],
  "e-da-barzam-li": [{ src: "/kak-da/pari-sms-barzane.webp", alt: "Съобщение от непознат номер, което пришпорва да обмените левове „още днес“ — измама" }],
  "e-gubia-li-pari": [{ src: "/kak-da/pari-prevalutirane.webp", alt: "Банково приложение: 1 000 лв са превалутирани в 511,29 € по курс 1,95583, без такса" }],
  "e-iban": [{ src: "/kak-da/pari-iban.webp", alt: "Данни за сметката в банковото приложение: IBAN-ът е оградено същият, валутата е евро" }],
  "e-izmama-telefon": [{ src: "/kak-da/pari-obazhdane-obmyana.webp", alt: "Входящо обаждане от непознат номер — затворете, обмяна на пари по телефон не се прави" }],
  "e-izmami-vnimanie": [{ src: "/kak-da/pari-vrata-izmama.webp", alt: "Врата със закопчалка и верига — не пускайте непознати, които искат да обменят или проверяват пари" }],
  "e-karta-raboti": [{ src: "/kak-da/pos.webp", alt: "Плащане с карта на ПОС терминал — сумата е в евро, картата работи както досега" }],
  "e-koga-evro": [{ src: "/kak-da/pari-koga-evro.webp", alt: "Стенен календар за януари 2026 г. с оградено 1 число и български евромонети — от този ден еврото е официалната валута" }],
  "e-kredit": [{ src: "/kak-da/pari-kredit.webp", alt: "Кредит в банковото приложение: остатък и месечна вноска в евро" }],
  "e-leva-do-koga": [{ src: "/kak-da/pari-kasa-samo-evro.webp", alt: "Табелка на касата „Плащане в брой само в евро“ и образци на евробанкнота и евромонети" }],
  "e-leva-vkashti": [{ src: "/kak-da/pari-spestovna-smetka.webp", alt: "Спестовна сметка в банковото приложение — по-сигурно от големи суми в брой вкъщи" }],
  "e-obmiana-bezplatno": [{ src: "/kak-da/pari-obmyana-razpiska.webp", alt: "Примерна разписка за обмяна на 500 лв в 255,65 € по курс 1,95583, без такса" }],
  "e-oficialna-info": [{ src: "/kak-da/pari-ofitsialni-saitove.webp", alt: "Телефон с официалните адреси за информация за еврото: bnb.bg, evroto.bg и kzp.bg" }],
  "e-online-bankirane": [{ src: "/kak-da/bank-balance.webp", alt: "Банково приложение, което показва баланса и движенията в евро" }],
  "e-pensiya": [{ src: "/kak-da/pari-pensiya-evro.webp", alt: "Движения по банковата сметка: пенсията е оградена и е в евро" }],
  "e-smetki-banka": [{ src: "/kak-da/pari-saobshtenie-banka.webp", alt: "Съобщение от банката в приложението: сметките са превалутирани автоматично и безплатно" }],
  "e-vaucheri": [{ src: "/kak-da/pari-vaucheri.webp", alt: "Хартиен ваучер за храна от 10 лв и нов ваучер от 5,00 €" }],
  "e-vlog": [{ src: "/kak-da/pari-vlog.webp", alt: "Срочен влог в банковото приложение: сума в евро, лихвата и срокът са оградени" }],
  "e-zaplata": [{ src: "/kak-da/pari-zaplata-fish.webp", alt: "Фиш за заплата с нетна сума за получаване в евро" }],
  "e-zashto": [{ src: "/kak-da/pari-obshta-valuta.webp", alt: "Портфейл с евромонети и банкноти от 10 и 20 евро — една и съща валута в много страни от ЕС" }],
  "m-byrzi-krediti-kapan": [{ src: "/kak-da/pari-barz-kredit.webp", alt: "Реклама „Пари за 10 минути“ с оградена в дребен шрифт обща сума за връщане и ГПР" }],
  "m-chete-dogovor": [{ src: "/kak-da/pari-dogovor.webp", alt: "Договор с оградени в дребен шрифт неустойка и автоматично подновяване" }],
  "m-chete-smetka-tok": [{ src: "/kak-da/pari-smetka-tok.webp", alt: "Сметка за ток с оградени период, изразходвано количество и сума за плащане" }],
  "m-darenie-vnimanie": [{ src: "/kak-da/pari-darenie.webp", alt: "Страница за дарение с натиск „Дари веднага“ и обратно броене — първо проверете каузата" }],
  "m-domakinski-byudzhet": [{ src: "/kak-da/pari-byudzhet.webp", alt: "Тетрадка с месечен бюджет: пенсия, разходи и оградена сума, която остава" }],
  "m-evro-podgotovka2": [{ src: "/kak-da/pari-shpargalka-kurs.webp", alt: "Жълта бележка с бърза сметка: 1 € = 1,95583 лв, около 2 лв, и български евромонети" }],
  "m-kakvo-e-lihva": [{ src: "/kak-da/pari-lihva-gpr.webp", alt: "Две оферти за заем от 1 000 € със сравнение на месечна вноска, обща сума и ГПР" }],
  "m-nadplaten-prava": [{ src: "/kak-da/pari-reklamatsia.webp", alt: "Писмено искане към търговец за връщане на надплатена сума от 20,00 €" }],
  "m-nalozhen-platezh2": [{ src: "/kak-da/pari-tovaritelnitsa.webp", alt: "Товарителница с оградена сума за наложен платеж 34,90 €" }],
  "m-nasledstvo-stapki": [{ src: "/kak-da/pari-nasledstvo.webp", alt: "Примерно удостоверение за наследници" }],
  "m-nenuzhni-abonamenti": [{ src: "/kak-da/pari-abonamenti.webp", alt: "Списък с абонаменти в телефона с бутон „Откажи“ до един от тях" }],
  "m-pazia-egn": [{ src: "/kak-da/pari-egn-chat.webp", alt: "Съобщение от непознат, който иска снимка на личната карта и ЕГН — не изпращайте" }],
  "m-prava-pacient": [{ src: "/kak-da/pari-prava-pacient.webp", alt: "Табло „Правата ми като пациент“ с петте основни права" }],
  "m-saveti-pestene": [{ src: "/kak-da/pari-spisak-pazar.webp", alt: "Списък за пазар в телефона — пазарувайте само от списъка" }],
  "m-spestiavane-banka": [{ src: "/kak-da/pari-spestyavane-nova.webp", alt: "Условия на спестовна сметка в банка с оградена лихва" }],
  "m-zaveshtanie-pulnomoshtno": [{ src: "/kak-da/pari-pulnomoshtno.webp", alt: "Примерно пълномощно с оградено за какво точно се дава и саморъчно завещание" }],
  "money-3d-secure": [{ src: "/kak-da/pari-3ds-sms.webp", alt: "SMS от банката с еднократен код за потвърждение на онлайн плащане" }],
  "money-evro-podgotovka": [{ src: "/kak-da/pari-shpargalka-kurs.webp", alt: "Жълта бележка с бърза сметка: 1 € = 1,95583 лв, около 2 лв, и български евромонети" }],
  "money-limit-karta": [{ src: "/kak-da/pari-limit-karta.webp", alt: "Банково приложение: дневни лимити за теглене и плащане с картата и бутон „Запази“" }],
  "money-nalozhen-platezh": [{ src: "/kak-da/pari-nalozhen-izbor.webp", alt: "Екран за плащане при поръчка с избран начин „Наложен платеж“" }],
  "money-teglene-bez-karta": [{ src: "/kak-da/pari-teglene-gishe.webp", alt: "Примерен документ за теглене в брой на гише с оградено място за подпис" }],
  "pn-dobavka-pensiya": [{ src: "/kak-da/pari-noi-obazhdane.webp", alt: "Обаждане към НОИ на 0700 14 802 за добавки към пенсията" }],
  "pn-dokumenti-socialna-pomosht": [{ src: "/kak-da/pari-dokumenti-spisak.webp", alt: "Списък с документите за социална помощ: лична карта, доходи, молба-декларация, решение на ТЕЛК" }],
  "pn-kade-da-pitam": [{ src: "/kak-da/pari-kontakti-pensii.webp", alt: "Контакти в телефона: НОИ 0700 14 802, Социално подпомагане и общината" }],
  "pn-pomosht-otoplenie": [{ src: "/kak-da/pari-otoplenie-molba.webp", alt: "Примерна молба-декларация за целева помощ за отопление" }],
  "pn-socialen-patronazh": [{ src: "/kak-da/pari-patronazh-obazhdane.webp", alt: "Обаждане към социалния патронаж на общината" }],
  "pn-telk": [{ src: "/kak-da/pari-telk-napravlenie.webp", alt: "Примерно направление от личния лекар за ТЕЛК" }],
  // ── Документи, плащания и транспорт (картинки от scripts/howto-mockups/gen-dokumenti.js) ──
  "c-adresna-registraciya": [{ src: "/kak-da/dokumenti-adresna-registraciya.webp", alt: "Примерна страница на общината за адресна регистрация: какво да носите" }],
  "c-bastun-rolator": [{ src: "/kak-da/dokumenti-bastun-rolator.webp", alt: "Проходилка: височина на дръжката и гумички на краката" }],
  "c-dostapen-transport-uvrejdane": [{ src: "/kak-da/dokumenti-dostapen-transport.webp", alt: "Примерна страница с достъпен транспорт и облекчения за хора с увреждания" }],
  "c-egov-kakvo-e": [{ src: "/kak-da/egov.webp", alt: "Примерна начална страница на портала за електронни услуги с търсене и категории" }],
  "c-elektronen-podpis2": [{ src: "/kak-da/dokumenti-elektronen-podpis2.webp", alt: "Подписване на документ с електронен подпис в мобилно приложение" }],
  "c-elektronna-recepta2": [{ src: "/kak-da/dokumenti-elektronna-recepta2.webp", alt: "SMS с номер на електронна рецепта, която получавате в аптеката с ЕГН" }],
  "c-hodia-noshtem-bezopasno": [{ src: "/kak-da/dokumenti-hodia-noshtem.webp", alt: "Съобщение до близък къде отивате вечер, със зареден телефон" }],
  "c-izgubena-lichna-karta": [{ src: "/kak-da/dokumenti-izgubena-lichna-karta.webp", alt: "Примерна бележка от полицията, че сте обявили загубата на личната карта" }],
  "c-kakvo-nosia-kola": [{ src: "/kak-da/dokumenti-kakvo-nosia-kola.webp", alt: "Бележка в телефона със списък какво да носите в колата" }],
  "c-lichna-karta-smiana": [{ src: "/kak-da/dokumenti-lichna-karta-smiana.webp", alt: "Талон за запазен час в МВР и старата лична карта, която носите при подмяна" }],
  "c-namaleniya-pensioneri-transport": [{ src: "/kak-da/dokumenti-namaleniya-pensioneri.webp", alt: "Примерна карта за пътуване с намаление за пенсионери и бележка къде да питате" }],
  "c-pasport-smiana": [{ src: "/kak-da/dokumenti-pasport-smiana.webp", alt: "Списък какво да носите за паспорт: час, лична карта, стар паспорт и платена такса" }],
  "c-pazia-dokumenti-spravka": [{ src: "/kak-da/dokumenti-pazia-dokumenti.webp", alt: "Папки с раздели за документи, които се пазят завинаги, дълго или докато тече гаранцията" }],
  "c-planiram-patuvane-lekar": [{ src: "/kak-da/dokumenti-planiram-patuvane-lekar.webp", alt: "Разписание на автобуса Бобов дол — Дупница и час за преглед при лекар" }],
  "c-povikam-pomosht-pat": [{ src: "/kak-da/dokumenti-pomosht-pat.webp", alt: "Любими контакти в телефона: пътна помощ и застраховател за повреда на пътя" }],
  "c-prava-potrebitel-spravka": [{ src: "/kak-da/dokumenti-prava-potrebitel.webp", alt: "Писмена рекламация към търговец по имейл с приложена касова бележка и гаранция" }],
  "c-presicham-ulica": [{ src: "/kak-da/dokumenti-presicham-ulica.webp", alt: "Пешеходна пътека и бележки как да пресичате безопасно" }],
  "c-pulnomoshtno-praviln": [{ src: "/kak-da/dokumenti-pulnomoshtno.webp", alt: "Примерно пълномощно: кой, на кого, за какво и за какъв срок дава право" }],
  "c-spodeleno-patuvane-kak": [{ src: "/kak-da/dokumenti-spodeleno-patuvane.webp", alt: "Обяви за споделено пътуване на сайта с маршрут, час и цена" }],
  "c-svetofar-znaci": [{ src: "/kak-da/dokumenti-svetofar-znaci.webp", alt: "Светофар за пешеходци: зелен и червен човек" }],
  "c-vidya-zlopoluka": [{ src: "/kak-da/dokumenti-svidetel-zlopoluka.webp", alt: "Набран номер 112 на телефона за съобщаване за катастрофа" }],
  "docs-chas-mvr": [{ src: "/kak-da/dokumenti-chas-mvr.webp", alt: "Примерна страница за запазване на час: избрани ден и час за подмяна на лична карта" }],
  "docs-elektronen-podpis": [{ src: "/kak-da/dokumenti-elektronen-podpis.webp", alt: "Примерна страница за заявяване на електронен подпис — на устройство или в мобилно приложение" }],
  "docs-lichna-karta-srok": [{ src: "/kak-da/dokumenti-lichna-karta-srok.webp", alt: "Къде на лицевата страна на личната карта пише „Валидна до“ (примерна карта)" }],
  "kak-da-platya-mestni-danatsi-onlayn": [{ src: "/kak-da/dokumenti-mestni-danatsi-onlayn.webp", alt: "Примерен общински портал: задължения за данък сгради и такса смет и бутон „Плащане с карта“" }],
  "kak-da-platya-na-kasa-easypay": [{ src: "/kak-da/dokumenti-kasa-easypay.webp", alt: "Сметка за ток с партиден номер, банкноти в евро и бележка за плащане в брой на каса" }],
  "t-bagaj-patuvane": [{ src: "/kak-da/dokumenti-bagaj-patuvane.webp", alt: "Свален на телефона билет за автобус и напълно заредена батерия" }],
  "t-povikam-taksi": [{ src: "/kak-da/dokumenti-povikam-taksi.webp", alt: "Контакт „Такси“ в телефона с бутон за обаждане" }],
  "x-eavtentikaciya": [{ src: "/kak-da/dokumenti-eavtentikaciya.webp", alt: "Примерна страница за вход в е-услуга: електронен подпис, ПИК или електронна лична карта" }],
  "x-glasuvane-informirano": [{ src: "/kak-da/dokumenti-glasuvane-informirano.webp", alt: "Избирателна секция с урни и кабини и бележки за информирано гласуване" }],
  "x-izbiratelna-sekciya": [{ src: "/kak-da/polling-station.webp", alt: "Проверка на избирателната секция по ЕГН" }],
  // ── Технологии, смартфон, облак, достъпност, акаунти (картинки от scripts/howto-mockups/gen-tech.js) ──
  "akaunt-kakvo-e": [{ src: "/kak-da/tech-akaunt-meniu.webp", alt: "Меню на акаунта в Gmail с имейл адреса, името и бутон за управление на акаунта" }],
  "akaunt-pazya-paroli": [{ src: "/kak-da/tech-tetradka-paroli.webp", alt: "Снимка на малка тетрадка с химикалка — в такава може да записвате паролите си" }],
  "akaunt-smenya-parola": [{ src: "/kak-da/tech-parola-smyana.webp", alt: "Екран „Парола“ с полета за стара и нова парола и бутон „Смяна на парола“" }],
  "akaunt-vlizam": [{ src: "/kak-da/tech-vhod-akaunt.webp", alt: "Екран за вход с попълнени имейл и парола и подчертан бутон „Вход“" }],
  "akaunt-zabravena-parola-gmail": [{ src: "/kak-da/tech-parola-zabravena.webp", alt: "Страница за вход в Google с подчертан бутон „Забравена парола?“" }],
  "dostap-112-uvreden-sluh": [{ src: "/kak-da/tech-112-uvreden-sluh.webp", alt: "Примерна страница за регистрация за хора с увреден слух и говор с бутон „Изпратете заявката“" }],
  "dostap-golyam-tekst-chetene": [{ src: "/kak-da/tech-dostap-golyam-tekst.webp", alt: "Лентата „Настройки за четене“ на сайта с три бутона „А“; подчертано е най-голямото" }],
  "dostap-po-lesno-dokosvane": [{ src: "/kak-da/tech-dostap-lesno-dokosvane.webp", alt: "Лентата „Настройки за четене“ с включен режим „По-лесно докосване“ и по-големи бутони" }],
  "dostap-svarzvane-bez-obazhdane": [{ src: "/kak-da/tech-svarzvane-bez-obazhdane.webp", alt: "Страница на услуга със записани телефон, имейл, адрес и работно време; подчертан е имейлът" }],
  "e2-fabrichni-nastroyki": [{ src: "/kak-da/tech-fabrichni.webp", alt: "Екран „Фабрични настройки“ с предупреждение, че всичко ще се изтрие" }],
  "e2-vtora-ruka-telefon": [{ src: "/kak-da/tech-vtora-raka.webp", alt: "Телефон, който иска вход с чужд Google акаунт — знак, че не е отписан" }],
  "kak-da-instaliram-prilozhenie": [{ src: "/kak-da/tech-instaliraj-prilozhenie.webp", alt: "Страница на приложение в Play Магазин с подчертан бутон „Инсталирай“" }],
  "kak-da-napravya-profil-facebook": [{ src: "/kak-da/tech-facebook-registraciya.webp", alt: "Екран „Как се казвате?“ във Facebook с полета за име и фамилия" }],
  "kak-da-napravya-silna-parola": [{ src: "/kak-da/tech-silna-parola.webp", alt: "Поле за нова парола от няколко думи и цифра, оценена като „Силна парола“" }],
  "kak-da-napravya-viber": [{ src: "/kak-da/tech-viber-registraciya.webp", alt: "Viber: въвеждане на телефонния номер и бутон „Продължи“" }],
  "kak-da-nastroya-google-akaunt-android": [{ src: "/kak-da/tech-google-akaunt-android.webp", alt: "Настройки „Добавяне на акаунт“ с подчертан избор „Google“" }],
  "kak-da-se-obadya-video-blizki": [{ src: "/kak-da/tech-video-obazhdane.webp", alt: "Разговор във Viber с подчертана иконка на камера за видео обаждане" }],
  "kak-da-suzdam-apple-id-iphone": [{ src: "/kak-da/tech-apple-id.webp", alt: "Настройки на iPhone с подчертан ред „Вписване в iPhone“" }],
  "kak-da-suzdam-imejl-gmail": [{ src: "/kak-da/tech-gmail-sazdavane.webp", alt: "Страница „Създаване на акаунт в Google“ с полета за име и фамилия и бутон „Напред“" }],
  "kak-da-tursya-novini-internet": [{ src: "/kak-da/tech-tarsene-novini.webp", alt: "Браузър с търсене „новини Бобов дол“ и списък с резултати" }],
  "kak-da-vlyaza-v-internet-wifi": [{ src: "/kak-da/tech-wifi-svarzvane.webp", alt: "Wi-Fi настройки: прозорец за парола на избраната мрежа и подчертан бутон „Свържи“" }],
  "kakvo-e-brauzar": [{ src: "/kak-da/tech-brauzar.webp", alt: "Начален екран на телефона с подчертана иконка на браузъра Chrome" }],
  "kakvo-e-link": [{ src: "/kak-da/tech-link.webp", alt: "Съобщение със син подчертан текст — линк, който се докосва веднъж" }],
  "kakvo-e-messenger": [{ src: "/kak-da/tech-messenger.webp", alt: "Messenger: списък с чатове; докосвате човек, за да му пишете или се обадите" }],
  "mem-arhiv-snimki": [{ src: "/kak-da/tech-arhiv-snimki.webp", alt: "Настройки за архивиране в Google Снимки: включен превключвател и качване само на Wi-Fi" }],
  "mem-dublirani": [{ src: "/kak-da/tech-dublirani.webp", alt: "Галерия с две отметнати еднакви снимки и подчертан бутон „Изтрий“" }],
  "mem-golqm-fayl-link": [{ src: "/kak-da/tech-golyam-fayl-link.webp", alt: "Меню на видео файл в Google Диск с подчертани „Сподели“ и „Копирай линк“" }],
  "mem-icloud-iphone": [{ src: "/kak-da/tech-icloud.webp", alt: "Екран iCloud на iPhone с превключватели за Снимки, Контакти и резервно копие" }],
  "mem-kakvo-e-oblak": [{ src: "/kak-da/tech-oblak-snimki.webp", alt: "Google Снимки със снимки и подчертана иконка на облак — архивирането е завършено" }],
  "mem-prehvarlya-kompyutar": [{ src: "/kak-da/tech-usb-fajlove.webp", alt: "Прозорец „Използване на USB за“ с подчертан избор „Прехвърляне на файлове“" }],
  "net-bavna-vrazka": [{ src: "/kak-da/tech-wifi-slab-signal.webp", alt: "Wi-Fi настройки: свързаната мрежа има слаб сигнал (една чертичка)" }],
  "net-falshiva-wifi": [{ src: "/kak-da/tech-wifi-opasna.webp", alt: "Списък с Wi-Fi мрежи; подчертана е отворена мрежа без парола и със странно име" }],
  "t2-kakvo-e-akaunt2": [{ src: "/kak-da/tech-akaunt-sigurnost.webp", alt: "Сигурност на Google акаунта с подчертана „Защита в две стъпки“" }],
  "t2-kakvo-e-gb": [{ src: "/kak-da/tech-gb-danni.webp", alt: "Екран „Употреба на данни“: колко GB са изразходвани и кои приложения ги ползват най-много" }],
  "t2-kakvo-e-oblak2": [{ src: "/kak-da/tech-oblak-drive.webp", alt: "Google Диск със списък от папки и файлове — „сейф“ в интернет" }],
  "t2-kakvo-e-parola-silna": [{ src: "/kak-da/tech-silna-parola.webp", alt: "Поле за нова парола от няколко думи и цифра, оценена като „Силна парола“" }],
  "t2-kakvo-e-pdf": [{ src: "/kak-da/tech-pdf.webp", alt: "PDF документ (примерна сметка), отворен на телефона" }],
  "t2-kakvo-e-roditelski-kontrol": [{ src: "/kak-da/tech-roditelski-kontrol.webp", alt: "Настройки „Цифрово благополучие и родителски контрол“ с подчертан „Родителски контрол“" }],
  "t2-kakvo-e-ruter": [{ src: "/kak-da/tech-ruter.webp", alt: "Снимка на домашен рутер с лампички и етикет с паролата за Wi-Fi" }],
  "t2-kakvo-e-sim": [{ src: "/kak-da/tech-sim.webp", alt: "Снимка на СИМ карта с чип" }],
  "t2-kakvo-e-smart-tv": [{ src: "/kak-da/tech-smart-tv.webp", alt: "Смарт телевизор с връзка към Wi-Fi и приложения YouTube, Netflix и други" }],
  "t2-kakvo-e-tablet": [{ src: "/kak-da/tech-tablet.webp", alt: "Снимка на ръце, които държат таблет с голям екран" }],
  "t2-kakvo-e-vpn-prosto": [{ src: "/kak-da/tech-vpn.webp", alt: "Настройки за връзка с подчертан ред „VPN“ — не е нужен за обикновена употреба" }],
  "t2-poiskai-pomosht-blizak": [{ src: "/kak-da/tech-pomosht-blizak.webp", alt: "Видео разговор с близък, на когото можете да покажете екрана или да опишете какво виждате" }],
  "t2-prilozhenie-vs-sayt": [{ src: "/kak-da/tech-prilozhenie-sayt.webp", alt: "Един до друг: сайт на банка в браузъра и иконата на нейното приложение на началния екран" }],
  "x-spodelyane-ekran": [{ src: "/kak-da/tech-spodelyane-ekran.webp", alt: "Видео разговор с подчертан бутон „Сподели екрана“" }],
  // ── Безопасност, измами, общуване и хобита (картинки от scripts/howto-mockups/gen-bezopasnost.js) ──
  "falshivi-imejli-fishing": [{ src: "/kak-da/bezopasnost-fishing-imejl.webp", alt: "Фишинг имейл със странен адрес на подателя, заплаха за спиране на акаунта и бутон за въвеждане на данни" }],
  "i-falshivi-novini": [{ src: "/kak-da/bezopasnost-falshiva-novina.webp", alt: "Фалшива новина с крещящо заглавие на непознат сайт и стара дата на публикуване" }],
  "i-iztegliam-bezopasno": [{ src: "/kak-da/bezopasnost-prikachen-fayl.webp", alt: "Имейл с неочакван прикачен файл от непознат подател — не го отваряйте" }],
  "i-iztriya-akaunt": [{ src: "/kak-da/bezopasnost-iztrivane-akaunt.webp", alt: "Настройки „Акаунт“ с опцията „Изтриване на акаунт“ най-долу" }],
  "i-obshtestven-wifi-bezopasnost": [{ src: "/kak-da/bezopasnost-wifi-spisak.webp", alt: "Списък с Wi-Fi мрежи, в който отворената обществена мрежа е подчертана" }],
  "i-proveria-tvardenie": [{ src: "/kak-da/bezopasnost-proveri-google.webp", alt: "Резултати от Google за проверка на твърдение в няколко различни източника" }],
  "i-soc-mreji-privatnost": [{ src: "/kak-da/bezopasnost-poveritelnost.webp", alt: "Настройки за поверителност във Facebook — избор кой вижда публикациите Ви" }],
  "i-vazstanovya-parola2": [{ src: "/kak-da/bezopasnost-zabravena-parola.webp", alt: "Екран за вход с подчертан линк „Забравена парола?“" }],
  "iz-izmamnik-na-vratata": [{ src: "/kak-da/bezopasnost-izmamnik-vrata.webp", alt: "Входна врата със сигурна верига — не отваряйте на непознат и не давайте пари на вратата" }],
  "iz-kakvo-ako-me-izmamiha": [{ src: "/kak-da/bezopasnost-dokazatelstva.webp", alt: "SMS съобщения от измамник, които запазвате като доказателство" }],
  "iz-ne-davay-karta": [{ src: "/kak-da/atm-safe.webp", alt: "Ръка прикрива клавиатурата на банкомат, докато на екрана се въвежда ПИН" }],
  "kak-da-razpoznavam-onlayn-izmami": [{ src: "/kak-da/bezopasnost-spesha-viber.webp", alt: "Съобщение във Viber от непознат номер, който настоява спешно да преведете пари — знак за измама" }],
  "kak-da-vnimavam-falshivi-magazini": [{ src: "/kak-da/scam-fake-shop.webp", alt: "Фалшив онлайн магазин с нереално ниска цена и плащане само по предварителна сметка" }],
  "kak-rabotyat-bankata-policiyata": [{ src: "/kak-da/bezopasnost-vhodyashto.webp", alt: "Входящо обаждане от непознат номер, представящ се за банка — затворете и звъннете сами на официалния номер" }],
  "kakvo-da-pravya-ako-me-e-strah": [{ src: "/kak-da/bezopasnost-lyubimi.webp", alt: "Любими контакти в телефона — дъщеря, син, банката и спешният номер 112, на които да се обадите" }],
  "o-chitalishte-deynosti": [{ src: "/kak-da/bezopasnost-chitalishte.webp", alt: "Страница „Събития“ на сайта със занимания в читалището — хор, ръкоделие, беседи" }],
  "o-dobrovolets-stana": [{ src: "/kak-da/bezopasnost-dobrovolets.webp", alt: "Страница „Доброволци в помощ“ на сайта с бутон „Станете доброволец“" }],
  "o-namerya-stari-priyateli": [{ src: "/kak-da/bezopasnost-fb-tarsene.webp", alt: "Търсене на човек във Facebook със снимки и брой общи приятели" }],
  "o-pomosht-sased": [{ src: "/kak-da/bezopasnost-sased.webp", alt: "Съобщение до възрастна съседка с предложение да ѝ вземете нещо от магазина" }],
  "o-pozdrav-online": [{ src: "/kak-da/bezopasnost-pozdrav.webp", alt: "Съобщение с поздрав за рожден ден и картичка във Viber, готово за изпращане" }],
  "o-prazenstva-online": [{ src: "/kak-da/bezopasnost-sluzhba-na-zhivo.webp", alt: "Църковна служба на живо в YouTube с бутон за пускане и надпис „На живо“" }],
  "o-spodelya-spomen": [{ src: "/kak-da/bezopasnost-spomen.webp", alt: "Форма „Споделете спомен“ на сайта със заглавие, име и текст на спомена" }],
  "o-spravia-se-samota": [{ src: "/kak-da/bezopasnost-sedmica.webp", alt: "Календар на седмицата с разходка, разговор с близък, служба и занимание в читалището" }],
  "o-vrazka-blizki": [{ src: "/kak-da/bezopasnost-viber-semeystvo.webp", alt: "Чат във Viber с дъщерята — снимка, съобщения и бутон за видео разговор" }],
  "s-egov-bezopasnost": [{ src: "/kak-da/bezopasnost-egov-adres.webp", alt: "Браузър с официалния адрес egov.bg, през който влизате в държавните е-услуги" }],
  "s-kakvo-da-pravia-izmama": [{ src: "/kak-da/bezopasnost-nabirane-112.webp", alt: "Набран номер 112 на клавиатурата на телефона и бутон за обаждане" }],
  "s-spri-nezhelani-obazhdaniya": [{ src: "/kak-da/block-number.webp", alt: "Блокиране на нежелан номер — задържате върху него в „Скорошни“ и избирате „Блокирай номера“" }],
  "safe-lichni-danni": [{ src: "/kak-da/bezopasnost-iskat-danni.webp", alt: "Непознат във Viber, който иска снимка на личната карта и ЕГН — не ги пращайте" }],
  "safe-proverya-link": [{ src: "/kak-da/bezopasnost-skraten-link.webp", alt: "SMS от непознат номер със съкратен и странен линк — не го натискайте" }],
  "x-antivirus": [{ src: "/kak-da/bezopasnost-play-zashtita.webp", alt: "Екран „Play Защита“ с надпис, че устройството е защитено и няма вредни приложения" }],
  "x-opasni-prilozheniya": [{ src: "/kak-da/bezopasnost-play-stranitsa.webp", alt: "Страница на приложение в Play Маркет с оценка и брой изтегляния, които проверявате преди инсталиране" }],
  "x-virus-telefon": [{ src: "/kak-da/bezopasnost-fals-virus.webp", alt: "Страница с фалшиво предупреждение, че телефонът е заразен с вируси — не натискайте бутона" }],
  "z-gradinarstvo-saveti": [{ src: "/kak-da/bezopasnost-gradina-saveti.webp", alt: "Търсене в Google „как да отглеждам домати“ с видео урок и съвети за градината" }],
  "z-prazni-igri-vnuci": [{ src: "/kak-da/bezopasnost-igra-poznai.webp", alt: "Видео разговор с внучето, което показва предмет пред камерата за играта „познай какво държа“" }],
  "z-sluham-cherkva": [{ src: "/kak-da/bezopasnost-cherkovni-pesni.webp", alt: "Резултати в YouTube за „църковни песнопения“ с хор от манастир" }],
  "z-slusham-muzika2": [{ src: "/kak-da/youtube-search.webp", alt: "Търсене на песен или изпълнител в YouTube" }],
  "z-virtualni-obikolki": [{ src: "/kak-da/bezopasnost-virtualna-obikolka.webp", alt: "Страница с виртуална обиколка на музей със стрелки за разглеждане на залите" }],
  "zlatni-pravila-bezopasnost": [{ src: "/kak-da/bezopasnost-zlatni-pravila.webp", alt: "Бележка в телефона със златните правила за безопасност — какво никога да не правите" }],
};

export function getIllustrations(slug: string): Illustration[] {
  return MAP[slug] ?? [];
}
