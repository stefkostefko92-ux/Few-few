// frontend/src/pages/PublicCommandsPage.jsx
// Public, unauthenticated command reference — the "/help" list, on the web.
// AEO-first: answer-first intro paragraph, then a plain list crawlers/LLMs can
// quote directly (mirrored as a static snapshot by scripts/prerender.mjs).
//
// Deliberately a DIFFERENT component from ../pages/CommandsPage.jsx (that one
// is the authenticated in-dashboard reference at /dashboard/:serverId/commands,
// fed by the API). This page renders the catalog directly — no auth, no fetch.
import { Terminal, LayoutDashboard, BookOpen } from "lucide-react";
import { COMMAND_CATALOG } from "../data/commandsCatalog";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo from "../components/Seo";

const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814416&scope=bot+applications.commands`;

const totalCommands = COMMAND_CATALOG.reduce((n, cat) => n + (cat.commands || []).length, 0);
const totalCategories = COMMAND_CATALOG.length;

// "(Premium)" is how the shared catalog marks Premium-only entries today (no
// boolean field yet) — detect it here rather than editing the single source
// of truth (bot/src/utils/commandsCatalog.js) just for a badge.
const PREMIUM_MARK = /\s*\(Premium\)\s*$/;
function splitPremium(label) {
  const isPremium = PREMIUM_MARK.test(label);
  return { label: label.replace(PREMIUM_MARK, ""), isPremium };
}

export default function PublicCommandsPage() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <Seo
        title="Supreme Bot Commands — Full Reference"
        description={`Every Supreme Bot slash command and dashboard feature: ${totalCommands} commands across ${totalCategories} categories — tickets, forms, verification, polls, giveaways, automation, and more.`}
        path="/commands"
      />
      <div className="max-w-4xl mx-auto py-12 px-6 w-full flex-1">
        <div className="flex items-center justify-between mb-8">
          <a href="/" className="flex items-center gap-3 group">
            <SupremeLogo size={36} />
            <div className="flex flex-col leading-tight">
              <SupremeWordmark className="text-base" />
              <span className="text-cs-dim text-[10px] font-mono uppercase tracking-[0.2em]">/ commands</span>
            </div>
          </a>
          <div className="flex items-center gap-4 font-mono text-xs text-cs-dim">
            <a href={BOT_INVITE_URL} className="hover:text-cs-cyan transition-colors">INVITE</a>
            <a href="/dashboard" className="hover:text-cs-cyan transition-colors">DASHBOARD</a>
          </div>
        </div>

        {/* ═══ Answer-first intro (AEO) ═══ */}
        <div className="cs-card mb-8">
          <h1 className="text-2xl font-bold text-cs-text flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-cs-cyan" /> Supreme Bot Commands
          </h1>
          <p className="text-cs-muted mt-3">
            Supreme Bot has {totalCommands} slash commands across {totalCategories} categories
            — tickets, panels, forms &amp; applications, verification, polls, giveaways,
            scheduled &amp; sticky messages, integrations, and server administration. Most
            features are also reachable from the web dashboard; this page is the full
            reference (the same list <code className="text-cs-cyan">/help</code> shows in Discord).
          </p>
          <p className="text-cs-muted mt-2 text-sm">
            Not using Supreme Bot yet?{" "}
            <a href={BOT_INVITE_URL} className="text-cs-cyan underline">Invite it to your server</a>{" "}
            or{" "}
            <a href="/dashboard" className="text-cs-cyan underline">open the dashboard</a>.
          </p>
        </div>

        {/* ═══ Categories ═══ */}
        <div className="space-y-6">
          {COMMAND_CATALOG.map((cat) => (
            <div key={cat.category} className="cs-card">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-cs-text">
                  {cat.icon} {cat.category}
                </h2>
                <p className="text-sm text-cs-muted mt-1">{cat.description}</p>
              </div>

              {(cat.commands || []).length === 0 && (cat.dashboardOnly || []).length === 0 && (
                <p className="text-sm text-cs-dim italic">No commands — dashboard-only category.</p>
              )}

              {(cat.commands || []).map((cmd) => {
                const { label, isPremium } = splitPremium(cmd.name);
                return (
                  <div key={cmd.name} className="py-3 border-b border-cs-border last:border-b-0">
                    <div className="flex items-start gap-3">
                      <Terminal className="w-4 h-4 text-cs-cyan flex-shrink-0 mt-1" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <code className="font-mono text-sm text-cs-cyan font-bold">{label}</code>
                          {isPremium && <span className="cs-badge-premium">Premium</span>}
                          {cmd.permission && (
                            <span className="text-[10px] uppercase tracking-wider text-cs-dim">
                              {cmd.permission}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-cs-dim mt-1">{cmd.signature}</p>
                        <p className="text-sm text-cs-text mt-2">{cmd.description}</p>
                        {cmd.dashboard && (
                          <div className="flex items-start gap-2 mt-2 text-xs text-cs-muted">
                            <LayoutDashboard className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span>Dashboard: {cmd.dashboard}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {(cat.dashboardOnly || []).map((feat, i) => {
                const { label, isPremium } = splitPremium(feat.feature);
                return (
                  <div key={i} className="py-3 border-b border-cs-border last:border-b-0">
                    <div className="flex items-start gap-3">
                      <LayoutDashboard className="w-4 h-4 text-cs-cyan flex-shrink-0 mt-1" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="text-sm text-cs-text font-bold">{label}</span>
                          {isPremium && <span className="cs-badge-premium">Premium</span>}
                          <span className="text-[10px] uppercase tracking-wider text-cs-cyan">Dashboard-only</span>
                        </div>
                        <p className="text-sm text-cs-text mt-2">{feat.description}</p>
                        <p className="text-xs text-cs-muted mt-2">{feat.dashboard}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-cs-border bg-cs-bg mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SupremeLogo size={28} />
            <div className="flex flex-col leading-tight">
              <SupremeWordmark className="text-sm" />
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-cs-dim">
                Created and Designed by{" "}
                <a
                  href="https://carbonstealth.eu"
                  target="_blank"
                  rel="noopener"
                  className="text-cs-cyan underline"
                >
                  Carbon Stealth VCC
                </a>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-cs-dim">
            <a href="/"        className="hover:text-cs-cyan transition-colors">Home</a>
            <a href="/status"  className="hover:text-cs-cyan transition-colors">Status</a>
            <a href="/terms"   className="hover:text-cs-cyan transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-cs-cyan transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
