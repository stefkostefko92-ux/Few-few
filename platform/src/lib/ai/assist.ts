import "server-only";
import { resolveProvider, type AiProvider } from "@/lib/ai/generate";
import {
  assistSystemPrompt,
  cleanAssistOutput,
  rulesFallback,
  type AssistAction,
} from "@/lib/ai/assist-core";

// AI асистент за текст на блок — „AI навсякъде" (подобри/скъси/официално/превод).
// Provider-гъвкав, същата резолюция като генератора; без ключ пада на rules.

async function withTimeout(url: string, init: RequestInit, ms = 20_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function viaAnthropic(system: string, prompt: string): Promise<string> {
  const res = await withTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
}

async function viaOpenAI(system: string, prompt: string): Promise<string> {
  const res = await withTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function viaGemini(system: string, prompt: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await withTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export type AssistResult = { text: string; provider: AiProvider; changed: boolean };

// Преобразува текст според действието. Никога не хвърля към UI — при грешка/липса
// на ключ връща детерминиран резерв (често оригинала непокътнат).
export async function assistText(
  action: AssistAction,
  text: string,
): Promise<AssistResult> {
  const input = text.trim();
  if (!input) return { text: "", provider: "rules", changed: false };

  const { provider } = resolveProvider();
  const system = assistSystemPrompt(action);
  try {
    let out = "";
    if (provider === "anthropic") out = await viaAnthropic(system, input);
    else if (provider === "openai") out = await viaOpenAI(system, input);
    else if (provider === "gemini") out = await viaGemini(system, input);
    if (provider !== "rules" && out.trim()) {
      const cleaned = cleanAssistOutput(out);
      if (cleaned) return { text: cleaned, provider, changed: cleaned !== input };
    }
  } catch (err) {
    console.error("AI асистент падна към rules:", err);
  }
  const fallback = rulesFallback(action, input);
  return { text: fallback, provider: "rules", changed: fallback !== input };
}
