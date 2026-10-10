// frontend/src/pages/Login.jsx
// Английският лендинг („/“) — по одобрената концепция (архивът
// supremebot-reference-locked, 10.10.2026). Секциите са общи с 7-те превода
// (components/LandingConcept.jsx); текстовете на концепцията — i18n/landingConcept.js.
import { useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check, Minus, Lock, Zap, ScrollText, Shield, Building2, MessageCircle, Activity,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo from "../components/Seo";
import { LandingFooter } from "../components/LandingParts";
import GameShowcase from "../components/GameShowcase";
import LandingNav from "../components/LandingNav";
import DeferredSections from "../components/DeferredSections";
import FeatureGroups from "../components/FeatureGroups";
import {
  ConceptHero, BotsSection, FeaturesSection, DemoCard, PlansSection, PlanCard, FaqSection, DiscordIcon,
} from "../components/LandingConcept";
import { LANDING_UI } from "../i18n/landingUi";
import { LANDING_CONCEPT } from "../i18n/landingConcept";
const TicketShowcase = lazy(() => import("../components/TicketShowcase"));
const ProductTour = lazy(() => import("../components/ProductTour"));
// Под сгъвката и със собствен текст на 8 езика → собствен чънк, извън LCP пътя.
const BaitShowcase = lazy(() => import("../components/BaitShowcase"));
import { useScrollReveal } from "../hooks/useScrollReveal";

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";
// Same permission set as Dashboard.jsx's "Add to a Server" invite link.
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814416&scope=bot+applications.commands`;

const UI = LANDING_UI.en;
const C = LANDING_CONCEPT.en;
// Етикетите на ръководствата за общия футър (преводите идват от i18n/landing.js → guides).
const EN_GUIDES = { heading: "Guides & comparisons", features: "Features", panel: "Panel & button setup", best: "Choosing a ticket bot", gdpr: "GDPR for Discord bots", vsTicketTool: "vs Ticket Tool", vsAppy: "vs Appy" };

// Функциите на английския лендинг — същите ключове като в i18n/landing.js,
// за да ги подрежда FeatureGroups по един и същ начин на всички езици.
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

// Въпросите — същите като FAQPage в index.html (видимото съдържание пази
// паритета със структурираните данни; prerender чете оттам).
const EN_FAQ = [
  { q: "How do I pay for Premium?", a: "Through Discord only. Open the Discord store for Supreme Bot, pick Premium or White-label for your server and complete Discord's checkout. Discord is the seller of record: it shows the final price with VAT, charges you and sends the receipt — we never see your card. Subscriptions are monthly; cancel anytime from Discord's User Settings → Subscriptions and keep access until the end of the paid period." },
  { q: "How is pricing calculated?", a: "Premium is billed per server — €4.99/server/month — not per seat, per agent or per ticket. Every server also has the Free tier forever at €0. Put a server on Premium when it needs it, drop it back to Free when it doesn't; you only ever pay for the servers you actively upgrade." },
  { q: "Where is my data stored?", a: "All data is stored in the EU (Germany, Hetzner); Carbon Stealth VCC operates from Bulgaria. Some sub-processors — Discord, Google (optional, for AI replies) and Sentry — are located in the US; those transfers are governed by Standard Contractual Clauses (see Privacy Policy §5-6). Custom bot tokens and Discord OAuth tokens are encrypted at rest with AES-256-GCM. We never sell or share your data." },
  { q: "Can I use my own Discord bot?", a: "Yes — on the White-label tier (€9.99 per server per month, bought in the Discord store) you upload your own bot token and it runs under your brand: your bot's name, avatar and server presence. The token is encrypted at rest with AES-256-GCM." },
  { q: "What happens if I cancel — can I take my data?", a: "No lock-in. Cancel anytime in Discord (User Settings → Subscriptions) — access continues until the end of the period you paid for, then the server reverts to the Free tier. Panels, forms, applications and settings are kept; transcripts of tickets closed more than 30 days ago are deleted on the Free tier. Export what you need to CSV or PDF before the period ends." },
  { q: "Do you support multiple servers?", a: "Yes — connect unlimited Discord servers from one Supreme Bot account. Each server has independent settings, panels, forms, and billing." },
  { q: "Is there an API?", a: "Yes — a public REST API is available on Premium at /public/v1 with bearer token authentication and scoped permissions. Rate limit is 300 req/min per key." },
  { q: "Does the leveling game read our messages?", a: "No. XP is counted per message event with a cooldown — the text is never read or stored for the game. The only exception is the counting channel an admin designates, where the bot checks whether a message is the next number and stores nothing else. The game is off by default, has no gambling, and sparks can't be bought; members can delete their game data with /privacy delete." },
  { q: "How do I get support?", a: "Join our Discord server — direct support from the team that built Supreme Bot (not outsourced). Response times are best-effort; no contractual SLA is included." },
];

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  const rootRef = useRef(null);
  useScrollReveal(rootRef);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading]);

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || "/api"}/auth/login`;
  };

  const authError = error && (
    <div role="alert" className="mb-6 max-w-md mx-auto lg:mx-0 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-left">
      <div className="text-xs font-semibold text-danger mb-1">Sign-in failed</div>
      <div className="text-sm text-cs-text">
        {error === "blacklisted"   ? "You have been blacklisted from this platform."
        : error === "oauth_failed" ? "Discord authentication failed. Please try again."
        : error === "no_code"      ? "OAuth flow incomplete. Please try again."
        : "An error occurred. Please try again."}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative min-h-screen bg-transparent overflow-x-clip">
      <Seo
        title="Supreme Bot — Discord Ticket Bot & SaaS Platform | Tickets, Forms, Applications | Carbon Stealth"
        description="Supreme Bot is a Discord ticket bot and all-in-one platform by Carbon Stealth: tickets, application forms, verification, a bait channel for spam bots, giveaways, a leveling game with companions and server quests, AI-assisted replies and white-label bots — one web dashboard, EU-hosted, Premium billed through Discord."
        path="/"
        lang="en"
        hreflang
      />
      {/* Декоративен фон — aria-hidden, само CSS. Фиксирана височина, НЕ
          inset-0: иначе горният ръб на аврората „скача“, когато React
          дорисува страницата (CLS, 08.10.2026). */}
      <div aria-hidden className="hero-backdrop absolute inset-x-0 top-0 h-[140vh] overflow-hidden pointer-events-none">
        <div className="hero-aurora" />
        <div className="grid-bg hero-grid-mask absolute inset-0" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="relative max-w-6xl w-full mx-auto px-6 sm:px-8 xl:px-0 py-5 flex items-center justify-between gap-4">
          <a href="https://carbonstealth.eu" className="flex items-center gap-3 group no-underline" target="_blank" rel="noopener">
            <SupremeLogo size={48} />
            <div className="hidden sm:block">
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
            addLabel={C.add}
            links={[
              { href: "#features", label: UI.nav.features },
              { href: "#pricing", label: UI.nav.pricing },
              { href: "#tour", label: C.nav.showcase },
              { href: "/commands", label: C.nav.docs },
              { href: SUPPORT_URL, label: C.nav.support, external: true },
            ]}
          />
        </header>

        <ConceptHero c={C} inviteUrl={BOT_INVITE_URL} onDashboard={handleLogin} notice={authError} />

        {/* Всичко под героя се рисува след първото рисуване, на порции
            (startTransition) — без дълги задачи при старта (TBT, 08.10.2026). */}
        <DeferredSections>
        <BotsSection c={C} />

        <FeaturesSection c={C}>
          <FeatureGroups features={EN_FEATURES} ui={UI} aside={<DemoCard c={C} />} />
        </FeaturesSection>

        {/* Живо демо на тикетите — основното, което продуктът прави */}
        <Suspense fallback={null}><TicketShowcase locale="en" /></Suspense>

        {/* SERVER SEASON — играта; същият компонент като на преведените лендинги */}
        <GameShowcase
          heading="A game that brings members back every day"
          sub="Server Season turns activity in your server into progress: levels, rewards and a collection that live inside your server. No gambling, and sparks can't be bought."
          bullets={[
            "Levels on the MEE6 curve members already know, with stacking level roles — only safe roles are ever assigned",
            "/daily sparks with a streak (×2 from day 7) and a shop with timed roles or your own custom rewards",
            "60 original companions show up on their own while people chat — catch them, train their stats with sparks and battle other members; the loser only loses 1–3 % of their sparks",
            "Weekly server quests, a counting channel and trivia — the whole server plays as one team",
          ]}
          link="See how the game works"
        />

        {/* v52 — канал-стръв за спам ботове: живото демо е единственият голям момент */}
        <Suspense fallback={null}><BaitShowcase locale="en" /></Suspense>

        {/* SHOWCASE — снимки от текущото табло (демо данни) */}
        <Suspense fallback={null}><ProductTour locale="en" /></Suspense>

        {/* PRICING — Free · Premium · White-label + ЕС хостинг */}
        <PlansSection
          c={C}
          note="All prices VAT-inclusive · per server / month · Monthly subscriptions sold and billed through the Discord store · Renews automatically until cancelled · 99.9% uptime target (not a contractual SLA) · EU hosting · GDPR · Cancel anytime"
          after={
            <details className="group mt-8 cs-card !p-0">
              <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none">
                <span className="font-semibold text-cs-text">Compare Free and Premium</span>
                <span className="text-cs-cyan text-xl leading-none group-open:rotate-45 transition-transform" aria-hidden="true">+</span>
              </summary>
              <div className="overflow-x-auto border-t border-cs-line">
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
            </details>
          }
        >
          <PlanCard
            name="Free"
            price="€0"
            per={C.perServer}
            onCta={handleLogin}
            cta="Get started"
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
          <PlanCard
            highlighted
            badge="Recommended"
            name="Premium"
            price="€4.99"
            per={C.perServer}
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
          <PlanCard
            name="White-label"
            price="€9.99"
            per={C.perServer}
            onCta={handleLogin}
            cta="Get White-label"
            bullets={[
              "Everything in Premium",
              "White-label custom bot (your token)",
              "Runs under your name & avatar",
            ]}
          />
        </PlansSection>

        {/* TRUST — факти, не обещания (същата решетка като функциите) */}
        <section className="px-6 sm:px-8 py-16 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 data-reveal className="cs-section-title">Why teams trust Supreme Bot</h2>
            <p data-reveal className="cs-section-sub">A registered EU company, encrypted secrets and a public status page — not promises.</p>
            <ul data-reveal className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-9">
              <TrustItem icon={Lock} title="EU data residency">
                Hosted and stored in the EU (Germany, Hetzner). GDPR-native. Discord, Google and Sentry are recipients in the US under Standard Contractual Clauses.
              </TrustItem>
              <TrustItem icon={Zap} title="99.9% uptime target">
                Monitored with auto-recovery — a target, not a contractual SLA. See live status at /status.
              </TrustItem>
              <TrustItem icon={ScrollText} title="Open audit logs">
                Every action is logged with actor, timestamp, and context. Full transparency for staff.
              </TrustItem>
              <TrustItem icon={Shield} title="No token storage in plaintext">
                AES-256-GCM encryption for custom bot tokens. Hashed API keys. Security first.
              </TrustItem>
              <TrustItem icon={Building2} title="Registered business">
                Carbon Stealth VCC, EIK 208725180, VAT BG208725180. A real company and real support; purchases are receipted by Discord as the seller of record.
              </TrustItem>
              <TrustItem icon={MessageCircle} title="Direct Discord support">
                Talk to the team that built it. No ticket triage outsourced overseas.
              </TrustItem>
            </ul>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-cs-dim border-t border-cs-line pt-6">
              {/* Статичната значка „всичко работи“ беше твърдение без измерване —
                  сега води към живия статус (одит 24.09.2026). */}
              <a href="/status" className="flex items-center gap-2 no-underline hover:text-cs-cyan transition-colors"><Activity className="w-3.5 h-3.5" aria-hidden="true" /> Live system status</a>
              <span>GDPR compliant</span>
              <span>Ad-free, no advertising trackers</span>
              <span>Cancel anytime, no lock-in</span>
            </div>
          </div>
        </section>

        <FaqSection c={C} items={EN_FAQ} />

        {/* FINAL CTA */}
        <section data-reveal className="px-6 sm:px-8 py-20 sm:py-24 text-center">
          <h2 className="cs-section-title !text-4xl sm:!text-5xl">Ready to consolidate?</h2>
          <p className="text-cs-muted mt-4 mb-8 max-w-lg mx-auto">
            Takes 60 seconds. Add the bot, sign in with Discord, go live on Free.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="cs-btn-primary cs-btn-lg no-underline">
              <DiscordIcon />
              <span>{C.add}</span>
            </a>
            <button type="button" onClick={handleLogin} className="cs-btn-secondary cs-btn-lg">{C.dashboard}</button>
          </div>
        </section>
        </DeferredSections>

        {/* FOOTER — общ с преводите (components/LandingParts.jsx) */}
        <LandingFooter lang="en" ui={UI.footer} nav={UI.nav} guides={EN_GUIDES} supportUrl={SUPPORT_URL} company={COMPANY_NAME} />
      </div>
    </div>
  );
}

function TrustItem({ icon: Icon, title, children }) {
  return (
    <li className="flex gap-4">
      <span className="cs-icon-tile !w-10 !h-10">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-cs-text text-base font-bold leading-snug">{title}</h3>
        <p className="text-sm text-cs-muted leading-relaxed mt-1">{children}</p>
      </div>
    </li>
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
