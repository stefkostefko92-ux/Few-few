// frontend/src/data/docsFormat.js
// Общото между React страницата (pages/DocsPage.jsx) и pre-render снимката
// (scripts/prerender.mjs) за ръководствата: вграденият формат на текста и
// структурираните данни. Без React/JSX — чете се и под Node.
import { DOCS_HUB, DOCS_KINDS, DOCS_SITE, docsPath, docsUrl } from "./docsPages.js";

// Позволеното вътре в низ: `код` и [текст](адрес). Адресът е вътрешен („/…“)
// или https — нищо друго не става връзка (без javascript:, без http:).
const TOKEN = /`([^`\n]+)`|\[([^\]\n]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g;

/** Низ → части: { type: "text" | "code" | "link", value, href? }. */
export function parseInline(text) {
  const s = String(text ?? "");
  const out = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > last) out.push({ type: "text", value: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "code", value: m[1] });
    else out.push({ type: "link", value: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: "text", value: s.slice(last) });
  return out;
}

/** Същият текст без разметката — за meta, JSON-LD и търсене. */
export const plainText = (text) => parseInline(text).map((t) => t.value).join("");

/** Страниците, групирани по вид (Diátaxis), в реда от DOCS_KINDS. */
export function groupByKind(pages) {
  return Object.keys(DOCS_KINDS)
    .map((kind) => ({ kind, ...DOCS_KINDS[kind], pages: pages.filter((p) => p.kind === kind) }))
    .filter((g) => g.pages.length);
}

const breadcrumbs = (url, name) => ({
  "@type": "BreadcrumbList",
  "@id": `${url}#breadcrumbs`,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Supreme Bot", item: `${DOCS_SITE}/` },
    { "@type": "ListItem", position: 2, name: "Documentation", item: `${DOCS_SITE}${DOCS_HUB.path}` },
    ...(name ? [{ "@type": "ListItem", position: 3, name, item: url }] : []),
  ],
});

/** TechArticle + BreadcrumbList (+ FAQPage, когато има въпроси). */
export function docsJsonLd(page) {
  const url = docsUrl(page);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        url,
        headline: page.title,
        description: page.description,
        inLanguage: "en",
        dateModified: page.updated,
        isPartOf: { "@id": `${DOCS_SITE}/#website` },
        about: { "@id": `${DOCS_SITE}/#software` },
        publisher: { "@id": `${DOCS_SITE}/#organization` },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
      },
      breadcrumbs(url, page.nav),
      ...(page.faq?.length
        ? [{
            "@type": "FAQPage",
            "@id": `${url}#faq`,
            mainEntity: page.faq.map((f) => ({
              "@type": "Question",
              name: plainText(f.q),
              acceptedAnswer: { "@type": "Answer", text: plainText(f.a) },
            })),
          }]
        : []),
    ],
  };
}

export function docsHubJsonLd(pages) {
  const url = `${DOCS_SITE}${DOCS_HUB.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: DOCS_HUB.title,
        description: DOCS_HUB.description,
        inLanguage: "en",
        isPartOf: { "@id": `${DOCS_SITE}/#website` },
        about: { "@id": `${DOCS_SITE}/#software` },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
        hasPart: pages.map((p) => ({ "@type": "TechArticle", name: p.title, url: docsUrl(p) })),
      },
      breadcrumbs(url, null),
    ],
  };
}

export const docsBySlug = (pages, slug) => pages.find((p) => p.slug === slug) || null;
export { docsPath };
