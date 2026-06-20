// Карта „ръководство (slug) → примерни екрани". Картинките са СТИЛИЗИРАНИ
// пресъздавания на интерфейса на приложенията (Viber, Messenger, WhatsApp,
// Facebook) — близки до реалния вид, за да разпознаят възрастните хора какво да
// търсят. Файловете са в public/kak-da/ и се генерират от
// scripts/howto-mockups/gen.js. Това е чисто добавъчен слой — не пипа базата.

export type Illustration = { src: string; alt: string };

const MAP: Record<string, Illustration[]> = {
  // ── Viber ──
  "app-viber-tekst": [
    { src: "/kak-da/viber-pisane.png", alt: "Екран на Viber: чат с подчертан бутон за изпращане (стрелка)" },
  ],
  "app-viber-glasovo": [
    { src: "/kak-da/viber-glasovo.png", alt: "Екран на Viber с подчертан бутон микрофон за гласово съобщение" },
  ],
  "app-viber-grupa": [
    { src: "/kak-da/viber-grupa.png", alt: "Екран на Viber „Нова група“ с избор на участници" },
  ],
  "app-viber-lokaciya": [
    { src: "/kak-da/viber-prikachi.png", alt: "Меню за прикачване във Viber с подчертани „Локация“ и „Контакт“" },
  ],
  "app-viber-kontakt": [
    { src: "/kak-da/viber-prikachi.png", alt: "Меню за прикачване във Viber с подчертан бутон „Контакт“" },
  ],
  "app-viber-blokiram": [
    { src: "/kak-da/viber-blok.png", alt: "Екран с информация за контакт във Viber и подчертан бутон „Блокирай“" },
  ],
  "app-viber-iztriya-sub": [
    { src: "/kak-da/viber-iztrij.png", alt: "Меню при задържане на съобщение с подчертано „Изтрий“" },
  ],
  "app-viber-procheteno": [
    { src: "/kak-da/viber-procheteno.png", alt: "Обяснение на отметките във Viber: изпратено, доставено, прочетено" },
  ],
  "app-emoji-stikeri": [
    { src: "/kak-da/viber-emoji.png", alt: "Панел с емоджи и стикери в чат приложение" },
  ],
  "app-zaglushi-chat": [
    { src: "/kak-da/viber-zaglushi.png", alt: "Прозорец за заглушаване на известията от група" },
  ],
  // ── Messenger ──
  "app-messenger-glasovo": [
    { src: "/kak-da/messenger.png", alt: "Екран на Messenger с подчертан бутон микрофон" },
  ],
  // ── WhatsApp ──
  "app-whatsapp": [
    { src: "/kak-da/whatsapp.png", alt: "Чат екран на WhatsApp (зелено приложение)" },
    { src: "/kak-da/whatsapp-registraciya.png", alt: "Регистрация в WhatsApp с въвеждане на телефонен номер" },
  ],
  // ── Снимки от чат ──
  "ph-zapazya-ot-chat": [
    { src: "/kak-da/chat-zapazi.png", alt: "Снимка в чат с подчертан бутон за запазване в галерията" },
  ],
  // ── Facebook ──
  "fb-kakvo-e": [
    { src: "/kak-da/fb-feed.png", alt: "Начален екран (емисия) на Facebook" },
  ],
  "fb-publikuvai": [
    { src: "/kak-da/fb-publikuvai.png", alt: "Създаване на публикация във Facebook с подчертан бутон „Публикувай“" },
  ],
  "fb-haresai-komentar": [
    { src: "/kak-da/fb-haresai.png", alt: "Публикация във Facebook с подчертан бутон „Харесвам“" },
  ],
  "fb-nameri-priyatel": [
    { src: "/kak-da/fb-priatel.png", alt: "Търсене на човек във Facebook с бутон „Добави приятел“" },
  ],
  "fb-poveritelnost": [
    { src: "/kak-da/fb-poveritelnost.png", alt: "Настройка кой вижда публикациите във Facebook" },
  ],
  "safe-falshiv-profil-fb": [
    { src: "/kak-da/fb-falshiv.png", alt: "Признаци за фалшив профил във Facebook" },
  ],
  "akaunt-zabravena-parola-fb": [
    { src: "/kak-da/fb-parola.png", alt: "Екран за възстановяване на забравена парола за Facebook" },
  ],

  // ── Обаждания и контакти ──
  "kak-da-otgovorya-na-obazhdane": [
    { src: "/kak-da/call-incoming.png", alt: "Входящо обаждане: зелен бутон за приемане, червен за отказ" },
  ],
  "kak-da-zapisha-nov-kontakt": [
    { src: "/kak-da/contact-new.png", alt: "Екран за запис на нов контакт с поле за име и телефон" },
  ],
  "kak-da-se-obadya-na-kontakt": [
    { src: "/kak-da/dial-contact.png", alt: "Списък с контакти и зелена слушалка за обаждане" },
  ],
  "kak-da-napisha-sms": [
    { src: "/kak-da/sms-new.png", alt: "Писане на SMS с подчертан бутон за изпращане" },
  ],
  "set-propusnati": [
    { src: "/kak-da/call-missed.png", alt: "Списък с обаждания, пропуснатото е в червено" },
  ],

  // ── Имейл (Gmail) ──
  "mail-otvarya": [
    { src: "/kak-da/mail-inbox.png", alt: "Входяща кутия на Gmail със списък писма" },
  ],
  "mail-pisha": [
    { src: "/kak-da/mail-compose.png", alt: "Писане на имейл с подчертан бутон за изпращане" },
  ],
  "mail-otgovor": [
    { src: "/kak-da/mail-compose.png", alt: "Отговор на имейл с бутон за изпращане" },
  ],
  "mail-prikachi": [
    { src: "/kak-da/mail-attach.png", alt: "Прикачване на снимка към имейл (кламер)" },
  ],
  "mail-spam": [
    { src: "/kak-da/mail-spam.png", alt: "Имейл-измама (спам) с предупреждение и бутон за изтриване" },
  ],

  // ── Банкомат, карта, е-услуги ──
  "kak-da-izteglya-pari-bankomat": [
    { src: "/kak-da/atm.png", alt: "Екран на банкомат за избор на сума" },
  ],
  "bezopasnost-na-bankomata": [
    { src: "/kak-da/atm-safe.png", alt: "Прикриване на ПИН с ръка на банкомат" },
  ],
  "kakvo-da-ne-pravya-s-karta-pin": [
    { src: "/kak-da/atm-safe.png", alt: "Защита на ПИН кода при въвеждане" },
  ],
  "kak-da-plashtam-s-karta-magazin": [
    { src: "/kak-da/pos.png", alt: "Плащане с карта на POS терминал (допиране)" },
  ],
  "izgubih-kartata-kakvo-da-pravya": [
    { src: "/kak-da/card-lost.png", alt: "Спешни стъпки при изгубена карта и обаждане до банката" },
  ],
  "shop-porchka": [
    { src: "/kak-da/shop-order.png", alt: "Поръчка в онлайн магазин с бутон „Купи сега“" },
  ],
  "shop-prosledya-pratka": [
    { src: "/kak-da/shop-track.png", alt: "Проследяване на пратка с Еконт по номер на товарителница" },
  ],
  "docs-egov": [
    { src: "/kak-da/egov.png", alt: "Вход в електронните услуги на egov.bg" },
  ],
  "docs-zdravno-dosie": [
    { src: "/kak-da/health-record.png", alt: "Електронно здравно досие с рецепти и прегледи" },
  ],
  "docs-elektronna-recepta": [
    { src: "/kak-da/health-record.png", alt: "Електронни рецепти в здравното досие" },
  ],
  "docs-noi-pensiya": [
    { src: "/kak-da/noi-pension.png", alt: "Проверка на пенсията онлайн (НОИ)" },
  ],
  "docs-pik-nap": [
    { src: "/kak-da/pik-nap.png", alt: "Вход в НАП с персонален идентификационен код (ПИК)" },
  ],

  // ── Настройки и достъпност ──
  "set-wifi-toggle": [
    { src: "/kak-da/quick-wifi.png", alt: "Бърз панел с включване на Wi-Fi" },
  ],
  "kak-da-uvelicha-shrifta": [
    { src: "/kak-da/font-size.png", alt: "Плъзгач за увеличаване на шрифта" },
  ],
  "kak-da-usilya-namalya-zvuka": [
    { src: "/kak-da/volume.png", alt: "Промяна на силата на звука със страничните бутони" },
  ],
  "set-ne-bezpokoy": [
    { src: "/kak-da/dnd.png", alt: "Включване на режим „Не безпокойте“" },
  ],
  "set-tih-rezhim": [
    { src: "/kak-da/dnd.png", alt: "Тих режим в настройките за звук" },
  ],
  "set-screenshot": [
    { src: "/kak-da/screenshot.png", alt: "Правене на снимка на екрана с двата бутона" },
  ],
  "acc-uvelichenie-ekran": [
    { src: "/kak-da/magnifier.png", alt: "Лупа за увеличаване на екрана" },
  ],
  "day-lupa": [
    { src: "/kak-da/magnifier.png", alt: "Използване на телефона като лупа за дребен текст" },
  ],
  "acc-subtitri": [
    { src: "/kak-da/captions.png", alt: "Включване на субтитри при видео (бутон CC)" },
  ],
  "acc-svetkavica-zvunene": [
    { src: "/kak-da/flash-alerts.png", alt: "Светване на светкавицата при звънене" },
  ],
  "acc-chetene-na-glas": [
    { src: "/kak-da/screen-reader.png", alt: "Четене на глас на това, което е на екрана" },
  ],
  "acc-po-golemi-ikoni": [
    { src: "/kak-da/big-icons.png", alt: "По-големи икони и менюта" },
  ],
  "acc-kontrast": [
    { src: "/kak-da/contrast.png", alt: "Висок контраст и удебелен текст за по-добра четимост" },
  ],

  // ── Клавиатура ──
  "kb-kopiram-tekst": [
    { src: "/kak-da/kb-copy.png", alt: "Копиране на маркиран текст от менюто" },
  ],
  "kb-markiram-tekst": [
    { src: "/kak-da/kb-copy.png", alt: "Маркиране на част от текст" },
  ],
  "kb-postavya-tekst": [
    { src: "/kak-da/kb-paste.png", alt: "Поставяне на копиран текст" },
  ],
  "kb-smenya-klaviatura": [
    { src: "/kak-da/kb-lang.png", alt: "Смяна на езика на клавиатурата с глобусчето" },
  ],
  "kb-kirilica": [
    { src: "/kak-da/kb-lang.png", alt: "Писане на кирилица и смяна на езика" },
  ],
  "kb-cifri-znaci": [
    { src: "/kak-da/kb-numbers.png", alt: "Бутон „?123“ за цифри и знаци на клавиатурата" },
  ],
  "kb-diktovka": [
    { src: "/kak-da/kb-dictate.png", alt: "Диктуване на текст с микрофона на клавиатурата" },
  ],

  // ── Интернет и браузър ──
  "net-otvarya-sayt": [
    { src: "/kak-da/browser-url.png", alt: "Въвеждане на адрес в лентата на браузъра" },
  ],
  "net-siguren-sayt": [
    { src: "/kak-da/browser-secure.png", alt: "Катинарче за сигурен сайт в адресната лента" },
  ],
  "net-youtube-gledam": [
    { src: "/kak-da/youtube-watch.png", alt: "Гледане на видео в YouTube с бутон за пускане" },
  ],
  "fun-muzika-youtube": [
    { src: "/kak-da/youtube-watch.png", alt: "Слушане на музика през YouTube" },
  ],
  "net-youtube-tarsya": [
    { src: "/kak-da/youtube-search.png", alt: "Търсене на видео или песен в YouTube" },
  ],

  // ── Карти и навигация ──
  "map-adres": [
    { src: "/kak-da/maps-search.png", alt: "Търсене на адрес в Google Карти" },
  ],
  "map-upatvane": [
    { src: "/kak-da/maps-directions.png", alt: "Упътване до място със синя линия и бутон „Старт“" },
  ],
  "map-apteka": [
    { src: "/kak-da/maps-nearby.png", alt: "Аптеки и болници наблизо в Google Карти" },
  ],

  // ── Всекидневни помощници ──
  "day-vremeto": [
    { src: "/kak-da/weather.png", alt: "Прогноза за времето за днес и следващите дни" },
  ],
  "day-budilnik": [
    { src: "/kak-da/alarm.png", alt: "Настройка на будилник" },
  ],
  "day-napomnyane": [
    { src: "/kak-da/reminder.png", alt: "Напомняне за лекарства в определен час" },
  ],
  "day-qr": [
    { src: "/kak-da/qr.png", alt: "Сканиране на QR код с камерата" },
  ],
  "day-kalkulator": [
    { src: "/kak-da/calculator.png", alt: "Калкулатор на телефона" },
  ],

  // ── Снимки и галерия ──
  "ph-dokument": [
    { src: "/kak-da/camera.png", alt: "Правене на снимка с бутона на камерата" },
  ],
  "ph-izrezha": [
    { src: "/kak-da/photo-crop.png", alt: "Изрязване на снимка чрез дърпане на ъглите" },
  ],
  "ph-zavartya": [
    { src: "/kak-da/photo-rotate.png", alt: "Завъртане на снимка" },
  ],
  "ph-mnogo-snimki": [
    { src: "/kak-da/photo-multi.png", alt: "Избор и изпращане на няколко снимки наведнъж" },
  ],

  // ── Телефонни основи ──
  "kak-da-vklyucha-izklyucha-telefona": [{ src: "/kak-da/power.png", alt: "Изключване на телефона чрез задържане на бутона" }],
  "kak-da-zaklyucha-otklyucha-ekrana": [{ src: "/kak-da/lock-screen.png", alt: "Заключен екран — плъзнете нагоре за отключване" }],
  "kak-da-promenya-zvuka-na-zvunene": [{ src: "/kak-da/ringer-volume.png", alt: "Плъзгач за силата на звънене" }],
  "kak-da-uvelicha-yarkostta": [{ src: "/kak-da/brightness.png", alt: "Плъзгач за яркост на екрана в бързия панел" }],
  "kak-da-polzvam-glasovo-tarsene": [{ src: "/kak-da/voice-search.png", alt: "Гласово търсене с микрофон" }],
  "kak-da-vklyucha-fenercheto": [{ src: "/kak-da/flashlight.png", alt: "Включване на фенерчето от бързия панел" }],
  "kak-da-zaredya-bateriyata": [{ src: "/kak-da/battery.png", alt: "Батерия и пестене на заряд" }],

  // ── Настройки на телефона ──
  "set-samoleten-rezhim": [{ src: "/kak-da/airplane.png", alt: "Самолетен режим в бързия панел" }],
  "set-mobilni-danni": [{ src: "/kak-da/mobile-data.png", alt: "Включване на мобилните данни" }],
  "set-bluetooth": [{ src: "/kak-da/bluetooth.png", alt: "Свързване на слушалки или колона по Bluetooth" }],
  "set-premestya-ikona": [{ src: "/kak-da/move-icon.png", alt: "Преместване на икона на началния екран" }],
  "set-papka-prilozheniya": [{ src: "/kak-da/app-folder.png", alt: "Папка с приложения" }],
  "set-iztriya-prilozhenie": [{ src: "/kak-da/uninstall.png", alt: "Деинсталиране на приложение" }],
  "set-obnovya-prilozhenie": [{ src: "/kak-da/update-app.png", alt: "Обновяване на приложение в Google Play" }],
  "set-tarsya-prilozhenie": [{ src: "/kak-da/find-app.png", alt: "Намиране на приложение чрез търсене" }],
  "set-avto-zavartane": [{ src: "/kak-da/auto-rotate.png", alt: "Автоматично завъртане на екрана" }],
  "set-smenya-tapeta": [{ src: "/kak-da/wallpaper.png", alt: "Смяна на фона (тапета)" }],
  "set-data-chas": [{ src: "/kak-da/date-time.png", alt: "Настройка на дата и час" }],
  "set-smenya-ezik": [{ src: "/kak-da/phone-language.png", alt: "Смяна на езика на телефона" }],
  "set-prastov-otpechatak": [{ src: "/kak-da/fingerprint.png", alt: "Отключване с пръстов отпечатък" }],
  "set-otklyuchvane-lice": [{ src: "/kak-da/face-unlock.png", alt: "Отключване с лице" }],
  "set-smenya-pin": [{ src: "/kak-da/change-pin.png", alt: "Смяна на ПИН код за отключване" }],
  "set-izkl-izvestiya": [{ src: "/kak-da/app-notifications.png", alt: "Изключване на известията от приложение" }],
  "set-vibraciya": [{ src: "/kak-da/vibration.png", alt: "Включване и изключване на вибрацията" }],
  "set-blokiram-nomer": [{ src: "/kak-da/block-number.png", alt: "Блокиране на нежелан телефонен номер" }],
  "set-nasilstven-restart": [{ src: "/kak-da/force-restart.png", alt: "Рестартиране на заседнал телефон с двата бутона" }],
  "set-usilya-slushalka": [{ src: "/kak-da/call-volume.png", alt: "Усилване на звука по време на разговор" }],
  "set-data-usage": [{ src: "/kak-da/data-usage.png", alt: "Проверка на изхарчените мобилни данни" }],

  // ── Клавиатура и достъпност ──
  "kb-iztriya-duma": [{ src: "/kak-da/kb-backspace.png", alt: "Триене на буква с бутона backspace" }],
  "kb-golemi-bukvi": [{ src: "/kak-da/kb-caps.png", alt: "Писане с главни букви чрез стрелката Shift" }],
  "kb-avtokorekciya": [{ src: "/kak-da/kb-autocorrect.png", alt: "Включване и изключване на автоматичната корекция" }],
  "kb-po-golyama-klaviatura": [{ src: "/kak-da/kb-bigger.png", alt: "По-големи клавиши на клавиатурата" }],
  "kb-redaktiram-izprateno": [{ src: "/kak-da/kb-edit.png", alt: "Поправяне на текст чрез поставяне на курсора" }],
  "acc-ednoruchen": [{ src: "/kak-da/one-hand.png", alt: "Режим за ползване с една ръка" }],
  "acc-namali-yarkost-avto": [{ src: "/kak-da/auto-brightness.png", alt: "Автоматична яркост на екрана" }],

  // ── Интернет и браузър ──
  "net-otmetka-zapazya": [{ src: "/kak-da/bookmark-add.png", alt: "Запазване на сайт в любими със звездичката" }],
  "net-otvarya-otmetki": [{ src: "/kak-da/bookmarks-list.png", alt: "Списък със запазени отметки (любими сайтове)" }],
  "net-nov-tab": [{ src: "/kak-da/new-tab.png", alt: "Отваряне на нов раздел (таб) в браузъра" }],
  "net-zatvarya-tab": [{ src: "/kak-da/close-tab.png", alt: "Затваряне на раздел с хиксчето" }],
  "net-osvezha": [{ src: "/kak-da/refresh.png", alt: "Презареждане на страницата" }],
  "net-uvelicha-tekst": [{ src: "/kak-da/zoom-page.png", alt: "Уголемяване на текста на уеб страница с два пръста" }],
  "net-prevod-stranica": [{ src: "/kak-da/translate-page.png", alt: "Превод на чужда страница на български" }],
  "net-izteglya-snimka": [{ src: "/kak-da/save-image.png", alt: "Запазване на снимка от интернет" }],
  "net-iztriya-istoriya": [{ src: "/kak-da/clear-history.png", alt: "Изчистване на историята на браузъра" }],
  "net-svali-fayl": [{ src: "/kak-da/downloads.png", alt: "Списък с изтеглени файлове и снимки" }],

  // ── Имейл (Gmail) ──
  "mail-iztriya": [{ src: "/kak-da/mail-delete.png", alt: "Изтриване на имейл с кошчето" }],
  "mail-izprateni": [{ src: "/kak-da/mail-sent.png", alt: "Папка с изпратени имейли" }],
  "mail-tarsya": [{ src: "/kak-da/mail-search.png", alt: "Търсене на стар имейл" }],
  "mail-prepratya": [{ src: "/kak-da/mail-forward.png", alt: "Препращане на имейл на друг човек" }],
  "mail-kontakt": [{ src: "/kak-da/mail-add-contact.png", alt: "Добавяне на човек в контактите на имейла" }],

  // ── Карти и навигация ──
  "map-moya-lokaciya": [{ src: "/kak-da/my-location.png", alt: "Показване къде се намирате сега (синя точка)" }],
  "map-share": [{ src: "/kak-da/share-location.png", alt: "Споделяне на местоположението с близък" }],
  "map-transport": [{ src: "/kak-da/transit.png", alt: "Разписание на автобус до съседен град" }],

  // ── Всекидневни помощници ──
  "day-belezhka": [{ src: "/kak-da/notes.png", alt: "Записване на бележка" }],
  "day-kalendar": [{ src: "/kak-da/calendar-event.png", alt: "Добавяне на събитие в календара" }],
  "day-taymer": [{ src: "/kak-da/timer.png", alt: "Таймер за готвене" }],
  "day-hronometar": [{ src: "/kak-da/stopwatch.png", alt: "Хронометър за измерване на време" }],
  "day-prevod-duma": [{ src: "/kak-da/translate-word.png", alt: "Превод на дума или изречение" }],
  "day-namerya-telefon-doma": [{ src: "/kak-da/ring-phone.png", alt: "Звънване на телефона, за да го намерите вкъщи" }],
  "day-nosht-rezhim": [{ src: "/kak-da/night-mode.png", alt: "Нощен режим — по-щадящ за очите екран" }],
  "day-spisak-pazar": [{ src: "/kak-da/shopping-list.png", alt: "Списък за пазаруване с чек-боксове" }],

  // ── Безопасност и пари ──
  "safe-namerya-izguben-telefon": [{ src: "/kak-da/find-device.png", alt: "Намиране на изгубен телефон отдалеч" }],
  "safe-otkradnat-telefon": [{ src: "/kak-da/find-device.png", alt: "Заключване на изгубен или откраднат телефон" }],
  "safe-dvufaktorna": [{ src: "/kak-da/2fa.png", alt: "Двуфакторна защита — код по SMS освен паролата" }],
  "safe-falshiva-pechalba": [{ src: "/kak-da/fake-prize.png", alt: "Фалшива печалба/лотария — измама, която да затворите" }],
  "money-smetka-barcode": [{ src: "/kak-da/bill-barcode.png", alt: "Плащане на сметка на каса с баркод" }],
  "money-balans-prilozhenie": [{ src: "/kak-da/bank-balance.png", alt: "Проверка на баланса в банковото приложение" }],
  "money-prevod-blizak": [{ src: "/kak-da/bank-transfer.png", alt: "Превод на пари на близък през банковото приложение" }],

  // ── Онлайн пазаруване и забавление ──
  "shop-varna-stoka": [{ src: "/kak-da/return-item.png", alt: "Връщане на поръчана стока" }],
  "shop-sravnya-ceni": [{ src: "/kak-da/compare-prices.png", alt: "Сравняване на цени на един продукт" }],
  "shop-garanciya": [{ src: "/kak-da/receipt-warranty.png", alt: "Снимане и пазене на касова бележка за гаранция" }],
  "fun-radio-online": [{ src: "/kak-da/radio.png", alt: "Слушане на радио онлайн" }],
  "fun-audiokniga": [{ src: "/kak-da/audiobook.png", alt: "Слушане на аудиокнига или подкаст" }],
  "fun-tv-online": [{ src: "/kak-da/tv-online.png", alt: "Гледане на български телевизии онлайн" }],
  "fun-recepti": [{ src: "/kak-da/recipes.png", alt: "Намиране на рецепти за готвене" }],
  "fun-pasians": [{ src: "/kak-da/solitaire.png", alt: "Игра на пасианс" }],
  "fun-kniga-telefon": [{ src: "/kak-da/ebook.png", alt: "Четене на книга на телефона" }],
  "fun-stari-filmi": [{ src: "/kak-da/movies.png", alt: "Гледане на стари филми онлайн" }],
  "fun-snimki-vnuci": [{ src: "/kak-da/photo-timer.png", alt: "Обща снимка с таймер на камерата" }],
  "fun-grupov-video": [{ src: "/kak-da/group-video.png", alt: "Видео разговор с няколко души едновременно" }],

  // ── Снимки и галерия ──
  "ph-iztriya-snimka": [{ src: "/kak-da/photo-delete.png", alt: "Изтриване на снимка" }],
  "ph-fon": [{ src: "/kak-da/set-wallpaper.png", alt: "Задаване на снимка за фон на телефона" }],
  "ph-album": [{ src: "/kak-da/create-album.png", alt: "Създаване на албум със снимки" }],
  "ph-vazstanovya": [{ src: "/kak-da/photo-restore.png", alt: "Връщане на изтрита по грешка снимка от кошчето" }],
  "ph-slideshow": [{ src: "/kak-da/slideshow.png", alt: "Гледане на снимките като слайдшоу" }],
  "ph-spodelya": [{ src: "/kak-da/photo-share.png", alt: "Споделяне на снимка към приложение" }],
  "ph-uvelicha": [{ src: "/kak-da/photo-zoom.png", alt: "Приближаване (увеличаване) на снимка с два пръста" }],

  // ── Измами (примерни екрани с подчертани червени флагове) ──
  "iz-sms-s-link": [{ src: "/kak-da/scam-parcel-sms.png", alt: "Фалшив SMS за пратка с искане да платите по линк" }],
  "s-falshив-kurier-sms": [{ src: "/kak-da/scam-parcel-sms.png", alt: "Фалшив куриерски SMS — измама" }],
  "falshivi-sms-primeri": [{ src: "/kak-da/scam-fake-sms.png", alt: "Фалшив SMS, че сметката е блокирана — измама" }],
  "iz-falshivo-obazhdane-banka": [{ src: "/kak-da/scam-bank-call.png", alt: "Фалшиво обаждане „от банката“, което иска кодове" }],
  "s-falshив-zvun-banka": [{ src: "/kak-da/scam-bank-call.png", alt: "Фалшиво обаждане от името на банка — измама" }],
  "telefonni-izmami-falshiv-policay": [{ src: "/kak-da/scam-police-call.png", alt: "Фалшиво обаждане „от полицай/прокурор“ — измама" }],
  "iz-telefonna-izmama-vnuche": [{ src: "/kak-da/scam-grandchild.png", alt: "Измама „внук в беда“, който иска пари спешно" }],
  "izmama-vnuk-rodnina-v-beda": [{ src: "/kak-da/scam-grandchild.png", alt: "Съобщение от уж близък в беда, който иска пари — измама" }],
  "s-falshiv-profil-rodnina": [{ src: "/kak-da/scam-grandchild.png", alt: "Фалшив профил на роднина, който иска пари — измама" }],
  "t2-kakvo-e-otp-kod": [{ src: "/kak-da/scam-otp.png", alt: "SMS с еднократен код (OTP), който не бива да давате на никого" }],
  "x-falshiva-bankova-stranica": [{ src: "/kak-da/scam-phishing-bank.png", alt: "Фалшива страница на банка без катинарче и с грешен адрес" }],
  "iz-falshivi-saytove": [{ src: "/kak-da/scam-fake-shop.png", alt: "Фалшив онлайн магазин с нереална цена и само предплащане" }],
  "x-izmama-investicii": [{ src: "/kak-da/scam-investment.png", alt: "Измама с „инвестиция“, обещаваща бързи печалби" }],
  "m-vnimanie-investicii2": [{ src: "/kak-da/scam-investment.png", alt: "Измамна инвестиционна схема с гарантирана печалба" }],
  "x-izmama-lyubov": [{ src: "/kak-da/scam-love.png", alt: "Измама „любов онлайн“ — непознат, който иска пари" }],
  "s-remote-dostap-izmama": [{ src: "/kak-da/scam-remote.png", alt: "Измама с отдалечен достъп (инсталиране на приложение по чуждо нареждане)" }],
  "iz-proveri-obazhdane": [{ src: "/kak-da/scam-verify.png", alt: "Как да проверите дали обаждане или SMS е истинско" }],
  "money-falshiva-banknota": [{ src: "/kak-da/fake-banknote.png", alt: "Как да познаете истинска банкнота по защитните белези" }],
  "m-falshiva-banknota2": [{ src: "/kak-da/fake-banknote.png", alt: "Защитни белези на истинска банкнота" }],
  "iz-falshiva-nagrada": [{ src: "/kak-da/fake-prize.png", alt: "Фалшива печалба/награда — измама" }],
  "s-falshiva-pechalba-link": [{ src: "/kak-da/fake-prize.png", alt: "Фалшива печалба с линк — измама" }],
  "x-falshiva-pechalba-mreja": [{ src: "/kak-da/fake-prize.png", alt: "Фалшива печалба онлайн — измама" }],

  // ── Еврото (нагледни помагала) ──
  "e-dvoyni-ceni-ot-koga": [{ src: "/kak-da/euro-dual-price.png", alt: "Ценоразпис с двете цени — в левове и в евро" }],
  "e-zashto-dve-ceni": [{ src: "/kak-da/euro-dual-price.png", alt: "Защо цените се показват и в лева, и в евро" }],
  "e-poskapvane": [{ src: "/kak-da/euro-dual-price.png", alt: "Двойни цени — курсът е фиксиран, не губите пари" }],
  "e-zakraglyane": [{ src: "/kak-da/euro-receipt.png", alt: "Касова бележка с обща сума в левове и в евро" }],
  "e-resto": [{ src: "/kak-da/euro-receipt.png", alt: "Ресто по фиксирания курс на касовата бележка" }],
  "e-gruba-smetka": [{ src: "/kak-da/euro-rate.png", alt: "Бързо пресмятане: лев ≈ половин евро" }],
  "e-banknoti": [{ src: "/kak-da/euro-banknotes.png", alt: "Евробанкноти по цвят и номинал (примерни)" }],
  "e-moneti": [{ src: "/kak-da/euro-coins.png", alt: "Евромонети — от 1 цент до 2 евро" }],
  "e-stotinki": [{ src: "/kak-da/euro-coins.png", alt: "Евроцентове (стотинки) — монети" }],
  "e-bg-moneti": [{ src: "/kak-da/euro-coins.png", alt: "Български евромонети" }],
  "e-bankomat-evro": [{ src: "/kak-da/euro-atm.png", alt: "Банкомат, който дава евро" }],
  "e-kurs": [{ src: "/kak-da/euro-rate.png", alt: "Фиксиран курс 1 евро = 1,95583 лева" }],
  "e-kak-presmiatam": [{ src: "/kak-da/euro-rate.png", alt: "Как да пресметна цена от лева в евро" }],
  "e-kolko-struva": [{ src: "/kak-da/euro-rate.png", alt: "Колко струва нещо в евро" }],
  "e-leva-do-koga": [{ src: "/kak-da/euro-dual-period.png", alt: "До кога може да се плаща с левове в брой" }],
  "e-leva-vkashti": [{ src: "/kak-da/euro-dual-period.png", alt: "Какво да правя с левовете вкъщи — има време за обмяна" }],
  "e-falshivo-evro": [{ src: "/kak-da/fake-banknote.png", alt: "Как да позная фалшиво евро по защитните белези" }],

  // ── Още телефонни действия и приложения ──
  "kak-da-namerya-snimkite": [{ src: "/kak-da/gallery.png", alt: "Галерия със снимките, подредени по дата" }],
  "kak-da-zasnema-video": [{ src: "/kak-da/video-record.png", alt: "Заснемане на видео с червения бутон" }],
  "kak-da-napravya-snimka": [{ src: "/kak-da/camera.png", alt: "Правене на снимка с бутона на камерата" }],
  "e2-selfi-po-dobro": [{ src: "/kak-da/camera.png", alt: "Селфи с предната камера" }],
  "kak-da-se-obadya-viber-messenger": [{ src: "/kak-da/viber-call.png", alt: "Безплатно обаждане по Viber през интернет" }],
  "kak-da-se-video-obadya-viber-messenger": [{ src: "/kak-da/video-call.png", alt: "Видео обаждане с превключване на камерата" }],
  "kak-da-izpratya-snimka-klip-viber-messenger": [{ src: "/kak-da/viber-prikachi.png", alt: "Изпращане на снимка или клип от менюто за прикачване" }],
  "kak-da-izpratya-link": [{ src: "/kak-da/share-link.png", alt: "Копиране и изпращане на линк на сайт" }],
  "kak-da-kopiram-link": [{ src: "/kak-da/share-link.png", alt: "Копиране на линк на сайт" }],
  "kak-da-postavya-link": [{ src: "/kak-da/share-link.png", alt: "Поставяне на копиран линк" }],
  "e2-bързо-nabirane": [{ src: "/kak-da/speed-dial.png", alt: "Любими контакти за бързо обаждане" }],
  "e2-snimka-na-kontakt": [{ src: "/kak-da/contact-photo.png", alt: "Слагане на снимка на контакт" }],
  "e2-pryak-pat-sayt": [{ src: "/kak-da/home-shortcut.png", alt: "Пряк път към сайт на началния екран" }],
  "e2-glasova-belezhka": [{ src: "/kak-da/voice-memo.png", alt: "Запис на гласова бележка" }],
  "e2-chete-sms-na-glas": [{ src: "/kak-da/screen-reader.png", alt: "Четене на съобщенията на глас" }],
  "e2-avtomatichno-zakliuchvane": [{ src: "/kak-da/auto-lock.png", alt: "Автоматично заключване на екрана" }],
  "e2-spri-izskachashti-reklami": [{ src: "/kak-da/block-popups.png", alt: "Спиране на изскачащите реклами в браузъра" }],
  "e2-namali-danni-youtube": [{ src: "/kak-da/data-saver.png", alt: "Намаляване на разхода на данни при видео" }],
  "kak-da-zaredya-telefon-vaucher": [{ src: "/kak-da/recharge-voucher.png", alt: "Зареждане на предплатен телефон с ваучер" }],

  // ── Е-услуги и документи ──
  "c-proverya-globi-kat": [{ src: "/kak-da/check-fines.png", alt: "Проверка на глоби от КАТ онлайн" }],
  "c-proveria-izbiratelna-sekciya2": [{ src: "/kak-da/polling-station.png", alt: "Проверка на избирателната секция по ЕГН" }],
  "c-kopия-dokumenti": [{ src: "/kak-da/scan-document.png", alt: "Сканиране на документ с камерата" }],
  "c-udostoverenie-online": [{ src: "/kak-da/egov.png", alt: "Издаване на удостоверение онлайн през e-услуги" }],
  "c-proveria-zadalzheniya-nap": [{ src: "/kak-da/pik-nap.png", alt: "Проверка на данъчни задължения в НАП" }],
  "c-zdravno-dosie2": [{ src: "/kak-da/health-record.png", alt: "Електронно здравно досие" }],
  "pn-proveri-pensiya": [{ src: "/kak-da/noi-pension.png", alt: "Проверка на размера на пенсията (НОИ)" }],
  "x-povtorna-recepta": [{ src: "/kak-da/health-record.png", alt: "Повторна електронна рецепта от здравното досие" }],
  "x-plati-smetka-prilozhenie": [{ src: "/kak-da/bill-barcode.png", alt: "Плащане на сметка през приложение/баркод" }],
  "iz-bezopasno-teglene-pari": [{ src: "/kak-da/atm.png", alt: "Безопасно теглене на пари от банкомат" }],

  // ── Транспорт ──
  "c-bilet-gradski": [{ src: "/kak-da/transit-ticket.png", alt: "Билет за градски транспорт в телефона" }],
  "c-bilet-avtobus-mezhdugradski": [{ src: "/kak-da/transit-ticket.png", alt: "Билет за междуградски автобус" }],
  "c-taksi-bezopasno": [{ src: "/kak-da/taxi.png", alt: "Поръчка на такси през приложение" }],

  // ── Интернет безопасност ──
  "i-namerya-oficialen-sayt": [{ src: "/kak-da/browser-secure.png", alt: "Разпознаване на официален сайт по адреса и катинарчето" }],
  "i-chete-adres-url": [{ src: "/kak-da/browser-secure.png", alt: "Разчитане на адреса (URL) на сайт" }],
  "i-recognize-secure-payment": [{ src: "/kak-da/browser-secure.png", alt: "Сигурна страница за плащане (катинарче)" }],
  "i-izlizam-chuzhdo-ustroistvo": [{ src: "/kak-da/logout-device.png", alt: "Изход от акаунта на чуждо устройство" }],

  // ── Здраве, спешност и безопасност ──
  "x-telemedicina": [{ src: "/kak-da/telemedicine.png", alt: "Видео преглед при лекар (телемедицина)" }],
  "x-sos-buton": [{ src: "/kak-da/sos-button.png", alt: "SOS бутон за спешна помощ" }],
  "x-speshen-kontakt-zaklyuchen": [{ src: "/kak-da/emergency-contact-lock.png", alt: "Спешен контакт на заключения екран" }],

  // ── Поддръжка на телефона ──
  "x-zaklyuchi-prilozhenie": [{ src: "/kak-da/lock-app.png", alt: "Заключване на приложение с пръст/ПИН" }],
  "x-osvobodi-myasto-snimki": [{ src: "/kak-da/free-space.png", alt: "Освобождаване на място в паметта" }],
  "t2-osvobodi-myasto2": [{ src: "/kak-da/free-space.png", alt: "Освобождаване на място на телефона" }],
  "x-prehvarli-nov-telefon": [{ src: "/kak-da/transfer-phone.png", alt: "Прехвърляне на данни към нов телефон" }],
};

export function getIllustrations(slug: string): Illustration[] {
  return MAP[slug] ?? [];
}
