// frontend/src/pages/Login.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ticket, FileText, ShieldCheck, BarChart3, Gift, Pin, CalendarClock,
  Webhook, Sparkles, Check, Star, Zap, Crown, ArrowRight,
  Lock, ScrollText, Shield, Building2, MessageCircle,
  Layers, Shuffle, Database, Palette, Minus,
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
      {/* Decorative animated backdrop — aria-hidden, pure CSS (no WebGL on the
          critical path). All motion is gated behind prefers-reduced-motion in
          index.css; the static state is an intentional aurora + grid poster.
          The hero H1 is plain text (the LCP element) and is never animated, so
          it paints immediately. */}
      <div aria-hidden className="hero-backdrop absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-aurora" />
        <div className="grid-bg hero-grid-mask absolute inset-0" />
      </div>
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
        <section className="px-6 sm:px-8 pt-16 pb-24">
          <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
            {/* Left column — copy. The H1 here is the LCP element: plain text,
                fully opaque, no entrance animation, so it paints on first frame. */}
            <div className="text-center lg:text-left">
              <div className="cs-eyebrow mb-4 inline-flex">→ One bot replaces six. Built in the EU.</div>
              <h1 className="font-display font-black text-5xl sm:text-6xl xl:text-7xl tracking-tight-4 text-balance text-cs-text leading-[0.95] mb-6">
                Six bots. Six bills.<br />
                <span className="text-cs-cyan">One dashboard.</span>
              </h1>
              <p className="text-cs-muted text-lg sm:text-xl leading-relaxed mb-8 text-pretty max-w-2xl mx-auto lg:mx-0">
                Tickets, applications, verification, giveaways, scheduled messages, webhooks and Claude-powered replies — for Discord communities that outgrew a folder full of single-purpose bots.
              </p>

              {error && (
                <div className="mb-6 max-w-md mx-auto lg:mx-0 border border-danger/40 bg-danger/5 px-4 py-3 text-left">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-danger mb-1">✕ Auth Error</div>
                  <div className="text-sm text-cs-text">
                    {error === "blacklisted"   ? "You have been blacklisted from this platform."
                    : error === "oauth_failed" ? "Discord authentication failed. Please try again."
                    : error === "no_code"      ? "OAuth flow incomplete. Please try again."
                    : "An error occurred. Please try again."}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3">
                <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
                  <DiscordIcon />
                  <span>Start free with Discord</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
                <a href="#pricing" className="cs-btn-secondary text-base px-8 py-4">
                  See what Premium unlocks →
                </a>
              </div>
              <p className="text-xs text-cs-dim mt-6 font-mono leading-relaxed">
                Free forever on the base tier · 14-day Premium trial, no card · Cancel anytime · EU-hosted, GDPR-native
              </p>
            </div>

            {/* Right column — the "6 → 1" convergence motif. Purely decorative
                (aria-hidden): six single-purpose bots funnel into one core. */}
            <HeroConverge />
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
                Claude drafts the first reply to common questions; your staff review and send — assistive, with a human in the loop.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* PREMIUM UPSELL */}
        <section className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Why teams upgrade</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                Free gets you running. <span className="text-cs-cyan">Premium gets you scaling.</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mb-16">
              <OutcomeBullet icon={Sparkles} title="Answer first, triage later.">
                Claude-powered auto-replies draft the first response to common questions — so staff pick up conversations that are already moving.
              </OutcomeBullet>
              <OutcomeBullet icon={Layers} title="Never re-explain your setup.">
                50 panels, 50 forms, 50 questions each, plus conditional branching and regex validation.
              </OutcomeBullet>
              <OutcomeBullet icon={Shuffle} title="Route work fairly, automatically.">
                Round-robin assignment, claim / escalate / rename and inactivity auto-close.
              </OutcomeBullet>
              <OutcomeBullet icon={Database} title="Keep the paper trail forever.">
                Unlimited transcript retention and CSV export (Free keeps 30 days).
              </OutcomeBullet>
              <OutcomeBullet icon={Palette} title="Ship it under your own brand.">
                White-label bot — your bot's name, avatar and token (encrypted).
              </OutcomeBullet>
              <OutcomeBullet icon={Webhook} title="Wire Supreme into your stack.">
                20 HMAC-signed webhook integrations.
              </OutcomeBullet>
            </div>

            {/* Scannable Free-vs-Premium comparison */}
            <div className="cs-card !p-0 overflow-hidden mb-10">
              <table className="cs-table w-full">
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Free</th>
                    <th className="!text-cs-cyan">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Ticket panels"          free="1 panel"              premium="50 panels" />
                  <CompareRow label="Forms"                   free="2 forms · 5 questions" premium="50 forms · 50 questions" />
                  <CompareRow label="Form logic"              free="—"                    premium="Branching + regex" />
                  <CompareRow label="Verification"            free="Button only"          premium="+ Math captcha + age gate" />
                  <CompareRow label="Ticket workflow"         free="Basic open/close"     premium="Claim · escalate · round-robin" />
                  <CompareRow label="AI replies"              free="—"                    premium="Claude-powered" />
                  <CompareRow label="Webhooks"                free="—"                    premium="20 integrations" />
                  <CompareRow label="Transcript retention"    free="30 days"              premium="Unlimited" />
                  <CompareRow label="Price"                   free="€0, forever"          premium="€9.99 / server / mo · 14-day trial" />
                </tbody>
              </table>
            </div>

            <div className="text-center">
              <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
                <span>Start your 14-day Premium trial</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
              <p className="text-xs text-cs-dim mt-4 max-w-lg mx-auto font-mono leading-relaxed">
                Full Premium, no credit card. Reverts to Free automatically if you don't subscribe — nothing to cancel, nothing charged.
              </p>
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
                icon={Lock}
                title="EU-only data residency"
                body="Hosted in the EU (Germany, Hetzner). GDPR-native. Your data never leaves the EU."
              />
              <TrustCard
                icon={Zap}
                title="99.9% uptime SLA"
                body="Monitored 24/7 with auto-recovery. See live status at /status — we're transparent."
              />
              <TrustCard
                icon={ScrollText}
                title="Open audit logs"
                body="Every action is logged with actor, timestamp, and context. Full transparency for staff."
              />
              <TrustCard
                icon={Shield}
                title="No token storage in plaintext"
                body="AES-256-GCM encryption for custom bot tokens. Hashed API keys. Security first."
              />
              <TrustCard
                icon={Building2}
                title="Registered business"
                body="Carbon Stealth VCC · EIK BG208725180. Real company, real invoices, real support."
              />
              <TrustCard
                icon={MessageCircle}
                title="Direct Discord support"
                body="Talk to the team that built it. No ticket triage outsourced overseas."
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-xs font-mono text-cs-dim border-t border-cs-border/50 pt-8">
              <div className="flex items-center gap-2"><span className="text-success">●</span> All systems operational</div>
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
                q="Will I be charged for the 14-day trial?"
                a="No. Starting a trial needs no credit card, and nothing is charged during or after it unless you actively choose to subscribe. If you don't subscribe, the server reverts to the Free tier automatically when the trial ends — there is nothing to cancel and nothing is billed. Your panels, forms and settings stay exactly as you left them."
              />
              <FaqItem
                q="How is pricing calculated?"
                a="Premium is billed per server — €9.99/server/month — not per seat, per agent or per ticket. Every server also has the Free tier forever at €0. Put a server on Premium when it needs it, drop it back to Free when it doesn't; you only ever pay for the servers you actively upgrade."
              />
              <FaqItem
                q="Where is my data stored?"
                a="All data is stored in the EU (Germany, Hetzner); Carbon Stealth VCC operates from Bulgaria. We are GDPR-native — no transfers outside the EU. Custom bot tokens and Discord OAuth tokens are encrypted at rest with AES-256-GCM. We never sell or share your data."
              />
              <FaqItem
                q="Can I use my own Discord bot?"
                a="Yes — Premium subscribers can upload their own bot token for a white-label experience. Your bot keeps your brand name, avatar, and server presence."
              />
              <FaqItem
                q="What happens if I cancel — can I take my data?"
                a="No lock-in. Cancel anytime from the dashboard; the server reverts to the Free tier. All your data (panels, forms, applications, transcripts) stays accessible, and you can export transcripts to CSV whenever you want — GDPR data portability, EU-hosted. Nothing is deleted just because you downgrade."
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
                    <h3 className="text-xl font-bold text-cs-text">Free</h3>
                  </div>
                  <p className="text-sm text-cs-muted">Get a real ticket + application flow live today. €0, forever.</p>
                </div>
                <div className="mb-6">
                  <div className="font-display text-4xl font-black text-cs-text">€0</div>
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
                  Get started free
                </button>
              </div>

              <div className="cs-card flex flex-col border-2 border-amber-500/50 bg-amber-500/5 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider">
                  Recommended
                </div>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="w-5 h-5 text-amber-400 fill-current" />
                    <h3 className="text-xl font-bold text-cs-text">Premium</h3>
                  </div>
                  <p className="text-sm text-cs-muted">For servers where support is a job, not a side task.</p>
                </div>
                <div className="mb-6">
                  <div className="font-display text-4xl font-black text-cs-text">€9.99<span className="text-lg text-cs-dim">/mo</span></div>
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
                  <PricingCheck>White-label bot (your name + token)</PricingCheck>
                  <PricingCheck>Round-robin assignment</PricingCheck>
                  <PricingCheck>Unlimited transcript retention</PricingCheck>
                  <PricingCheck>CSV exports · Panel duplicate</PricingCheck>
                </ul>
                <button onClick={handleLogin} className="cs-btn-primary w-full bg-amber-500 hover:bg-amber-400 text-black border-amber-500">
                  Start 14-day trial — no card
                </button>
                <p className="text-[11px] text-cs-dim font-mono mt-3 text-center leading-relaxed">
                  The tier with AI replies, webhooks, white-label and unlimited history.
                </p>
              </div>

              <div className="cs-card flex flex-col">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="w-5 h-5 text-cs-cyan" />
                    <h3 className="text-xl font-bold text-cs-text">Enterprise</h3>
                  </div>
                  <p className="text-sm text-cs-muted">Custom domain, a dedicated SLA and priority support — your brand, our engine.</p>
                </div>
                <div className="mb-6">
                  <div className="font-display text-4xl font-black text-cs-text">Custom</div>
                  <div className="text-xs text-cs-dim font-mono">Contact for quote</div>
                </div>
                <ul className="space-y-2 text-sm text-cs-text mb-8 flex-1">
                  <PricingCheck>Everything in Premium (incl. white-label bot)</PricingCheck>
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
                  Talk to us
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
        {badge && <span className="cs-badge text-[9px] text-success">{badge}</span>}
      </div>
      <h3 className="text-cs-text font-bold mb-2">{title}</h3>
      <p className="text-sm text-cs-muted leading-relaxed">{children}</p>
    </div>
  );
}

function TrustCard({ icon: Icon, title, body }) {
  return (
    <div className="cs-card hover:border-cs-cyan/50 transition-colors">
      <div className="mb-3"><Icon className="w-6 h-6 text-cs-cyan" aria-hidden="true" /></div>
      <h3 className="text-cs-text font-bold mb-2 text-sm">{title}</h3>
      <p className="text-xs text-cs-muted leading-relaxed">{body}</p>
    </div>
  );
}

function FaqItem({ q, a }) {
  return (
    <details className="cs-card group cursor-pointer hover:border-cs-cyan/50 transition-colors">
      <summary className="flex items-center justify-between gap-4 list-none select-none">
        <span className="text-cs-text font-semibold text-sm sm:text-base">{q}</span>
        <span className="text-cs-cyan text-xl group-open:rotate-45 transition-transform flex-shrink-0">+</span>
      </summary>
      <p className="text-sm text-cs-muted leading-relaxed mt-4 pt-4 border-t border-cs-border/50">{a}</p>
    </details>
  );
}

function PricingCheck({ children }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

/* Outcome-oriented bullet for the Premium upsell section. */
function OutcomeBullet({ icon: Icon, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg border border-cs-cyan/30 bg-cs-cyan/5 flex items-center justify-center">
        <Icon className="w-5 h-5 text-cs-cyan" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-cs-text font-bold mb-1.5 text-base">{title}</h3>
        <p className="text-sm text-cs-muted leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

/* One row of the scannable Free-vs-Premium table. A free value of "—" renders
   as an explicit "None" so the gap reads clearly. */
function CompareRow({ label, free, premium }) {
  return (
    <tr>
      <td className="text-cs-text font-medium">{label}</td>
      <td className="text-cs-muted">
        {free === "—" ? (
          <span className="inline-flex items-center gap-1 text-cs-dim">
            <Minus className="w-3.5 h-3.5" aria-hidden="true" /> None
          </span>
        ) : (
          free
        )}
      </td>
      <td className="text-cs-text">
        <span className="inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-success flex-shrink-0" aria-hidden="true" />
          {premium}
        </span>
      </td>
    </tr>
  );
}

/* Hero "6 → 1" convergence motif — six single-purpose bots funnel into one
   Supreme core. Purely decorative (aria-hidden): a screen reader skips it and
   loses nothing, since the headline + copy already state the value. All motion
   is CSS-only and gated behind prefers-reduced-motion in index.css. */
function HeroConverge() {
  const replaced = [
    { icon: Ticket,        label: "Ticket bot" },
    { icon: FileText,      label: "Application bot" },
    { icon: ShieldCheck,   label: "Verify bot" },
    { icon: Gift,          label: "Giveaway bot" },
    { icon: CalendarClock, label: "Scheduler bot" },
    { icon: Webhook,       label: "Webhook relay" },
  ];
  const funnelTops = [20, 76, 132, 188, 244, 300];

  return (
    <div aria-hidden className="hero-converge relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="cs-card !p-6 sm:!p-7 bg-cs-surface/70 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-cs-dim">Before · six bots</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-cs-cyan">After · one</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {replaced.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="hero-chip flex items-center gap-2 px-3 py-2 rounded-lg border border-cs-border bg-cs-bg/60"
            >
              <Icon className="w-4 h-4 text-cs-dim flex-shrink-0" />
              <span className="text-xs text-cs-muted truncate">{label}</span>
            </div>
          ))}
        </div>

        {/* Funnel: six signals converge to a single point. */}
        <div className="hero-funnel relative h-14 my-1.5">
          <svg viewBox="0 0 320 56" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            {funnelTops.map((x, i) => (
              <path
                key={x}
                d={`M ${x} 2 C ${x} 30 160 26 160 54`}
                className="hero-flow"
                style={{ animationDelay: `${i * 0.4}s` }}
              />
            ))}
            <circle cx="160" cy="54" r="2.5" className="hero-core-dot" />
          </svg>
        </div>

        {/* The one core. */}
        <div className="hero-converge-core rounded-xl border border-cs-cyan/50 bg-cs-cyan/5 px-4 py-3.5 flex items-center gap-3">
          <SupremeLogo size={40} />
          <div className="min-w-0">
            <div className="font-display font-black text-cs-text text-lg leading-none">Supreme Bot</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cs-cyan mt-1.5">
              One dashboard · one bill
            </div>
          </div>
        </div>
      </div>
    </div>
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
