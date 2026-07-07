import Link from "next/link";
import Logo from "@/components/Logo";

const NAV = [
  { href: "/etiketi", label: "Етикети" },
  { href: "/vizitki", label: "Визитки" },
  { href: "/cv", label: "CV" },
  { href: "/pismo", label: "Писмо" },
];

export default function Header() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight"
        >
          <Logo className="h-9 w-9" />
          <span>
            Мастилко
            <span className="ml-2 hidden rounded-full bg-med-pale px-2 py-0.5 text-xs font-semibold text-ink-soft sm:inline">
              безплатно
            </span>
          </span>
        </Link>
        <nav aria-label="Основна навигация" className="flex items-center gap-1 sm:gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft transition hover:bg-tera-pale hover:text-tera-dark sm:px-4 sm:text-base"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
