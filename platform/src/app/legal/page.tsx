import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DOCS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Правна информация · Платформа",
  description: "Общи условия, политика за поверителност и бисквитки.",
  robots: { index: true, follow: true },
};

export default function LegalIndex() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
      <h1 className="text-2xl font-semibold text-white">Правна информация</h1>
      <p className="mt-2 text-sm text-ink-400">
        Документите уреждат ползването на платформата и защитата на данните.
      </p>
      <ul className="mt-6 space-y-3">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="block rounded-lg border border-ink-800 p-4 hover:border-brand-700 hover:bg-ink-900"
            >
              <span className="font-medium text-white">{d.title}</span>
              <span className="mt-1 block text-xs text-ink-500">{d.intro.slice(0, 100)}…</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
