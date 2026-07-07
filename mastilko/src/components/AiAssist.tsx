"use client";

import { useState } from "react";
import { askAi, splitSuggestions, type AiMode } from "@/lib/ai-client";

interface Props {
  mode: AiMode;
  /** Какво пращаме на AI (описание от потребителя или текущ текст). */
  input: string;
  /** Етикет на бутона, напр. „Предложи текст с AI“. */
  label: string;
  /** При режими със списък — извиква се с избраното предложение. */
  onPick: (text: string) => void;
  /** true → отговорът е един цял текст (CV), не списък от варианти. */
  single?: boolean;
}

// Общ AI бутон: вика /api/ai (Gemini Flash), показва предложенията и
// прозрачно казва, че въведеното се изпраща към Google.
export default function AiAssist({ mode, input, label, onPick, single }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  async function run() {
    if (busy) return;
    setError(null);
    if (input.trim().length < 3) {
      setError("Първо напиши поне няколко думи, за да има от какво да тръгне AI.");
      return;
    }
    setBusy(true);
    try {
      const text = await askAi(mode, input);
      if (single) {
        onPick(text.trim());
        setSuggestions([]);
      } else {
        setSuggestions(splitSuggestions(text));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI услугата не е налична.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print">
      <button type="button" onClick={run} disabled={busy} className="btn-secondary text-sm">
        <span aria-hidden>✨</span>
        {busy ? "Мастилко мисли…" : label}
      </button>
      <p className="mt-1 text-xs text-ink-faint">
        Подсказките ползват Google Gemini — въведеният текст се изпраща към
        Google само когато натиснеш бутона.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-tera-dark">
          {error}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick(s);
                  setSuggestions([]);
                }}
                className="w-full rounded-xl border border-tera/30 bg-tera-pale/60 px-3 py-2 text-left text-sm transition hover:border-tera hover:bg-tera-pale"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
