// frontend/src/components/LandingConcept.jsx
// Секциите на лендинга по одобрената концепция (архивът
// supremebot-reference-locked, 10.10.2026): герой с арта, „Осем бота. Едно
// табло.“, функциите с картата към живото демо, плановете с ЕС хостинга и
// въпросите на две колони. Една разметка за английския (Login.jsx) и 7-те
// превода (LandingLocalized.jsx); текстовете — i18n/landingConcept.js.
//
// Артът на героя е изрязан от самата концепция (public/hero-sentinel.webp).
// Вградената в него карта „Add to Discord · 1.2M+ Servers“ е закърпена — числото
// беше измислено; на нейното място стои истинската карта по-долу.
import {
  ChevronRight, ShieldCheck, Server, BadgeCheck, Play, Plus, Check, Lock, ArrowRight,
  Ticket, FileText, SmilePlus, Gift, ScrollText, CalendarClock, Webhook,
} from "lucide-react";
import { BOT_KEYS } from "../i18n/landingConcept";

// Всяка карта води към страницата на функцията (английски — както футъра).
const BOT_LINKS = {
  ticket: "/features/discord-ticket-system",
  forms: "/features/discord-application-forms",
  verification: "/features/discord-verification-bot",
  reactionRoles: "/features/discord-reaction-roles",
  giveaways: "/features/discord-giveaway-bot",
  logging: "/features/discord-logging-bot",
  scheduler: "/features/discord-sticky-scheduled-messages",
  webhooks: "/features",
};
const BOT_ICONS = {
  ticket: Ticket, forms: FileText, verification: ShieldCheck, reactionRoles: SmilePlus,
  giveaways: Gift, logging: ScrollText, scheduler: CalendarClock, webhooks: Webhook,
};
const TRUST_ICONS = [ShieldCheck, Server, BadgeCheck];

export function DiscordIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.249a18.365 18.365 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.098.245.198.372.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

// ─── Героят ──────────────────────────────────────────────────────────────────
// H1-ът е LCP елементът: обикновен текст, без анимация на влизане. Главните
// букви са от CSS (`uppercase`), не от данните — така езиците с особени
// правила (ß, i/İ) се изписват от браузъра според `lang` на страницата.
export function ConceptHero({ c, inviteUrl, onDashboard, notice = null }) {
  return (
    <section className="relative">
      <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 xl:px-0 pt-8 lg:pt-12 pb-10 lg:pb-14 grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-4 items-center">
        <div className="text-center lg:text-left">
          <p className="cs-eyebrow !mb-5">{c.eyebrow}</p>
          <h1 className="font-wide font-black uppercase text-cs-text leading-[0.98] tracking-[-0.01em] text-[2.75rem] sm:text-6xl xl:text-[4.5rem] mb-6">
            <span className="block">{c.h1[0]}</span>
            <span className="block text-cs-cyan">{c.h1[1]}</span>
            <span className="block">{c.h1[2]}</span>
          </h1>
          <p className="text-cs-muted text-lg sm:text-xl leading-relaxed text-pretty max-w-xl mx-auto lg:mx-0 mb-8">{c.sub}</p>
          {notice}
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
            <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="cs-btn-primary cs-btn-lg no-underline w-full sm:w-auto">
              <DiscordIcon />
              <span>{c.add}</span>
            </a>
            <button type="button" onClick={onDashboard} className="cs-btn-secondary cs-btn-lg w-full sm:w-auto">
              {c.dashboard}
            </button>
          </div>
          <ul className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-cs-muted">
            {c.trust.map((t, i) => {
              const Icon = TRUST_ICONS[i] || BadgeCheck;
              return (
                <li key={t} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-cs-cyan flex-none" aria-hidden="true" />
                  {t}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
          {/* Артът е декорация (празен alt): заглавието вече казва всичко. */}
          <div aria-hidden="true" className="hero-art relative aspect-[692/616]">
            <img
              src="/hero-sentinel.webp"
              alt=""
              width="692"
              height="616"
              fetchpriority="high"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hero-art-card absolute flex items-center gap-3 rounded-xl border border-cs-line bg-cs-surface/85 backdrop-blur-md pl-3 pr-5 py-3 no-underline shadow-cs-lift hover:border-cs-cyan/50 transition-colors"
          >
            <span className="w-11 h-11 rounded-lg bg-[#5865F2] text-white flex items-center justify-center flex-none">
              <DiscordIcon className="w-6 h-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-cs-text whitespace-nowrap">{c.add}</span>
              <span className="block text-xs text-cs-muted whitespace-nowrap">{c.cardNote}</span>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Осем бота. Едно табло. ──────────────────────────────────────────────────
export function BotsSection({ c }) {
  return (
    <section id="bots" className="px-6 sm:px-8 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <h2 data-reveal className="cs-section-title">{c.botsTitle}</h2>
        <p data-reveal className="cs-section-sub">{c.botsSub}</p>
        <ul data-reveal className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BOT_KEYS.map((k, i) => {
            const Icon = BOT_ICONS[k];
            const [title, sub] = c.bots[i];
            return (
              <li key={k}>
                <a href={BOT_LINKS[k]} className="cs-card cs-card-link !p-4 flex items-center gap-4 no-underline group h-full">
                  <span className="cs-icon-tile">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-cs-text leading-snug">{title}</span>
                    <span className="block text-sm text-cs-muted mt-0.5">{sub}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 flex-none text-cs-dim group-hover:text-cs-cyan transition-colors" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ─── Функциите + картата към живото демо ─────────────────────────────────────
export function FeaturesSection({ c, children }) {
  return (
    <section id="features" className="px-6 sm:px-8 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <h2 data-reveal className="cs-section-title">{c.featuresTitle}</h2>
        <p data-reveal className="cs-section-sub">{c.featuresSub}</p>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

// Картата „Вижте го в действие“: снимка от таблото и бутон към живото демо на
// същата страница (#demo) — без видео, затова и без обещание за видео.
export function DemoCard({ c }) {
  return (
    <a href="#demo" className="cs-card cs-card-link !p-0 overflow-hidden flex flex-col h-full no-underline group">
      <span className="relative block aspect-[16/10] bg-cs-bg overflow-hidden">
        <img src="/screens/home.webp" alt="" width="1440" height="900" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover object-left-top opacity-60 group-hover:opacity-75 transition-opacity" />
        <span className="absolute inset-0 bg-gradient-to-t from-cs-surface via-cs-surface/30 to-transparent" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-14 h-14 rounded-full bg-cs-cyan text-black flex items-center justify-center shadow-cs-cyan">
            <Play className="w-6 h-6 fill-current ml-0.5" aria-hidden="true" />
          </span>
        </span>
      </span>
      <span className="block p-5 text-center flex-1">
        <span className="block text-lg font-bold text-cs-text">{c.demoTitle}</span>
        <span className="block text-sm text-cs-muted mt-1.5 text-pretty">{c.demoSub}</span>
        <span className="cs-btn-primary cs-btn-sm mt-4">{c.demoCta}</span>
      </span>
    </a>
  );
}

// ─── Плановете + ЕС хостинг ──────────────────────────────────────────────────
export function PlansSection({ c, children, note = null, after = null }) {
  return (
    <section id="pricing" className="px-6 sm:px-8 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <h2 data-reveal className="cs-section-title">{c.plansTitle}</h2>
        <p data-reveal className="cs-section-sub">{c.plansSub}</p>
        <div data-reveal className="mt-10 grid gap-5 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_1.1fr] items-stretch">
          {children}
          <EuCard c={c} />
        </div>
        {note && <p className="text-sm text-cs-dim mt-8 max-w-3xl leading-relaxed">{note}</p>}
        {after}
      </div>
    </section>
  );
}

export function PlanCard({ name, price, per, tagline, bullets, cta, onCta, badge = null, highlighted = false }) {
  return (
    <div className={`cs-card !p-5 flex flex-col relative ${highlighted ? "plan-card-hi !border-cs-cyan/70" : ""}`}>
      <div className="flex items-center justify-between gap-2 min-h-[1.75rem]">
        <h3 className="text-lg font-bold text-cs-text">{name}</h3>
        {highlighted && badge && <span className="cs-badge-cyan whitespace-nowrap">{badge}</span>}
      </div>
      <div className="mt-3 font-wide font-black text-4xl text-cs-text tabular-nums">{price}</div>
      <div className="text-sm text-cs-dim mt-1">{per}</div>
      {tagline && <p className="text-sm text-cs-muted mt-3 text-pretty">{tagline}</p>}
      <ul className="mt-5 space-y-2.5 text-sm text-cs-text flex-1">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cs-cyan flex-none mt-0.5" aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCta} className={`${highlighted ? "cs-btn-primary" : "cs-btn-secondary"} w-full mt-6`}>
        {cta}
      </button>
    </div>
  );
}

function EuCard({ c }) {
  const icons = [ShieldCheck, Lock];
  return (
    <div className="cs-card !p-0 overflow-hidden relative min-h-[17rem] md:col-span-3 xl:col-span-1">
      <img src="/eu-racks.webp" alt="" width="276" height="364" loading="lazy" decoding="async" className="absolute inset-y-0 right-0 h-full w-[64%] object-cover opacity-90" />
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-cs-surface via-cs-surface/80 to-cs-surface/10" />
      <div className="relative p-6 flex flex-col h-full">
        <h3 className="font-wide font-black uppercase text-xl text-cs-text">{c.euTitle}</h3>
        <p className="text-sm text-cs-muted mt-2 max-w-[17rem] text-pretty">{c.euSub}</p>
        <ul className="mt-auto pt-6 space-y-3">
          {c.euFacts.map((f, i) => {
            const Icon = icons[i] || ShieldCheck;
            return (
              <li key={f} className="flex items-center gap-3 text-sm text-cs-text">
                <span className="cs-icon-tile !w-9 !h-9">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                {f}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Въпросите — на две колони ───────────────────────────────────────────────
// `items` е същият списък като в FAQPage JSON-LD (видимото съдържание пази
// паритета със структурираните данни, както иска Google).
export function FaqSection({ c, items, moreHref = "/commands" }) {
  const half = Math.ceil(items.length / 2);
  const cols = [items.slice(0, half), items.slice(half)];
  return (
    <section id="faq" className="px-6 sm:px-8 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <div data-reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="cs-section-title">{c.faqTitle}</h2>
            <p className="cs-section-sub">{c.faqSub}</p>
          </div>
          <a href={moreHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cs-cyan no-underline hover:underline">
            {c.faqMore}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
        <div data-reveal className="mt-8 grid lg:grid-cols-2 gap-3 lg:gap-x-5 items-start">
          {cols.map((col, i) => (
            <div key={i} className="space-y-3">
              {col.map(({ q, a }) => (
                <details key={q} className="group cs-card !p-0">
                  <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none">
                    <span className="text-sm sm:text-[15px] font-semibold text-cs-text">{q}</span>
                    <Plus className="w-4 h-4 text-cs-cyan flex-none transition-transform group-open:rotate-45" aria-hidden="true" />
                  </summary>
                  <p className="px-5 pb-5 text-sm text-cs-muted leading-relaxed">{a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
