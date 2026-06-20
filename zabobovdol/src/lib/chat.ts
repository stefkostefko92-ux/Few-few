import { prisma } from "@/lib/prisma";
import { search, recordMiss } from "@/lib/search";
import { plainText } from "@/lib/markdown";
import { SITE } from "@/lib/site";

export type ChatAnswer = {
  answer: string;
  sources: { title: string; url: string }[];
  provider: "rules" | "anthropic";
};

type Hit = Awaited<ReturnType<typeof search>>[number];
type Ctx = { title: string; url: string; body: string };

// ───────────────────────── Помощни функции ─────────────────────────

const norm = (s: string) => s.toLowerCase().trim();

// Чист откъс, който НЕ реже по средата на дума/изречение.
function cleanExcerpt(src: string, max = 340): string {
  const t = plainText(src, 100000);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("\n"),
  );
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).trim() + "…";
}

// Зарежда пълното съдържание на най-добрите резултати (за грундиран отговор/RAG).
async function hydrate(hits: Hit[], n = 6): Promise<Ctx[]> {
  const out: Ctx[] = [];
  for (const h of hits.slice(0, n)) {
    const slug = h.url.split("/").pop() ?? "";
    if (!slug) continue;
    if (h.type === "faq") {
      const f = await prisma.faq.findUnique({
        where: { slug },
        select: { question: true, answer: true, steps: true },
      });
      if (f) {
        const steps = f.steps ? `\nСтъпки: ${f.steps.split("\n").filter(Boolean).join("; ")}` : "";
        out.push({ title: f.question, url: h.url, body: `${plainText(f.answer, 1400)}${steps}` });
      }
    } else if (h.type === "service") {
      const s = await prisma.service.findUnique({
        where: { slug },
        select: { name: true, phone: true, phone2: true, address: true, hours: true, description: true },
      });
      if (s) {
        const tel = [s.phone, s.phone2].filter(Boolean).join(" / ") || "—";
        out.push({
          title: s.name,
          url: h.url,
          body: `Телефон: ${tel}. Адрес: ${s.address || "—"}. Работно време: ${s.hours || "—"}. ${plainText(s.description, 300)}`.trim(),
        });
      }
    } else if (h.type === "business") {
      const b = await prisma.business.findUnique({
        where: { slug },
        select: { name: true, phone: true, address: true, hours: true, description: true },
      });
      if (b) {
        out.push({
          title: b.name,
          url: h.url,
          body: `Телефон: ${b.phone || "—"}. Адрес: ${b.address || "—"}. Работно време: ${b.hours || "—"}. ${plainText(b.description, 300)}`.trim(),
        });
      }
    } else if (h.type === "event") {
      const e = await prisma.event.findUnique({
        where: { slug },
        select: { title: true, description: true, location: true, startAt: true },
      });
      if (e) {
        const when = new Intl.DateTimeFormat("bg-BG", { dateStyle: "long", timeStyle: "short" }).format(e.startAt);
        out.push({ title: e.title, url: h.url, body: `Кога: ${when}. Място: ${e.location || "—"}. ${plainText(e.description, 300)}`.trim() });
      }
    }
  }
  return out;
}

// ───────────────────────── Бързи намерения ─────────────────────────

function quickIntent(q: string): ChatAnswer | null {
  const n = norm(q);

  // Спешен случай — винаги извеждаме 112 на първо място.
  if (/(пожар|линейк|спешен случай|спешно|опасност за живот|кръв тече|задушав|инфаркт|обади.*линейк)/.test(n)) {
    return {
      answer:
        "При спешен случай се обадете веднага на единен европейски номер 112 — " +
        "там приемат повиквания за полиция, спешна помощ и пожарна, денонощно.\n\n" +
        "Ако не чувате добре по телефона, вижте раздел „Достъпност“ за връзка с 112 за хора с увреден слух.",
      sources: [
        { title: "Спешни телефони (112)", url: "/uslugi?cat=EMERGENCY" },
        { title: "Достъпност — 112 за хора с увреден слух", url: "/dostapnost" },
      ],
      provider: "rules",
    };
  }

  // Поздрав / какво можеш.
  if (/^(здравей|здрасти|здравейте|добър ден|добро утро|добър вечер|ало|хей|привет|здр)/.test(n) ||
      /(какво можеш|с какво.*помагаш|кой си|как работиш|що за помощник)/.test(n)) {
    return {
      answer:
        `Здравейте! Аз съм дигиталният помощник на ${SITE.name}. Мога да помогна с:\n` +
        "• важни телефони и услуги в Бобов дол;\n" +
        "• обяснения „как да…“ за е-услуги и документи;\n" +
        "• пенсии и помощи, еврото, защита от измами, транспорт.\n\n" +
        "Просто напишете какво търсите — например „телефон на общината“, „как да платя данък“ или „дежурна аптека“.",
      sources: [
        { title: "Услуги и телефони", url: "/uslugi" },
        { title: "Как да… (ръководства)", url: "/kak-da" },
      ],
      provider: "rules",
    };
  }

  // Благодарност.
  if (/^(благодаря|мерси|благодаря ви|много благодаря|мерси много|тенкю)/.test(n)) {
    return {
      answer: "Моля, винаги съм насреща. Ако имате друг въпрос — пишете.",
      sources: [],
      provider: "rules",
    };
  }

  return null;
}

// ───────────────────────── Главна функция ─────────────────────────

export async function answerQuestion(question: string): Promise<ChatAnswer> {
  const q = question.trim();
  if (q.length < 2) {
    return { answer: "Напишете въпрос с поне няколко букви.", sources: [], provider: "rules" };
  }

  const quick = quickIntent(q);
  if (quick) return quick;

  const hits = await search(q, 6);

  if (process.env.CHAT_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    try {
      return await answerWithClaude(q, hits);
    } catch (err) {
      console.error("Грешка при заявка към Claude, връщам се към правила:", err);
    }
  }
  return await answerWithRules(q, hits);
}

// Правила (без AI): грундиран отговор от най-подходящото съдържание.
async function answerWithRules(q: string, hits: Hit[]): Promise<ChatAnswer> {
  if (hits.length === 0) {
    await recordMiss(q);
    return {
      answer:
        "Все още нямам готов отговор на този въпрос. Записах го и ще добавим информация. " +
        `Междувременно опитайте с друга дума, разгледайте „Услуги и телефони“, или ни пишете на ${SITE.contact.email}.`,
      sources: [
        { title: "Услуги и телефони", url: "/uslugi" },
        { title: "Как да… (ръководства)", url: "/kak-da" },
      ],
      provider: "rules",
    };
  }

  const ctx = await hydrate(hits, 4);

  // При въпрос за телефон/контакт предпочитаме услуга/бизнес с номер.
  const phoneIntent = /(телефон|номер|тел\.|контакт|обад|позвън|връзка с)/.test(norm(q));
  let lead = 0;
  if (phoneIntent) {
    const i = hits.findIndex((h) => h.type === "service" || h.type === "business");
    if (i >= 0) lead = i;
  }
  const topHit = hits[lead];
  const top = ctx[lead];
  const weak = topHit.score < 3;

  let answer = "";
  if (top) {
    const hedge = weak ? "Не съм напълно сигурен, но това може да помогне:\n\n" : "";
    if (topHit.type === "service" || topHit.type === "business" || topHit.type === "event") {
      answer = `${hedge}${top.title}\n${top.body}`;
    } else {
      answer = `${hedge}За „${top.title}“:\n\n${cleanExcerpt(top.body)}\n\nПълното обяснение е на страницата по-долу ↓`;
    }
  } else {
    answer = `${topHit.title}\n\n${topHit.snippet}`;
  }

  return {
    answer,
    sources: hits.slice(0, 4).map((h) => ({ title: h.title, url: h.url })),
    provider: "rules",
  };
}

// Claude (RAG): отговаря само от извлечения релевантен локален контекст.
async function answerWithClaude(q: string, hits: Hit[]): Promise<ChatAnswer> {
  const ctx = await hydrate(hits, 6);

  if (ctx.length === 0) {
    return answerWithRules(q, hits);
  }

  const context = ctx
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.body}\nИзточник: ${SITE.url}${c.url}`)
    .join("\n\n");

  const system =
    `Ти си любезен и точен помощник на жителите на град ${SITE.geo.city}. ` +
    "Отговаряй кратко, ясно и на български, подходящо за хора от всички възрасти. " +
    "Използвай САМО фактите от ИЗТОЧНИЦИТЕ по-долу. НИКОГА не измисляй телефони, " +
    "адреси, цени или срокове — ако ги няма в източниците, кажи честно, че не " +
    "разполагаш с информацията, и насочи към страница „Услуги и телефони“ или към " +
    `имейла ${SITE.contact.email}. При спешност винаги напомняй за номер 112. ` +
    "Когато ползваш факт, посочвай накратко от коя страница е. Не отговаряй на " +
    "въпроси извън темите на сайта (местни услуги, документи, помощ на жителите).\n\n" +
    `ИЗТОЧНИЦИ:\n${context}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 600,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: q }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const answer =
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim() || "Извинявам се, не успях да отговоря в момента.";

  return {
    answer,
    sources: ctx.slice(0, 4).map((c) => ({ title: c.title, url: c.url })),
    provider: "anthropic",
  };
}
