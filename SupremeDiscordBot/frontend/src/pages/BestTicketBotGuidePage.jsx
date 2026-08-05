// frontend/src/pages/BestTicketBotGuidePage.jsx
// Public "how-to-choose" guide — Growth Level-2 (docs/PRODUCT_ROADMAP.md),
// targets "best discord ticket bot" search intent. Names Ticket Tool and
// Appy Bot neutrally (no disparagement) and links to the sourced comparisons.
import { BookOpen, ExternalLink } from "lucide-react";
import PublicPageLayout, { BOT_INVITE_URL } from "../components/PublicPageLayout";
import Seo from "../components/Seo";
import { BEST_TICKET_BOT_GUIDE as d } from "../data/growthContent";

export default function BestTicketBotGuidePage() {
  return (
    <PublicPageLayout crumb="guides / best ticket bot">
      <Seo
        title={d.title}
        description={d.description}
        path={d.path}
        keywords={["best discord ticket bot", "discord ticket bot", "how to choose a discord bot", "supreme bot", "discord support tool", "carbon stealth"]}
      />

      {/* ═══ Answer-first intro (AEO) ═══ */}
      <div className="cs-card mb-8">
        <h1 className="text-2xl font-bold text-cs-text flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-cs-cyan" /> How to choose the best Discord ticket bot
        </h1>
        <p className="text-cs-muted mt-3">{d.answer}</p>
      </div>

      {/* ═══ Criteria ═══ */}
      <div className="space-y-4 mb-8">
        {d.criteria.map((c) => (
          <div key={c.title} className="cs-card">
            <h2 className="text-lg font-bold text-cs-text">{c.title}</h2>
            <p className="text-sm text-cs-muted mt-2">{c.body}</p>
            <p className="text-sm mt-3 border-l-2 border-cs-cyan pl-3">
              <span className="text-cs-cyan font-semibold">How Supreme Bot covers this: </span>
              <span className="text-cs-text">{c.supreme}</span>
            </p>
          </div>
        ))}
      </div>

      {/* ═══ Honest mention of alternatives ═══ */}
      <div className="cs-card mb-8">
        <h2 className="text-lg font-bold text-cs-text mb-2">Other bots worth evaluating</h2>
        <p className="text-sm text-cs-muted">{d.mentions}</p>
        <div className="flex flex-wrap gap-3 mt-4 text-sm font-mono">
          <a href="/compare/ticket-tool-alternative" className="text-cs-cyan underline">
            Supreme Bot vs Ticket Tool →
          </a>
          <a href="/compare/appy-alternative" className="text-cs-cyan underline">
            Supreme Bot vs Appy Bot →
          </a>
        </div>
      </div>

      <div className="text-center mt-8">
        <a href={BOT_INVITE_URL} className="cs-btn-primary inline-flex items-center gap-2">
          Invite Supreme Bot — free forever tier <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </PublicPageLayout>
  );
}
