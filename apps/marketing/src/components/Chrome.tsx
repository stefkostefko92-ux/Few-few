import Link from "next/link";
import { SITE } from "../lib/site";

export function Header() {
  return (
    <header className="site-header">
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}
      >
        <Link href="/" style={{ fontFamily: "Playfair Display, serif", fontSize: "1.5rem", color: "var(--brass-300)" }}>
          {SITE.name}
        </Link>
        <nav style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <Link href="/games/">Игри</Link>
          <Link href="/about/">За нас</Link>
          <a className="cta" href={SITE.playUrl}>
            Играй сега
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container" style={{ padding: "1.5rem 1.25rem" }}>
        <nav
          style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem", marginBottom: "0.75rem", fontSize: "0.9rem" }}
        >
          <Link href="/about/">За нас</Link>
          <Link href="/terms/">Общи условия</Link>
          <Link href="/privacy/">Поверителност</Link>
          <Link href="/cookies/">Бисквитки</Link>
          <Link href="/responsible/">Отговорна игра</Link>
        </nav>
        <p>Социална игра — не е хазарт за реални пари. Само за 18+.</p>
        <p style={{ marginTop: "0.25rem" }}>
          <a href={SITE.org.url} target="_blank" rel="noopener noreferrer">
            Created and Designed by Carbon Stealth VCC
          </a>
        </p>
      </div>
    </footer>
  );
}
