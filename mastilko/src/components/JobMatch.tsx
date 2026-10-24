"use client";

import { useId, useMemo, useState } from "react";
import { matchCv } from "@/lib/job-match";

interface Props {
  /** Целият текст на CV-то (всички полета, слепени). */
  cvText: string;
}

// „Сравни с обява“ — поставяш обявата, виждаш кои нейни ключови думи ги има в
// CV-то и кои липсват. Изцяло в браузъра: обявата не се пази и не се изпраща
// никъде (не е в състоянието на проекта, не отива към AI).
export default function JobMatch({ cvText }: Props) {
  const id = useId();
  const [ad, setAd] = useState("");
  const r = useMemo(() => matchCv(cvText, ad), [cvText, ad]);

  return (
    <div className="card-warm space-y-3 p-5">
      <label htmlFor={id} className="field-label">Сравни с обява за работа</label>
      <textarea
        id={id}
        className="field-input min-h-24 text-sm"
        maxLength={8000}
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        placeholder="Постави текста на обявата — ще видиш кои от ключовите ѝ думи ги има в CV-то ти."
      />
      <p className="text-xs text-ink-faint">
        Сравнението става в браузъра ти — обявата не се пази и не се изпраща никъде.
      </p>
      {ad.trim() && (
        <div className="space-y-2 text-sm" aria-live="polite">
          <p className="font-semibold">
            Покриваш {r.percent}% от ключовите думи на обявата ({r.found.length} от {r.found.length + r.missing.length}).
          </p>
          {r.missing.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-soft">
                Липсват — добави ги, само ако наистина ги владееш:
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {r.missing.map((w) => (
                  <li key={w} className="rounded-full border border-ink/20 px-2 py-0.5 text-xs">{w}</li>
                ))}
              </ul>
            </div>
          )}
          {r.found.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-soft">Вече ги има:</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {r.found.map((w) => (
                  <li key={w} className="rounded-full bg-ink/10 px-2 py-0.5 text-xs">✓ {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
