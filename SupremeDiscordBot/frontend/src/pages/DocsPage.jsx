// frontend/src/pages/DocsPage.jsx
// Ръководствата за клиенти: /docs (списъкът) и /docs/:slug (една страница).
// Всичко идва от src/data/docsPages.js — СЪЩИЯТ обект, който prerender.mjs снима
// за обхождачите без JavaScript. Четимостта е целта: една колона до ~70 знака,
// съдържание вдясно на широк екран, номера само където редът има значение.
import { useParams } from "react-router-dom";
import { ChevronRight, Info } from "lucide-react";
import PublicPageLayout, { BOT_INVITE_URL } from "../components/PublicPageLayout";
import Seo from "../components/Seo";
import NotFoundPage from "./NotFoundPage";
import { DOCS_HUB, DOCS_PAGES, DOCS_KINDS, docsPath } from "../data/docsPages";
import { parseInline, groupByKind, docsBySlug, docsJsonLd, docsHubJsonLd } from "../data/docsFormat";

/** Низ с `код` и [връзки](/път) → React. */
function Inline({ text }) {
  return parseInline(text).map((t, i) => {
    if (t.type === "code") return <code key={i} className="px-1.5 py-0.5 rounded bg-cs-panel border border-cs-border text-cs-text text-[0.9em] font-mono whitespace-nowrap">{t.value}</code>;
    if (t.type === "link") {
      const external = t.href.startsWith("https://");
      return <a key={i} href={t.href} className="text-cs-cyan underline underline-offset-2 hover:no-underline" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{t.value}</a>;
    }
    return t.value;
  });
}

function Section({ s }) {
  return (
    <section id={s.id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-cs-text mb-3">
        <a href={`#${s.id}`} className="no-underline hover:text-cs-cyan">{s.heading}</a>
      </h2>
      <div className="space-y-4 text-cs-muted leading-relaxed">
        {(s.body || []).map((p, i) => <p key={i}><Inline text={p} /></p>)}
        {s.steps?.length > 0 && (
          <ol className="list-decimal pl-6 space-y-2 marker:text-cs-cyan marker:font-semibold">
            {s.steps.map((st, i) => <li key={i} className="pl-1"><Inline text={st} /></li>)}
          </ol>
        )}
        {s.list?.length > 0 && (
          <ul className="list-disc pl-6 space-y-2 marker:text-cs-dim">
            {s.list.map((it, i) => <li key={i} className="pl-1"><Inline text={it} /></li>)}
          </ul>
        )}
        {/* Област, която се скролира настрани (таблица, код), трябва да се стига с
            клавиатура — WCAG 2.1.1; затова е tabIndex=0 с име. */}
        {s.table && (
          <div className="overflow-x-auto -mx-2 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cs-cyan rounded" tabIndex={0} role="region" aria-label={`${s.heading} — table`}>
            <table className="w-full text-sm border-collapse min-w-[28rem]">
              <thead>
                <tr className="text-left border-b border-cs-border">
                  {s.table.head.map((h) => <th key={h} scope="col" className="py-2 pr-4 font-semibold text-cs-text">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {s.table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-cs-border/50 align-top">
                    {row.map((cell, j) => (
                      <td key={j} className={`py-2 pr-4 ${j === 0 ? "text-cs-text" : "text-cs-muted"}`}><Inline text={cell} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s.code && (
          <pre tabIndex={0} role="region" aria-label={`${s.heading} — code example`} className="overflow-x-auto rounded-lg bg-cs-panel border border-cs-border p-4 text-xs leading-relaxed text-cs-text font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-cs-cyan"><code>{s.code}</code></pre>
        )}
        {s.note && (
          <p role="note" className="flex gap-3 rounded-lg border border-cs-cyan/30 bg-cs-cyan/5 p-4 text-sm text-cs-text">
            <Info className="w-4 h-4 mt-0.5 flex-none text-cs-cyan" aria-hidden="true" />
            <span><Inline text={s.note} /></span>
          </p>
        )}
      </div>
    </section>
  );
}

// Етикетите на свързаните страници: ръководствата по име, останалото — по пътя си.
const LABELS = {
  ...Object.fromEntries(DOCS_PAGES.map((p) => [docsPath(p), p.nav])),
  "/docs": "All documentation",
  "/commands": "Commands reference",
  "/features": "All features",
  "/status": "Service status",
  "/privacy": "Privacy Policy",
  "/terms": "Terms of Service",
};
const labelFor = (path) => LABELS[path] || path.replace(/^\/(features|guides|compare)\//, "").replace(/-/g, " ");

export function DocsHubPage() {
  const groups = groupByKind(DOCS_PAGES);
  return (
    <PublicPageLayout crumb="docs">
      <Seo title={DOCS_HUB.title} description={DOCS_HUB.description} path={DOCS_HUB.path} keywords={DOCS_HUB.keywords} jsonLd={docsHubJsonLd(DOCS_PAGES)} />
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-cs-text">{DOCS_HUB.h1}</h1>
        <p className="text-cs-muted mt-3 leading-relaxed">{DOCS_HUB.answer}</p>
      </header>

      <div className="space-y-10">
        {groups.map((g) => (
          <section key={g.kind} aria-labelledby={`docs-${g.kind}`}>
            <h2 id={`docs-${g.kind}`} className="text-lg font-semibold text-cs-text mb-4">{g.plural}</h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {g.pages.map((p) => (
                <li key={p.slug}>
                  <a href={docsPath(p)} className="cs-card !p-5 block h-full no-underline hover:border-cs-cyan/50 transition-colors">
                    <span className="block font-semibold text-cs-text">{p.nav}</span>
                    <span className="block text-sm text-cs-muted mt-1.5 leading-relaxed">{p.description}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-sm text-cs-muted mt-10">
        Looking for a command? The <a href="/commands" className="text-cs-cyan underline underline-offset-2">commands reference</a> lists every slash command with its options.
      </p>
    </PublicPageLayout>
  );
}

export default function DocsPage() {
  const { slug } = useParams();
  const page = docsBySlug(DOCS_PAGES, slug);
  if (!page) return <NotFoundPage />;
  const kind = DOCS_KINDS[page.kind];
  return (
    <PublicPageLayout crumb={`docs / ${page.nav.toLowerCase()}`} maxWidth="max-w-5xl">
      <Seo title={`${page.title} | Supreme Bot`} description={page.description} path={docsPath(page)} keywords={page.keywords} jsonLd={docsJsonLd(page)} />

      <nav aria-label="Breadcrumb" className="text-xs text-cs-dim mb-4">
        <a href="/docs" className="hover:text-cs-cyan">Documentation</a>
        <ChevronRight className="inline w-3 h-3 mx-1" aria-hidden="true" />
        <span>{kind.label}</span>
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12">
        <article className="min-w-0 max-w-[44rem]">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-cs-text leading-tight">{page.title}</h1>
            <p className="text-lg text-cs-muted mt-4 leading-relaxed"><Inline text={page.answer} /></p>
            {page.requires?.length > 0 && (
              <div className="mt-5 rounded-lg border border-cs-border bg-cs-panel/60 p-4">
                <p className="text-sm font-semibold text-cs-text">Before you start</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-cs-muted marker:text-cs-dim">
                  {page.requires.map((r, i) => <li key={i}><Inline text={r} /></li>)}
                </ul>
              </div>
            )}
          </header>

          <div className="space-y-10">
            {page.sections.map((s) => <Section key={s.id} s={s} />)}
          </div>

          {page.faq?.length > 0 && (
            <section id="faq" className="mt-12 scroll-mt-24">
              <h2 className="text-xl font-semibold text-cs-text mb-4">Questions people ask</h2>
              <div className="space-y-5">
                {page.faq.map((f) => (
                  <div key={f.q}>
                    <h3 className="font-semibold text-cs-text">{f.q}</h3>
                    <p className="text-cs-muted mt-1 leading-relaxed"><Inline text={f.a} /></p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {page.related?.length > 0 && (
            <nav aria-label="Related pages" className="mt-12 pt-6 border-t border-cs-border">
              <h2 className="text-sm font-semibold text-cs-text mb-3">Keep going</h2>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {page.related.map((p) => (
                  <li key={p}>
                    <a href={p} className="text-cs-cyan underline underline-offset-2 hover:no-underline inline-block first-letter:uppercase">{labelFor(p)}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <p className="text-xs text-cs-dim mt-8">Checked against the bot on {page.updated}.</p>
        </article>

        {/* Съдържанието на страницата — само на широк екран; на телефон заглавията са достатъчно близо. */}
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-8 text-sm">
            <p className="font-semibold text-cs-text mb-3">On this page</p>
            <ul className="space-y-2 border-l border-cs-border">
              {page.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block pl-4 -ml-px border-l border-transparent text-cs-muted no-underline hover:text-cs-cyan hover:border-cs-cyan">{s.heading}</a>
                </li>
              ))}
              {page.faq?.length > 0 && (
                <li><a href="#faq" className="block pl-4 -ml-px border-l border-transparent text-cs-muted no-underline hover:text-cs-cyan hover:border-cs-cyan">Questions people ask</a></li>
              )}
            </ul>
            <a href={BOT_INVITE_URL} className="cs-btn-primary cs-btn-sm no-underline mt-6 w-full">Add Supreme Bot</a>
          </nav>
        </aside>
      </div>
    </PublicPageLayout>
  );
}
