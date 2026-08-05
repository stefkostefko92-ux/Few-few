import Link from "next/link";

import { DATA_SOURCES, PUBLISHER, SITE_NAME } from "@/lib/site";

const LEGAL = [
  { href: "/poveritelnost", label: "Поверителност" },
  { href: "/usloviya", label: "Условия за ползване" },
  { href: "/danni-v-rezultatite", label: "Данни за трети лица" },
  { href: "/impresum", label: "Импресум" },
] as const;

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-text">{SITE_NAME}</p>
            <p className="mt-2 text-sm text-text-muted">
              Продукт на{" "}
              <a href={PUBLISHER.url} className="text-accent underline underline-offset-2">
                {PUBLISHER.legalName}
              </a>
              . Без реклами, без проследяване, без бисквитки.
            </p>
            <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Правна информация">
              {LEGAL.map((item) => (
                <Link key={item.href} href={item.href} className="text-text-muted underline underline-offset-2 hover:text-text">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Кредитът към източниците не е учтивост — част от лицензите (Spamhaus
              DROP, публичните диапазони) го изискват изрично. */}
          <div>
            <p className="card-title">Източници на данните</p>
            <ul className="mt-2 space-y-1 text-sm text-text-muted">
              {DATA_SOURCES.map((source) => (
                <li key={source.url}>
                  <a href={source.url} className="underline underline-offset-2 hover:text-text" rel="noreferrer">
                    {source.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 text-xs text-text-faint">
          Справката се прави от публични регистри и публични списъци. Тя не установява самоличност и не
          е основание за твърдения за конкретен човек.
        </p>
      </div>
    </footer>
  );
}
