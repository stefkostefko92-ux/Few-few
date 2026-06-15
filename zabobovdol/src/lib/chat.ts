import { prisma } from "@/lib/prisma";
import { search, recordMiss } from "@/lib/search";
import { plainText } from "@/lib/markdown";
import { SITE } from "@/lib/site";

export type ChatAnswer = {
  answer: string;
  sources: { title: string; url: string }[];
  provider: "rules" | "anthropic";
};

// Слой за чатбота с превключвател. По подразбиране работи без AI ("rules"):
// намира най-подходящия отговор от базата. Когато сложиш ANTHROPIC_API_KEY и
// CHAT_PROVIDER="anthropic", същият вход минава през Claude с локалния контекст.
export async function answerQuestion(question: string): Promise<ChatAnswer> {
  const q = question.trim();
  if (q.length < 2) {
    return {
      answer: "Напишете въпрос с поне няколко букви.",
      sources: [],
      provider: "rules",
    };
  }

  const hits = await search(q, 5);
  if (process.env.CHAT_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    try {
      return await answerWithClaude(q, hits);
    } catch (err) {
      console.error("Грешка при заявка към Claude, връщам се към правила:", err);
    }
  }
  return answerWithRules(q, hits);
}

async function answerWithRules(
  q: string,
  hits: Awaited<ReturnType<typeof search>>,
): Promise<ChatAnswer> {
  if (hits.length === 0) {
    await recordMiss(q);
    return {
      answer:
        "Все още нямам готов отговор на този въпрос. Записахме го и ще добавим " +
        "информация. Междувременно може да попитате близък човек или да ни " +
        `пишете на ${SITE.contact.email}.`,
      sources: [],
      provider: "rules",
    };
  }
  const top = hits[0];
  const more = hits.slice(1, 4);
  let answer = `${top.snippet}`;
  if (more.length) {
    answer +=
      "\n\nВижте също:\n" + more.map((h) => `• ${h.title}`).join("\n");
  }
  return {
    answer,
    sources: hits.slice(0, 4).map((h) => ({ title: h.title, url: h.url })),
    provider: "rules",
  };
}

async function answerWithClaude(
  q: string,
  hits: Awaited<ReturnType<typeof search>>,
): Promise<ChatAnswer> {
  // Зареждаме компактен локален контекст: топ въпроси и услуги.
  const [faqs, services] = await Promise.all([
    prisma.faq.findMany({
      where: { published: true },
      orderBy: { views: "desc" },
      take: 25,
      select: { question: true, answer: true, slug: true },
    }),
    prisma.service.findMany({
      where: { published: true },
      take: 40,
      select: { name: true, phone: true, address: true, hours: true, slug: true },
    }),
  ]);

  const context = [
    "ЧЕСТО ЗАДАВАНИ ВЪПРОСИ:",
    ...faqs.map(
      (f) => `Въпрос: ${f.question}\nОтговор: ${plainText(f.answer, 400)}`,
    ),
    "",
    "УСЛУГИ И ТЕЛЕФОНИ:",
    ...services.map(
      (s) =>
        `${s.name} | тел: ${s.phone || "—"} | адрес: ${s.address || "—"} | часове: ${s.hours || "—"}`,
    ),
  ].join("\n");

  const system =
    `Ти си любезен помощник на жителите на град Бобов дол. Отговаряй кратко, ` +
    `просто и на български, подходящо за хора от всички възрасти, включително ` +
    `по-възрастни. Използвай САМО предоставения по-долу местен контекст. Ако ` +
    `информацията липсва, кажи честно, че не разполагаш с нея, и предложи да ` +
    `пишат на нас или да попитат близък. Не измисляй телефони и адреси.\n\n` +
    `ЛОКАЛЕН КОНТЕКСТ:\n${context}`;

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
      system,
      messages: [{ role: "user", content: q }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const answer =
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim() || "Извинявам се, не успях да отговоря в момента.";

  return {
    answer,
    sources: hits.slice(0, 4).map((h) => ({ title: h.title, url: h.url })),
    provider: "anthropic",
  };
}
