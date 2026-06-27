// frontend/src/pages/Login.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ticket, FileText, ShieldCheck, BarChart3, Gift, Pin, CalendarClock,
  Webhook, Sparkles, Check, Star, Zap, Crown, ArrowRight,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo from "../components/Seo";

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading]);

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || "/api"}/auth/login`;
  };

  return (
    <div className="relative min-h-screen bg-cs-black overflow-hidden">
      <Seo
        title="Supreme Bot — Discord Bot SaaS Platform | Tickets, Forms, Applications | Carbon Stealth"
        description="Supreme Bot is a multi-tenant Discord bot SaaS platform by Carbon Stealth. Manage tickets, application forms, panels, white-label bots, AI auto-replies, and Stripe subscriptions — all through a modern web dashboard."
        path="/"
        lang="en"
        hreflang
      />
      <div aria-hidden className="absolute inset-0 grid-bg opacity-30" />
      <div aria-hidden className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-cs-cyan/10 rounded-full blur-[120px] animate-pulse-slow" />
      <div aria-hidden className="absolute top-0 left-0 right-0 h-px bg-cs-cyan/40" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="px-6 sm:px-8 py-6 flex items-center justify-between">
          <a href="https://carbonstealth.eu" className="flex items-center gap-3 group" target="_blank" rel="noopener">
            <SupremeLogo size={44} />
            <div>
              <SupremeWordmark className="text-lg leading-none" />
              <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-cs-dim mt-0.5 group-hover:text-cs-cyan transition-colors">
                by {COMPANY_NAME}
              </div>
            </div>
          </a>
          <div className="hidden md:flex items-center gap-6 font-mono text-xs text-cs-dim">
            <a href="#features" className="hover:text-cs-cyan transition-colors">FEATURES</a>
            <a href="#pricing" className="hover:text-cs-cyan transition-colors">PRICING</a>
            <a href="#faq" className="hover:text-cs-cyan transition-colors">FAQ</a>
            <a href={SUPPORT_URL} target="_blank" rel="noopener" className="hover:text-cs-cyan transition-colors">DISCORD</a>
            <button onClick={handleLogin} className="cs-btn-primary text-xs">SIGN IN →</button>
          </div>
          <button onClick={handleLogin} className="md:hidden cs-btn-primary text-xs">SIGN IN</button>
        </header>

        {/* HERO */}
        <section className="px-6 sm:px-8 pt-16 pb-24 flex items-center justify-center">
          <div className="w-full max-w-4xl text-center">
            <div className="cs-eyebrow mb-4 justify-center flex">→ All-in-One Discord SaaS Platform</div>
            <h1 className="font-display font-black text-5xl sm:text-7xl tracking-tight-4 text-balance text-cs-text leading-[0.95] mb-6">
              One bot.<br />
              <span className="text-cs-cyan">Everything you need.</span>
            </h1>
            <p className="text-cs-muted text-lg sm:text-xl leading-relaxed mb-10 text-pretty max-w-2xl mx-auto">
              Tickets, applications, verification, polls, giveaways, scheduled messages, webhooks, and AI.
              Replace TicketTool, Appy.bot, GiveawayBot, and half a dozen other bots — with one brutally minimal dashboard.
            </p>

            {error && (
              <div className="mb-6 max-w-md mx-auto border border-danger/40 bg-danger/5 px-4 py-3 text-left">
                <div className="font-mono text-[10px] uppercase tracking-wider text-danger mb-1">✕ Auth Error</div>
                <div className="text-sm text-cs-text">
                  {error === "blacklisted"   ? "You have been blacklisted from this platform."
                  : error === "oauth_failed" ? "Discord authentication failed. Please try again."
                  : error === "no_code"      ? "OAuth flow incomplete. Please try again."
                  : "An error occurred. Please try again."}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
                <DiscordIcon />
                <span>Start free with Discord</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
              <a href="#pricing" className="text-cs-muted hover:text-cs-cyan transition-colors text-sm font-mono uppercase tracking-wider">
                See Pricing →
              </a>
            </div>
            <p className="text-xs text-cs-dim mt-6 font-mono">
              14-day Premium trial · No credit card required · Cancel anytime
            </p>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Features</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                Everything, <span className="text-cs-cyan">integrated.</span>
              </h2>
              <p className="text-cs-muted max-w-2xl mx-auto">
                Stop paying €5–20/month for 6 different bots that don't talk to each other.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard icon={Ticket} title="Ticket System" badge="Free">
                Unlimited panel-based tickets with claim, escalate, rename, two-step close, rich transcripts, and archive links.
              </FeatureCard>
              <FeatureCard icon={FileText} title="Forms & Applications" badge="Free">
                Multi-step questionnaires with validation, review workflow, and application approval — replaces Appy.bot entirely.
              </FeatureCard>
              <FeatureCard icon={ShieldCheck} title="Verification & Anti-Bot">
                One-click button or math captcha. Account age gates. Brute-force protection. Gate ticket panels behind verification.
              </FeatureCard>
              <FeatureCard icon={BarChart3} title="Polls" badge="Free">
                Live-updating embed polls with up to 9 options, single/multi-choice, auto-close timers.
              </FeatureCard>
              <FeatureCard icon={Gift} title="Giveaways" badge="Free">
                Prize drawings with required-role gating, auto-end scheduler, reroll support.
              </FeatureCard>
              <FeatureCard icon={Pin} title="Sticky Messages">
                Keep important info pinned at the bottom of channels — auto-reposted as new messages arrive.
              </FeatureCard>
              <FeatureCard icon={CalendarClock} title="Scheduled Messages">
                One-shot or recurring (daily/weekly/monthly) automated posts.
              </FeatureCard>
              <FeatureCard icon={Webhook} title="Webhook Integrations">
                HMAC-signed event delivery for tickets, applications, giveaways, verification — plug into your stack.
              </FeatureCard>
              <FeatureCard icon={Sparkles} title="AI Auto-Replies">
                Claude-powered first-response suggestions reduce staff load by ~40% on common questions.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* REPLACE */}
        <section className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-4xl mx-auto text-center">
            <div className="cs-eyebrow mb-4 justify-center flex">→ Why switch?</div>
            <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-10">
              Replace these. <span className="text-cs-cyan">All of them.</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                ["TicketTool", "€5/mo"], ["Appy.bot", "€5/mo"], ["GiveawayBot", "€3/mo"],
                ["Stickyboard", "€4/mo"], ["Dyno Poll", "€2/mo"], ["Webhook.io", "€10/mo"],
              ].map(([name, price]) => (
                <div key={name} className="cs-card text-center !p-4">
                  <div className="text-sm text-cs-text font-bold line-through decoration-red-500">{name}</div>
                  <div className="text-xs text-cs-dim mt-1">{price}</div>
                </div>
              ))}
            </div>
            <p className="text-cs-muted mt-8 max-w-2xl mx-auto">
              Total: <span className="line-through decoration-red-500">€29/month, 6 dashboards, 6 support channels.</span><br />
              <span className="text-cs-cyan font-bold">One subscription. One dashboard. One bot.</span>
            </p>
          </div>
        </section>

        {/* ═══════════ TRUST / SOCIAL PROOF ═══════════ */}
        <section className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Built for reliability</div>
              <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-4">
                Why teams <span className="text-cs-cyan">trust</span> Supreme Bot
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              <TrustCard
                icon="🔒"
                title="EU-only data residency"
                body="Hosted in Bobov Dol, Bulgaria. GDPR-native. Your data never crosses the EU border."
              />
              <TrustCard
                icon="⚡"
                title="99.9% uptime SLA"
                body="Monitored 24/7 with auto-recovery. See live status at /status — we're transparent."
              />
              <TrustCard
                icon="📜"
                title="Open audit logs"
                body="Every action is logged with actor, timestamp, and context. Full transparency for staff."
              />
              <TrustCard
                icon="🛡️"
                title="No token storage in plaintext"
                body="AES-256-GCM encryption for custom bot tokens. Hashed API keys. Security first."
              />
              <TrustCard
                icon="🏢"
                title="Registered business"
                body="Carbon Stealth VCC · EIK BG208725180. Real company, real invoices, real support."
              />
              <TrustCard
                icon="💬"
                title="Direct Discord support"
                body="Talk to the team that built it. No ticket triage outsourced overseas."
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-xs font-mono text-cs-dim border-t border-cs-border/50 pt-8">
              <div className="flex items-center gap-2"><span className="text-green-400">●</span> All systems operational</div>
              <div>GDPR compliant</div>
              <div>Ad-free · no telemetry</div>
              <div>Cancel anytime · no lock-in</div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Frequently Asked</div>
              <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-4">
                Common <span className="text-cs-cyan">questions</span>
              </h2>
            </div>

            <div className="space-y-3">
              <FaqItem
                q="How does the 14-day free trial work?"
                a="Click 'Start Free Trial' on any server — no credit card required. You get full Premium access for 14 days. If you don't subscribe, features automatically revert to the Free tier when the trial ends. You can also cancel the trial early at any time."
              />
              <FaqItem
                q="Where is my data stored?"
                a="All data is stored in the EU (Bobov Dol, Bulgaria). We are GDPR-native — no cross-border transfers. Custom bot tokens are encrypted with AES-256-GCM. We never sell or share your data."
              />
              <FaqItem
                q="Can I use my own Discord bot?"
                a="Yes — Premium subscribers can upload their own bot token for a white-label experience. Your bot keeps your brand name, avatar, and server presence."
              />
              <FaqItem
                q="What happens if I cancel?"
                a="No lock-in. Cancel anytime from the dashboard. Your server automatically reverts to the Free tier. All your data (panels, forms, applications, transcripts) stays accessible so you can export or resubscribe."
              />
              <FaqItem
                q="Do you support multiple servers?"
                a="Yes — connect unlimited Discord servers from one Supreme Bot account. Each server has independent settings, panels, forms, and billing."
              />
              <FaqItem
                q="Is there an API?"
                a="Yes — a public REST API is available on Premium at /public/v1 with bearer token authentication and scoped permissions. Rate limit is 300 req/min per key."
              />
              <FaqItem
                q="How do I get support?"
                a="Join our Discord server — direct support from the team that built Supreme Bot (not outsourced). Premium customers get priority responses."
              />
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Pricing</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                Simple. <span className="text-cs-cyan">Per server.</span>
              </h2>
              <p className="text-cs-muted">Pay only for what you need. Upgrade anytime.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="cs-card flex flex-col">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5 text-cs-cyan" />
                    <h3 className="text-xl font-bold text-white">Free</h3>
                  </div>
                  <p className="text-sm text-cs-muted">Small servers, evaluation</p>
                </div>
                <div className="mb-6">
                  <div className="font-display text-4xl font-black text-white">€0</div>
                  <div className="text-xs text-cs-dim font-mono">/ month, forever</div>
                </div>
                <ul className="space-y-2 text-sm text-cs-text mb-8 flex-1">
                  <PricingCheck>1 ticket panel</PricingCheck>
                  <PricingCheck>2 forms (5 questions each)</PricingCheck>
                  <PricingCheck>1 verification panel (button only)</PricingCheck>
                  <PricingCheck>Unlimited polls & giveaways</PricingCheck>
                  <PricingCheck>30-day transcript retention</PricingCheck>
                  <PricingCheck>/help + full dashboard</PricingCheck>
                </ul>
                <button onClick={handleLogin} className="cs-btn-secondary w-full">
                  Get Started Free
                </button>
              </div>

              <div className="cs-card flex flex-col border-2 border-amber-500/50 bg-amber-500/5 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider">
                  Most Popular
                </div>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="w-5 h-5 text-amber-400 fill-current" />
                    <h3 className="text-xl font-bold text-white">Premium</h3>
                  </div>
                  <p className="text-sm text-cs-muted">Growing communities</p>
                </div>
                <div className="mb-6">
                  <div className="font-display text-4xl font-black text-white">€9.99<span className="text-lg text-cs-dim">/mo</span></div>
                  <div className="text-xs text-amber-400 font-mono">14-day free trial</div>
                </div>
                <ul className="space-y-2 text-sm text-cs-text mb-8 flex-1">
                  <PricingCheck>50 panels · 50 forms · 50 questions</PricingCheck>
                  <PricingCheck>Math captcha + account age gates</PricingCheck>
                  <PricingCheck>Ticket claim + escalate + rename</PricingCheck>
                  <PricingCheck>Observer roles + DM on open/close</PricingCheck>
                  <PricingCheck>Feedback ratings · Inactivity auto-close</PricingCheck>
                  <PricingCheck>Sticky + scheduled + recurring messages</PricingCheck>
                  <PricingCheck>20 webhook integrations</PricingCheck>
                  <PricingCheck>Conditional form branching + regex</PricingCheck>
                  <PricingCheck>AI auto-replies (Claude-powered)</PricingCheck>
                  <PricingCheck>Round-robin assignment</PricingCheck>
                  <PricingCheck>Unlimited transcript retention</PricingCheck>
                  <PricingCheck>CSV exports · Panel duplicate</PricingCheck>
                </ul>
                <button onClick={handleLogin} className="cs-btn-primary w-full bg-amber-500 hover:bg-amber-400 text-black border-amber-500">
                  Start 14-Day Trial
                </button>
              </div>

              <div className="cs-card flex flex-col">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="w-5 h-5 text-cs-cyan" />
                    <h3 className="text-xl font-bold text-white">Enterprise</h3>
                  </div>
                  <p className="text-sm text-cs-muted">Large servers, brands</p>
                </div>
                <div className="mb-6">
                  <div className="font-display text-4xl font-black text-white">Custom</div>
                  <div className="text-xs text-cs-dim font-mono">Contact for quote</div>
                </div>
                <ul className="space-y-2 text-sm text-cs-text mb-8 flex-1">
                  <PricingCheck>Everything in Premium</PricingCheck>
                  <PricingCheck>White-label bot (your name + token)</PricingCheck>
                  <PricingCheck>Custom branding (logo + templates)</PricingCheck>
                  <PricingCheck>Custom domain</PricingCheck>
                  <PricingCheck>Multi-region hosting</PricingCheck>
                  <PricingCheck>Dedicated bot shard</PricingCheck>
                  <PricingCheck>99.95% uptime SLA</PricingCheck>
                  <PricingCheck>Priority support (4h response)</PricingCheck>
                  <PricingCheck>SSO (Google / Microsoft / SAML)</PricingCheck>
                  <PricingCheck>GDPR data residency</PricingCheck>
                </ul>
                <a href="mailto:discord@carbonstealth.eu?subject=Supreme Bot Enterprise Inquiry"
                   className="cs-btn-secondary w-full text-center">
                  Contact Sales
                </a>
              </div>
            </div>

            <p className="text-center text-xs text-cs-dim font-mono mt-8">
              All plans include: 99.9% uptime · EU hosting · GDPR compliant · Cancel anytime
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="px-6 sm:px-8 py-20 border-t border-cs-border/50 text-center">
          <h2 className="font-display font-black text-3xl sm:text-5xl text-cs-text mb-6">
            Ready to <span className="text-cs-cyan">consolidate</span>?
          </h2>
          <p className="text-cs-muted mb-8 max-w-lg mx-auto">
            Takes 60 seconds. Sign in with Discord, pick a server, start your 14-day trial.
          </p>
          <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
            <DiscordIcon />
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </section>

        {/* FOOTER */}
        <footer className="px-6 sm:px-8 py-10 border-t border-cs-border/50">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <SupremeLogo size={36} />
                <div className="flex flex-col leading-tight">
                  <SupremeWordmark className="text-base" />
                  <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-cs-dim mt-1">
                    © 2026 {COMPANY_NAME} · EIK / VAT BG208725180 · EU-hosted
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.12em] text-cs-dim mt-1">
                    Carbon Stealth VCC · ul. Samuil 3, 2670 Bobov dol, Bulgaria ·{" "}
                    <a href="mailto:legal@carbonstealth.eu" className="text-cs-cyan underline">legal@carbonstealth.eu</a>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-cs-dim">
                <a href="/terms"   className="hover:text-cs-cyan transition-colors">TERMS</a>
                <a href="/privacy" className="hover:text-cs-cyan transition-colors">PRIVACY</a>
                <a href="/cookies" className="hover:text-cs-cyan transition-colors">COOKIES</a>
                <a href="/eula"    className="hover:text-cs-cyan transition-colors">EULA</a>
                <a href="/accessibility" className="hover:text-cs-cyan transition-colors">ACCESSIBILITY</a>
                <a href="/status"  className="hover:text-cs-cyan transition-colors">STATUS</a>
                <a href={SUPPORT_URL} target="_blank" rel="noopener" className="hover:text-cs-cyan transition-colors">DISCORD</a>
              </div>
            </div>
            {/* Language versions — visible crawlable links matching the
                hreflang alternates (Seo.jsx + sitemap.xml). */}
            <nav aria-label="Language" className="flex flex-wrap items-center justify-center gap-3 font-mono text-[10px] text-cs-dim border-t border-cs-border/30 pt-4">
              <span className="text-cs-cyan">EN</span>
              <a href="/bg" className="hover:text-cs-cyan transition-colors">БЪЛГАРСКИ</a>
              <a href="/de" className="hover:text-cs-cyan transition-colors">DEUTSCH</a>
              <a href="/es" className="hover:text-cs-cyan transition-colors">ESPAÑOL</a>
              <a href="/fr" className="hover:text-cs-cyan transition-colors">FRANÇAIS</a>
              <a href="/it" className="hover:text-cs-cyan transition-colors">ITALIANO</a>
              <a href="/nl" className="hover:text-cs-cyan transition-colors">NEDERLANDS</a>
              <a href="/pl" className="hover:text-cs-cyan transition-colors">POLSKI</a>
            </nav>
            <div className="text-center text-xs font-mono text-cs-dim border-t border-cs-border/30 pt-4">
              Created and Designed by{" "}
              <a
                href="https://carbonstealth.eu"
                target="_blank"
                rel="noopener"
                className="text-cs-cyan underline"
              >
                Carbon Stealth VCC
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, badge, children }) {
  return (
    <div className="cs-card hover:border-cs-cyan/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <Icon className="w-6 h-6 text-cs-cyan" />
        {badge && <span className="cs-badge text-[9px] text-green-400">{badge}</span>}
      </div>
      <h3 className="text-white font-bold mb-2">{title}</h3>
      <p className="text-sm text-cs-muted leading-relaxed">{children}</p>
    </div>
  );
}

function TrustCard({ icon, title, body }) {
  return (
    <div className="cs-card hover:border-cs-cyan/50 transition-colors">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-white font-bold mb-2 text-sm">{title}</h3>
      <p className="text-xs text-cs-muted leading-relaxed">{body}</p>
    </div>
  );
}

function FaqItem({ q, a }) {
  return (
    <details className="cs-card group cursor-pointer hover:border-cs-cyan/50 transition-colors">
      <summary className="flex items-center justify-between gap-4 list-none select-none">
        <span className="text-white font-semibold text-sm sm:text-base">{q}</span>
        <span className="text-cs-cyan text-xl group-open:rotate-45 transition-transform flex-shrink-0">+</span>
      </summary>
      <p className="text-sm text-cs-muted leading-relaxed mt-4 pt-4 border-t border-cs-border/50">{a}</p>
    </details>
  );
}

function PricingCheck({ children }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
      <rect x="1" y="1" width="30" height="30" stroke="#00e5ff" strokeWidth="1.5"/>
      <path d="M16 4 L28 16 L16 28 L4 16 Z" stroke="#00e5ff" strokeWidth="1.5" fill="#00e5ff" fillOpacity="0.15"/>
      <circle cx="16" cy="16" r="3" fill="#00e5ff"/>
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.249a18.365 18.365 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.098.245.198.372.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
