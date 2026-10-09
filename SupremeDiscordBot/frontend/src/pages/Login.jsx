// frontend/src/pages/Login.jsx
import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ticket, FileText, ShieldCheck, Gift, CalendarClock, Webhook, Sparkles, Check, Star, Zap, Crown, ArrowRight, Lock, ScrollText, Shield, Building2, MessageCircle, Layers, Shuffle, Database, Palette, Minus, SmilePlus, Activity,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import SignalFunnel from "../components/SignalFunnel";
import Seo from "../components/Seo";
import FeatureLinks from "../components/FeatureLinks";
import GameShowcase from "../components/GameShowcase";
import LandingNav from "../components/LandingNav";
import DeferredSections from "../components/DeferredSections";
import SectionHead from "../components/SectionHead";
import FeatureGroups from "../components/FeatureGroups";
import { LANDING_UI } from "../i18n/landingUi";
const TicketShowcase = lazy(() => import("../components/TicketShowcase"));
const ProductTour = lazy(() => import("../components/ProductTour"));
const ReplaceBots = lazy(() => import("../components/ReplaceBots"));
// Под сгъвката и със собствен текст на 8 езика → собствен чънк, извън LCP пътя.
const BaitShowcase = lazy(() => import("../components/BaitShowcase"));
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

const UI = LANDING_UI.en;

// Функциите на английския лендинг — същите ключове като в i18n/landing.js,
// за да ги групира FeatureGroups по един и същ начин на всички езици.
const EN_FEATURES = [
  { key: "ticket", title: "Ticket system", desc: "Unlimited tickets from button panels — claim, escalate, rename, priorities, two-step close, transcripts and archive links. Staff can reply straight from the dashboard." },
  { key: "forms", title: "Forms & applications", desc: "Multi-step questionnaires with validation and branching, a review flow with reasons, and a private channel with the applicant before you decide." },
  { key: "canned", title: "Canned replies & SLA", desc: "Saved replies your team drops in with one command, plus first-response and resolution timers that flag a ticket before it goes stale." },
  { key: "knowledgeBase", title: "Knowledge base", desc: "Write answers once; the bot suggests the matching article the moment a ticket opens — and tracks whether it helped." },
  { key: "ai", title: "AI first replies", desc: "The AI answers the first message in a ticket, clearly labelled as AI; your staff take over from there. Opt-in." },
  { key: "reactionRoles", title: "Reaction roles", desc: "Up to 20 emoji-to-role pairs per message, pick-one mode, and the bot places the reactions for you." },
  { key: "giveaways", title: "Giveaways", desc: "Prize drawings with required roles, an automatic end and rerolls — from the dashboard or a slash command." },
  { key: "polls", title: "Polls", desc: "Live polls with up to 9 options, single or multiple choice and an auto-close timer." },
  { key: "welcomer", title: "Welcomer & autorole", desc: "Greet new members in a channel or by DM and hand out roles automatically — separate rules for humans and bots." },
  { key: "game", title: "Leveling & Server Season", desc: "XP from activity (never from message text), level roles, daily sparks, a server shop, 60 companions and weekly server quests." },
  { key: "verification", title: "Verification", desc: "Button or math captcha and a minimum account age, brute-force protection, and ticket panels locked behind the verified role." },
  { key: "bait", title: "Bait channel for spam bots", desc: "Whoever writes in the bait channel is kicked, banned or timed out on the spot. Owner and staff are never touched; message text is never read." },
  { key: "activityLog", title: "Server activity log", desc: "Voice, member, moderation and message events in your own log channel — edited and deleted messages included." },
  { key: "sticky", title: "Sticky messages", desc: "Important info stays at the bottom of a channel, reposted as new messages arrive." },
  { key: "scheduled", title: "Scheduled messages", desc: "One-off or daily, weekly and monthly posts that run themselves." },
  { key: "webhooks", title: "Webhooks & API", desc: "HMAC-signed events for tickets, applications, giveaways and verification, plus a public REST API." },
];

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

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
    <div ref={rootRef} className="relative min-h-screen bg-transparent overflow-x-clip">
      <Seo
        title="Supreme Bot — Discord Ticket Bot & SaaS Platform | Tickets, Forms, Applications | Carbon Stealth"
        description="Supreme Bot is a Discord ticket bot and all-in-one platform by Carbon Stealth: tickets, application forms, verification, a bait channel for spam bots, giveaways, a leveling game with companions and server quests, AI-assisted replies and white-label bots — one web dashboard, EU-hosted, Premium billed through Discord."
        path="/"
        lang="en"
        hreflang
      />
      {/* Decorative animated backdrop — aria-hidden, pure CSS (no WebGL on the
          critical path). All motion is gated behind prefers-reduced-motion in
          index.css; the static state is an intentional aurora + grid poster.
          The hero H1 is plain text (the LCP element) and is never animated, so
          it paints immediately. */}
      {/* Фиксирана височина, НЕ inset-0: аврората е `inset: -20%` от контейнера, а
          контейнерът растеше с цялата страница, когато React я дорисува — горният
          ѝ ръб „скачаше“ и даваше CLS 0.29 на мобилен (измерено 08.10.2026), макар
          визуално да не се вижда. Мрежата и аврората живеят само в горната част. */}
      <div aria-hidden className="hero-backdrop absolute inset-x-0 top-0 h-[140vh] overflow-hidden pointer-events-none">
        <div className="hero-aurora" />
        <div className="grid-bg hero-grid-mask absolute inset-0" />
      </div>
      <div aria-hidden className="absolute top-0 left-0 right-0 h-px bg-cs-cyan/40" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="relative px-6 sm:px-8 py-6 flex items-center justify-between gap-4">
          <a href="https://carbonstealth.eu" className="flex items-center gap-3 group" target="_blank" rel="noopener">
            <SupremeLogo size={52} />
            <div>
              <SupremeWordmark className="text-lg leading-none" />
              <div className="text-xs text-cs-dim mt-0.5 group-hover:text-cs-cyan transition-colors">
                by {COMPANY_NAME}
              </div>
            </div>
          </a>
          <LandingNav
            ui={UI.nav}
            onSignIn={handleLogin}
            inviteUrl={BOT_INVITE_URL}
            links={[
              { href: "#features", label: UI.nav.features },
              { href: "#demo", label: UI.nav.demo },
              { href: "#game", label: UI.nav.game },
              { href: "#bait", label: UI.nav.bait },
              { href: "#pricing", label: UI.nav.pricing },
              { href: "#faq", label: UI.nav.faq },
            ]}
          />
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
              <p className="text-sm text-cs-muted mb-5">One bot replaces eight. Built in the EU.</p>
              <h1 className="font-display font-black text-5xl sm:text-6xl xl:text-7xl tracking-tight-4 text-balance text-cs-text leading-[0.95] mb-6">
                Eight bots. Eight bills.<br />
                <span className="text-cs-cyan">One dashboard.</span>
              </h1>
              <p className="text-cs-muted text-lg sm:text-xl leading-relaxed mb-8 text-pretty max-w-2xl mx-auto lg:mx-0">
                Tickets, applications, verification, a bait channel that reels spam bots out, reaction roles, giveaways, activity logging, a leveling game with collectible companions, scheduled messages, webhooks and AI-assisted replies — for Discord communities that outgrew a folder full of single-purpose bots.
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
              <p className="text-sm text-cs-dim mt-6 leading-relaxed">
                Free forever on the base tier · Premium billed through Discord · Cancel anytime · EU-hosted, GDPR-native
              </p>
              <a
                href={BOT_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-cs-dim hover:text-cs-cyan transition-colors"
              >
                Already have an account? Invite the bot directly →
              </a>
            </div>

            {/* Right column — the "6 → 1" convergence motif. Purely decorative
                (aria-hidden): eight single-purpose bots funnel into one core. */}
            <HeroConverge />
          </div>
        </section>

        {/* Всичко под hero-то се рисува след първото рисуване, на порции
            (startTransition) — без дълги задачи при старта (TBT, 08.10.2026). */}
        <DeferredSections>
        {/* FEATURES — групирани по задача, не 16 еднакви карти */}
        <section id="features" className="px-6 sm:px-8 pt-24 pb-12">
          <div className="max-w-6xl mx-auto">
            <SectionHead
              title="Everything a Discord server runs on, in one bot."
              sub="Stop juggling eight bots that don't talk to each other — each with its own dashboard, permissions and support channel."
            />
            <FeatureGroups features={EN_FEATURES} ui={UI} />
          </div>
        </section>

        {/* Живо демо на тикетите — основното, което продуктът прави */}
        <Suspense fallback={null}><TicketShowcase locale="en" /></Suspense>

        {/* SERVER SEASON — играта; същият компонент като на преведените лендинги */}
        <GameShowcase
          heading="A game that brings members back every day"
          sub="Server Season turns activity in your server into progress: levels, rewards and a collection that live inside your server. No gambling, and sparks can't be bought."
          bullets={[
            "Levels on the MEE6 curve members already know, with stacking level roles — only safe roles are ever assigned",
            "/daily sparks with a streak (×2 from day 7) and a shop with timed roles or your own custom rewards",
            "60 original companions show up on their own while people chat — catch them, train their stats with sparks and battle other members; the loser loses nothing",
            "Weekly server quests, a counting channel and trivia — the whole server plays as one team",
          ]}
          link="See how the game works"
        />

        {/* v52 — канал-стръв за спам ботове: живото демо е единственият голям момент */}
        <Suspense fallback={null}><BaitShowcase locale="en" /></Suspense>

        {/* PRODUCT TOUR — снимки от текущото табло (демо данни) */}
        <Suspense fallback={null}><ProductTour locale="en" /></Suspense>

        {/* PREMIUM UPSELL */}
        <section className="px-6 sm:px-8 py-24">
          <div className="max-w-5xl mx-auto">
            <SectionHead title="Free gets you running. Premium gets you scaling." />

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
            <div data-reveal className="cs-card !p-0 overflow-x-auto mb-10">
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
                  <CompareRow label="Verification"            free="1 panel · button, captcha, account-age gate" premium="10 panels" />
                  <CompareRow label="Ticket workflow"         free="Basic open/close"     premium="Claim · escalate · round-robin" />
                  <CompareRow label="AI replies"              free="—"                    premium="Automatic first reply, labelled as AI" />
                  <CompareRow label="Webhooks"                free="—"                    premium="20 integrations" />
                  <CompareRow label="Transcript retention"    free="30 days"              premium="Unlimited" />
                  <CompareRow label="Server Season game"      free="5 level roles · 5 shop items · 1 companion · 1 quest" premium="100 roles · 50 items · every companion · 3 quests" />
                  <CompareRow label="Price"                   free="€0, forever"          premium="€4.99/mo · billed through Discord" />
                </tbody>
              </table>
            </div>

            <div className="text-center">
              <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
                <span>Start free with Discord</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
              <p className="text-sm text-cs-dim mt-4 max-w-lg mx-auto leading-relaxed">
                Start on Free today. When a server needs Premium, subscribe for it in the Discord store — monthly, billed by Discord, cancel anytime.
              </p>
            </div>
          </div>
        </section>

        {/* REPLACE — осемте бота, които заменя */}
        <Suspense fallback={null}><ReplaceBots locale="en" /></Suspense>

        {/* ═══════════ TRUST / SOCIAL PROOF ═══════════ */}
        <section className="px-6 sm:px-8 py-24">
          <div className="max-w-5xl mx-auto">
            <SectionHead size="md" title="Why teams trust Supreme Bot" sub="A registered EU company, encrypted secrets and a public status page — not promises." />

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
                body="Carbon Stealth VCC · EIK 208725180 · VAT BG208725180. A real company and real support; purchases are receipted by Discord as the seller of record."
              />
              <TrustCard
                icon={MessageCircle}
                title="Direct Discord support"
                body="Talk to the team that built it. No ticket triage outsourced overseas."
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-cs-dim border-t border-cs-border/50 pt-8">
              {/* Статичната значка „всичко работи“ беше твърдение без измерване —
                  сега води към живия статус (одит 24.09.2026). */}
              <a href="/status" className="flex items-center gap-2 hover:text-cs-cyan transition-colors"><Activity className="w-3.5 h-3.5" aria-hidden="true" /> Live system status →</a>
              <div>GDPR compliant</div>
              <div>Ad-free · no advertising trackers</div>
              <div>Cancel anytime · no lock-in</div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-6 sm:px-8 py-24 bg-cs-surface/40 border-y border-cs-border/40">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,20rem)_1fr] gap-10 lg:gap-16">
            <div className="lg:sticky lg:top-8 self-start">
              <SectionHead size="md" className="!mb-0" title="Questions people ask before they switch" sub="Billing, data, limits and support — the short answers." />
            </div>

            <div data-reveal className="space-y-3">
              <FaqItem
                q="How do I pay for Premium?"
                a="Through Discord only. Open the Discord store for Supreme Bot, pick Premium or White-label for your server and complete Discord's checkout. Discord is the seller of record: it shows the final price with VAT, charges you and sends the receipt — we never see your card. Subscriptions are monthly; cancel anytime from Discord's User Settings → Subscriptions and keep access until the end of the paid period."
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
                a="Yes — on the White-label tier (€9.99 per server per month, bought in the Discord store) you upload your own bot token and it runs under your brand: your bot's name, avatar and server presence. The token is encrypted at rest with AES-256-GCM."
              />
              <FaqItem
                q="What happens if I cancel — can I take my data?"
                a="No lock-in. Cancel anytime in Discord (User Settings → Subscriptions) — access continues until the end of the period you paid for, then the server reverts to the Free tier. Panels, forms, applications and settings are kept; transcripts of tickets closed more than 30 days ago are deleted on the Free tier. Export what you need to CSV or PDF before the period ends."
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
                q="Does the leveling game read our messages?"
                a="No. XP is counted per message event with a cooldown — the text is never read or stored for the game. The only exception is the counting channel an admin designates, where the bot checks whether a message is the next number and stores nothing else. The game is off by default, has no gambling, and sparks can't be bought; members can delete their game data with /privacy delete."
              />
              <FaqItem
                q="How do I get support?"
                a="Join our Discord server — direct support from the team that built Supreme Bot (not outsourced). Response times are best-effort; no contractual SLA is included."
              />
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="px-6 sm:px-8 py-24">
          <div className="max-w-5xl mx-auto">
            <SectionHead align="center" title="Simple, per server." sub="Pay only for the servers that need more. Upgrade or drop back anytime." />

            {/* Free · Premium · White-label */}
            <div data-reveal className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PricingCard
                icon={Zap}
                name="Free"
                tagline="Get a real ticket + application flow live today."
                price="€0"
                per="/ month, forever"
                onCta={handleLogin}
                cta="Get started free"
                bullets={[
                  "1 ticket panel",
                  "2 application forms (up to 5 questions)",
                  "1 verification panel (captcha + account-age gate included)",
                  "Unlimited polls & giveaways",
                  "Server Season game: levels, shop, 1 companion slot",
                  "Bait channel for spam bots",
                  "Persistent transcripts (30-day retention)",
                ]}
              />

              <PricingCard
                icon={Star}
                highlighted
                badge="Recommended"
                name="Premium"
                tagline="For servers where support is a job, not a side task."
                price="€4.99"
                per="/ month · via Discord"
                onCta={handleLogin}
                cta="Get Premium"
                bullets={[
                  "50 panels · 50 forms · 50 questions",
                  "10 verification panels",
                  "Claim · escalate · round-robin",
                  "Sticky + scheduled + recurring messages",
                  "Advanced analytics",
                  "AI auto-replies (labelled as AI)",
                  "Webhooks (HMAC) + public REST API",
                  "Unlimited transcript retention",
                  "Full game: every companion, 3 quests, daily trivia",
                ]}
              />

              <PricingCard
                icon={Crown}
                name="White-label"
                tagline="Run Supreme under your own brand."
                price="€9.99"
                per="/ month · via Discord"
                onCta={handleLogin}
                cta="Get White-label"
                bullets={[
                  "Everything in Premium",
                  "White-label custom bot (your token)",
                  "Runs under your name & avatar",
                ]}
              />
            </div>

            <p className="text-center text-sm text-cs-dim mt-8 max-w-3xl mx-auto leading-relaxed">
              All prices VAT-inclusive · per server / month · Monthly subscriptions sold and billed through the Discord store · Renews automatically until cancelled · 99.9% uptime target (not a contractual SLA) · EU hosting · GDPR · Cancel anytime
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section data-reveal className="px-6 sm:px-8 py-24 text-center">
          <h2 className="font-display font-black text-4xl sm:text-6xl text-cs-text mb-6 tracking-tight">
            Ready to consolidate?
          </h2>
          <p className="text-cs-muted mb-8 max-w-lg mx-auto">
            Takes 60 seconds. Sign in with Discord, pick a server, go live on Free.
          </p>
          <button ref={finalCtaRef} onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
            <DiscordIcon />
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </section>

        </DeferredSections>

        {/* FOOTER */}
        <footer className="px-6 sm:px-8 py-10 border-t border-cs-border/50">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <SupremeLogo size={36} />
                <div className="flex flex-col leading-tight">
                  <SupremeWordmark className="text-base" />
                  <span className="text-xs text-cs-dim mt-1">
                    © 2026 {COMPANY_NAME} · EIK 208725180 · VAT BG208725180 · EU-hosted
                  </span>
                  <span className="text-xs text-cs-dim mt-1">
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
            {/* Guides & comparisons — until now these five pages were reachable
                only from INSIDE the dashboard (login required), from each other,
                and from sitemap.xml. A visitor on the landing page had no path
                to them at all, so the docs we wrote were effectively invisible
                to the people they were written for — and orphan pages get no
                internal link equity either. (Owner, 12.08.2026: "why isn't it
                on the landing page anywhere?") */}
            <nav aria-label="Guides and comparisons"
                 className="flex flex-wrap items-center justify-center gap-4 text-xs text-cs-dim border-t border-cs-border/30 pt-4">
              <a href="/guides/ticket-panel-setup" className="hover:text-cs-cyan transition-colors">PANEL &amp; BUTTON SETUP</a>
              <a href="/guides/best-discord-ticket-bot" className="hover:text-cs-cyan transition-colors">CHOOSING A TICKET BOT</a>
              <a href="/guides/gdpr-discord-bot" className="hover:text-cs-cyan transition-colors">GDPR FOR DISCORD BOTS</a>
              <a href="/compare/ticket-tool-alternative" className="hover:text-cs-cyan transition-colors">VS TICKET TOOL</a>
              <a href="/compare/appy-alternative" className="hover:text-cs-cyan transition-colors">VS APPY</a>
            </nav>
            {/* Страници по функция (/features/*) — това, което хората търсят като
                отделни ботове („verification bot", „giveaway bot", „logging
                bot"…). Едно определение за всички начални страници и за
                pre-render снимката: components/FeatureLinks.jsx. */}
            <FeatureLinks heading="Features" uppercase />

            {/* Language versions — visible crawlable links matching the
                hreflang alternates (Seo.jsx + sitemap.xml). */}
            <nav aria-label="Language" className="flex flex-wrap items-center justify-center gap-3 text-xs text-cs-dim border-t border-cs-border/30 pt-4">
              <span className="text-cs-cyan">EN</span>
              <a href="/bg" className="hover:text-cs-cyan transition-colors">БЪЛГАРСКИ</a>
              <a href="/de" className="hover:text-cs-cyan transition-colors">DEUTSCH</a>
              <a href="/es" className="hover:text-cs-cyan transition-colors">ESPAÑOL</a>
              <a href="/fr" className="hover:text-cs-cyan transition-colors">FRANÇAIS</a>
              <a href="/it" className="hover:text-cs-cyan transition-colors">ITALIANO</a>
              <a href="/nl" className="hover:text-cs-cyan transition-colors">NEDERLANDS</a>
              <a href="/pl" className="hover:text-cs-cyan transition-colors">POLSKI</a>
            </nav>
            <div className="text-center text-xs text-cs-dim border-t border-cs-border/30 pt-4">
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
function PricingCard({ icon: Icon, name, tagline, seats, price, per, badge, bullets, cta, onCta, highlighted = false, compact = false }) {
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
