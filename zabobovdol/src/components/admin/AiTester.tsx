"use client";

import { useState } from "react";

const PROVIDER_BG: Record<string, string> = {
  rules: "Без AI (отговор от съдържанието на сайта)",
  gemini: "Google Gemini Flash",
  anthropic: "Anthropic Claude",
};

// Пробва истинския път на помощника (същия като в сайта) и показва отговора +
// кой режим е отговорил. Така редакторът вижда веднага дали ключът работи.
export function AiTester() {
  const [q, setQ] = useState("телефон на общината");
  const [out, setOut] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (loading || q.trim().length < 2) return;
    setLoading(true);
    setOut("");
    setProvider(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q.trim() }),
      });
      const ctype = res.headers.get("content-type") || "";
      if (!res.ok || !res.body || ctype.includes("application/json")) {
        const d = await res.json().catch(() => ({}));
        setOut(d.answer || "Грешка при заявката.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let evt: { type: string; text?: string; provider?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "delta" && evt.text) {
            acc += evt.text;
            setOut(acc);
          } else if (evt.type === "done" && evt.provider) {
            setProvider(evt.provider);
          }
        }
      }
    } catch {
      setOut("Грешка при свързване с помощника.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          aria-label="Пробен въпрос"
          placeholder="Напишете въпрос за проба…"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={loading}>
          {loading ? "Пробвам…" : "Тествай"}
        </button>
      </form>

      {(out || loading) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="whitespace-pre-line text-sm text-slate-800">
            {out || "…"}
          </div>
          {provider && (
            <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-600">
              Отговори: <strong>{PROVIDER_BG[provider] ?? provider}</strong>
              {provider === "rules" && (
                <> — AI не е включен или ключът не работи. Проверете настройките по-горе.</>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
