"use client";

import { SITE } from "../../lib/site";
import { useT } from "../../i18n/I18nProvider";

export function AboutBody() {
  const t = useT();
  return (
    <article className="container" style={{ padding: "3rem 1.25rem", maxWidth: 720 }}>
      <h1>{t.about.heading}</h1>
      <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>{t.about.p1}</p>
      <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>{t.about.p2}</p>
      <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>
        {t.about.createdByPrefix}{" "}
        <a href={SITE.org.url} target="_blank" rel="noopener noreferrer">
          Carbon Stealth VCC
        </a>
        .
      </p>
    </article>
  );
}
