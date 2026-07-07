import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// AI подсказки чрез безплатния Google Gemini Flash. Ключът живее САМО на
// сървъра (GEMINI_API_KEY) — клиентът никога не говори директно с Google.

export const runtime = "nodejs";

const BodySchema = z.object({
  mode: z.enum(["label", "card", "cv-summary", "cv-improve", "letter"]),
  input: z.string().trim().min(3).max(2000),
});

// Прост rate limit в паметта: 10 заявки/минута на IP. Достатъчен за
// един Node процес; целта е да пази безплатната квота, не да е крепост.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

// Глобален предпазител, независим от IP — X-Forwarded-For е клиентски
// контролиран, така че само per-IP лимит не пази безплатната Gemini квота.
const GLOBAL_MAX_PER_WINDOW = 120;
let globalHits: number[] = [];

function globalLimited(): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  if (globalHits.length >= GLOBAL_MAX_PER_WINDOW) return true;
  globalHits.push(now);
  return false;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  // Да не расте безкрайно при много различни IP-та.
  if (hits.size > 5000) hits.clear();
  return false;
}

const PROMPTS: Record<z.infer<typeof BodySchema>["mode"], (input: string) => string> = {
  label: (input) =>
    `Ти помагаш за текст на малък печатен етикет на български език. ` +
    `Потребителят описва за какво е етикетът: „${input}“. ` +
    `Предложи точно 3 варианта за текст на етикета — всеки на отделен ред, ` +
    `без номерация, без кавички, максимум 6 думи на вариант. ` +
    `Може по желание един ред да има втори по-малък текст след „|“ (напр. „Домашно сладко | ягода, 2026“).`,
  card: (input) =>
    `Ти помагаш за визитка на български език. Дейност/професия: „${input}“. ` +
    `Предложи точно 3 кратки, топли и професионални слогана за визитката — ` +
    `всеки на отделен ред, без номерация и без кавички, максимум 8 думи.`,
  "cv-summary": (input) =>
    `Напиши кратък професионален профил за автобиография (CV) на български език ` +
    `от първо лице, 2–3 изречения, без клишета и без преувеличения, ` +
    `на база тази информация: „${input}“. Върни само текста на профила.`,
  letter: (input) =>
    `Напиши кратко мотивационно писмо на български език (3–4 абзаца, до 200 ` +
    `думи) от първо лице по тази информация: „${input}“. Върни САМО основния ` +
    `текст — без обръщение („Уважаеми…“) и без подпис накрая. Тон: топъл, ` +
    `професионален и конкретен, без клишета и без измислени факти.`,
  "cv-improve": (input) =>
    `Подобри следния текст от автобиография (CV) на български език: „${input}“. ` +
    `Запази смисъла и фактите, направи го по-ясен, активен и професионален, ` +
    `без да измисляш нови факти. Върни само подобрения текст.`,
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI подсказките не са включени на този сървър." },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip) || globalLimited()) {
    return NextResponse.json(
      { error: "Прекалено много заявки — опитай пак след минута." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: PROMPTS[body.mode](body.input) }] },
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          error:
            status === 429
              ? "AI квотата е изчерпана за момента — опитай след малко."
              : "AI услугата не отговори — опитай пак.",
        },
        { status },
      );
    }

    const data: unknown = await res.json();
    const text = extractText(data);
    if (!text) {
      return NextResponse.json(
        { error: "AI не върна текст — опитай с друго описание." },
        { status: 502 },
      );
    }
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "AI услугата не отговори навреме — опитай пак." },
      { status: 504 },
    );
  }
}

function extractText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0] as {
    content?: { parts?: Array<{ text?: unknown }> };
  };
  const parts = first?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  return text || null;
}
