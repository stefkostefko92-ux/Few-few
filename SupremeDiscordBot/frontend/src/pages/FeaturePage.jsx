// frontend/src/pages/FeaturePage.jsx
// Една страница на функция (/features/:slug) + хъбът (/features). Всичко идва
// от src/data/featurePages.js — СЪЩИЯТ обект, който prerender.mjs снима за
// обхождачите без JavaScript, за да не може живата страница да се разминава с
// обходения HTML. Структурата е нарочно „отговор отпред": H1 → един абзац с
// прекия отговор → стъпки → таблица Free/Premium → FAQ → свързани страници.
import { useParams } from "react-router-dom";
import { Sparkles, ChevronRight } from "lucide-react";
import PublicPageLayout, { BOT_INVITE_URL } from "../components/PublicPageLayout";
import Seo from "../components/Seo";
import NotFoundPage from "./NotFoundPage";
import { FEATURES_HUB, FEATURE_PAGES, featureBySlug, featureJsonLd, hubJsonLd } from "../data/featurePages";
import { TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE } from "../data/growthContent";

const LABELS = Object.fromEntries([
  ...FEATURE_PAGES.map((p) => [p.path, p.nav]),
  [FEATURES_HUB.path, FEATURES_HUB.nav],
  ...[TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE].map((d) => [d.path, d.title.split(" — ")[0]]),
  ["/commands", "Commands reference"],
  ["/eula", "End-User License Agreement"],
]);

function TierTable({ rows }) {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm border-collapse min-w-[30rem]">
        <thead>
          <tr className="text-left border-b border-cs-border">
            <th className="py-2 pr-4 font-semibold text-cs-text">Capability</th>
            <th className="py-2 pr-4 font-semibold text-cs-text whitespace-nowrap">Free</th>
            <th className="py-2 font-semibold text-cs-cyan whitespace-nowrap">Premium</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([cap, free, premium]) => (
            <tr key={cap} className="border-b border-cs-border/50 align-top">
              <td className="py-2 pr-4 text-cs-muted">{cap}</td>
              <td className="py-2 pr-4 text-cs-dim font-mono text-xs">{free}</td>
              <td className="py-2 text-cs-text font-mono text-xs">{premium}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Related({ paths }) {
  return (
    <nav aria-label="Related pages" className="cs-card">
      <h2 className="text-lg font-semibold text-cs-text mb-3">Related</h2>
      <ul className="space-y-2 text-sm">
        {paths.map((p) => (
          <li key={p}>
            <a href={p} className="text-cs-cyan hover:underline inline-flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /> {LABELS[p] || p}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FeaturesHubPage() {
  return (
    <PublicPageLayout crumb="Features">
      <Seo title={FEATURES_HUB.title} description={FEATURES_HUB.description} path={FEATURES_HUB.path} keywords={FEATURES_HUB.keywords} jsonLd={hubJsonLd()} />
      <div className="cs-card mb-8">
        <h1 className="text-2xl font-bold text-cs-text flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-cs-cyan" aria-hidden="true" /> {FEATURES_HUB.h1}
        </h1>
        <p className="text-cs-muted mt-3">{FEATURES_HUB.answer}</p>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {FEATURE_PAGES.map((p) => (
          <li key={p.path} className="cs-card">
            <h2 className="text-lg font-semibold text-cs-text">
              <a href={p.path} className="hover:text-cs-cyan">{p.h1}</a>
            </h2>
            <p className="text-sm text-cs-muted mt-2">{p.description}</p>
          </li>
        ))}
      </ul>
      <div className="text-center">
        <a href={BOT_INVITE_URL} className="cs-btn-primary inline-flex">Add Supreme Bot to your server</a>
      </div>
    </PublicPageLayout>
  );
}

export default function FeaturePage() {
  const { slug } = useParams();
  const page = featureBySlug(slug);
  if (!page) return <NotFoundPage />;
  return (
    <PublicPageLayout crumb={`Features / ${page.nav}`}>
      <Seo title={page.title} description={page.description} path={page.path} keywords={page.keywords} jsonLd={featureJsonLd(page)} />

      {/* ═══ Отговор отпред (AEO) ═══ */}
      <div className="cs-card mb-8">
        <h1 className="text-2xl font-bold text-cs-text">{page.h1}</h1>
        <p className="text-cs-muted mt-3">{page.answer}</p>
      </div>

      <section className="cs-card mb-8">
        <h2 className="text-lg font-semibold text-cs-text mb-4">How it works</h2>
        <ol className="space-y-4 list-decimal list-inside">
          {page.steps.map((s) => (
            <li key={s.title} className="text-cs-text">
              <span className="font-semibold">{s.title}.</span>{" "}
              <span className="text-cs-muted">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="cs-card mb-8">
        <h2 className="text-lg font-semibold text-cs-text mb-4">Free vs Premium</h2>
        <TierTable rows={page.tiers} />
        <p className="text-xs text-cs-dim mt-3">Premium is €4.99 per server per month, VAT included, sold as a monthly subscription in the Discord store. When a subscription ends the server reverts to Free: panels, forms and settings are kept, transcripts of tickets closed more than 30 days ago are deleted.</p>
      </section>

      <section className="cs-card mb-8">
        <h2 className="text-lg font-semibold text-cs-text mb-4">Frequently asked questions</h2>
        <div className="space-y-4">
          {page.faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold text-cs-text">{f.q}</h3>
              <p className="text-sm text-cs-muted mt-1">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <Related paths={page.related} />

      <div className="text-center mt-8">
        <a href={BOT_INVITE_URL} className="cs-btn-primary inline-flex">Add Supreme Bot to your server</a>
      </div>
    </PublicPageLayout>
  );
}
