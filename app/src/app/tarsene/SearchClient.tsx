"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type SearchItem = {
  title: string;
  href: string;
  section: string;
  keywords: string;
};

export function SearchClient({
  items,
  initialQuery = "",
}: {
  items: SearchItem[];
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter(
        (it) =>
          it.title.toLowerCase().includes(needle) ||
          it.keywords.toLowerCase().includes(needle) ||
          it.section.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [q, items]);

  return (
    <div>
      <label className="label" htmlFor="q">
        Какво търсите?
      </label>
      <input
        id="q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="напр. аптека, вода, данъци, личен лекар"
        className="input max-w-xl"
        autoFocus
      />

      <div className="mt-6">
        {q.trim() === "" ? (
          <p className="text-base text-slate-500">
            Напишете дума, за да търсите из целия сайт.
          </p>
        ) : results.length === 0 ? (
          <p className="text-base text-slate-600">
            Няма резултати за „{q}“. Опитайте с друга дума.
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.href} className="card">
                <p className="text-sm font-semibold text-brand-700">{r.section}</p>
                <Link
                  href={r.href}
                  className="font-display text-lg font-bold text-slate-900 hover:text-brand-800 hover:underline"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
