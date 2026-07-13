import type { Source } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Известни случаи и „червени флагове“ около държавните предприятия.
//
// СТРОГО ПРАВИЛО: само ДОКУМЕНТИРАНИ случаи с официален източник и с ЯСНО
// отбелязан правен статус. Разследване/обвинение НЕ е присъда — важи
// презумпцията за невиновност. Нищо тук не е твърдение за доказана вина.
// ─────────────────────────────────────────────────────────────────────────────

export type CaseKey =
  | "prisada" // влязла в сила осъдителна присъда
  | "obvinenie" // повдигнато обвинение (ЕППО/прокуратура)
  | "razsledvane" // разследване/претърсване, без обвинение
  | "olaf" // приключена находка/препоръка на OLAF
  | "korekciya" // финансова корекция/спрени средства от ЕК
  | "smetna_palata" // одитна находка (Сметна палата / АДФИ)
  | "kzk" // решение на КЗК
  | "signal"; // официален сигнал/сезиране, без установено нарушение

export const STATUS: Record<CaseKey, { label: string; tone: "red" | "amber" | "slate" }> = {
  prisada: { label: "Осъдителна присъда", tone: "red" },
  obvinenie: { label: "Повдигнато обвинение", tone: "red" },
  razsledvane: { label: "Разследване (ЕППО/прокуратура)", tone: "amber" },
  olaf: { label: "Находка на OLAF", tone: "amber" },
  korekciya: { label: "Финансова корекция на ЕК", tone: "amber" },
  smetna_palata: { label: "Одитна находка (Сметна палата/АДФИ)", tone: "amber" },
  kzk: { label: "Решение на КЗК", tone: "slate" },
  signal: { label: "Официален сигнал/сезиране", tone: "slate" },
};

// Подредба по „тежест на установеност“.
export const STATUS_ORDER: CaseKey[] = [
  "prisada",
  "obvinenie",
  "smetna_palata",
  "olaf",
  "korekciya",
  "razsledvane",
  "kzk",
  "signal",
];

export type CaseItem = {
  title: string;
  enterprise: string;
  slug?: string;
  statusKey: CaseKey;
  desc: string;
  amount?: string;
  year: string;
  sources: Source[];
};

export const CASES: CaseItem[] = [
  {
    title: "Сигнализация Пловдив–Бургас (GSM-R) — измама с търг",
    enterprise: "НКЖИ",
    slug: "nkzhi",
    statusKey: "obvinenie",
    desc: "Европейската прокуратура повдигна обвинение на 4 лица (вкл. бивш генерален директор на НКЖИ) за измама с обществена поръчка — представена невярна информация, за да се спечели търгът. Обвинение, не присъда.",
    amount: "€94,5 млн. средства от ЕС",
    year: "2025",
    sources: [
      { label: "EPPO — Four charged", url: "https://www.eppo.europa.eu/en/media/news/bulgaria-four-charged-eu945-million-fraud-involving-railway-signalling-systems" },
      { label: "Свободна Европа", url: "https://www.svobodnaevropa.bg/a/evropeiska-prokuratura/33274264.html" },
    ],
  },
  {
    title: "In-house възлагане без търг (3,77 млрд. лв.)",
    enterprise: "„Автомагистрали“ ЕАД",
    slug: "avtomagistrali",
    statusKey: "smetna_palata",
    desc: "Сметната палата установи: за 2016–2020 г. дружеството е изпълнило договори за ~3,77 млрд. лв., 6 от които възложени без търг (in-house); ~96,9% са преотдадени на трети фирми, а дружеството няма собствен капацитет. АДФИ потвърди нарушения за 2,8–2,9 млрд. лв. и предаде на прокуратурата (досъдебно производство за безстопанственост).",
    amount: "~3,77 млрд. лв. договори; 2,8–2,9 млрд. лв. нарушения",
    year: "2016–2024",
    sources: [
      { label: "Свободна Европа", url: "https://www.svobodnaevropa.bg/a/31286289.html" },
      { label: "Capital — АДФИ потвърди", url: "https://www.capital.bg/politika_i_ikonomika/ikonomika/2024/05/09/4623289_adfi_potvurdi_narusheniia_za_29_mlrd_lv_v/" },
      { label: "Сметна палата", url: "https://www.bulnao.government.bg/" },
    ],
  },
  {
    title: "Модернизация на жп инфраструктура — находка на OLAF",
    enterprise: "НКЖИ (проект)",
    slug: "nkzhi",
    statusKey: "olaf",
    desc: "Приключено разследване на OLAF с препоръка за възстановяване на €38 млн. и предотвратен разход от €92 млн. — участници без техническа способност или с невярно представен капацитет. Административна находка, не присъда.",
    amount: "над €140 млн. съмнителни нередности",
    year: "2023",
    sources: [
      { label: "OLAF / ЕК", url: "https://anti-fraud.ec.europa.eu/media-corner/news/bulgaria-suspected-irregularities-over-eu140-million-railway-infrastructure-project-2023-08-23_en" },
    ],
  },
  {
    title: "ВиК проекти по ОП „Околна среда“ (ОПОС)",
    enterprise: "ВиК сектор",
    slug: "balgarski-vik-holding",
    statusKey: "korekciya",
    desc: "Европейската комисия спря плащания и наложи финансова корекция за нередности при обществени поръчки и завишени цени. Средствата впоследствие са възстановени. Финансова корекция, не наказателна присъда.",
    amount: "корекция 153 млн. лв.",
    year: "2013–2014",
    sources: [
      { label: "Сега", url: "https://www.segabg.com/hot/category-economy/ek-dade-bulgariya-na-sud-zaradi-vik-mrezhata" },
    ],
  },
  {
    title: "ПГХ „Чирен“ — разширение на газохранилището",
    enterprise: "Булгартрансгаз",
    slug: "bulgartransgaz",
    statusKey: "razsledvane",
    desc: "Разследване на Европейската прокуратура със спецакция (претърсвания, 2024) по съмнение за измама с европейски грант — смяна на подизпълнители и намален обем на сондажите. Няма повдигнати обвинения.",
    amount: "грант €78 млн.; съмнение за ~100 млн. лв.",
    year: "2024",
    sources: [
      { label: "EPPO — BTA", url: "https://www.bta.bg/en/news/bulgaria/725622-eppo-investigation-of-bulgartransgaz-related-to-expansion-of-chiren-underground-" },
      { label: "АКФ — сигнал", url: "https://acf.bg/en/akf-signalizira-evropeyskata-prokur/" },
    ],
  },
  {
    title: "Модернизация Костенец–Септември и Оризово–Михайлово",
    enterprise: "НКЖИ",
    slug: "nkzhi",
    statusKey: "razsledvane",
    desc: "Разследване на Европейската прокуратура (претърсвания на 28 адреса, 2023) по съмнение за измама с евросредства и изпиране на пари през верига „кухи“ фирми. Без обвинение към момента.",
    amount: "€241 млн. финансиране от ЕС",
    year: "2023",
    sources: [
      { label: "EPPO — searches €241M", url: "https://www.eppo.europa.eu/en/media/news/bulgaria-eppo-carries-out-searches-probe-railway-works-worth-over-eu241-million" },
    ],
  },
  {
    title: "Тунел „Железница“ (АМ „Струма“)",
    enterprise: "Агенция „Пътна инфраструктура“ (проект)",
    statusKey: "razsledvane",
    desc: "Разследване на Европейската прокуратура (претърсвания, 2024) по съмнение за присвояване на евросредства и изпиране на пари при най-дългия пътен тунел в страната.",
    amount: "проект ~185 млн. лв.; съмнение >11 млн. лв.",
    year: "2024",
    sources: [
      { label: "EPPO — Zheleznitsa tunnel", url: "https://www.eppo.europa.eu/en/media/news/bulgaria-eppo-leads-evidence-gathering-searches-probe-zheleznitsa-tunnel" },
    ],
  },
  {
    title: "19 жп договора (коридор София–Пловдив–Бургас)",
    enterprise: "НКЖИ / БДЖ",
    slug: "nkzhi",
    statusKey: "razsledvane",
    desc: "Живи разследвания на ЕППО (17 договора) и OLAF (2 договора за подвижен състав), оповестени от транспортния министър след вътрешен одит (2026). Сумата е деклариран РИСК, не потвърдена загуба.",
    amount: "до €400 млн. под риск",
    year: "2026",
    sources: [
      { label: "RailFreight", url: "https://www.railfreight.com/business/2026/06/19/new-bulgarian-minister-finds-rail-debts-missing-funds-and-eu-investigations/" },
    ],
  },
  {
    title: "Ревизия на договори за специална продукция",
    enterprise: "ВМЗ „Вазовски машиностроителни заводи“ ЕАД",
    slug: "vmz-sopot",
    statusKey: "razsledvane",
    desc: "АДФИ приключи финансова ревизия (възложена от прокуратурата) на договори за специална продукция и на изплатения дивидент (2022 г.) и я предаде на прокуратурата поради съмнения за тежки нарушения. Конкретните суми не са публично оповестени.",
    amount: "непубликувани",
    year: "2022–2024",
    sources: [
      { label: "Сега — АДФИ до прокуратурата", url: "https://www.segabg.com/hot/category-bulgaria/adfi-prati-na-prokuraturata-proverka-na-sporni-sdelki-na-vmz" },
    ],
  },
  {
    title: "Отменен търг за 42 мотриси",
    enterprise: "„БДЖ – Пътнически превози“ ЕООД",
    slug: "bdz-patnicheski",
    statusKey: "kzk",
    desc: "КЗК отмени като незаконосъобразен търга за 42 нови мотриси и поддръжка (проблеми в спецификациите). Установена незаконосъобразност на условията, не корупционна присъда.",
    amount: "675 млн. лв.",
    year: "2018",
    sources: [
      { label: "Club Z", url: "https://clubz.bg/75797-targat_za_novi_vlakove_na_bdzh_nezakonen_kzk_go_otmeni" },
    ],
  },
  {
    title: "Незаконна процедура без обявление (СОИ, блокове 5 и 6)",
    enterprise: "ТЕЦ „Марица изток 2“ ЕАД",
    slug: "tec-maritsa-iztok-2",
    statusKey: "kzk",
    desc: "КЗК отмени като незаконосъобразно решението на изп. директор за „договаряне без обявление“ за обследване на сероочистващите инсталации — липса на извънредно обстоятелство по ЗОП.",
    year: "2013",
    sources: [
      { label: "Money.bg", url: "https://money.bg/finance/otmeniha-nezakonosaobrazna-obshtestvena-porachka-na-tets-maritsa-iztok2.html" },
    ],
  },
  {
    title: "Липсващи и дублиращи договори — сезирана прокуратура",
    enterprise: "„Кинтекс“ ЕАД",
    slug: "kintex",
    statusKey: "signal",
    desc: "Ръководството на ДКК сезира прокуратурата след вътрешна проверка на „Кинтекс“ — констатирани липсващи и дублиращи се договори и прехвърляне на функции към частна фирма. Сезиране + журналистика, не установено съдебно нарушение.",
    year: "2023",
    sources: [
      { label: "business.dir.bg", url: "https://business.dir.bg/kompanii/dkk-sriv-v-kinteks-lipsvashti-i-dublirashti-se-dogovori-eksshefove-na-prokuror" },
    ],
  },
  {
    title: "Проверки на търговете за дървесина (в ход)",
    enterprise: "Държавни горски предприятия",
    slug: "szdp",
    statusKey: "signal",
    desc: "АДФИ започна проверки в държавните горски предприятия (2025), а МЗ подготвя искане до КЗК за възможен картел сред ползвателите на дървесина. Проверката не е приключила; журналистически оценки за загуби от нагласени търгове не са одитна находка.",
    amount: "~200 млн. лв./год. (журналистическа оценка)",
    year: "2025",
    sources: [
      { label: "News.bg", url: "https://news.bg/politics/adfi-zapochva-proverki-v-darzhavnite-gorskite-predpriyatiya.html" },
    ],
  },
  {
    title: "„Хемусгейт“ — аванси за АМ „Хемус“ през подизпълнители",
    enterprise: "„Автомагистрали“ ЕАД",
    slug: "avtomagistrali",
    statusKey: "razsledvane",
    desc: "По разследване на Антикорупционен фонд ~54–55 млн. лв. аванси за АМ „Хемус“ са проследени през верига подизпълнители и масови тегления в брой. Досъдебното производство се разпадна — обвинителен акт не е внесен, разследващите прокурори са отстранени. Няма обвинение или присъда.",
    amount: "~54–55 млн. лв.",
    year: "2019–2025",
    sources: [
      { label: "АКФ (news.bg)", url: "https://news.bg/society/akf-kak-54-mln-lv-za-hemus-se-ozovavat-kray-blagoevgrad-i-zashto-ne-sa-obvineni-nay-vinovnite-za-shemata.html" },
      { label: "banker.bg", url: "https://banker.bg/2025/10/13/otstraneniyat-prokuror-po-deloto-hemusgejt-smachkaha-razsledvaneto-milionite-se-gubyat/" },
    ],
  },
  {
    title: "„Безплатна пътна помощ“ — преотдаване в нарушение на ЗОП",
    enterprise: "„Автомагистрали“ ЕАД",
    slug: "avtomagistrali",
    statusKey: "signal",
    desc: "Журналистическо разследване на Антикорупционен фонд (2026): дейността по пътна помощ е преотдадена в нарушение на ЗОП; държавната „Автомагистрали“ е платила над 1,34 млн. евро на частна фирма. Само журналистическо разследване — без образувано наказателно производство.",
    amount: ">1,34 млн. евро (само от „Автомагистрали“)",
    year: "2025–2026",
    sources: [
      { label: "АКФ — Пътят на парите", url: "https://acf.bg/bg/patyat-na-parite-finansovi-tranzaktsii/" },
    ],
  },
  {
    title: "Договори на ДКК и износ на продукция на ВМЗ",
    enterprise: "„Държавна консолидационна компания“ ЕАД",
    slug: "dkk",
    statusKey: "razsledvane",
    desc: "Досъдебно производство (Софийска градска прокуратура, 2021) след проверка на антикорупционната комисия по редица договори на ДКК — вкл. еднолично предоставени изключителни права на частна фирма за износ на продукция на ВМЗ. Публично обсъждани щети над 700 млн. лв. Без повдигнати обвинения.",
    amount: "обсъждани щети >700 млн. лв.",
    year: "2021",
    sources: [
      { label: "Mediapool", url: "https://www.mediapool.bg/orazheini-interesi-za-milioni-izpluvaha-ot-skandala-dkk-news329689.html" },
      { label: "Investor.bg", url: "https://www.investor.bg/a/332-ikonomika-i-politika/341795-prokuraturata-obrazuva-dosadebno-proizvodstvo-po-sluchaya-s-dkk" },
    ],
  },
  {
    title: "Вътрешен одит с „индикатори за измама“",
    enterprise: "„ТЕРЕМ – Холдинг“ ЕАД",
    slug: "terem",
    statusKey: "signal",
    desc: "Вътрешен одит на Министерството на отбраната (2022) установи нарушения и „индикатори за измама“ и е изпратен на прокуратурата. По журналистически данни: гориво за армията на завишени цени, ремонти на вертолети над пазарните и продажба на актив без търг. Одит + сезиране; предимно журналистически разкрития.",
    amount: "щети по журналистически данни (гориво >2 млн. лв., ремонти >6 млн. лв.)",
    year: "2022–2023",
    sources: [
      { label: "faktor.bg", url: "https://faktor.bg/petak-13-kak-sluzhebnite-pravitelstva-oskubaha-terem-holding-zlatnata-kokoshka-na-ministerstvo-na-otbranata" },
      { label: "news.bg", url: "https://news.bg/crime/turski-potok-i-koruptsiya-v-mo-sa-sred-22-ta-signala-ot-komisiyata-po-reviziya-prateni-na-prokuraturata.html" },
    ],
  },
  {
    title: "Аванс за ракети „Конкурс“ без доставка",
    enterprise: "ВМЗ „Вазовски машиностроителни заводи“ ЕАД",
    slug: "vmz-sopot",
    statusKey: "signal",
    desc: "По журналистическо разследване (Свободна Европа) ВМЗ е платил ~$10 млн. аванс на сръбска фирма за 1360 стари ракети „Конкурс“, без доставка след над 3 години. Сезирани са ДАНС и прокуратурата; документацията е засекретена. Журналистическо разследване + сезиране, без обвинение/присъда.",
    amount: "~$10 млн. аванс (договор ~$20,4 млн.)",
    year: "2018–2021",
    sources: [
      { label: "Свободна Европа", url: "https://www.svobodnaevropa.bg/a/31441694.html" },
      { label: "Boulevard Bulgaria", url: "https://boulevardbulgaria.bg/articles/vmz-sopot-e-platil-10-mln-na-srabska-firma-no-chaka-dostavkata-veche-3-godini" },
    ],
  },
  {
    title: "Проверка на поръчка за ремонт на мотриси (137 млн. лв.)",
    enterprise: "Холдинг БДЖ",
    slug: "holding-bdz",
    statusKey: "razsledvane",
    desc: "Софийска градска прокуратура влезе в централата на БДЖ (2021) за проверка на 5-годишна поръчка за ремонт на дизелови и електрически мотриси (2019) — дали ремонтите са реални или фиктивни. Проверка/досъдебно, без известно обвинение.",
    amount: "137 млн. лв.",
    year: "2019–2021",
    sources: [
      { label: "24 часа", url: "https://www.24chasa.bg/biznes/article/10536501" },
      { label: "Investor.bg", url: "https://www.investor.bg/ikonomika-i-politika/332/a/prokuraturata-izvyrshva-proverka-v-bdj-342329/" },
    ],
  },
  {
    title: "Съмнителни поръчки и компрометиран тираж",
    enterprise: "Държавно предприятие „Български спортен тотализатор“",
    slug: "balgarski-sporten-totalizator",
    statusKey: "signal",
    desc: "АДФИ и вътрешни проверки (2024) по съмнителни обществени поръчки (напр. ~3 млн. лв. за база във Велинград); след компрометиран тираж (2025) ръководството е уволнено и са сезирани прокуратура, НАП и МВР. Проверки и сезиране, без обвинение или присъда.",
    amount: "~3 млн. лв. (поръчка); пакет >20 млн. лв.",
    year: "2024–2025",
    sources: [
      { label: "БТА — проверка на тиража", url: "https://www.bta.bg/bg/news/bulgaria/857405-ministarat-na-mladezhta-i-sporta-razporezhda-nezabavna-proverka-na-balgarskiya-s" },
      { label: "banker.bg", url: "https://banker.bg/2024/05/23/проверка-българския-спортен-тотализ/" },
    ],
  },
  {
    title: "Измами със земеделски субсидии (европейски средства)",
    enterprise: "Земеделски субсидии — ДФ „Земеделие“",
    statusKey: "obvinenie",
    desc: "Няколко производства на Европейската прокуратура за измами със субсидии по Общата селскостопанска политика с участие на държавни служители, сертифицирали неверни данни: повдигнати обвинения (напр. ~190 000 € и >220 000 €), обиски и задържания по случай за ~900 000 €. Обвинения, не присъди.",
    amount: "стотици хиляди евро на случай",
    year: "2024–2026",
    sources: [
      { label: "Свободна Европа", url: "https://www.svobodnaevropa.bg/a/epropeyska-prokuratura-razsledvane-selskostopanski-fondove/33598252.html" },
      { label: "BTA", url: "https://www.bta.bg/bg/news/economy/1012959-evropeyskata-prokuratura-razsledva-izmami-sas-zemedelski-subsidii-v-balgariya" },
    ],
  },
];

/** Случаи, свързани с даден каталогов slug. */
export function casesForSlug(slug: string): CaseItem[] {
  return CASES.filter((c) => c.slug === slug);
}

/** Предприятия, подредени по брой документирани случаи („червени флагове“). */
export function redFlagsByEnterprise(): {
  enterprise: string;
  slug?: string;
  count: number;
}[] {
  const map = new Map<string, { enterprise: string; slug?: string; count: number }>();
  for (const c of CASES) {
    const key = c.slug ?? c.enterprise;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { enterprise: c.enterprise, slug: c.slug, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
