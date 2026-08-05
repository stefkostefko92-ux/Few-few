// frontend/src/components/PublicPageLayout.jsx
// Shared chrome for the public, unauthenticated content pages under /compare
// and /guides (Level-2 growth pages — PRODUCT_ROADMAP.md). Same header/footer
// pattern as StatusPage.jsx and PublicCommandsPage.jsx (logo + breadcrumb,
// footer with the Carbon Stealth attribution and legal links), pulled into
// one place so it does not drift across four near-identical pages.
import SupremeLogo, { SupremeWordmark } from "./SupremeLogo";

const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814288&scope=bot+applications.commands`;

export default function PublicPageLayout({ crumb, children, maxWidth = "max-w-4xl" }) {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <div className={`${maxWidth} mx-auto py-12 px-6 w-full flex-1`}>
        <div className="flex items-center justify-between mb-8">
          <a href="/" className="flex items-center gap-3 group">
            <SupremeLogo size={36} />
            <div className="flex flex-col leading-tight">
              <SupremeWordmark className="text-base" />
              {crumb && (
                <span className="text-cs-dim text-[10px] font-mono uppercase tracking-[0.2em]">
                  / {crumb}
                </span>
              )}
            </div>
          </a>
          <div className="flex items-center gap-4 font-mono text-xs text-cs-dim">
            <a href={BOT_INVITE_URL} className="hover:text-cs-cyan transition-colors">INVITE</a>
            <a href="/dashboard" className="hover:text-cs-cyan transition-colors">DASHBOARD</a>
          </div>
        </div>

        {children}
      </div>

      <footer className="border-t border-cs-border bg-cs-bg mt-12">
        <div className={`${maxWidth} mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4`}>
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
            <a href="/"          className="hover:text-cs-cyan transition-colors">Home</a>
            <a href="/commands"  className="hover:text-cs-cyan transition-colors">Commands</a>
            <a href="/terms"     className="hover:text-cs-cyan transition-colors">Terms</a>
            <a href="/privacy"   className="hover:text-cs-cyan transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export { BOT_INVITE_URL };
