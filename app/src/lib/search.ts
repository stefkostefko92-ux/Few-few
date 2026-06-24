import { prisma } from "@/lib/prisma";
import { plainText } from "@/lib/markdown";
import { SERVICE_CATEGORY_LABELS, BUSINESS_CATEGORY_LABELS } from "@/lib/categories";

export type SearchResult = {
  type: "faq" | "service" | "business" | "event";
  title: string;
  snippet: string;
  url: string;
  score: number;
};

// Често срещани думи, които не помагат за търсене.
const STOP = new Set([
  "как", "да", "за", "на", "в", "и", "или", "се", "си", "ми", "е",
  "ли", "кой", "коя", "кое", "кога", "къде", "що", "the", "to", "от",
]);

function tokenize(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2 && !STOP.has(t)),
    ),
  ).slice(0, 6);
}

// Леко „стемване" за български — за да намира и при членуване и множествено
// число (напр. „аптеки" → намира „аптека"; „зъболекари" → „зъболекар").
function variants(term: string): string[] {
  const v = new Set([term]);
  if (term.length >= 5) v.add(term.slice(0, -1));
  if (term.length >= 6) v.add(term.slice(0, -2));
  return [...v];
}

// Понятийни групи на разговорен български. Хората (особено възрастните) питат
// с ежедневни думи — „доктор", „боклук", „няма ток". Всяка група събира
// равнозначни изрази, така че който и да е от тях да намира съдържанието,
// описано с „официалната" дума. Една група = едно понятие (брои се веднъж).
const CONCEPTS: string[][] = [
  ["лекар", "доктор", "медицин", "личен лекар", "джипи", "поликлиника", "амбулатория"],
  ["болница", "спешно отделение", "спешна помощ", "мбал"],
  ["линейка", "бърза помощ", "спешна помощ"],
  ["аптека", "лекарства", "хапчета", "дежурна аптека"],
  ["зъболекар", "стоматолог", "зъби", "зъбен"],
  ["ток", "електричество", "електрозахранване", "няма ток", "спря токът", "авария на тока", "епрео", "чез", "електрохолд"],
  ["вода", "водоснабдяване", "няма вода", "спря водата", "водопровод", "вик"],
  ["боклук", "смет", "отпадъци", "сметосъбиране", "контейнер", "извозване", "сметоизвозване"],
  ["данък", "данъци", "налог", "патентен данък", "местни данъци", "мдт"],
  ["данък сгради", "данък върху недвижими имоти", "имотен данък", "данък жилище"],
  ["данък кола", "данък автомобил", "данък мпс", "данък превозно средство"],
  ["такса смет", "такса битови отпадъци", "тбо"],
  ["пенсия", "пенсии", "пенсионер", "нссо"],
  ["помощ", "помощи", "социална помощ", "помощ за отопление", "целева помощ", "енергийни помощи"],
  ["телк", "инвалидност", "степен на увреждане", "пенсия за инвалидност"],
  ["кмет", "община", "кметство", "общинска администрация", "общината"],
  ["лична карта", "документ за самоличност", "паспорт", "шофьорска книжка"],
  ["акт за раждане", "удостоверение за раждане"],
  ["адресна регистрация", "настоящ адрес", "постоянен адрес"],
  ["автобус", "автобуси", "разписание", "спирка", "автогара"],
  ["влак", "жп", "гара", "бдж", "железница"],
  ["такси", "превоз с кола"],
  ["евро", "еврото", "приемане на еврото", "обмяна на лева", "обменен курс"],
  ["измама", "измами", "телефонна измама", "фишинг", "лъжат", "крадат пари", "фалшив", "мним"],
  ["събитие", "събития", "празник", "концерт", "мероприятие", "панаир"],
  ["именен ден", "имен ден", "именни дни", "светец", "православен календар"],
  ["работа", "обява за работа", "наемане", "свободно работно място", "трудова борса"],
  ["сигнал", "оплакване", "жалба", "нередност", "проблем в квартала"],
  ["пожар", "пожарна", "горя", "запали се"],
  ["полиция", "кражба", "обир", "престъпление", "рп"],
];

// Влиза ли думата в понятие? Сравнява с членуване/стемване — равенство, или
// едната дума започва с другата (напр. „доктора" ↔ „доктор").
function tokenInConcept(token: string, group: string[]): boolean {
  return group.some((w) => {
    if (w.includes(" ")) return false; // изразите се търсят по цялата заявка
    return w === token || w.startsWith(token) || token.startsWith(w);
  });
}

// Разгръща понятие до всичките му форми (с лек стем за единичните думи).
function expandConcept(group: string[]): string[] {
  const out = new Set<string>();
  for (const w of group) {
    if (w.includes(" ")) out.add(w);
    else for (const v of variants(w)) out.add(v);
  }
  return [...out];
}

// Думи, които изразяват КАКВО иска човекът (контакт), а не ЗА КОГО. „телефон“,
// „номер“, „контакт“ не бива да участват в самото съвпадение — иначе „телефон
// на общината“ напасва всяка статия, в която се мярка думата „телефон“. Те само
// насочват, че трябва да предпочетем услуга/бизнес (които имат телефон/адрес).
function isContactWord(t: string): boolean {
  return (
    t === "тел" || t === "номер" ||
    t.startsWith("телефон") || t.startsWith("контакт") ||
    t.startsWith("номер") || t.startsWith("имейл") || t === "мейл"
  );
}

export type QueryIntent = { contact: boolean; howto: boolean };

// Разпознава намерението: иска ли човекът контакт (телефон/адрес) или обяснение
// „как да…“. Така подреждаме правилния ТИП съдържание най-отгоре.
export function classifyIntent(query: string): QueryIntent {
  const lc = query.toLowerCase();
  const tokens = tokenize(query);
  const contact =
    tokens.some(isContactWord) ||
    lc.includes("обади") ||
    lc.includes("позвън") ||
    lc.includes("свържа се") ||
    lc.includes("работно време") ||
    lc.includes("кога работи") ||
    lc.includes("отворено ли");
  const howto =
    lc.includes("как да") ||
    lc.includes("как се") ||
    lc.includes("как мога") ||
    lc.includes("къде да") ||
    lc.includes("откъде") ||
    lc.includes("мога ли");
  return { contact, howto };
}

// Изгражда групите термини за оценяване: засечените понятия (по цялата заявка,
// вкл. изрази от няколко думи) + останалите думи със собствените им варианти.
// Думите за намерение (телефон/номер/контакт) се махат от съвпадението.
// Експортирана за тестове.
export function buildTermGroups(query: string): string[][] {
  const lcq = query.toLowerCase();
  const all = tokenize(query);
  // Махаме контактните думи, освен ако така не остане нищо за търсене.
  const stripped = all.filter((t) => !isContactWord(t));
  const tokens = stripped.length ? stripped : all;

  const groups: string[][] = [];
  const used = new Set<number>();

  CONCEPTS.forEach((g, i) => {
    const phraseHit = g.some((w) => w.includes(" ") && lcq.includes(w));
    const wordHit = tokens.some((t) => tokenInConcept(t, g));
    if (phraseHit || wordHit) {
      groups.push(expandConcept(g));
      used.add(i);
    }
  });

  for (const t of tokens) {
    const covered = [...used].some((i) => tokenInConcept(t, CONCEPTS[i]));
    if (!covered) groups.push(variants(t));
  }

  if (groups.length === 0) {
    const fallback = tokens.length
      ? tokens
      : [query.trim().toLowerCase()].filter((t) => t.length >= 2);
    return fallback.map(variants);
  }
  return groups;
}

// Оценка на съвпаденията. Сравнението е изцяло в кода (toLowerCase в JS сгъва
// правилно кирилицата — независимо от базата). По-дългите думи носят повече
// тежест (по-специфични са), за да не доминират къси общи думи.
function matchedCount(haystack: string, termVariants: string[][]): number {
  const lc = haystack.toLowerCase();
  let s = 0;
  for (const vs of termVariants) {
    if (vs.some((v) => lc.includes(v))) {
      s += 1 + Math.max(0, vs[0].length - 3) * 0.4;
    }
  }
  return s;
}

// Тежест според типа спрямо намерението. При въпрос за телефон/контакт
// предпочитаме услуги и бизнеси (те имат телефон/адрес/работно време), а не
// статии „как да…“; при въпрос „как да…“ — обратното.
function typeMultiplier(
  type: SearchResult["type"],
  intent: QueryIntent,
): number {
  if (intent.contact) {
    if (type === "service" || type === "business") return 1.6;
    if (type === "faq") return 0.4;
    return 0.6; // event
  }
  if (intent.howto) {
    if (type === "faq") return 1.4;
    return 0.9;
  }
  return 1;
}

// Лек кеш на индекса в паметта (за да не сканираме базата при всяко търсене).
export type SearchIndex = {
  faqs: { slug: string; question: string; answer: string; tags: string; category: string }[];
  services: {
    slug: string; name: string; description: string; address: string;
    phone: string; phone2: string; category: string;
  }[];
  businesses: { slug: string; name: string; description: string; category: string }[];
  events: { slug: string; title: string; description: string; location: string }[];
};
let cache: { at: number; idx: SearchIndex } | null = null;
const TTL_MS = 60_000;

async function loadIndex(): Promise<SearchIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.idx;
  const [faqs, services, businesses, events] = await Promise.all([
    prisma.faq.findMany({
      where: { published: true },
      select: { slug: true, question: true, answer: true, tags: true, category: true },
    }),
    prisma.service.findMany({
      where: { published: true },
      select: {
        slug: true, name: true, description: true, address: true,
        phone: true, phone2: true, category: true,
      },
    }),
    prisma.business.findMany({
      where: { published: true },
      select: { slug: true, name: true, description: true, category: true },
    }),
    prisma.event.findMany({
      where: {
        published: true,
        startAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
      },
      select: { slug: true, title: true, description: true, location: true },
    }),
  ]);
  cache = { at: Date.now(), idx: { faqs, services, businesses, events } };
  return cache.idx;
}

// Чисто класиране върху подаден индекс (без база) — за да е лесно за тестване.
export function rankIndex(
  idx: SearchIndex,
  query: string,
  limit = 12,
): SearchResult[] {
  const T = buildTermGroups(query);
  if (T.length === 0) return [];
  const intent = classifyIntent(query);
  const results: SearchResult[] = [];

  for (const f of idx.faqs) {
    const head = `${f.question} ${f.tags} ${f.category}`;
    const base = matchedCount(head, T) * 3 + matchedCount(f.answer, T);
    if (base > 0) {
      results.push({
        type: "faq",
        title: f.question,
        snippet: plainText(f.answer, 140),
        url: `/kak-da/${f.slug}`,
        score: base * typeMultiplier("faq", intent),
      });
    }
  }

  for (const s of idx.services) {
    const catLabel = SERVICE_CATEGORY_LABELS[s.category] ?? "";
    const head = `${s.name} ${catLabel} ${s.phone} ${s.phone2}`;
    const base = matchedCount(head, T) * 3 + matchedCount(`${s.description} ${s.address}`, T);
    if (base > 0) {
      results.push({
        type: "service",
        title: s.name,
        snippet: plainText(s.description || s.address, 140),
        url: `/uslugi/${s.slug}`,
        score: base * typeMultiplier("service", intent),
      });
    }
  }

  for (const b of idx.businesses) {
    const catLabel = BUSINESS_CATEGORY_LABELS[b.category] ?? "";
    const head = `${b.name} ${catLabel}`;
    const base = matchedCount(head, T) * 3 + matchedCount(b.description, T);
    if (base > 0) {
      results.push({
        type: "business",
        title: b.name,
        snippet: plainText(b.description, 140),
        url: `/biznes/${b.slug}`,
        score: base * typeMultiplier("business", intent),
      });
    }
  }

  for (const e of idx.events) {
    const head = `${e.title} ${e.location}`;
    const base = matchedCount(head, T) * 3 + matchedCount(e.description, T);
    if (base > 0) {
      results.push({
        type: "event",
        title: e.title,
        snippet: plainText(e.description, 140),
        url: `/sabitiya/${e.slug}`,
        score: base * typeMultiplier("event", intent),
      });
    }
  }

  // По резултат, после по-късото име напред (по-общ/каноничен запис).
  results.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.title.length - b.title.length,
  );
  return results.slice(0, limit);
}

// Обединено търсене по думи в основните типове съдържание.
export async function search(query: string, limit = 12): Promise<SearchResult[]> {
  if (buildTermGroups(query).length === 0) return [];
  const idx = await loadIndex();
  return rankIndex(idx, query, limit);
}

// Записва запитване без резултат, за да виждаме какво търсят хората.
export async function recordMiss(query: string): Promise<void> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;
  try {
    const existing = await prisma.searchMiss.findFirst({ where: { query: q } });
    if (existing) {
      await prisma.searchMiss.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, resolved: false },
      });
    } else {
      await prisma.searchMiss.create({ data: { query: q } });
    }
  } catch (err) {
    console.error("Грешка при запис на търсене без резултат:", err);
  }
}
