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
};

export function getIllustrations(slug: string): Illustration[] {
  return MAP[slug] ?? [];
}
