"use client";

import Link from "next/link";
import { useT } from "../i18n/I18nProvider";

export function NotFoundBody() {
  const t = useT();
  return (
    <section className="container" style={{ padding: "5rem 1.25rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "3rem" }}>{t.notFound.heading}</h1>
      <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>{t.notFound.text}</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/">{t.notFound.back}</Link>
      </p>
    </section>
  );
}
