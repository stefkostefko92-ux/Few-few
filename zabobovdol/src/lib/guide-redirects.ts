// Оттеглени ръководства „Как да…“ — дубли на друго ръководство на същата тема
// (отговарят на същия въпрос с почти същите стъпки). Google вижда два адреса с
// едно и също съдържание и разделя сигналите им, затова оставяме ЕДНО канонично:
//  • старият адрес води с 301 към каноничния (src/middleware.ts);
//  • не влиза в sitemap.xml (src/app/sitemap.ts);
//  • сийдовете вече не го създават, а заварената база го скрива с миграциите
//    prisma/migrations/20261022120000_seo_retire_duplicates_placeholders (5-те с
//    еднакво заглавие) и 20261102120000_seo_retire_near_duplicate_guides (почти
//    еднаквите; там е и пренесеното в каноничните съдържание).
// Правило: остава по-пълното ръководство; при равни — това, което е на
// тематичната страница (/izmami, /pomoshti), после първоначалното (не копието от
// seed-c-*.ts / „…2“). Полезна стъпка или факт само в оттегленото се пренася в
// каноничното. Тестът src/lib/__tests__/guide-redirects.test.ts пази праг на
// сходство между сийдовете — нова двойка над него трябва да се обедини тук.
// Ключ = оттегленият slug, стойност = каноничният (никога сам оттеглен).
export const RETIRED_GUIDES: Readonly<Record<string, string>> = Object.freeze({
  // ── 22.10.2026: еднакво заглавие ──
  "z-televiziya-online2": "fun-tv-online",
  "c-proverya-globi-kat": "docs-kat-globi",
  "m-falshiva-banknota2": "money-falshiva-banknota",
  "c-zdravno-dosie2": "docs-zdravno-dosie",
  "c-elektronna-recepta2": "docs-elektronna-recepta",

  // ── 02.11.2026: почти еднакви (същият въпрос, същите стъпки) ──
  // Забавление и хобита
  "z-radio-online2": "fun-radio-online",
  "z-audiokniga2": "fun-audiokniga",
  "z-slusham-muzika2": "fun-muzika-youtube",
  "z-knigi-telefon2": "fun-kniga-telefon",
  "z-stari-filmi2": "fun-stari-filmi",
  "z-recepti-video2": "fun-recepti",
  "z-igri-pamet": "fun-pasians",
  "z-prognoza-zanimaniya": "day-vremeto",
  "z-snimki-album-spomeni": "ph-album",
  "o-grupov-video-semeystvo": "fun-grupov-video",
  // Телефон, настройки, понятия
  "t2-kakvo-e-samoleten": "set-samoleten-rezhim",
  "t2-kakvo-e-screenshot2": "set-screenshot",
  "t2-kakvo-e-bluetooth2": "set-bluetooth",
  "t2-svurzia-slushalki": "set-bluetooth",
  "day-kolonka-muzika": "set-bluetooth",
  "t2-kakvo-e-oblak2": "mem-kakvo-e-oblak",
  "t2-osvobodi-myasto2": "mem-osvobodya-myasto",
  "x-osvobodi-myasto-snimki": "mem-osvobodya-myasto",
  "t2-kakvo-e-akaunt2": "akaunt-kakvo-e",
  "t2-kakvo-e-parola-silna": "kak-da-napravya-silna-parola",
  "t2-poiskai-pomosht-blizak": "x-spodelyane-ekran",
  "ph-fon": "set-smenya-tapeta",
  "e2-chete-sms-na-glas": "acc-chetene-na-glas",
  "x-nochno-bezpokoene": "set-ne-bezpokoy",
  "e2-tih-nochem-vazhni": "set-ne-bezpokoy",
  "kak-da-se-video-obadya-viber-messenger": "kak-da-se-obadya-video-blizki",
  "safe-dvufaktorna": "akaunt-dve-stapki",
  "s-zashtita-dve-stapki2": "akaunt-dve-stapki",
  "i-iztegliam-bezopasno": "x-opasni-prilozheniya",
  // Измами (каноничното е на /izmami, където има такова)
  "s-kakvo-da-pravia-izmama": "iz-kakvo-ako-me-izmamiha",
  "safe-falshiva-pechalba": "iz-falshiva-nagrada",
  "x-falshiva-pechalba-mreja": "iz-falshiva-nagrada",
  "s-falshiva-pechalba-link": "iz-falshiva-nagrada",
  "izmama-vnuk-rodnina-v-beda": "iz-telefonna-izmama-vnuche",
  "d-ne-otvarjam-neznakomci": "iz-izmamnik-na-vratata",
  "kak-da-izteglya-pari-bankomat": "iz-bezopasno-teglene-pari",
  "falshivi-sms-primeri": "iz-sms-s-link",
  "s-falshiv-zvun-banka": "iz-falshivo-obazhdane-banka",
  "iz-ne-davay-karta": "kakvo-da-ne-pravya-s-karta-pin",
  "m-vnimanie-investicii2": "x-izmama-investicii",
  "s-falshiv-profil-rodnina": "safe-falshiv-profil-fb",
  // Пари, пазаруване, права
  "m-iban-prevod2": "money-iban",
  "m-nalozhen-platezh2": "money-nalozhen-platezh",
  "m-evro-podgotovka2": "money-evro-podgotovka",
  "m-sravniavam-ceni": "shop-sravnya-ceni",
  "m-vrashtane-stoka-prava": "shop-varna-stoka",
  "m-plati-smetka-easypay": "kak-da-platya-na-kasa-easypay",
  "m-nadplaten-prava": "c-prava-potrebitel-spravka",
  "i-pazaruvane-online-bezopasno2": "shop-bezopasno",
  "k-spisak-pazaruvane2": "day-spisak-pazar",
  // Документи и е-услуги
  "c-pik-nap-kakvo": "docs-pik-nap",
  "m-pik-noi2": "docs-pik-noi",
  "c-elektronen-podpis2": "docs-elektronen-podpis",
  "c-proveria-izbiratelna-sekciya2": "x-izbiratelna-sekciya",
  "docs-egov": "c-egov-kakvo-e",
  // Пенсии, социални услуги, грижа (каноничното е на /pomoshti, където има такова)
  "pn-proveri-pensiya": "docs-noi-pensiya",
  "m-noi-pensiya2": "docs-noi-pensiya",
  "d-celeva-pomosht-otoplenie": "pn-pomosht-otoplenie",
  "d-socialen-patronazh": "pn-socialen-patronazh",
  "g-patronazh-za-blizak": "pn-socialen-patronazh",
  "g-lichen-asistent-blizak": "d-lichen-asistent",
  "g-speshen-profil-blizak": "h-speshen-profil",
  // Здраве и всекидневие
  "o-spravia-se-samota": "h2-samota-nastroenie",
});

export const RETIRED_GUIDE_SLUGS: readonly string[] = Object.freeze(
  Object.keys(RETIRED_GUIDES),
);

// Каноничният slug за оттеглено ръководство, иначе null.
export function retiredGuideTarget(slug: string): string | null {
  return Object.prototype.hasOwnProperty.call(RETIRED_GUIDES, slug)
    ? RETIRED_GUIDES[slug]
    : null;
}
