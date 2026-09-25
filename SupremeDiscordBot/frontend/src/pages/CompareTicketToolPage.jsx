// frontend/src/pages/CompareTicketToolPage.jsx
// Public, unauthenticated comparison page — "Supreme Bot vs Ticket Tool".
// Growth Level-2 (docs/PRODUCT_ROADMAP.md): captures "ticket tool alternative"
// search intent. Every competitor claim in growthContent.js was verified live
// against ticket-tool.app on 2026-08-05 (UCPD / Dir. 2006/114/EC discipline —
// factual, dated, sourced; no disparagement).
import { CheckCircle2, ExternalLink } from "lucide-react";
import PublicPageLayout, { BOT_INVITE_URL } from "../components/PublicPageLayout";
import Seo from "../components/Seo";
import { TICKET_TOOL_COMPARE, CHECKED_DATE } from "../data/growthContent";

const d = TICKET_TOOL_COMPARE;

export default function CompareTicketToolPage() {
  return (
    <PublicPageLayout crumb="compare / ticket tool">
      <Seo
        title={d.title}
        description={d.description}
        path={d.path}
        keywords={["discord ticket bot", "ticket tool alternative", "best discord ticket bot", "supreme bot", "discord bot comparison", "carbon stealth"]}
      />

      {/* ═══ Answer-first intro (AEO) ═══ */}
      <div className="cs-card mb-8">
        <h1 className="text-2xl font-bold text-cs-text flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-cs-cyan" /> Supreme Bot vs Ticket Tool
        </h1>
        <p className="text-cs-muted mt-3">{d.answer}</p>
        <p className="text-xs text-cs-dim font-mono mt-4">
          Checked {CHECKED_DATE} against {d.sourceUrls.map((u, i) => (
            <span key={u}>
              {i > 0 && ", "}
              <a href={u} target="_blank" rel="noopener" className="text-cs-cyan underline">
                {u.replace("https://", "")}
              </a>
            </span>
          ))}. Prices as published by each vendor, not converted — verify current pricing on their site before deciding.
        </p>
        <a href={BOT_INVITE_URL} className="cs-btn-primary inline-flex items-center gap-2 mt-4">
          Try Supreme Bot free <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>

      {/* ═══ Comparison table ═══ */}
      <div className="cs-card mb-8 overflow-x-auto">
        <h2 className="text-xl font-bold text-cs-text mb-4">Feature &amp; pricing comparison</h2>
        <table className="cs-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Supreme Bot</th>
              <th>{d.competitor}</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map(([cap, supreme, competitor]) => (
              <tr key={cap}>
                <td className="font-semibold text-cs-text">{cap}</td>
                <td className="text-cs-cyan">{supreme}</td>
                <td className="text-cs-muted">{competitor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ FAQ ═══ */}
      <div className="cs-card">
        <h2 className="text-xl font-bold text-cs-text mb-4">Frequently asked questions</h2>
        <div className="space-y-5">
          {d.faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-bold text-cs-text">{f.q}</h3>
              <p className="text-sm text-cs-muted mt-1">{f.a}</p>
            </div>
          ))}
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
