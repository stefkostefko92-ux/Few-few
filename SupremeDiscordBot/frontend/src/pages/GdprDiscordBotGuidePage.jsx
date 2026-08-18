// frontend/src/pages/GdprDiscordBotGuidePage.jsx
// Public, educational guide — Growth Level-2 (docs/PRODUCT_ROADMAP.md),
// zero-competition niche ("GDPR discord bot", "EU hosting discord bot").
// Deliberately names NO competitors — pure explanation + our own posture.
import { ShieldCheck, ExternalLink } from "lucide-react";
import PublicPageLayout, { BOT_INVITE_URL } from "../components/PublicPageLayout";
import Seo from "../components/Seo";
import { GDPR_GUIDE as d } from "../data/growthContent";

export default function GdprDiscordBotGuidePage() {
  return (
    <PublicPageLayout crumb="guides / gdpr & eu hosting">
      <Seo
        title={d.title}
        description={d.description}
        path={d.path}
        keywords={["gdpr discord bot", "eu hosted discord bot", "discord data residency", "supreme bot", "discord dpa", "carbon stealth"]}
      />

      {/* ═══ Answer-first intro (AEO) ═══ */}
      <div className="cs-card mb-8">
        <h1 className="text-2xl font-bold text-cs-text flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-cs-cyan" /> GDPR &amp; EU hosting for Discord communities
        </h1>
        <p className="text-cs-muted mt-3">{d.answer}</p>
      </div>

      {/* ═══ Sections ═══ */}
      <div className="space-y-4 mb-8">
        {d.sections.map((s) => (
          <div key={s.title} className="cs-card">
            <h2 className="text-lg font-bold text-cs-text">{s.title}</h2>
            <p className="text-sm text-cs-muted mt-2 whitespace-pre-line">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="cs-card mb-8 text-xs text-cs-dim">
        <p>{d.disclaimer}</p>
      </div>

      <div className="text-center mt-8">
        <a href={BOT_INVITE_URL} className="cs-btn-primary inline-flex items-center gap-2">
          Invite Supreme Bot — EU-hosted, free forever tier <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </PublicPageLayout>
  );
}
