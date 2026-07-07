// Клиентски помощник за AI подсказките (говори само с нашия /api/ai).

export type AiMode = "label" | "card" | "cv-summary" | "cv-improve" | "letter";

export async function askAi(mode: AiMode, input: string): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, input }),
  });
  const data = (await res.json().catch(() => null)) as
    | { text?: string; error?: string }
    | null;
  if (!res.ok || !data?.text) {
    throw new Error(data?.error ?? "AI услугата не е налична в момента.");
  }
  return data.text;
}

/** Разделя отговор „по един вариант на ред“ на чисти предложения. */
export function splitSuggestions(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}
