import { UI, type Locale } from "./i18n";
import { LEGAL, LEGAL_UPDATED, type LegalKind } from "./legal";
import { bundledAlt } from "./cms";

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

// The 30 letters of the Bulgarian alphabet with the official (Streamlined
// System) transliteration and one word each. Letter, transliteration and word are
// Bulgarian and shared by every language; the meaning is translated — on the
// Bulgarian page it is the Italian word, for children growing up between the two.
const ALPHABET: [letter: string, latin: string, word: string, it: string, en: string][] = [
  ["А", "a", "азбука", "alfabeto", "alphabet"],
  ["Б", "b", "баница", "banitsa, sfoglia salata al formaggio", "banitsa, a cheese pastry"],
  ["В", "v", "вода", "acqua", "water"],
  ["Г", "g", "гайда", "cornamusa", "bagpipe"],
  ["Д", "d", "дъга", "arcobaleno", "rainbow"],
  ["Е", "e", "език", "lingua", "language"],
  ["Ж", "zh", "жаба", "rana", "frog"],
  ["З", "z", "звезда", "stella", "star"],
  ["И", "i", "игра", "gioco", "game"],
  ["Й", "y", "йогурт", "yogurt", "yogurt"],
  ["К", "k", "книга", "libro", "book"],
  ["Л", "l", "лъв", "leone", "lion"],
  ["М", "m", "мартеница", "martenitsa, il portafortuna bianco e rosso del 1° marzo", "martenitsa, the red-and-white token of 1 March"],
  ["Н", "n", "небе", "cielo", "sky"],
  ["О", "o", "обич", "affetto", "love"],
  ["П", "p", "песен", "canzone", "song"],
  ["Р", "r", "роза", "rosa", "rose"],
  ["С", "s", "слънце", "sole", "sun"],
  ["Т", "t", "танц", "danza", "dance"],
  ["У", "u", "училище", "scuola", "school"],
  ["Ф", "f", "фолклор", "folclore", "folklore"],
  ["Х", "h", "хоро", "horo, la danza in cerchio", "horo, the circle dance"],
  ["Ц", "ts", "цвете", "fiore", "flower"],
  ["Ч", "ch", "чудо", "meraviglia", "wonder"],
  ["Ш", "sh", "шевица", "ricamo tradizionale", "traditional embroidery"],
  ["Щ", "sht", "щъркел", "cicogna", "stork"],
  ["Ъ", "a", "ъгъл", "angolo", "corner"],
  ["Ь", "y", "синьо", "blu (la Ь non apre mai una parola)", "blue (Ь never begins a word)"],
  ["Ю", "yu", "юнак", "eroe", "hero"],
  ["Я", "ya", "Яворов", "il poeta che dà il nome alla nostra scuola", "the poet our school is named after"],
];
// Bundled pronunciation, one clip per default word (public/assets/audio/alphabet,
// voice bg-BG-KalinaNeural). Keyed by the WORD, so an editor who changes a word
// never gets the old word's sound; an uploaded clip always wins.
const AUDIO_BY_WORD = new Map(
  ALPHABET.map(([, latin, word], i) => [word, `/assets/audio/alphabet/${String(i + 1).padStart(2, "0")}-${latin.replace(/[^a-z]/g, "") || "x"}.mp3`]),
);
export const bundledWordAudio = (word: string): string => AUDIO_BY_WORD.get(word) ?? "";

const lettersFor = (l: Locale) =>
  ALPHABET.map(([letter, latin, word, it, en]) => ({ letter, latin, word, meaning: l === "en" ? en : it, audio: "" }));

const BASE_ROWS: DefaultRow[] = [
  {
    key: "settings",
    group: "settings",
    label: "Настройки и контакти",
    order: 0,
    it: {
      brandName: "Qui Bulgaria",
      brandSub: "Scuola bulgara di Milano",
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
      brandSub: "Българско училище в Милано",
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
      brandSub: "Bulgarian school in Milan",
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
      badge: "Scuola bulgara «P. Yavorov» a Milano, dal 2014",
      title: "La lingua e la cultura bulgara, nel cuore di Milano.",
      lead: "Siamo l'Associazione Qui Bulgaria: una comunità che custodisce e diffonde la lingua, le tradizioni e le danze popolari bulgare come strumenti di identità, dialogo e condivisione.",
      highlights: [
        { text: "Diplomi riconosciuti dal Ministero bulgaro dell'Istruzione e della Scienza" },
        { text: "Bambini e adulti, dai principianti agli avanzati" },
        { text: "In aula a Milano, online o in formato ibrido" },
        { text: "Danza popolare con il gruppo «Veselie»" },
      ],
    },
    bg: {
      badge: "Българско училище „П. Яворов“ в Милано, от 2014 г.",
      title: "Българският език и култура, в сърцето на Милано.",
      lead: "Ние сме Асоциация „Qui Bulgaria“: общност, която съхранява и разпространява българския език, традиции и народни танци като средство за идентичност, диалог и споделяне.",
      highlights: [
        { text: "Дипломи, признати от Министерството на образованието и науката" },
        { text: "Деца и възрастни, от начинаещи до напреднали" },
        { text: "Присъствено в Милано, онлайн или хибридно" },
        { text: "Народни танци с група „Веселие“" },
      ],
    },
    en: {
      badge: "The “P. Yavorov” Bulgarian school in Milan, since 2014",
      title: "The Bulgarian language and culture, in the heart of Milan.",
      lead: "We are the Qui Bulgaria Association: a community that preserves and shares the Bulgarian language, traditions and folk dances as tools of identity, dialogue and togetherness.",
      highlights: [
        { text: "Diplomas recognised by the Bulgarian Ministry of Education and Science" },
        { text: "Children and adults, from beginners to advanced" },
        { text: "In class in Milan, online or hybrid" },
        { text: "Folk dance with the “Veselie” group" },
      ],
    },
  },
  {
    key: "about",
    group: "section",
    label: "За нас",
    order: 2,
    it: {
      title: "Una comunità che cresce nell'amore per la cultura bulgara",
      lead: "L'Associazione Qui Bulgaria è un centro linguistico e culturale senza scopo di lucro che si pone come priorità la conservazione e la divulgazione della lingua e della cultura bulgara in Italia e all'estero.",
      features: [
        { title: "Identità e radici", text: "Ci ispiriamo alla ricchezza della tradizione, della lingua e delle danze popolari come strumenti di identità." },
        { title: "Dialogo e condivisione", text: "Uniamo le persone che amano la cultura bulgara in una comunità sana e positiva in cui crescere." },
        { title: "Qualità riconosciuta", text: "Operiamo secondo libri di testo e programmi approvati dal Ministero, con diplomi riconosciuti in Bulgaria." },
      ],
    },
    bg: {
      title: "Общност, която расте в любов към българската култура",
      lead: "Асоциация „Qui Bulgaria“ е лингвистичен и културен център с нестопанска цел, чийто приоритет е съхранението и популяризирането на българския език и култура в Италия и по света.",
      features: [
        { title: "Идентичност и корени", text: "Вдъхновяваме се от богатството на традицията, езика и народните танци като средство за идентичност." },
        { title: "Диалог и споделяне", text: "Обединяваме хората, които обичат българската култура, в здрава и позитивна общност, в която да растем." },
        { title: "Признато качество", text: "Работим по учебници и програми, одобрени от Министерството, с дипломи, признати в България." },
      ],
    },
    en: {
      title: "A community growing in love for Bulgarian culture",
      lead: "The Qui Bulgaria Association is a non-profit language and cultural centre whose priority is preserving and sharing the Bulgarian language and culture in Italy and abroad.",
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
    order: 4,
    it: {
      title: "Un percorso completo, dal 2014 ad oggi",
      lead: "La scuola bulgara «P. Yavorov» ha aperto le porte il 12 gennaio 2014. Nata per i bambini delle famiglie bulgare e miste in Lombardia, si è poi estesa agli adulti e, da febbraio 2020, all'apprendimento online tramite piattaforma e-learning.",
      items: [
        { icon: "presence", title: "In presenza", text: "Lezioni dal vivo a Milano per bambini e adulti, con piccoli gruppi e attenzione a ogni studente.", bullets: [] },
        { icon: "distance", title: "A distanza", text: "Corsi di lingua bulgara online tramite piattaforma e-learning, ovunque ti trovi in Italia o all'estero.", bullets: [] },
        { icon: "hybrid", title: "Formato ibrido", text: "Il meglio dei due mondi: combina lezioni in aula e a distanza secondo le tue esigenze e i tuoi tempi.", bullets: [] },
      ],
      quote: "I nostri docenti sono filologi, pedagogisti e storici. Nel team abbiamo anche un docente universitario.",
      quoteCite: "Il corpo insegnante della scuola «P. Yavorov»",
    },
    bg: {
      title: "Пълноценен път, от 2014 г. до днес",
      lead: "Българското училище „П. Яворов“ отвори врати на 12 януари 2014 г. Създадено за децата на българските и смесените семейства в Ломбардия, по-късно се разшири към възрастни, а от февруари 2020 г. — и към онлайн обучение чрез платформа за е-обучение.",
      items: [
        { icon: "presence", title: "Присъствено", text: "Живи уроци в Милано за деца и възрастни, в малки групи и с внимание към всеки ученик.", bullets: [] },
        { icon: "distance", title: "Дистанционно", text: "Онлайн курсове по български език чрез платформа за е-обучение, където и да сте в Италия или по света.", bullets: [] },
        { icon: "hybrid", title: "Хибриден формат", text: "Най-доброто от двата свята: комбинира присъствени и дистанционни уроци според нуждите и времето ви.", bullets: [] },
      ],
      quote: "Нашите преподаватели са филолози, педагози и историци. В екипа имаме и университетски преподавател.",
      quoteCite: "Преподавателският екип на училище „П. Яворов“",
    },
    en: {
      title: "A complete journey, from 2014 to today",
      lead: "The Bulgarian school “P. Yavorov” opened on 12 January 2014. Founded for children of Bulgarian and mixed families in Lombardy, it later expanded to adults and, from February 2020, to online learning via an e-learning platform.",
      items: [
        { icon: "presence", title: "In person", text: "Live lessons in Milan for children and adults, in small groups with attention to every student.", bullets: [] },
        { icon: "distance", title: "Remote", text: "Online Bulgarian courses via an e-learning platform, wherever you are in Italy or abroad.", bullets: [] },
        { icon: "hybrid", title: "Hybrid format", text: "The best of both worlds: combine classroom and remote lessons to suit your needs and schedule.", bullets: [] },
      ],
      quote: "Our teachers are philologists, pedagogues and historians. Our team even includes a university lecturer.",
      quoteCite: "The teaching staff of the “P. Yavorov” school",
    },
  },
  {
    key: "alphabet",
    group: "section",
    label: "Азбуката",
    order: 3,
    it: {
      title: "L'alfabeto bulgaro, lettera per lettera",
      lead: "Trenta lettere nate nella Bulgaria medievale, alla scuola letteraria di Preslav, alla fine del IX secolo. Dal 2007 il cirillico è il terzo alfabeto ufficiale dell'Unione europea. Scegli una lettera: vedrai come si traslittera e una parola che inizia così.",
      letters: lettersFor("it"),
    },
    bg: {
      title: "Българската азбука, буква по буква",
      lead: "Тридесет букви, родени в средновековна България, в Преславската книжовна школа в края на IX век. От 2007 г. кирилицата е третата официална азбука на Европейския съюз. Изберете буква: ще видите как се изписва на латиница и дума, която започва с нея, с превод на италиански.",
      letters: lettersFor("bg"),
    },
    en: {
      title: "The Bulgarian alphabet, letter by letter",
      lead: "Thirty letters born in medieval Bulgaria, at the Preslav Literary School, at the end of the 9th century. Since 2007 Cyrillic has been the third official alphabet of the European Union. Pick a letter to see how it is transliterated and a word that starts with it.",
      letters: lettersFor("en"),
    },
  },
  {
    key: "courses",
    group: "section",
    label: "Курсове по български",
    order: 5,
    it: {
      title: "Lingua bulgara per ogni età e ogni livello",
      lead: "Lavoriamo con piccoli gruppi, così da rispondere alle esigenze specifiche e al livello di ogni singolo studente — dai principianti assoluti ai più avanzati.",
      items: [
        { icon: "kids", title: "Bambini", text: "Per i bambini delle famiglie bulgare e miste: imparare la lingua materna divertendosi e coltivando le proprie radici.", bullets: ["Programmi del Ministero bulgaro", "Diploma riconosciuto in Bulgaria"] },
        { icon: "adults", title: "Adulti", text: "Per chi vuole avvicinarsi alla lingua, alla cultura e alla letteratura bulgara — dal lavoro alla famiglia, alla passione.", bullets: ["Tutti i livelli, dai principianti", "Percorsi personalizzati"] },
        { icon: "culture", title: "Cultura e letteratura", text: "Un viaggio tra storia, letteratura e tradizioni per imprenditori, amanti della natura e giovani delle famiglie miste.", bullets: ["Piccoli gruppi e attenzione personale", "In presenza, online o ibrido"] },
      ],
    },
    bg: {
      title: "Български език за всяка възраст и всяко ниво",
      lead: "Работим в малки групи, за да отговорим на конкретните нужди и нивото на всеки ученик — от пълни начинаещи до напреднали.",
      items: [
        { icon: "kids", title: "Деца", text: "За децата на българските и смесените семейства: да учат майчиния си език с удоволствие и да пазят корените си.", bullets: ["Програми на българското Министерство", "Диплома, призната в България"] },
        { icon: "adults", title: "Възрастни", text: "За всеки, който иска да се докосне до българския език, култура и литература — от работата до семейството и страстта.", bullets: ["Всички нива, от начинаещи", "Индивидуални програми"] },
        { icon: "culture", title: "Култура и литература", text: "Пътешествие през историята, литературата и традициите — за предприемачи, любители на природата и младежи от смесени семейства.", bullets: ["Малки групи и лично внимание", "Присъствено, онлайн или хибридно"] },
      ],
    },
    en: {
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
      title: "Il gruppo «Veselie»: un vulcano di emozioni",
      lead: "Le danze popolari bulgare sono un'arte conosciuta in tutto il mondo: costumi colorati, musica e canti che accendono sempre un vulcano di emozioni.",
      body: "Oltre a custodire il patrimonio culturale, ballare fa bene al corpo e alla mente: riduce lo stress, tonifica e crea comunità attorno all'horo, la tradizionale danza in cerchio. Accogliamo bambini e adulti, famiglie bulgare e partecipanti italiani. Una sola iscrizione dà accesso a entrambi gli appuntamenti settimanali.",
      scheduleTitle: "Orari delle prove",
      schedule: [
        { day: "Domenica", time: "10:00–12:00", place: "Vicino a Piazzale Corvetto, Milano. Segue il calendario scolastico." },
        { day: "Giovedì", time: "20:30–22:30", place: "Zona Rho, Milano" },
      ],
      groupNote: "Il gruppo di danza «Veselie» è nato nel 2016 in seno alla Scuola bulgara di Milano ed è cresciuto molto da allora.",
      instructorName: "Stanimir Minev",
      instructorRole: "Ballerino e coreografo, diplomato alla Scuola Nazionale di Danza e Balletto bulgara, a Milano dal 2013",
      cta: "Iscriviti alla danza",
    },
    bg: {
      title: "Групата „Веселие“: вулкан от емоции",
      lead: "Българските народни танци са изкуство, познато по целия свят: цветни носии, музика и песни, които винаги разпалват вулкан от емоции.",
      body: "Освен че пазят културното наследство, танците са полезни за тялото и ума: намаляват стреса, тонизират и създават общност около хорото — традиционния танц в кръг. Посрещаме деца и възрастни, български семейства и италиански участници. Едно записване дава достъп до двете седмични занятия.",
      scheduleTitle: "Часове за репетиции",
      schedule: [
        { day: "Неделя", time: "10:00–12:00", place: "До Пиазале Корвето, Милано. Следва учебния календар." },
        { day: "Четвъртък", time: "20:30–22:30", place: "Зона Rho, Милано" },
      ],
      groupNote: "Танцовата група „Веселие“ е създадена през 2016 г. към Българското училище в Милано и оттогава порасна значително.",
      instructorName: "Станимир Минев",
      instructorRole: "Танцьор и хореограф, завършил Националното училище за танцово и балетно изкуство в България, в Милано от 2013 г.",
      cta: "Запиши се за танци",
    },
    en: {
      title: "The “Veselie” group: a volcano of emotions",
      lead: "Bulgarian folk dances are an art known around the world: colourful costumes, music and songs that always spark a volcano of emotions.",
      body: "Beyond preserving cultural heritage, dancing is good for body and mind: it reduces stress, tones the body and builds community around the horo, the traditional circle dance. We welcome children and adults, Bulgarian families and Italian participants. A single enrolment gives access to both weekly sessions.",
      scheduleTitle: "Rehearsal times",
      schedule: [
        { day: "Sunday", time: "10:00–12:00", place: "Near Piazzale Corvetto, Milan. Follows the school calendar." },
        { day: "Thursday", time: "20:30–22:30", place: "Rho area, Milan" },
      ],
      groupNote: "The “Veselie” dance group was founded in 2016 within the Bulgarian School of Milan and has grown a lot since then.",
      instructorName: "Stanimir Minev",
      instructorRole: "Dancer and choreographer, trained at the Bulgarian National School of Dance and Ballet, in Milan since 2013",
      cta: "Join the dance",
    },
  },
  {
    key: "facebook",
    group: "section",
    label: "Секция Facebook",
    order: 7,
    it: {
      title: "Seguici su Facebook",
      lead: "Foto, eventi, lezioni e novità della nostra comunità: tutto quello che pubblichiamo, direttamente dalla nostra pagina, in tempo reale.",
      points: ["Eventi e appuntamenti del gruppo «Veselie»", "Foto e momenti della vita scolastica", "Avvisi su iscrizioni e nuovi corsi"],
    },
    bg: {
      title: "Последвайте ни във Facebook",
      lead: "Снимки, събития, уроци и новини от нашата общност: всичко, което публикуваме, директно от страницата ни, в реално време.",
      points: ["Събития и изяви на групата „Веселие“", "Снимки и моменти от училищния живот", "Новини за записвания и нови курсове"],
    },
    en: {
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
    // Real photos of the school's own events (from its original website), not
    // stock. Shown at their natural proportions; editors add, remove and reorder.
    it: {
      title: "Momenti di lingua, cultura e festa",
      photos: [
        { src: "/assets/img/photos/festa-della-scuola.webp", caption: "La festa della scuola" },
        { src: "/assets/img/photos/horo.webp", caption: "L'horo, la danza in cerchio" },
        { src: "/assets/img/photos/bandiera-fortezza.webp", caption: "La bandiera bulgara su un'antica fortezza" },
        { src: "/assets/img/photos/rose-damascena.webp", caption: "La rosa damascena, simbolo della Bulgaria" },
      ],
    },
    bg: {
      title: "Моменти на език, култура и празник",
      photos: [
        { src: "/assets/img/photos/festa-della-scuola.webp", caption: "Празникът на училището" },
        { src: "/assets/img/photos/horo.webp", caption: "Хоро — танцът в кръг" },
        { src: "/assets/img/photos/bandiera-fortezza.webp", caption: "Българското знаме над стара крепост" },
        { src: "/assets/img/photos/rose-damascena.webp", caption: "Маслодайната роза — символ на България" },
      ],
    },
    en: {
      title: "Moments of language, culture and celebration",
      photos: [
        { src: "/assets/img/photos/festa-della-scuola.webp", caption: "The school celebration" },
        { src: "/assets/img/photos/horo.webp", caption: "The horo, the circle dance" },
        { src: "/assets/img/photos/bandiera-fortezza.webp", caption: "The Bulgarian flag over an old fortress" },
        { src: "/assets/img/photos/rose-damascena.webp", caption: "The Damask rose, a symbol of Bulgaria" },
      ],
    },
  },
  {
    key: "contact",
    group: "section",
    label: "Контакти",
    order: 10,
    it: {
      title: "Iscriviti o richiedi informazioni",
      lead: "Scrivici per conoscere i prossimi corsi di lingua e di danza, gli orari e le modalità di iscrizione. Ti risponderemo con piacere.",
      topics: ["Corso di bulgaro — bambini", "Corso di bulgaro — adulti", "Danza tradizionale", "Informazioni generali"],
    },
    bg: {
      title: "Запишете се или поискайте информация",
      lead: "Пишете ни, за да научите за предстоящите курсове по език и танци, часовете и начините за записване. Ще ви отговорим с удоволствие.",
      topics: ["Курс по български — деца", "Курс по български — възрастни", "Народни танци", "Обща информация"],
    },
    en: {
      title: "Enrol or request information",
      lead: "Write to us about upcoming language and dance courses, schedules and how to enrol. We will be glad to reply.",
      topics: ["Bulgarian course — children", "Bulgarian course — adults", "Traditional dance", "General information"],
    },
  },
  {
    key: "cta",
    group: "section",
    label: "Финален призив",
    order: 11,
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
  {
    key: "faq",
    group: "section",
    label: "Често задавани въпроси",
    order: 9,
    it: {
      title: "Le risposte alle domande più comuni",
      items: [
        { q: "Dove si trova la scuola bulgara di Milano?", a: "Siamo a Milano, in Lombardia (Via Giovanni Battista Piazzetta, 20138 Milano). Le prove di danza si tengono vicino a Piazzale Corvetto e in zona Rho." },
        { q: "A chi sono rivolti i corsi di bulgaro?", a: "A bambini delle famiglie bulgare e miste e ad adulti di ogni livello, dai principianti agli avanzati, in presenza, online o in formato ibrido." },
        { q: "I diplomi sono riconosciuti?", a: "Sì. Operiamo secondo i programmi del Ministero dell’Istruzione e della Scienza bulgaro e i diplomi sono riconosciuti nel sistema educativo bulgaro." },
        { q: "Offrite anche danza tradizionale bulgara?", a: "Sì, con il gruppo «Veselie»: due appuntamenti settimanali a Milano per bambini e adulti, italiani inclusi." },
      ],
    },
    bg: {
      title: "Отговори на най-честите въпроси",
      items: [
        { q: "Къде се намира българското училище в Милано?", a: "Намираме се в Милано, Ломбардия (Via Giovanni Battista Piazzetta, 20138 Милано). Репетициите по танци са до Пиазале Корвето и в зона Rho." },
        { q: "За кого са курсовете по български?", a: "За деца от български и смесени семейства и за възрастни от всички нива — присъствено, онлайн или хибридно." },
        { q: "Признати ли са дипломите?", a: "Да. Работим по програмите на българското Министерство на образованието и науката и дипломите се признават в българската образователна система." },
        { q: "Предлагате ли и народни танци?", a: "Да, с групата „Веселие“: две седмични занятия в Милано за деца и възрастни." },
      ],
    },
    en: {
      title: "Answers to the most common questions",
      items: [
        { q: "Where is the Bulgarian school in Milan located?", a: "We are in Milan, Lombardy (Via Giovanni Battista Piazzetta, 20138 Milan). Dance rehearsals are held near Piazzale Corvetto and in the Rho area." },
        { q: "Who are the Bulgarian courses for?", a: "For children of Bulgarian and mixed families and for adults of all levels, in person, online or hybrid." },
        { q: "Are the diplomas recognised?", a: "Yes. We follow the programmes of the Bulgarian Ministry of Education and Science, and diplomas are recognised in the Bulgarian education system." },
        { q: "Do you also offer Bulgarian folk dance?", a: "Yes, with the “Veselie” group: two weekly sessions in Milan for children and adults." },
      ],
    },
  },
  {
    // Search results and social-media previews, per language. The BG and EN
    // pages used to ship the Italian description — now each speaks its own.
    key: "seo",
    group: "settings",
    label: "SEO и споделяне",
    order: 20,
    it: {
      title: "Qui Bulgaria — Scuola bulgara di Milano",
      description: "Centro linguistico e culturale a Milano: lingua e cultura bulgara, scuola «P. Yavorov», corsi per bambini e adulti e danza tradizionale.",
      keywords: ["scuola bulgara", "scuola bulgara milano", "българско училище", "българско училище в Милано", "Carbon Stealth", "corsi di bulgaro", "lingua bulgara milano"],
      shareImage: "",
    },
    bg: {
      title: "Qui Bulgaria — Българско училище в Милано",
      description: "Езиков и културен център в Милано: български език и култура, училище „П. Яворов“, курсове за деца и възрастни и народни танци.",
      keywords: ["scuola bulgara", "scuola bulgara milano", "българско училище", "българско училище в Милано", "Carbon Stealth", "български език Милано", "народни танци Милано"],
      shareImage: "",
    },
    en: {
      title: "Qui Bulgaria — Bulgarian School in Milan",
      description: "Language and cultural centre in Milan: Bulgarian language and culture, the “P. Yavorov” school, courses for children and adults, and traditional dance.",
      keywords: ["scuola bulgara", "scuola bulgara milano", "българско училище", "българско училище в Милано", "Carbon Stealth", "Bulgarian school Milan", "learn Bulgarian"],
      shareImage: "",
    },
  },
  {
    // Facts about the organisation, published as structured data for search
    // and answer engines. The address lines up with the visible contact block.
    key: "org",
    group: "settings",
    label: "Данни на организацията",
    order: 21,
    it: {
      name: "Associazione Qui Bulgaria — Scuola bulgara di Milano",
      alternateName: "Scuola bulgara «P. Yavorov»",
      streetAddress: "Via Giovanni Battista Piazzetta",
      postalCode: "20138",
      locality: "Milano",
      region: "Lombardia",
      country: "IT",
      latitude: "45.4642",
      longitude: "9.1900",
      foundingDate: "2014-01-12",
    },
    bg: {
      name: "Асоциация „Qui Bulgaria“ — Българско училище в Милано",
      alternateName: "Българско училище „П. Яворов“",
      streetAddress: "Via Giovanni Battista Piazzetta",
      postalCode: "20138",
      locality: "Милано",
      region: "Ломбардия",
      country: "IT",
      latitude: "45.4642",
      longitude: "9.1900",
      foundingDate: "2014-01-12",
    },
    en: {
      name: "Qui Bulgaria Association — Bulgarian School of Milan",
      alternateName: "“P. Yavorov” Bulgarian School",
      streetAddress: "Via Giovanni Battista Piazzetta",
      postalCode: "20138",
      locality: "Milan",
      region: "Lombardy",
      country: "IT",
      latitude: "45.4642",
      longitude: "9.1900",
      foundingDate: "2014-01-12",
    },
  },
];

// ---- Photos per section --------------------------------------------------
// A picture is the same in every language; its description (alt text, for
// screen readers) is translated and lives once, next to the photo, in cms.ts.
const SECTION_MEDIA: Record<string, string> = {
  hero: "/assets/img/photos/ballerini-in-costume.webp",
  about: "/assets/img/photos/comunita-in-costume.webp",
  school: "/assets/img/photos/docenti.webp",
  dance: "/assets/img/photos/gruppo-veselie.webp",
};
const altFor = (url: string, l: Locale) => bundledAlt(url)?.[l] ?? "";

// Interface wording (buttons, menu, form) — editable from the admin. Seeded from
// the built-in dictionary so there is one source of truth. Left out: the FAQ
// headings (they live in the FAQ section) and the two attributions — the agency
// credit and the CC BY-SA photo credit are obligations, not wording to edit.
const NOT_EDITABLE = new Set(["credit", "photoCredit"]);
const uiFor = (l: Locale) =>
  Object.fromEntries(Object.entries(UI[l]).filter(([k]) => !k.startsWith("faq.") && !NOT_EDITABLE.has(k)));

// Legal pages: every section gets both `p` and `list`, so an editor can add a
// paragraph or a bullet to any section, not only to the ones that had one.
const LEGAL_ROWS: { kind: LegalKind; label: string; order: number }[] = [
  { kind: "privacy", label: "Поверителност", order: 30 },
  { kind: "cookie", label: "Бисквитки", order: 31 },
  { kind: "termini", label: "Общи условия", order: 32 },
];
const legalFor = (kind: LegalKind, l: Locale) => {
  const doc = LEGAL[kind][l];
  return {
    title: doc.title,
    intro: doc.intro,
    updated: LEGAL_UPDATED,
    sections: doc.sections.map((s) => ({ h: s.h, p: s.p ?? [], list: s.list ?? [] })),
  };
};

function build(): DefaultRow[] {
  const rows: DefaultRow[] = BASE_ROWS.map((row) => {
    const img = SECTION_MEDIA[row.key];
    const logo = row.key === "settings" ? { logo: "/assets/img/brand/logo.webp" } : {};
    const add = (l: Locale) => {
      const d: Record<string, unknown> = { ...row[l], ...logo };
      if (img) Object.assign(d, { image: img, imageAlt: altFor(img, l) });
      if (Array.isArray(d.photos)) {
        d.photos = (d.photos as { src: string; caption: string }[]).map((p) => ({ ...p, alt: altFor(p.src, l) }));
      }
      return d;
    };
    return { ...row, it: add("it"), bg: add("bg"), en: add("en") };
  });
  rows.push({
    key: "ui", group: "settings", label: "Надписи по бутони и менюта", order: 22,
    it: uiFor("it"), bg: uiFor("bg"), en: uiFor("en"),
  });
  for (const { kind, label, order } of LEGAL_ROWS) {
    rows.push({
      key: `legal_${kind}`, group: "legal", label, order,
      it: legalFor(kind, "it"), bg: legalFor(kind, "bg"), en: legalFor(kind, "en"),
    });
  }
  return rows;
}

export const DEFAULT_CONTENT: DefaultRow[] = build();

// Convenience lookup used as a runtime fallback by the public pages.
export function defaultFor(key: string, locale: Locale): Record<string, unknown> {
  const row = DEFAULT_CONTENT.find((r) => r.key === key);
  if (!row) return {};
  return (row[locale] as Record<string, unknown>) || row.en;
}
