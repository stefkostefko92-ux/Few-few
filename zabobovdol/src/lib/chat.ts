import { prisma } from "@/lib/prisma";
import { search, recordMiss } from "@/lib/search";
import { plainText } from "@/lib/markdown";
import { SITE } from "@/lib/site";

export type ChatSource = { title: string; url: string };
export type ChatTurn = { role: "user" | "bot"; text: string };
export type ChatProvider = "rules" | "anthropic" | "gemini";

export type ChatAnswer = {
  answer: string;
  sources: ChatSource[];
  provider: ChatProvider;
};

// Поточни събития към интерфейса (NDJSON). Текстът пристига на части (delta),
// после идват източниците и накрая „done".
export type ChatChunk =
  | { type: "delta"; text: string }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "done"; provider: ChatProvider }
  | { type: "error"; message: string };

type Hit = Awaited<ReturnType<typeof search>>[number];
type Ctx = { title: string; url: string; body: string };

const MAX_HISTORY_TURNS = 8; // колко предишни реплики помним при заявка към AI

// ───────────────────────── Помощни функции ─────────────────────────

const norm = (s: string) => s.toLowerCase().trim();

// Днешната дата в София, изписана на български — за отговори, зависещи от деня
// (срокове, „кой празнува днес", „кога идва еврото").
function todayInSofia(): string {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

// Чист откъс, който НЕ реже по средата на дума/изречение.
function cleanExcerpt(src: string, max = 360): string {
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
        const steps = f.steps
          ? `\nСтъпки: ${f.steps.split("\n").filter(Boolean).join("; ")}`
          : "";
        out.push({
          title: f.question,
          url: h.url,
          body: `${plainText(f.answer, 1400)}${steps}`,
        });
      }
    } else if (h.type === "service") {
      const s = await prisma.service.findUnique({
        where: { slug },
        select: {
          name: true, phone: true, phone2: true, address: true,
          hours: true, description: true,
        },
      });
      if (s) {
        const lines = [
          s.phone ? `Телефон: ${s.phone}` : "",
          s.phone2 ? `Втори телефон: ${s.phone2}` : "",
          s.address ? `Адрес: ${s.address}` : "",
          s.hours ? `Работно време: ${s.hours}` : "",
          plainText(s.description, 300),
        ].filter(Boolean);
        out.push({ title: s.name, url: h.url, body: lines.join("\n") });
      }
    } else if (h.type === "business") {
      const b = await prisma.business.findUnique({
        where: { slug },
        select: { name: true, phone: true, address: true, hours: true, description: true },
      });
      if (b) {
        const lines = [
          b.phone ? `Телефон: ${b.phone}` : "",
          b.address ? `Адрес: ${b.address}` : "",
          b.hours ? `Работно време: ${b.hours}` : "",
          plainText(b.description, 300),
        ].filter(Boolean);
        out.push({ title: b.name, url: h.url, body: lines.join("\n") });
      }
    } else if (h.type === "event") {
      const e = await prisma.event.findUnique({
        where: { slug },
        select: { title: true, description: true, location: true, startAt: true },
      });
      if (e) {
        const when = new Intl.DateTimeFormat("bg-BG", {
          dateStyle: "long", timeStyle: "short",
        }).format(e.startAt);
        out.push({
          title: e.title,
          url: h.url,
          body: `Кога: ${when}. Място: ${e.location || "—"}. ${plainText(e.description, 300)}`.trim(),
        });
      }
    }
  }
  return out;
}

// ───────────────────────── Бързи намерения ─────────────────────────

function quickIntent(q: string): ChatAnswer | null {
  const n = norm(q);

  // Спешен случай — винаги извеждаме 112 на първо място.
  if (/(пожар|линейк|спешен случай|спешно|опасност за живот|кръв тече|задушав|инфаркт|обади.*линейк|умира|припадна)/.test(n)) {
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
  if (
    /^(здравей|здрасти|здравейте|добър ден|добро утро|добър вечер|ало|хей|привет|здр)/.test(n) ||
    /(какво можеш|с какво.*помагаш|кой си|как работиш|що за помощник)/.test(n)
  ) {
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
  if (/^(благодаря|мерси|благодаря ви|много благодаря|мерси много|тенкю|супер, благодаря)/.test(n)) {
    return {
      answer: "Моля, винаги съм насреща. Ако имате друг въпрос — пишете.",
      sources: [],
      provider: "rules",
    };
  }

  return null;
}

// ───────────────────────── Поточен отговор ─────────────────────────

// Кой AI доставчик е включен (ако има). Gemini Flash е безплатен; Claude е
// платен. Без ключ/без CHAT_PROVIDER → работим само на правила (от съдържанието).
function selectedProvider(): "gemini" | "anthropic" | null {
  const p = process.env.CHAT_PROVIDER;
  if (p === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// Главната функция: връща поток от събития. Интерфейсът ги показва на части.
export async function* streamAnswer(
  question: string,
  history: ChatTurn[] = [],
): AsyncGenerator<ChatChunk> {
  const q = question.trim();
  if (q.length < 2) {
    yield { type: "delta", text: "Напишете въпрос с поне няколко букви." };
    yield { type: "done", provider: "rules" };
    return;
  }

  const quick = quickIntent(q);
  if (quick) {
    yield { type: "delta", text: quick.answer };
    if (quick.sources.length) yield { type: "sources", sources: quick.sources };
    yield { type: "done", provider: "rules" };
    return;
  }

  const hits = await search(q, 8);

  const provider = selectedProvider();
  if (provider) {
    try {
      if (provider === "gemini") yield* streamWithGemini(q, history, hits);
      else yield* streamWithClaude(q, history, hits);
      return;
    } catch (err) {
      console.error("AI доставчикът отказа, връщам се към правила:", err);
      // Падаме обратно към правилата само ако още нищо не е изпратено
      // (грешката се хвърля преди първата delta).
    }
  }

  const rules = await answerWithRules(q, hits);
  yield { type: "delta", text: rules.answer };
  if (rules.sources.length) yield { type: "sources", sources: rules.sources };
  yield { type: "done", provider: "rules" };
}

// Удобен непоточен вариант (за тестове и за други извиквачи).
export async function answerQuestion(
  question: string,
  history: ChatTurn[] = [],
): Promise<ChatAnswer> {
  let answer = "";
  let sources: ChatSource[] = [];
  let provider: ChatProvider = "rules";
  for await (const chunk of streamAnswer(question, history)) {
    if (chunk.type === "delta") answer += chunk.text;
    else if (chunk.type === "sources") sources = chunk.sources;
    else if (chunk.type === "done") provider = chunk.provider;
  }
  return { answer: answer.trim(), sources, provider };
}

// ───────────────────────── Правила (без AI) ─────────────────────────

async function answerWithRules(q: string, hits: Hit[]): Promise<ChatAnswer> {
  if (hits.length === 0) {
    await recordMiss(q);
    return {
      answer:
        "Все още нямам готов отговор на този въпрос. Записах го и ще добавим информация.\n\n" +
        "Междувременно опитайте с друга дума, разгледайте „Услуги и телефони“, " +
        `или ни пишете на ${SITE.contact.email}.`,
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

// ───────────────────────── Claude (RAG, поточно) ─────────────────────────

function buildSystemPrompt(context: string): string {
  const today = todayInSofia();
  return [
    `Ти си „Дигиталният помощник“ на ${SITE.name} — официално-любезен, търпелив и`,
    `изключително точен консултант за жителите на град ${SITE.geo.city}.`,
    "Голяма част от хората, на които помагаш, са възрастни и не са свикнали с",
    "технологиите. Затова пишеш просто, спокойно и насърчаващо.",
    "",
    `Днес е ${today} (часова зона Европа/София).`,
    "",
    "ПРАВИЛА:",
    "1. Отговаряй ВИНАГИ на български, с кратки изречения и без чужди думи и жаргон.",
    "2. Използвай САМО фактите от ИЗТОЧНИЦИТЕ по-долу. НИКОГА не измисляй телефони,",
    "   адреси, цени, срокове или имена. Ако нещо го няма в източниците, кажи честно:",
    `   „Не разполагам с тази информация“ и насочи към „Услуги и телефони“ или към`,
    `   имейла ${SITE.contact.email}.`,
    "3. Телефонните номера изписвай точно както са в източниците, всеки на отделен ред.",
    "4. Когато има стъпки, изброй ги ясно — една стъпка на ред, започната с тире.",
    "5. Дръж отговора кратък (обикновено 2–6 изречения). Първо най-важното.",
    "6. При спешност (живот в опасност, пожар, тежко нараняване) винаги напомняй за 112.",
    "7. Бъди внимателен към измами: никога не съветвай човек да дава пароли, ПИН,",
    "   кодове или пари по телефона; при съмнение насочи към раздела за измами.",
    "8. Отговаряй само по темите на сайта (местни услуги, документи, помощ за жителите).",
    "   Учтиво откажи въпроси извън тях.",
    "9. Не повтаряй буквално целия източник — обобщи го с думи, разбираеми за всеки.",
    "",
    "ИЗТОЧНИЦИ (само това знаеш със сигурност):",
    context,
  ].join("\n");
}

function toApiMessages(history: ChatTurn[], q: string) {
  const trimmed = history
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({
      role: t.role === "user" ? ("user" as const) : ("assistant" as const),
      content: t.text.slice(0, 1500),
    }));
  // Гарантираме, че разговорът завършва с текущия въпрос на потребителя.
  const msgs = [...trimmed];
  if (msgs.length === 0 || msgs[msgs.length - 1].role !== "user") {
    msgs.push({ role: "user", content: q });
  } else {
    msgs[msgs.length - 1] = { role: "user", content: q };
  }
  return msgs;
}

async function* streamWithClaude(
  q: string,
  history: ChatTurn[],
  hits: Hit[],
): AsyncGenerator<ChatChunk> {
  const ctx = await hydrate(hits, 6);
  if (ctx.length === 0) {
    const rules = await answerWithRules(q, hits);
    yield { type: "delta", text: rules.answer };
    if (rules.sources.length) yield { type: "sources", sources: rules.sources };
    yield { type: "done", provider: "rules" };
    return;
  }

  const context = ctx
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.body}\nИзточник: ${SITE.url}${c.url}`)
    .join("\n\n");
  const sources = ctx.slice(0, 4).map((c) => ({ title: c.title, url: c.url }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 800,
      temperature: 0.2,
      system: buildSystemPrompt(context),
      messages: toApiMessages(history, q),
      stream: true,
    }),
  });

  // Хвърляме ПРЕДИ да сме пуснали първа delta → горният слой пада към правилата.
  if (!res.ok || !res.body) throw new Error(`Anthropic API ${res.status}`);

  yield* drain(anthropicDeltas(res.body), q, hits, sources, "anthropic");
}

// ───────────────────────── Gemini (RAG, поточно, безплатно) ─────────────────────────

// Историята във формата на Gemini: роли „user" и „model", завършва с въпроса.
function toGeminiContents(history: ChatTurn[], q: string) {
  const turns = history
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.text.slice(0, 1500) }],
    }));
  const contents = [...turns];
  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    contents.push({ role: "user", parts: [{ text: q }] });
  } else {
    contents[contents.length - 1] = { role: "user", parts: [{ text: q }] };
  }
  return contents;
}

async function* streamWithGemini(
  q: string,
  history: ChatTurn[],
  hits: Hit[],
): AsyncGenerator<ChatChunk> {
  const ctx = await hydrate(hits, 6);
  if (ctx.length === 0) {
    const rules = await answerWithRules(q, hits);
    yield { type: "delta", text: rules.answer };
    if (rules.sources.length) yield { type: "sources", sources: rules.sources };
    yield { type: "done", provider: "rules" };
    return;
  }

  const context = ctx
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.body}\nИзточник: ${SITE.url}${c.url}`)
    .join("\n\n");
  const sources = ctx.slice(0, 4).map((c) => ({ title: c.title, url: c.url }));

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const key = process.env.GEMINI_API_KEY as string;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemPrompt(context) }] },
      contents: toGeminiContents(history, q),
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  });

  // Хвърляме ПРЕДИ първа delta → горният слой пада към правилата.
  if (!res.ok || !res.body) throw new Error(`Gemini API ${res.status}`);

  yield* drain(geminiDeltas(res.body), q, hits, sources, "gemini");
}

// ───────────────────────── Общ поток / SSE ─────────────────────────

// Пуска текстовите парчета от доставчика; ако нищо не дойде — пада към правилата;
// ако прекъсне след вече казано — добавя кратка бележка. Накрая дава източници.
async function* drain(
  deltas: AsyncGenerator<string>,
  q: string,
  hits: Hit[],
  sources: ChatSource[],
  provider: ChatProvider,
): AsyncGenerator<ChatChunk> {
  let produced = false;
  try {
    for await (const text of deltas) {
      produced = true;
      yield { type: "delta", text };
    }
  } catch (err) {
    if (!produced) throw err; // нищо не е казано → падаме към правилата
    console.error("Прекъсване по средата на потока:", err);
    yield {
      type: "delta",
      text: "\n\n(Връзката прекъсна. Ако отговорът е непълен, опитайте пак.)",
    };
  }

  if (!produced) {
    const rules = await answerWithRules(q, hits);
    yield { type: "delta", text: rules.answer };
    yield { type: "sources", sources: rules.sources };
    yield { type: "done", provider: "rules" };
    return;
  }

  yield { type: "sources", sources };
  yield { type: "done", provider };
}

// Чете SSE поток ред по ред и връща съдържанието на „data:" редовете.
async function* sseDataLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Текстовите парчета от потока на Anthropic.
async function* anthropicDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  for await (const payload of sseDataLines(body)) {
    let evt: {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    try {
      evt = JSON.parse(payload);
    } catch {
      continue;
    }
    if (evt.type === "error") throw new Error(evt.error?.message || "stream error");
    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
      yield evt.delta.text;
    }
  }
}

// Текстовите парчета от потока на Gemini.
async function* geminiDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  for await (const payload of sseDataLines(body)) {
    let evt: {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };
    try {
      evt = JSON.parse(payload);
    } catch {
      continue;
    }
    if (evt.error?.message) throw new Error(evt.error.message);
    const parts = evt.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) if (p.text) yield p.text;
    }
  }
}
