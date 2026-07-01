import "server-only";
import {
  parseBlocks,
  makeBlock,
  newBlockId,
  type Block,
} from "@/lib/blocks";

// AI генератор на страници — „опиши сайта, AI го построява" (като Wix Harmony/Aria).
// Provider-гъвкав по модела на zabobovdol/ai-config: по подразбиране нашия
// стандарт Claude (claude-opus-4-8); по избор OpenAI (каквото ползва Wix) или
// Gemini; без ключ — детерминиран „rules" генератор от шаблон.

export type AiProvider = "anthropic" | "openai" | "gemini" | "rules";

export type AiResolved = {
  provider: AiProvider; // какво реално ще работи
  configured: AiProvider; // какво е избрано
};

function pick(v: string | undefined): AiProvider | "" {
  return v === "anthropic" || v === "openai" || v === "gemini" || v === "rules"
    ? v
    : "";
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): AiResolved {
  const configured: AiProvider = pick(env.AI_PROVIDER) || "anthropic";
  let provider: AiProvider = "rules";
  if (configured === "anthropic" && env.ANTHROPIC_API_KEY) provider = "anthropic";
  else if (configured === "openai" && env.OPENAI_API_KEY) provider = "openai";
  else if (configured === "gemini" && env.GEMINI_API_KEY) provider = "gemini";
  return { provider, configured };
}

// Инструкция за модела: строг JSON масив от нашите блокове.
const SYSTEM = `Ти си дизайнер на уеб страници. По кратко описание връщаш само страница
като СТРОГ JSON масив от блокове (без обяснения, без markdown ограждане).
Всеки блок е обект с "type" и полета:
- {"type":"hero","title":"...","subtitle":"...","align":"center","buttonLabel":"...","buttonHref":""}
- {"type":"heading","level":2,"text":"...","align":"left"}
- {"type":"text","text":"... (позволен е лек markdown: **удебелен** _курсив_ [линк](https://...))","align":"left"}
- {"type":"image","url":"","alt":"...","align":"center","rounded":true}
- {"type":"button","label":"...","href":"","align":"left","variant":"primary"}
- {"type":"gallery","images":[]}
- {"type":"divider"}
- {"type":"spacer","size":"md"}
Пиши съдържанието на български, стегнато и смислено. URL полета остави празни ("") освен ако не си сигурен в реален https адрес.
Започни с hero. Върни между 4 и 8 блока. Само JSON масивът.`;

// Извлича първия JSON масив от текст (моделите понякога ограждат с ```).
function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function withTimeout(url: string, init: RequestInit, ms = 30_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function viaAnthropic(prompt: string): Promise<Block[]> {
  const res = await withTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
  return finalize(extractJsonArray(text));
}

async function viaOpenAI(prompt: string): Promise<Block[]> {
  const res = await withTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return finalize(extractJsonArray(text));
}

async function viaGemini(prompt: string): Promise<Block[]> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await withTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return finalize(extractJsonArray(text));
}

// Детерминиран генератор без AI ключ — прилична начална страница от описанието.
function viaRules(prompt: string): Block[] {
  const title = prompt.trim().split(/[.\n]/)[0].slice(0, 80) || "Добре дошли";
  const blocks: Block[] = [
    { id: newBlockId(), type: "hero", title, subtitle: "Кратко въведение за вашия сайт.", align: "center", buttonLabel: "Научете повече", buttonHref: "" },
    { id: newBlockId(), type: "heading", level: 2, text: "Какво предлагаме", align: "center" },
    { id: newBlockId(), type: "text", text: `Тази страница е създадена от описание: „${title}". Редактирайте текста и блоковете отдясно, или свържете AI ключ за по-богато генериране.`, align: "center" },
    { id: newBlockId(), type: "divider" },
    { id: newBlockId(), type: "heading", level: 3, text: "Свържете се с нас", align: "left" },
    { id: newBlockId(), type: "button", label: "Контакти", href: "", align: "left", variant: "primary" },
  ];
  return blocks;
}

// Валидира през Zod и презадава уникални id-та (моделът може да върне лоши id).
function finalize(raw: unknown): Block[] {
  const withIds = Array.isArray(raw)
    ? raw.map((b) => ({ ...(b as object), id: newBlockId() }))
    : [];
  const clean = parseBlocks(withIds);
  return clean;
}

// Генерира блокове от описание. Никога не хвърля към UI — при грешка/липса на
// ключ пада на rules генератора.
export async function generatePageBlocks(prompt: string): Promise<{
  blocks: Block[];
  provider: AiProvider;
}> {
  const { provider } = resolveProvider();
  try {
    let blocks: Block[] = [];
    if (provider === "anthropic") blocks = await viaAnthropic(prompt);
    else if (provider === "openai") blocks = await viaOpenAI(prompt);
    else if (provider === "gemini") blocks = await viaGemini(prompt);
    if (blocks.length > 0) return { blocks, provider };
  } catch (err) {
    console.error("AI генериране падна към rules:", err);
  }
  // fallback — гарантирано връща нещо смислено
  const b = viaRules(prompt);
  return { blocks: b.length ? b : [makeBlock("hero")], provider: "rules" };
}
