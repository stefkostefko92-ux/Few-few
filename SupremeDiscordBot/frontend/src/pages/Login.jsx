// frontend/src/pages/Login.jsx
import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ticket, FileText, ShieldCheck, BarChart3, Gift, Pin, CalendarClock,
  Webhook, Sparkles, Check, Star, Zap, Crown, ArrowRight,
  Lock, ScrollText, Shield, Building2, MessageCircle,
  Layers, Shuffle, Database, Palette, Minus,
  SmilePlus, BookOpen, ClipboardList, UserPlus,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import SignalFunnel from "../components/SignalFunnel";
import Seo from "../components/Seo";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useMagnetic, useTiltCard } from "../hooks/useMicroInteractions";

// Own chunk, downloaded post-idle — never sits on this eager/LCP-critical
// page's main bundle. See ShaderHero.jsx for the full accessibility/perf
// discipline (reduced-motion gate, FPS watchdog, IntersectionObserver).
const ShaderHero = lazy(() => import("../components/ShaderHero"));

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";
// Same permission set as Dashboard.jsx's "Add to a Server" invite link.
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814416&scope=bot+applications.commands`;

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  // Billing interval for the pricing section (monthly | annual). Real
  // keyboard-operable control below (radiogroup of aria-checked buttons).
  const [billing, setBilling] = useState("month");
  const rootRef = useRef(null);
  useScrollReveal(rootRef);
  const heroCtaRef = useMagnetic();
  const finalCtaRef = useMagnetic();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading]);

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || "/api"}/auth/login`;
  };

  return (
    <div ref={rootRef} className="relative min-h-screen bg-transparent overflow-hidden">
      <Seo
        title="Supreme Bot — Discord Ticket Bot & SaaS Platform | Tickets, Forms, Applications | Carbon Stealth"
        description="Supreme Bot is a Discord ticket bot and multi-tenant SaaS platform by Carbon Stealth. Manage tickets, application forms, panels, white-label bots, AI auto-replies, and Stripe subscriptions — all through a modern web dashboard."
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
            <SupremeLogo size={52} />
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
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="cs-btn-secondary text-xs">Invite Bot</a>
            <button onClick={handleLogin} className="cs-btn-primary text-xs">SIGN IN →</button>
          </div>
          <button onClick={handleLogin} className="md:hidden cs-btn-primary text-xs">SIGN IN</button>
        </header>

        {/* HERO — the WebGL spectacle is SCOPED to just this section (not the
            whole page), so the raymarched raymarch cost stays bounded to a
            few hundred px of viewport instead of the full document height. */}
        <section className="relative px-6 sm:px-8 pt-16 pb-24 overflow-hidden">
          <Suspense fallback={null}>
            <ShaderHero />
          </Suspense>
          <div className="relative z-10 w-full max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
            {/* Left column — copy. The H1 here is the LCP element: plain text,
                fully opaque, no entrance animation, so it paints on first frame. */}
            <div className="text-center lg:text-left">
              <div className="cs-eyebrow mb-4 inline-flex">→ One bot replaces eight. Built in the EU.</div>
              <h1 className="font-display font-black text-5xl sm:text-6xl xl:text-7xl tracking-tight-4 text-balance text-cs-text leading-[0.95] mb-6">
                Eight bots. Eight bills.<br />
                <span className="text-cs-cyan">One dashboard.</span>
              </h1>
              <p className="text-cs-muted text-lg sm:text-xl leading-relaxed mb-8 text-pretty max-w-2xl mx-auto lg:mx-0">
                Tickets, applications, verification, reaction roles, giveaways, activity logging, scheduled messages, webhooks and AI-powered replies — for Discord communities that outgrew a folder full of single-purpose bots.
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
                <button ref={heroCtaRef} onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
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
              <a
                href={BOT_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs text-cs-dim hover:text-cs-cyan transition-colors font-mono"
              >
                Already have an account? Invite the bot directly →
              </a>
            </div>

            {/* Right column — the "6 → 1" convergence motif. Purely decorative
                (aria-hidden): eight single-purpose bots funnel into one core. */}
            <HeroConverge />
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-6xl mx-auto">
            <div data-reveal className="text-center mb-16">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Features</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                Everything, <span className="text-cs-cyan">integrated.</span>
              </h2>
              <p className="text-cs-muted max-w-2xl mx-auto">
                Stop paying €5–20/month for 8 different bots that don't talk to each other.
              </p>
            </div>

            <div data-reveal className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard icon={Ticket} title="Ticket System" badge="Free">
                A complete Discord ticket bot: unlimited ticket volume via button panels — claim, escalate, rename, priority levels, two-step close, rich transcripts and archive links. Staff can reply straight from the dashboard.
              </FeatureCard>
              <FeatureCard icon={FileText} title="Forms & Applications" badge="Free">
                Multi-step questionnaires with validation and conditional branching, a review workflow with approve/deny reasons, and a private discussion channel with the applicant before you decide — replaces Appy.bot entirely.
              </FeatureCard>
              <FeatureCard icon={SmilePlus} title="Reaction Roles" badge="Free">
                Members react to a message to get a role and remove the reaction to drop it. Up to 20 emoji-to-role pairs per message, exclusive (pick-one) mode, and the bot places the reactions for you.
              </FeatureCard>
              <FeatureCard icon={ShieldCheck} title="Verification & Anti-Bot">
                One-click button or math captcha. Account age gates. Brute-force protection. Gate ticket panels behind verification.
              </FeatureCard>
              <FeatureCard icon={BarChart3} title="Polls" badge="Free">
                Live-updating embed polls with up to 9 options, single/multi-choice, auto-close timers — start one from the dashboard or with a slash command.
              </FeatureCard>
              <FeatureCard icon={Gift} title="Giveaways" badge="Free">
                Prize drawings with required-role gating, auto-end scheduler and reroll support — start one from the dashboard or with a slash command.
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
                The AI drafts the first reply to common questions; your staff review and send — assistive, with a human in the loop.
              </FeatureCard>
              <FeatureCard icon={ScrollText} title="Server Activity Logging" badge="Free">
                Voice, member, moderation and message events relayed to your own log channel — including edited and deleted messages, with the original text kept.
              </FeatureCard>
              <FeatureCard icon={UserPlus} title="Welcomer & Autorole" badge="Free">
                Greet new members in a channel or by DM, and assign roles automatically — separate rules for humans and bots.
              </FeatureCard>
              <FeatureCard icon={BookOpen} title="Knowledge Base">
                Write answers once; the bot suggests the matching article the moment a ticket opens — and tracks whether it actually helped.
              </FeatureCard>
              <FeatureCard icon={ClipboardList} title="Canned Responses & SLA">
                Saved replies your team can drop in with one command, plus first-response and resolution timers that flag a ticket before it goes stale.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* PRODUCT TOUR — реални скрийншоти на dashboard-а (демо данни).
            Прост tab превключвател (aria-pressed), без анимации — само смяна
            на src; изображенията са с фиксирани размери (без CLS) + lazy. */}
        <ProductTour />

        {/* PREMIUM UPSELL */}
        <section className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-5xl mx-auto">
            <div data-reveal className="text-center mb-14">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Why teams upgrade</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                Free gets you running. <span className="text-cs-cyan">Premium gets you scaling.</span>
              </h2>
            </div>

            <div data-reveal className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mb-16">
              <OutcomeBullet icon={Sparkles} title="Answer first, triage later.">
                AI auto-replies draft the first response to common questions — so staff pick up conversations that are already moving.
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
                Add the White-label tier to run your own bot — its name, avatar and token (encrypted) — under your brand.
              </OutcomeBullet>
              <OutcomeBullet icon={Webhook} title="Wire Supreme into your stack.">
                20 HMAC-signed webhook integrations.
              </OutcomeBullet>
            </div>

            {/* Scannable Free-vs-Premium comparison */}
            <div data-reveal className="cs-card !p-0 overflow-hidden mb-10">
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
                  <CompareRow label="AI replies"              free="—"                    premium="AI-powered (assistive)" />
                  <CompareRow label="Webhooks"                free="—"                    premium="20 integrations" />
                  <CompareRow label="Transcript retention"    free="30 days"              premium="Unlimited" />
                  <CompareRow label="Price"                   free="€0, forever"          premium="€4.99/mo · €49/yr · 14-day trial" />
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
            <div data-reveal className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
            <div data-reveal className="text-center mb-12">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Built for reliability</div>
              <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-4">
                Why teams <span className="text-cs-cyan">trust</span> Supreme Bot
              </h2>
            </div>

            <div data-reveal className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              <TrustCard
                icon={Lock}
                title="EU-only data residency"
                body="Hosted and stored in the EU (Germany, Hetzner). GDPR-native. Discord, Google and Sentry are recipients in the US under Standard Contractual Clauses."
              />
              <TrustCard
                icon={Zap}
                title="99.9% uptime target"
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
                body="Carbon Stealth VCC · EIK 208725180 · VAT BG208725180. Real company, real invoices, real support."
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
              <div>Ad-free · no advertising trackers</div>
              <div>Cancel anytime · no lock-in</div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-3xl mx-auto">
            <div data-reveal className="text-center mb-12">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Frequently Asked</div>
              <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-4">
                Common <span className="text-cs-cyan">questions</span>
              </h2>
            </div>

            <div data-reveal className="space-y-3">
              <FaqItem
                q="Will I be charged for the 14-day trial?"
                a="No. Starting a trial needs no credit card, and nothing is charged during or after it unless you actively choose to subscribe. If you don't subscribe, the server reverts to the Free tier automatically when the trial ends — there is nothing to cancel and nothing is billed. Your panels, forms and settings stay exactly as you left them."
              />
              <FaqItem
                q="How is pricing calculated?"
                a="Premium is billed per server — €4.99/server/month — not per seat, per agent or per ticket. Every server also has the Free tier forever at €0. Put a server on Premium when it needs it, drop it back to Free when it doesn't; you only ever pay for the servers you actively upgrade."
              />
              <FaqItem
                q="Where is my data stored?"
                a="All data is stored in the EU (Germany, Hetzner); Carbon Stealth VCC operates from Bulgaria. Some sub-processors — Discord, Google (optional, for AI replies) and Sentry — are located in the US; those transfers are governed by Standard Contractual Clauses (see Privacy Policy §5-6). Custom bot tokens and Discord OAuth tokens are encrypted at rest with AES-256-GCM. We never sell or share your data."
              />
              <FaqItem
                q="Can I use my own Discord bot?"
                a="Yes — on the White-label tier (€9.99/mo or €99/yr) you upload your own bot token and it runs under your brand: your bot's name, avatar and server presence. Agencies can cover up to 5 or 10 servers under one White-label subscription (Agency 5 / Agency 10)."
              />
              <FaqItem
                q="What happens if I cancel — can I take my data?"
                a="No lock-in. Cancel anytime from the dashboard — access continues until the end of the period you paid for, then the server reverts to the Free tier. Panels, forms, applications and settings are kept; transcripts of tickets closed more than 30 days ago are deleted on the Free tier. Export what you need to CSV or PDF before the period ends."
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
                a="Join our Discord server — direct support from the team that built Supreme Bot (not outsourced). Response times are best-effort; no contractual SLA is included."
              />
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-5xl mx-auto">
            <div data-reveal className="text-center mb-10">
              <div className="cs-eyebrow mb-4 justify-center flex">→ Pricing</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                Simple. <span className="text-cs-cyan">Per server.</span>
              </h2>
              <p className="text-cs-muted">Pay only for what you need. Upgrade anytime.</p>
            </div>

            <BillingToggle interval={billing} onChange={setBilling} />

            {/* Free · Premium · White-label */}
            <div data-reveal className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PricingCard
                icon={Zap}
                name="Free"
                tagline="Get a real ticket + application flow live today. €0, forever."
                price="€0"
                per="/ month, forever"
                onCta={handleLogin}
                cta="Get started free"
                bullets={[
                  "1 ticket panel",
                  "2 application forms (up to 5 questions)",
                  "1 verification panel",
                  "Unlimited polls & giveaways",
                  "Persistent transcripts (30-day retention)",
                ]}
              />

              <PricingCard
                icon={Star}
                highlighted
                badge="Recommended"
                name="Premium"
                tagline="For servers where support is a job, not a side task."
                price={billing === "year" ? "€49" : "€4.99"}
                per={billing === "year" ? "/ year" : "/ month"}
                trial="14-day free trial, no card"
                onCta={handleLogin}
                cta="Start 14-day trial"
                bullets={[
                  "50 panels · 50 forms · 50 questions",
                  "Math captcha + account-age gates",
                  "Claim · escalate · round-robin",
                  "Sticky + scheduled + recurring messages",
                  "Giveaways, polls & analytics",
                  "AI auto-replies (assistive, human-in-the-loop)",
                  "Webhooks (HMAC) + public REST API",
                  "Unlimited transcript retention",
                ]}
              />

              <PricingCard
                icon={Crown}
                name="White-label"
                tagline="Run Supreme under your own brand."
                price={billing === "year" ? "€99" : "€9.99"}
                per={billing === "year" ? "/ year" : "/ month"}
                onCta={handleLogin}
                cta="Get White-label"
                bullets={[
                  "Everything in Premium",
                  "White-label custom bot (your token)",
                  "Runs under your name & avatar",
                ]}
              />
            </div>

            {/* Agency — up to 5 / up to 10 servers, one subscription */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <PricingCard
                icon={Building2}
                compact
                name="Agency 5"
                seats="Up to 5 servers"
                tagline="White-label for up to 5 servers, one subscription. Reseller-friendly."
                price={billing === "year" ? "€199" : "€19.99"}
                per={billing === "year" ? "/ year" : "/ month"}
                onCta={handleLogin}
                cta="Get Agency 5"
                bullets={[
                  "Everything in White-label",
                  "Up to 5 servers, one subscription",
                  "Reseller-friendly",
                ]}
              />

              <PricingCard
                icon={Building2}
                compact
                name="Agency 10"
                seats="Up to 10 servers"
                tagline="White-label for up to 10 servers, one subscription."
                price={billing === "year" ? "€399" : "€39.99"}
                per={billing === "year" ? "/ year" : "/ month"}
                onCta={handleLogin}
                cta="Get Agency 10"
                bullets={[
                  "Everything in White-label",
                  "Up to 10 servers, one subscription",
                  "Reseller-friendly",
                ]}
              />
            </div>

            <p className="text-center text-xs text-cs-dim font-mono mt-8">
              All prices VAT-inclusive · per server / month unless noted · Annual = ~2 months free · Renews automatically until cancelled · 99.9% uptime target (not a contractual SLA) · EU hosting · GDPR · Cancel anytime
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section data-reveal className="px-6 sm:px-8 py-20 border-t border-cs-border/50 text-center">
          <h2 className="font-display font-black text-3xl sm:text-5xl text-cs-text mb-6">
            Ready to <span className="text-cs-cyan">consolidate</span>?
          </h2>
          <p className="text-cs-muted mb-8 max-w-lg mx-auto">
            Takes 60 seconds. Sign in with Discord, pick a server, start your 14-day trial.
          </p>
          <button ref={finalCtaRef} onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
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
                    © 2026 {COMPANY_NAME} · EIK 208725180 · VAT BG208725180 · EU-hosted
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
  const tiltRef = useTiltCard();
  return (
    <div ref={tiltRef} className="cs-card hover:border-cs-cyan/50 hover:shadow-cs-cyan-sm transition-colors">
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
  const tiltRef = useTiltCard();
  return (
    <div ref={tiltRef} className="cs-card hover:border-cs-cyan/50 hover:shadow-cs-cyan-sm transition-colors">
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

/* Accessible monthly/annual switch — a radiogroup of two aria-checked buttons,
   fully keyboard-operable. The annual choice carries a "2 months free" badge.
   Only a color transition (neutralized by prefers-reduced-motion) — no flashing. */
/* Product tour: реални скрийншоти на dashboard-а с демо данни. Табовете са
   истински бутони (aria-pressed, клавиатурно достъпни); смяната е само на
   src — нула анимация (reduced-motion дисциплина). width/height пазят от CLS. */
const TOUR_SCREENS = [
  { key: "home",      label: "Overview",  alt: "Server overview — stats, setup checklist and feature cards" },
  { key: "tickets",   label: "Tickets",   alt: "Ticket list with statuses, assignees and satisfaction ratings" },
  { key: "panels",    label: "Panels",    alt: "Ticket panel builder with button styles and support roles" },
  { key: "forms",     label: "Forms",     alt: "Application form builder with logic branching" },
  { key: "analytics", label: "Analytics", alt: "Ticket analytics — volume, response times and staff leaderboard" },
  { key: "premium",   label: "Premium",   alt: "Premium plans and billing management" },
];

function ProductTour() {
  const [active, setActive] = useState(TOUR_SCREENS[0]);
  return (
    <section id="tour" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="cs-eyebrow mb-4 justify-center flex">→ See it in action</div>
          <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
            The dashboard, <span className="text-cs-cyan">for real.</span>
          </h2>
          <p className="text-cs-muted max-w-2xl mx-auto">
            Not mockups — actual screenshots of the Supreme Bot dashboard running a live server.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-6" role="group" aria-label="Dashboard screenshots">
          {TOUR_SCREENS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={active.key === s.key}
              onClick={() => setActive(s)}
              className={`px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                active.key === s.key
                  ? "bg-cs-cyan text-black"
                  : "border border-cs-border text-cs-muted hover:text-cs-text hover:border-cs-borderHi"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-cs-border overflow-hidden shadow-2xl shadow-cs-cyan/5 bg-cs-panel">
          <img
            src={`/screens/${active.key}.webp`}
            alt={active.alt}
            width="1440"
            height="900"
            loading="lazy"
            decoding="async"
            className="w-full h-auto block"
          />
        </div>
      </div>
    </section>
  );
}

function BillingToggle({ interval, onChange }) {
  return (
    <div className="flex flex-col items-center gap-2 mb-10">
      <div
        role="radiogroup"
        aria-label="Billing interval"
        className="inline-flex items-center gap-1 p-1 rounded-full border border-cs-border bg-cs-surface/60"
      >
        {[["month", "Monthly"], ["year", "Annual"]].map(([value, label]) => {
          const active = interval === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(value)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                active ? "bg-cs-gold text-black" : "text-cs-muted hover:text-cs-text"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <span className="cs-badge-cyan text-[10px]">Save ~17% — 2 months free</span>
    </div>
  );
}

/* One pricing tier card. `highlighted` renders the gold "Recommended" treatment;
   `compact` is the tighter Agency variant. Price/per are computed by the caller
   from the billing interval; the price block is an aria-live region so the change
   is announced when the toggle flips. */
function PricingCard({ icon: Icon, name, tagline, seats, price, per, trial, badge, bullets, cta, onCta, highlighted = false, compact = false }) {
  const tiltRef = useTiltCard(highlighted ? 6 : 4);
  const cardCls = highlighted
    ? "cs-card flex flex-col border-2 border-cs-gold/50 bg-cs-gold/5 relative shadow-cs-gold-sm"
    : "cs-card flex flex-col";
  return (
    <div ref={tiltRef} className={cardCls}>
      {highlighted && badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-cs-gold text-black text-[10px] font-bold uppercase tracking-wider">
          {badge}
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-5 h-5 ${highlighted ? "text-cs-gold fill-current" : "text-cs-cyan"}`} />
          <h3 className="text-xl font-bold text-cs-text">{name}</h3>
        </div>
        {seats && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-cs-cyan mb-1">{seats}</div>
        )}
        <p className="text-sm text-cs-muted">{tagline}</p>
      </div>
      <div className="mb-6" aria-live="polite">
        <div className="font-display text-4xl font-black text-cs-text">{price}</div>
        <div className="text-xs text-cs-dim font-mono">{per}</div>
        {trial && (
          <div className={`text-xs font-mono mt-1 ${highlighted ? "text-cs-gold" : "text-cs-dim"}`}>{trial}</div>
        )}
      </div>
      <ul className={`space-y-2 text-sm text-cs-text flex-1 ${compact ? "mb-6" : "mb-8"}`}>
        {bullets.map((b) => (
          <PricingCheck key={b}>{b}</PricingCheck>
        ))}
      </ul>
      <button
        onClick={onCta}
        className={highlighted
          ? "cs-btn-primary w-full bg-cs-gold hover:bg-cs-goldDim text-black border-cs-gold"
          : "cs-btn-secondary w-full"}
      >
        {cta}
      </button>
    </div>
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

/* Hero "8 → 1" convergence motif — eight single-purpose bots funnel into one
   Supreme core. Purely decorative (aria-hidden): a screen reader skips it and
   loses nothing, since the headline + copy already state the value. All motion
   is CSS-only and gated behind prefers-reduced-motion in index.css. */
function HeroConverge() {
  const replaced = [
    { icon: Ticket,        label: "Ticket bot" },
    { icon: FileText,      label: "Application bot" },
    { icon: ShieldCheck,   label: "Verify bot" },
    { icon: SmilePlus,     label: "Reaction-role bot" },
    { icon: Gift,          label: "Giveaway bot" },
    { icon: CalendarClock, label: "Scheduler bot" },
    { icon: ScrollText,    label: "Logging bot" },
    { icon: Webhook,       label: "Webhook relay" },
  ];
  // По една крива на заместен бот — броят ТРЯБВА да съвпада с `replaced`,
  // иначе фунията рисува повече или по-малко потоци от чиповете отгоре.
  const funnelTops = [20, 60, 100, 140, 180, 220, 260, 300];

  return (
    <div aria-hidden className="hero-converge relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="cs-card !p-6 sm:!p-7 bg-cs-surface/70 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-cs-dim">Before · eight bots</span>
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

        {/* Funnel: eight signals converge to a single point — canvas 2D, not
            SVG. Particles actually travel along each curve toward the core
            (see SignalFunnel.jsx); reduced-motion draws the static curves
            once and never starts a loop. */}
        <div className="hero-funnel relative h-14 my-1.5">
          <SignalFunnel tops={funnelTops} />
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

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.249a18.365 18.365 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.098.245.198.372.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
