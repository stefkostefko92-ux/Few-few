import type { Locale } from "./i18n";

// Single source of truth for the site's initial content in all three
// languages. The seed writes these rows into the database; the public pages
// fall back to them if a row is missing. Editors change the DB copy via /admin.

export type DefaultRow = {
  key: string;
  group: string;
  label: string;
  order: number;
  it: Record<string, unknown>;
  bg: Record<string, unknown>;
  en: Record<string, unknown>;
};

export const DEFAULT_CONTENT: DefaultRow[] = [
  {
    key: "settings",
    group: "settings",
    label: "Настройки и контакти",
    order: 0,
    it: {
      brandName: "Qui Bulgaria",
      brandSub: "Scuola bulgara · Milano",
      phone: "+39 320 847 9971",
      phoneHref: "+393208479971",
      email: "centroquibulgaria@gmail.com",
      address: "Via Giovanni Battista Piazzetta, 20138 Milano (MI)",
      facebookUrl: "https://www.facebook.com/scuolabulgaramilano/",
      facebookPageHref: "https://www.facebook.com/scuolabulgaramilano/",
      mapUrl: "https://maps.google.com/?q=Via+Giovanni+Battista+Piazzetta+Milano",
    },
    bg: {
      brandName: "Qui Bulgaria",
      brandSub: "Българско училище · Милано",
      phone: "+39 320 847 9971",
      phoneHref: "+393208479971",
      email: "centroquibulgaria@gmail.com",
      address: "Via Giovanni Battista Piazzetta, 20138 Милано (MI)",
      facebookUrl: "https://www.facebook.com/scuolabulgaramilano/",
      facebookPageHref: "https://www.facebook.com/scuolabulgaramilano/",
      mapUrl: "https://maps.google.com/?q=Via+Giovanni+Battista+Piazzetta+Milano",
    },
    en: {
      brandName: "Qui Bulgaria",
      brandSub: "Bulgarian school · Milan",
      phone: "+39 320 847 9971",
      phoneHref: "+393208479971",
      email: "centroquibulgaria@gmail.com",
      address: "Via Giovanni Battista Piazzetta, 20138 Milan (MI)",
      facebookUrl: "https://www.facebook.com/scuolabulgaramilano/",
      facebookPageHref: "https://www.facebook.com/scuolabulgaramilano/",
      mapUrl: "https://maps.google.com/?q=Via+Giovanni+Battista+Piazzetta+Milano",
    },
  },
  {
    key: "hero",
    group: "section",
    label: "Начална секция (интро)",
    order: 1,
    it: {
      badge: "Centro linguistico e culturale dal 2014",
      titleA: "La ",
      titleAccent: "lingua",
      titleB: " e la cultura bulgara, nel cuore di Milano.",
      lead: "Siamo l'Associazione Qui Bulgaria: una comunità che custodisce e diffonde la lingua, le tradizioni e le danze popolari bulgare come strumenti di identità, dialogo e condivisione.",
      trust: "Diplomi riconosciuti dal Ministero dell'Istruzione e della Scienza bulgaro",
      stat: "11",
      statLabel: "anni al fianco della comunità bulgara",
    },
    bg: {
      badge: "Лингвистичен и културен център от 2014 г.",
      titleA: "Българският ",
      titleAccent: "език",
      titleB: " и култура, в сърцето на Милано.",
      lead: "Ние сме Асоциация „Qui Bulgaria“: общност, която съхранява и разпространява българския език, традиции и народни танци като средство за идентичност, диалог и споделяне.",
      trust: "Дипломи, признати от Министерството на образованието и науката на България",
      stat: "11",
      statLabel: "години рамо до рамо с българската общност",
    },
    en: {
      badge: "Language & cultural centre since 2014",
      titleA: "The Bulgarian ",
      titleAccent: "language",
      titleB: " and culture, in the heart of Milan.",
      lead: "We are the Qui Bulgaria Association: a community that preserves and shares the Bulgarian language, traditions and folk dances as tools of identity, dialogue and togetherness.",
      trust: "Diplomas recognised by the Bulgarian Ministry of Education and Science",
      stat: "11",
      statLabel: "years alongside the Bulgarian community",
    },
  },
  {
    key: "about",
    group: "section",
    label: "За нас",
    order: 2,
    it: {
      eyebrow: "Chi siamo",
      title: "Una comunità che cresce nell'amore per la cultura bulgara",
      lead: "L'Associazione Qui Bulgaria è un centro linguistico e culturale senza scopo di lucro che si pone come priorità la conservazione e la divulgazione della lingua e della cultura bulgara in Italia e all'estero.",
      tag: "Milano · Lombardia",
      features: [
        { title: "Identità e radici", text: "Ci ispiriamo alla ricchezza della tradizione, della lingua e delle danze popolari come strumenti di identità." },
        { title: "Dialogo e condivisione", text: "Uniamo le persone che amano la cultura bulgara in una comunità sana e positiva in cui crescere." },
        { title: "Qualità riconosciuta", text: "Operiamo secondo libri di testo e programmi approvati dal Ministero, con diplomi riconosciuti in Bulgaria." },
      ],
    },
    bg: {
      eyebrow: "За нас",
      title: "Общност, която расте в любов към българската култура",
      lead: "Асоциация „Qui Bulgaria“ е лингвистичен и културен център с нестопанска цел, чийто приоритет е съхранението и популяризирането на българския език и култура в Италия и по света.",
      tag: "Милано · Ломбардия",
      features: [
        { title: "Идентичност и корени", text: "Вдъхновяваме се от богатството на традицията, езика и народните танци като средство за идентичност." },
        { title: "Диалог и споделяне", text: "Обединяваме хората, които обичат българската култура, в здрава и позитивна общност, в която да растем." },
        { title: "Признато качество", text: "Работим по учебници и програми, одобрени от Министерството, с дипломи, признати в България." },
      ],
    },
    en: {
      eyebrow: "About us",
      title: "A community growing in love for Bulgarian culture",
      lead: "The Qui Bulgaria Association is a non-profit language and cultural centre whose priority is preserving and sharing the Bulgarian language and culture in Italy and abroad.",
      tag: "Milan · Lombardy",
      features: [
        { title: "Identity and roots", text: "We draw on the richness of tradition, language and folk dance as tools of identity." },
        { title: "Dialogue and sharing", text: "We bring together people who love Bulgarian culture in a healthy, positive community to grow in." },
        { title: "Recognised quality", text: "We follow textbooks and programmes approved by the Ministry, with diplomas recognised in Bulgaria." },
      ],
    },
  },
  {
    key: "school",
    group: "section",
    label: "Училище „П. Яворов“",
    order: 3,
    it: {
      eyebrow: "La scuola «P. Yavorov»",
      title: "Un percorso completo, dal 2014 ad oggi",
      lead: "La scuola bulgara «P. Yavorov» ha aperto le porte il 12 gennaio 2014. Nata per i bambini delle famiglie bulgare e miste in Lombardia, si è poi estesa agli adulti e, da febbraio 2020, all'apprendimento online tramite piattaforma e-learning.",
      items: [
        { icon: "presence", title: "In presenza", text: "Lezioni dal vivo a Milano per bambini e adulti, con piccoli gruppi e attenzione a ogni studente.", bullets: [] },
        { icon: "distance", title: "A distanza", text: "Corsi di lingua bulgara online tramite piattaforma e-learning, ovunque ti trovi in Italia o all'estero.", bullets: [] },
        { icon: "hybrid", title: "Formato ibrido", text: "Il meglio dei due mondi: combina lezioni in aula e a distanza secondo le tue esigenze e i tuoi tempi.", bullets: [] },
      ],
      quote: "I nostri docenti sono filologi, pedagogisti e storici. Nel team abbiamo anche un docente universitario.",
      quoteCite: "— Il corpo insegnante della scuola «P. Yavorov»",
    },
    bg: {
      eyebrow: "Училище „П. Яворов“",
      title: "Пълноценен път, от 2014 г. до днес",
      lead: "Българското училище „П. Яворов“ отвори врати на 12 януари 2014 г. Създадено за децата на българските и смесените семейства в Ломбардия, по-късно се разшири към възрастни, а от февруари 2020 г. — и към онлайн обучение чрез платформа за е-обучение.",
      items: [
        { icon: "presence", title: "Присъствено", text: "Живи уроци в Милано за деца и възрастни, в малки групи и с внимание към всеки ученик.", bullets: [] },
        { icon: "distance", title: "Дистанционно", text: "Онлайн курсове по български език чрез платформа за е-обучение, където и да сте в Италия или по света.", bullets: [] },
        { icon: "hybrid", title: "Хибриден формат", text: "Най-доброто от двата свята: комбинира присъствени и дистанционни уроци според нуждите и времето ви.", bullets: [] },
      ],
      quote: "Нашите преподаватели са филолози, педагози и историци. В екипа имаме и университетски преподавател.",
      quoteCite: "— Преподавателският екип на училище „П. Яворов“",
    },
    en: {
      eyebrow: "The “P. Yavorov” school",
      title: "A complete journey, from 2014 to today",
      lead: "The Bulgarian school “P. Yavorov” opened on 12 January 2014. Founded for children of Bulgarian and mixed families in Lombardy, it later expanded to adults and, from February 2020, to online learning via an e-learning platform.",
      items: [
        { icon: "presence", title: "In person", text: "Live lessons in Milan for children and adults, in small groups with attention to every student.", bullets: [] },
        { icon: "distance", title: "Remote", text: "Online Bulgarian courses via an e-learning platform, wherever you are in Italy or abroad.", bullets: [] },
        { icon: "hybrid", title: "Hybrid format", text: "The best of both worlds: combine classroom and remote lessons to suit your needs and schedule.", bullets: [] },
      ],
      quote: "Our teachers are philologists, pedagogues and historians. Our team even includes a university lecturer.",
      quoteCite: "— The teaching staff of the “P. Yavorov” school",
    },
  },
  {
    key: "stats",
    group: "section",
    label: "Числа",
    order: 4,
    it: { items: [
      { num: "2014", label: "Fondazione della scuola «P. Yavorov»" },
      { num: "2", label: "Discipline: lingua e danza tradizionale" },
      { num: "100%", label: "Docenti qualificati: filologi e pedagogisti" },
      { num: "2", label: "Sedi a Milano: Corvetto e zona Rho" },
    ] },
    bg: { items: [
      { num: "2014", label: "Основаване на училище „П. Яворов“" },
      { num: "2", label: "Дисциплини: език и народни танци" },
      { num: "100%", label: "Квалифицирани преподаватели: филолози и педагози" },
      { num: "2", label: "Локации в Милано: Корвето и зона Rho" },
    ] },
    en: { items: [
      { num: "2014", label: "Founding of the “P. Yavorov” school" },
      { num: "2", label: "Disciplines: language and folk dance" },
      { num: "100%", label: "Qualified teachers: philologists and pedagogues" },
      { num: "2", label: "Locations in Milan: Corvetto and Rho area" },
    ] },
  },
  {
    key: "courses",
    group: "section",
    label: "Курсове по български",
    order: 5,
    it: {
      eyebrow: "Corsi di bulgaro",
      title: "Lingua bulgara per ogni età e ogni livello",
      lead: "Lavoriamo con piccoli gruppi, così da rispondere alle esigenze specifiche e al livello di ogni singolo studente — dai principianti assoluti ai più avanzati.",
      items: [
        { icon: "kids", title: "Bambini", text: "Per i bambini delle famiglie bulgare e miste: imparare la lingua materna divertendosi e coltivando le proprie radici.", bullets: ["Programmi del Ministero bulgaro", "Diploma riconosciuto in Bulgaria"] },
        { icon: "adults", title: "Adulti", text: "Per chi vuole avvicinarsi alla lingua, alla cultura e alla letteratura bulgara — dal lavoro alla famiglia, alla passione.", bullets: ["Tutti i livelli, dai principianti", "Percorsi personalizzati"] },
        { icon: "culture", title: "Cultura e letteratura", text: "Un viaggio tra storia, letteratura e tradizioni per imprenditori, amanti della natura e giovani delle famiglie miste.", bullets: ["Piccoli gruppi e attenzione personale", "In presenza, online o ibrido"] },
      ],
    },
    bg: {
      eyebrow: "Курсове по български",
      title: "Български език за всяка възраст и всяко ниво",
      lead: "Работим в малки групи, за да отговорим на конкретните нужди и нивото на всеки ученик — от пълни начинаещи до напреднали.",
      items: [
        { icon: "kids", title: "Деца", text: "За децата на българските и смесените семейства: да учат майчиния си език с удоволствие и да пазят корените си.", bullets: ["Програми на българското Министерство", "Диплома, призната в България"] },
        { icon: "adults", title: "Възрастни", text: "За всеки, който иска да се докосне до българския език, култура и литература — от работата до семейството и страстта.", bullets: ["Всички нива, от начинаещи", "Индивидуални програми"] },
        { icon: "culture", title: "Култура и литература", text: "Пътешествие през историята, литературата и традициите — за предприемачи, любители на природата и младежи от смесени семейства.", bullets: ["Малки групи и лично внимание", "Присъствено, онлайн или хибридно"] },
      ],
    },
    en: {
      eyebrow: "Bulgarian courses",
      title: "Bulgarian language for every age and level",
      lead: "We work in small groups, so we can meet the specific needs and level of every single student — from absolute beginners to advanced.",
      items: [
        { icon: "kids", title: "Children", text: "For children of Bulgarian and mixed families: learning their mother tongue with joy while nurturing their roots.", bullets: ["Bulgarian Ministry programmes", "Diploma recognised in Bulgaria"] },
        { icon: "adults", title: "Adults", text: "For anyone wishing to get closer to the Bulgarian language, culture and literature — from work to family and passion.", bullets: ["All levels, from beginners", "Personalised paths"] },
        { icon: "culture", title: "Culture & literature", text: "A journey through history, literature and traditions for entrepreneurs, nature lovers and youth of mixed families.", bullets: ["Small groups and personal attention", "In person, online or hybrid"] },
      ],
    },
  },
  {
    key: "dance",
    group: "section",
    label: "Народни танци",
    order: 6,
    it: {
      eyebrow: "Danza tradizionale",
      title: "Il gruppo «Veselie»: un vulcano di emozioni",
      lead: "Le danze popolari bulgare sono un'arte conosciuta in tutto il mondo: costumi colorati, musica e canti che accendono sempre un vulcano di emozioni.",
      body: "Oltre a custodire il patrimonio culturale, ballare fa bene al corpo e alla mente: riduce lo stress, tonifica e crea comunità attorno all'horo, la tradizionale danza in cerchio. Accogliamo bambini e adulti, famiglie bulgare e partecipanti italiani. Una sola iscrizione dà accesso a entrambi gli appuntamenti settimanali.",
      scheduleTitle: "Orari delle prove",
      schedule: [
        { day: "DOM", time: "10–12", title: "Domenica · 10:00–12:00", place: "Vicino a Piazzale Corvetto, Milano · segue il calendario scolastico" },
        { day: "GIO", time: "20:30", title: "Giovedì · 20:30–22:30", place: "Zona Rho (Milano)" },
      ],
      groupNote: "Il gruppo di danza «Veselie» è nato nel 2016 in seno alla Scuola bulgara di Milano ed è cresciuto molto da allora.",
      instructorName: "Stanimir Minev",
      instructorRole: "Ballerino e coreografo, diplomato alla Scuola Nazionale di Danza e Balletto bulgara · a Milano dal 2013",
      cta: "Iscriviti alla danza",
    },
    bg: {
      eyebrow: "Народни танци",
      title: "Групата „Веселие“: вулкан от емоции",
      lead: "Българските народни танци са изкуство, познато по целия свят: цветни носии, музика и песни, които винаги разпалват вулкан от емоции.",
      body: "Освен че пазят културното наследство, танците са полезни за тялото и ума: намаляват стреса, тонизират и създават общност около хорото — традиционния танц в кръг. Посрещаме деца и възрастни, български семейства и италиански участници. Едно записване дава достъп до двете седмични занятия.",
      scheduleTitle: "Часове за репетиции",
      schedule: [
        { day: "НЕД", time: "10–12", title: "Неделя · 10:00–12:00", place: "До Пиазале Корвето, Милано · следва учебния календар" },
        { day: "ЧЕТ", time: "20:30", title: "Четвъртък · 20:30–22:30", place: "Зона Rho (Милано)" },
      ],
      groupNote: "Танцовата група „Веселие“ е създадена през 2016 г. към Българското училище в Милано и оттогава порасна значително.",
      instructorName: "Станимир Минев",
      instructorRole: "Танцьор и хореограф, завършил Националното училище за танцово и балетно изкуство в България · в Милано от 2013 г.",
      cta: "Запиши се за танци",
    },
    en: {
      eyebrow: "Traditional dance",
      title: "The “Veselie” group: a volcano of emotions",
      lead: "Bulgarian folk dances are an art known around the world: colourful costumes, music and songs that always spark a volcano of emotions.",
      body: "Beyond preserving cultural heritage, dancing is good for body and mind: it reduces stress, tones the body and builds community around the horo, the traditional circle dance. We welcome children and adults, Bulgarian families and Italian participants. A single enrolment gives access to both weekly sessions.",
      scheduleTitle: "Rehearsal times",
      schedule: [
        { day: "SUN", time: "10–12", title: "Sunday · 10:00–12:00", place: "Near Piazzale Corvetto, Milan · follows the school calendar" },
        { day: "THU", time: "20:30", title: "Thursday · 20:30–22:30", place: "Rho area (Milan)" },
      ],
      groupNote: "The “Veselie” dance group was founded in 2016 within the Bulgarian School of Milan and has grown a lot since then.",
      instructorName: "Stanimir Minev",
      instructorRole: "Dancer and choreographer, trained at the Bulgarian National School of Dance and Ballet · in Milan since 2013",
      cta: "Join the dance",
    },
  },
  {
    key: "facebook",
    group: "section",
    label: "Секция Facebook",
    order: 7,
    it: {
      eyebrow: "Sui social",
      title: "Seguici su Facebook",
      lead: "Foto, eventi, lezioni e novità della nostra comunità: tutto quello che pubblichiamo, direttamente dalla nostra pagina, in tempo reale.",
      points: ["Eventi e appuntamenti del gruppo «Veselie»", "Foto e momenti della vita scolastica", "Avvisi su iscrizioni e nuovi corsi"],
    },
    bg: {
      eyebrow: "В социалните мрежи",
      title: "Последвайте ни във Facebook",
      lead: "Снимки, събития, уроци и новини от нашата общност: всичко, което публикуваме, директно от страницата ни, в реално време.",
      points: ["Събития и изяви на групата „Веселие“", "Снимки и моменти от училищния живот", "Новини за записвания и нови курсове"],
    },
    en: {
      eyebrow: "On social",
      title: "Follow us on Facebook",
      lead: "Photos, events, lessons and news from our community: everything we post, straight from our page, in real time.",
      points: ["Events of the “Veselie” group", "Photos and moments of school life", "News about enrolments and new courses"],
    },
  },
  {
    key: "gallery",
    group: "section",
    label: "Галерия",
    order: 8,
    it: {
      eyebrow: "La nostra comunità",
      title: "Momenti di lingua, cultura e festa",
      tiles: [
        { kind: "image", src: "/assets/img/photos/community.webp", alt: "La comunità riunita in costumi tradizionali bulgari" },
        { kind: "green", big: "Horo", small: "La danza in cerchio" },
        { kind: "red", script: "Заедно", small: "Insieme" },
        { kind: "ink", big: "P. Yavorov", small: "La nostra scuola" },
        { kind: "green", script: "Веселие", small: "Gruppo di danza" },
      ],
    },
    bg: {
      eyebrow: "Нашата общност",
      title: "Моменти на език, култура и празник",
      tiles: [
        { kind: "image", src: "/assets/img/photos/community.webp", alt: "Общността, събрана в традиционни български носии" },
        { kind: "green", big: "Хоро", small: "Танцът в кръг" },
        { kind: "red", script: "Заедно", small: "Заедно" },
        { kind: "ink", big: "П. Яворов", small: "Нашето училище" },
        { kind: "green", script: "Веселие", small: "Танцова група" },
      ],
    },
    en: {
      eyebrow: "Our community",
      title: "Moments of language, culture and celebration",
      tiles: [
        { kind: "image", src: "/assets/img/photos/community.webp", alt: "The community gathered in traditional Bulgarian costumes" },
        { kind: "green", big: "Horo", small: "The circle dance" },
        { kind: "red", script: "Заедно", small: "Together" },
        { kind: "ink", big: "P. Yavorov", small: "Our school" },
        { kind: "green", script: "Веселие", small: "Dance group" },
      ],
    },
  },
  {
    key: "contact",
    group: "section",
    label: "Контакти",
    order: 9,
    it: {
      eyebrow: "Contatti",
      title: "Iscriviti o richiedi informazioni",
      lead: "Scrivici per conoscere i prossimi corsi di lingua e di danza, gli orari e le modalità di iscrizione. Ti risponderemo con piacere.",
      topics: ["Corso di bulgaro — bambini", "Corso di bulgaro — adulti", "Danza tradizionale", "Informazioni generali"],
    },
    bg: {
      eyebrow: "Контакти",
      title: "Запишете се или поискайте информация",
      lead: "Пишете ни, за да научите за предстоящите курсове по език и танци, часовете и начините за записване. Ще ви отговорим с удоволствие.",
      topics: ["Курс по български — деца", "Курс по български — възрастни", "Народни танци", "Обща информация"],
    },
    en: {
      eyebrow: "Contact",
      title: "Enrol or request information",
      lead: "Write to us about upcoming language and dance courses, schedules and how to enrol. We will be glad to reply.",
      topics: ["Bulgarian course — children", "Bulgarian course — adults", "Traditional dance", "General information"],
    },
  },
  {
    key: "cta",
    group: "section",
    label: "Финален призив",
    order: 10,
    it: {
      title: "Добре дошли! Benvenuti nella nostra comunità",
      body: "Che tu voglia imparare la lingua, riscoprire le tue radici o ballare l'horo insieme a noi, c'è un posto per te a Qui Bulgaria.",
      primary: "Scrivici una email",
      secondary: "Chiamaci ora",
    },
    bg: {
      title: "Добре дошли! Заповядайте в нашата общност",
      body: "Независимо дали искате да научите езика, да преоткриете корените си или да танцувате хоро с нас — има място за вас в „Qui Bulgaria“.",
      primary: "Пишете ни имейл",
      secondary: "Обадете се сега",
    },
    en: {
      title: "Добре дошли! Welcome to our community",
      body: "Whether you want to learn the language, rediscover your roots or dance the horo with us, there is a place for you at Qui Bulgaria.",
      primary: "Send us an email",
      secondary: "Call us now",
    },
  },
];

// Convenience lookup used as a runtime fallback by the public pages.
export function defaultFor(key: string, locale: Locale): Record<string, unknown> {
  const row = DEFAULT_CONTENT.find((r) => r.key === key);
  if (!row) return {};
  return (row[locale] as Record<string, unknown>) || row.en;
}
