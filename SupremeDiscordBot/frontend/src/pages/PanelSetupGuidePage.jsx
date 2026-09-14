// frontend/src/pages/PanelSetupGuidePage.jsx
// Public how-to docs for ticket panel + button configuration — targets the
// "discord ticket panel setup / button options" search intent. Mirrors the
// coverage of Ticket Tool's public "Button Options" page, but documents OUR
// model (panel buttons are ticket TYPES; in-ticket actions are automatic).
// All values come from src/data/growthContent.js — the SAME object the
// prerender snapshot uses — so the live page can never drift from the crawled
// HTML.
import { LayoutPanelTop, ExternalLink } from "lucide-react";
import PublicPageLayout, { BOT_INVITE_URL } from "../components/PublicPageLayout";
import Seo from "../components/Seo";
import { PANEL_SETUP_GUIDE as d } from "../data/growthContent";

// Small option table — one row per field. Wrapped in an overflow-x-auto shell
// so it never pushes the page sideways on a phone (mobile discipline).
function OptionTable({ rows }) {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm border-collapse min-w-[34rem]">
        <thead>
          <tr className="text-left border-b border-cs-border">
            <th className="py-2 pr-4 font-semibold text-cs-text whitespace-nowrap">Option</th>
            <th className="py-2 pr-4 font-semibold text-cs-text">What it does</th>
            <th className="py-2 font-semibold text-cs-text whitespace-nowrap">Values</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-cs-border/50 align-top">
              <td className="py-2 pr-4 font-mono text-cs-cyan whitespace-nowrap">{r.name}</td>
              <td className="py-2 pr-4 text-cs-muted">{r.body}</td>
              <td className="py-2 text-cs-dim font-mono text-xs whitespace-nowrap">{r.values}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PanelSetupGuidePage() {
  return (
    <PublicPageLayout crumb="guides / ticket panel setup">
      <Seo
        title={d.title}
        description={d.description}
        path={d.path}
        keywords={["discord ticket panel", "ticket panel setup", "discord ticket bot buttons", "supreme bot", "discord support tool", "carbon stealth"]}
      />

      {/* ═══ Answer-first intro (AEO) ═══ */}
      <div className="cs-card mb-8">
        <h1 className="text-2xl font-bold text-cs-text flex items-center gap-2">
          <LayoutPanelTop className="w-6 h-6 text-cs-cyan" aria-hidden="true" /> Ticket panel &amp; button setup
        </h1>
        <p className="text-cs-muted mt-3">{d.answer}</p>
      </div>

      {/* ═══ Panel options ═══ */}
      <section className="cs-card mb-8">
        <h2 className="text-lg font-bold text-cs-text mb-1">The panel message</h2>
        <p className="text-sm text-cs-muted mb-4">
          These settings shape the panel embed members see and how every ticket opened from it behaves.
        </p>
        <OptionTable rows={d.panelOptions} />
      </section>

      {/* ═══ Layout modes ═══ */}
      <section className="cs-card mb-8">
        <h2 className="text-lg font-bold text-cs-text mb-3">Layouts</h2>
        <div className="space-y-3">
          {d.layoutModes.map((m) => (
            <p key={m.name} className="text-sm border-l-2 border-cs-cyan pl-3">
              <span className="text-cs-cyan font-semibold">{m.name}: </span>
              <span className="text-cs-muted">{m.body}</span>
            </p>
          ))}
        </div>
      </section>

      {/* ═══ Button options ═══ */}
      <section className="cs-card mb-8">
        <h2 className="text-lg font-bold text-cs-text mb-1">Button options</h2>
        <p className="text-sm text-cs-muted mb-4">
          Each button — or dropdown option — is one ticket type. Configure each one independently:
        </p>
        <OptionTable rows={d.buttonOptions} />
      </section>

      {/* ═══ Automatic in-ticket actions ═══ */}
      <section className="cs-card mb-8">
        <h2 className="text-lg font-bold text-cs-text mb-2">Close, claim &amp; the other actions are automatic</h2>
        <p className="text-sm text-cs-muted">{d.inTicketButtons}</p>
      </section>

      {/* ═══ Limits ═══ */}
      <section className="cs-card mb-8">
        <h2 className="text-lg font-bold text-cs-text mb-3">Limits</h2>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm border-collapse min-w-[28rem]">
            <tbody>
              {d.limits.map(([cap, val]) => (
                <tr key={cap} className="border-b border-cs-border/50">
                  <td className="py-2 pr-4 text-cs-muted">{cap}</td>
                  <td className="py-2 text-cs-text font-mono whitespace-nowrap">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-center mt-8">
        <a href={BOT_INVITE_URL} className="cs-btn-primary inline-flex items-center gap-2">
          Invite Supreme Bot — free forever tier <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </PublicPageLayout>
  );
}
