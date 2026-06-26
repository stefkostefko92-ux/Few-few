import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container" style={{ padding: "5rem 1.25rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "3rem" }}>404</h1>
      <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>Страницата не е намерена.</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/">← Към началото</Link>
      </p>
    </section>
  );
}
