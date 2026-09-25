"use client";

import { Fragment, type ReactNode } from "react";
import { LocaleLink as Link } from "./LocaleLink";
import { SITE } from "../lib/site";
import { useLocale, useT } from "../i18n/I18nProvider";
import { LEGAL } from "../i18n/legal";
import { JsonLd } from "./JsonLd";
import { breadcrumbLd } from "../lib/jsonld";

type LegalKey = "terms" | "privacy" | "cookies" | "responsible";

const PATHS: Record<LegalKey, string> = {
  terms: "/terms/",
  privacy: "/privacy/",
  cookies: "/cookies/",
  responsible: "/responsible/",
};

/** Split on `**bold**` and render the bold runs as <strong>. */
function renderBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={`${keyPrefix}-b${i}`}>{m[1]}</strong>;
    return <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>;
  });
}

/**
 * Render a paragraph string, replacing the i18n tokens with real elements and
 * linkifying known emails. Tokens: {org}, {begambleaware}, {terms} {privacy}
 * {cookies} {responsible}. Bold runs use **…**.
 */
function renderParagraph(text: string, labels: Record<LegalKey, string>): ReactNode[] {
  const TOKEN =
    /(\{org\}|\{begambleaware\}|\{terms\}|\{privacy\}|\{cookies\}|\{responsible\}|legal@carbonstealth\.eu|privacy@carbonstealth\.eu)/g;
  const out: ReactNode[] = [];
  const parts = text.split(TOKEN);
  parts.forEach((part, i) => {
    switch (part) {
      case "{org}":
        out.push(
          <a key={i} href={SITE.org.url} target="_blank" rel="noopener noreferrer">
            {SITE.org.legalName}
          </a>,
        );
        break;
      case "{begambleaware}":
        out.push(
          <a key={i} href="https://www.begambleaware.org/" target="_blank" rel="noopener noreferrer">
            BeGambleAware
          </a>,
        );
        break;
      case "{terms}":
      case "{privacy}":
      case "{cookies}":
      case "{responsible}": {
        const k = part.slice(1, -1) as LegalKey;
        out.push(
          <Link key={i} href={PATHS[k]}>
            {labels[k]}
          </Link>,
        );
        break;
      }
      case "legal@carbonstealth.eu":
      case "privacy@carbonstealth.eu":
        out.push(
          <a key={i} href={`mailto:${part}`}>
            {part}
          </a>,
        );
        break;
      default:
        out.push(<Fragment key={i}>{renderBold(part, `p${i}`)}</Fragment>);
    }
  });
  return out;
}

const FOOTER_TOKEN = /\{(terms|privacy|cookies|responsible)\}/;

export function LegalArticle({ pageKey }: { pageKey: LegalKey }) {
  const t = useT();
  const locale = useLocale();
  const page = LEGAL[locale][pageKey];
  const crossLinkLabels = t.breadcrumbs; // reuse localized page names
  const labels: Record<LegalKey, string> = {
    terms: crossLinkLabels.terms,
    privacy: crossLinkLabels.privacy,
    cookies: crossLinkLabels.cookies,
    responsible: crossLinkLabels.responsible,
  };

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", url: `${SITE.url}/` },
          { name: crossLinkLabels[pageKey], url: `${SITE.url}${PATHS[pageKey]}` },
        ])}
      />
      <article className="legal container">
        <h1>{page.h1}</h1>
        {page.updated ? (
          <p className="legal-updated">
            {t.legal.updatedLabel} {page.updated}
          </p>
        ) : null}
        {page.blocks.map((block, i) => {
          if (block.type === "h2") return <h2 key={i}>{block.text}</h2>;
          if (block.type === "ul")
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderBold(item, `li${i}-${j}`)}</li>
                ))}
              </ul>
            );
          const isFoot = FOOTER_TOKEN.test(block.text);
          return (
            <p key={i} className={isFoot ? "legal-foot" : undefined}>
              {renderParagraph(block.text, labels)}
            </p>
          );
        })}
      </article>
    </>
  );
}
