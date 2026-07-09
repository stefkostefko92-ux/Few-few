"use client";

import { SITE } from "../../lib/site";
import { useLocale, useT } from "../../i18n/I18nProvider";
import { localizedSiteFaq } from "../../i18n/content";

export function FaqBody() {
  const t = useT();
  const locale = useLocale();
  const faq = localizedSiteFaq(locale);
  return (
    <article className="legal container">
      <h1>{t.faqPage.heading}</h1>
      <p className="legal-updated">{t.faqPage.sub}</p>
      {faq.map((f) => (
        <div key={f.question}>
          <h2>{f.question}</h2>
          <p>{f.answer}</p>
        </div>
      ))}
      <p className="legal-foot">
        {t.faqPage.cta} <a href={SITE.playUrl}>{t.faqPage.ctaLink}</a>.
      </p>
    </article>
  );
}
