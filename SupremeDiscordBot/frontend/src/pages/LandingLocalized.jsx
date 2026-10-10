// frontend/src/pages/LandingLocalized.jsx
// Localized marketing landing pages (/bg, /de, /es, /fr, /it, /nl, /pl).
// The English landing remains at "/" (Login.jsx). Each locale page emits its
// own title/description/canonical/hreflang plus a translated FAQPage JSON-LD
// (the visible FAQ below keeps content parity with the structured data, as
// Google requires).
import { useMemo, useState, useRef, lazy, Suspense } from "react";
import {
  Sparkles, Check, Star, Zap, Crown, ArrowRight, Globe,
} from "lucide-react";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo, { SITE, landingPath } from "../components/Seo";
import GameShowcase from "../components/GameShowcase";
import LandingNav from "../components/LandingNav";
import SectionHead from "../components/SectionHead";
import FeatureGroups from "../components/FeatureGroups";
import DeferredSections from "../components/DeferredSections";
import { LANDING_UI } from "../i18n/landingUi";
const TicketShowcase = lazy(() => import("../components/TicketShowcase"));
const ProductTour = lazy(() => import("../components/ProductTour"));
const ReplaceBots = lazy(() => import("../components/ReplaceBots"));
// Под сгъвката и със собствен текст на 8 езика → собствен чънк (бюджет 30 KB).
const BaitShowcase = lazy(() => import("../components/BaitShowcase"));
import { TrustLine, LandingFooter } from "../components/LandingParts";
import { LANDING_TRANSLATIONS } from "../i18n/landing";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useMagnetic, useTiltCard } from "../hooks/useMicroInteractions";

// Own chunk — this whole page is already lazy-loaded from App.jsx, so the
// extra split just keeps the WebGL code out of the locale's initial chunk
// until the hero is actually near the viewport (see ShaderHero.jsx).
const ShaderHero = lazy(() => import("../components/ShaderHero"));

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";

// Иконите се търсят по КЛЮЧ, не по позиция. Преди беше позиционен масив и
// точно това се счупи: добавихме карта в средата на преводите и всяка следваща
// получи чуждата икона (верификацията излезе с графика, анкетите с подарък).
// С ключ пренареждането или добавянето на карта е безобидно, а непозната
// стойност пада на Sparkles вместо да размести всичко след себе си.

export default function LandingLocalized({ locale }) {
  const t = LANDING_TRANSLATIONS[locale];
  const ui = LANDING_UI[locale] || LANDING_UI.en;

  const rootRef = useRef(null);
  useScrollReveal(rootRef);
  const heroCtaRef = useMagnetic();
  const finalCtaRef = useMagnetic();

  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || "/api"}/auth/login`;
  };

  const jsonLd = useMemo(() => t && ({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${SITE}${landingPath(locale)}#webpage`,
        url: `${SITE}${landingPath(locale)}`,
        name: t.title,
        description: t.description,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}${landingPath(locale)}#faq`,
        inLanguage: locale,
        mainEntity: t.faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  }), [locale]);

  if (!t) return null;

  return (
    <div ref={rootRef} className="relative min-h-screen bg-transparent overflow-x-clip">
      <Seo
        title={t.title}
        description={t.description}
        path={landingPath(locale)}
        lang={locale}
        hreflang
        jsonLd={jsonLd}
      />
      <div aria-hidden className="absolute inset-0 grid-bg opacity-30" />
      <div aria-hidden className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-cs-cyan/10 rounded-full blur-[120px] animate-pulse-slow" />
      <div aria-hidden className="absolute top-0 left-0 right-0 h-px bg-cs-cyan/40" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="relative px-6 sm:px-8 py-6 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group">
            <SupremeLogo size={52} />
            <div>
              <SupremeWordmark className="text-lg leading-none" />
              <div className="hidden sm:block text-xs text-cs-dim mt-0.5 group-hover:text-cs-cyan transition-colors">
                by {COMPANY_NAME}
              </div>
            </div>
          </a>
          <LandingNav
            ui={ui.nav}
            onSignIn={handleLogin}
            extra={<LanguageSwitcher current={locale} />}
            menuFooter={<LanguageSwitcher current={locale} inMenu />}
            links={[
              { href: "#features", label: ui.nav.features },
              { href: "#demo", label: ui.nav.demo },
              { href: "#game", label: ui.nav.game },
              { href: "#bait", label: ui.nav.bait },
              { href: "#pricing", label: ui.nav.pricing },
              { href: "#faq", label: ui.nav.faq },
            ]}
          />
        </header>

        {/* HERO — WebGL is scoped to just this section (see Login.jsx for the
            full rationale). */}
        <section className="relative px-6 sm:px-8 pt-16 pb-24 flex items-center justify-center overflow-hidden">
          <Suspense fallback={null}>
            <ShaderHero />
          </Suspense>
          <div className="relative z-10 w-full max-w-4xl text-center">
            <p className="text-sm text-cs-muted mb-5">{t.eyebrow.replace(/^→\s*/, "")}</p>
            <h1 className="font-display font-black text-5xl sm:text-7xl tracking-tight-4 text-balance text-cs-text leading-[0.95] mb-6">
              {t.h1a}<br />
              <span className="text-cs-cyan">{t.h1b}</span>
            </h1>
            <p className="text-cs-muted text-lg sm:text-xl leading-relaxed mb-10 text-pretty max-w-2xl mx-auto">
              {t.sub}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button ref={heroCtaRef} onClick={handleLogin} className="cs-btn-primary cs-btn-lg">
                <span>{t.cta}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
              <a href="#pricing" className="cs-btn-secondary cs-btn-lg">
                {t.seePricing.replace(/\s*→\s*$/, "")}
              </a>
            </div>
            <TrustLine className="mt-6 lg:justify-center" text={t.ctaNote} />
          </div>
        </section>

        {/* Всичко под hero-то — след първото рисуване, на порции (TBT). */}
        <DeferredSections>
        {/* FEATURES — групирани по задача */}
        <section id="features" className="px-6 sm:px-8 pt-24 pb-12">
          <div className="max-w-6xl mx-auto">
            <SectionHead title={t.featuresHeading} sub={t.featuresSub} />
            <FeatureGroups features={t.features} ui={ui} />
          </div>
        </section>

        {/* Живо демо на тикетите */}
        <Suspense fallback={null}><TicketShowcase locale={locale} /></Suspense>

        {/* SERVER SEASON — играта (текстът по локал, картинките общи) */}
        {t.game && <GameShowcase heading={t.game.heading} sub={t.game.sub} bullets={t.game.bullets} link={t.game.link} />}

        {/* v52 — канал-стръв за спам ботове (текстът по локал) */}
        <Suspense fallback={null}><BaitShowcase locale={locale} /></Suspense>

        {/* Снимки от таблото и „Заменете ги“ — както на английския */}
        <Suspense fallback={null}><ProductTour locale={locale} /></Suspense>
        <Suspense fallback={null}><ReplaceBots locale={locale} /></Suspense>

        {/* EU TRUST */}
        <section className="px-6 sm:px-8 py-24">
          <div data-reveal className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_1.2fr] gap-10 items-start">
            <div>
              <Globe className="w-8 h-8 text-cs-cyan mb-4" aria-hidden="true" />
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text leading-[1.02] tracking-tight text-balance">{t.euHeading}</h2>
            </div>
            <ul className="space-y-4">
              {t.euBullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-cs-muted">
                  <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ — visible content parity with the FAQPage JSON-LD above */}
        <section id="faq" className="px-6 sm:px-8 py-24 bg-cs-surface/40 border-y border-cs-border/40">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,20rem)_1fr] gap-10 lg:gap-16">
            <div className="lg:sticky lg:top-8 self-start">
              <SectionHead size="md" className="!mb-0" title={t.faqHeading} />
            </div>
            <div data-reveal className="space-y-3">
              {t.faq.map(({ q, a }) => (
                <details key={q} className="cs-card group cursor-pointer hover:border-cs-cyan/50 transition-colors">
                  <summary className="flex items-center justify-between gap-4 list-none select-none">
                    <span className="text-cs-text font-semibold text-sm sm:text-base">{q}</span>
                    <span className="text-cs-cyan text-xl group-open:rotate-45 transition-transform flex-shrink-0">+</span>
                  </summary>
                  <p className="text-sm text-cs-muted leading-relaxed mt-4 pt-4 border-t border-cs-border/50">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARE — Free vs Premium (content parity with prerender + Login.jsx EN) */}
        {t.compare && (
          <section className="px-6 sm:px-8 py-24">
            <div className="max-w-4xl mx-auto">
              <SectionHead size="md" title={t.compare.heading} />
              <div data-reveal className="cs-card overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-cs-border text-left">
                      <th className="py-3 pr-4 text-cs-muted font-semibold">{t.compare.colCap}</th>
                      <th className="py-3 px-4 text-cs-muted font-semibold">{t.compare.colFree}</th>
                      <th className="py-3 pl-4 text-cs-cyan font-semibold">{t.compare.colPremium}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.compare.rows.map(([cap, free, prem]) => (
                      <tr key={cap} className="border-b border-cs-border/40">
                        <td className="py-3 pr-4 text-cs-text font-medium">{cap}</td>
                        <td className="py-3 px-4 text-cs-muted">{free}</td>
                        <td className="py-3 pl-4 text-cs-text">{prem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* PRICING */}
        <section id="pricing" className="px-6 sm:px-8 py-24">
          <div className="max-w-5xl mx-auto">
            <SectionHead align="center" title={t.pricingHeading} sub={t.pricingSub} />
            <div data-reveal className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TierCard icon={Zap} tier={t.tiers.free} onCta={handleLogin} />
              <TierCard icon={Star} tier={t.tiers.premium} onCta={handleLogin} highlighted />
              <TierCard icon={Crown} tier={t.tiers.whitelabel} onCta={handleLogin} />
            </div>
            {/* Преддоговорна информация (чл. 6(1)(д),(о) Дир. 2011/83): ДДС в
                цената + авто-подновяване — задължителна на ВСЕКИ език, не само EN. */}
            {t.priceNote && (
              <p className="text-center text-sm text-cs-dim mt-8 max-w-3xl mx-auto leading-relaxed">{t.priceNote}</p>
            )}
          </div>
        </section>

        {/* FINAL CTA */}
        <section data-reveal className="px-6 sm:px-8 py-24 text-center">
          <h2 className="font-display font-black text-4xl sm:text-6xl text-cs-text mb-6 tracking-tight">
            {t.finalH}
          </h2>
          <p className="text-cs-muted mb-8 max-w-lg mx-auto">{t.finalSub}</p>
          <button ref={finalCtaRef} onClick={handleLogin} className="cs-btn-primary cs-btn-lg">
            <span>{t.finalCta}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </section>

        </DeferredSections>

        {/* FOOTER — общ с английския (components/LandingParts.jsx) */}
        <LandingFooter lang={locale} ui={ui.footer} nav={ui.nav} guides={t.guides} supportUrl={SUPPORT_URL} company={COMPANY_NAME} />
      </div>
    </div>
  );
}


// One feature card in the grid — real 3D pointer tilt (skipped under
// reduced-motion / touch, see useTiltCard in useMicroInteractions.js).

// v3.3 — само месечни цени: Discord Premium Apps не поддържа годишни абонаменти.
function TierCard({ icon: Icon, tier, onCta, ctaHref, highlighted = false, compact = false }) {
  const tiltRef = useTiltCard(highlighted ? 6 : 4);
  const price = tier.price;
  const per = tier.per;
  const cardCls = highlighted
    ? "cs-card flex flex-col border-2 border-cs-gold/50 bg-cs-gold/5 relative shadow-cs-gold-sm"
    : "cs-card flex flex-col";
  return (
    <div ref={tiltRef} className={cardCls}>
      {highlighted && tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-cs-gold text-black text-xs font-bold">
          {tier.badge}
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-5 h-5 ${highlighted ? "text-cs-gold fill-current" : "text-cs-cyan"}`} />
          <h3 className="text-xl font-bold text-cs-text">{tier.name}</h3>
        </div>
        {tier.seats && (
          <div className="text-xs text-cs-cyan mb-1">{tier.seats}</div>
        )}
        <p className="text-sm text-cs-muted">{tier.tagline}</p>
      </div>
      <div className="mb-6" aria-live="polite">
        <div className="font-display text-4xl font-black text-cs-text">{price}</div>
        <div className="text-sm text-cs-dim mt-1">{per}</div>
      </div>
      <ul className={`space-y-2 text-sm text-cs-text flex-1 ${compact ? "mb-6" : "mb-8"}`}>
        {tier.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {ctaHref ? (
        <a href={ctaHref} className="cs-btn-secondary w-full text-center">{tier.cta}</a>
      ) : (
        <button
          onClick={onCta}
          className={highlighted
            ? "cs-btn-primary w-full bg-cs-gold hover:bg-cs-goldDim text-black border-cs-gold"
            : "cs-btn-secondary w-full"}
        >
          {tier.cta}
        </button>
      )}
    </div>
  );
}

// Visible cross-links between language versions — crawlable <a href> links so
// Google discovers every locale even without reading hreflang.
function LanguageSwitcher({ current, inMenu = false }) {
  const locales = [
    ["en", "EN"], ["bg", "БГ"], ["de", "DE"], ["es", "ES"],
    ["fr", "FR"], ["it", "IT"], ["nl", "NL"], ["pl", "PL"],
  ];
  return (
    <nav aria-label="Language" className={`${inMenu ? "flex flex-wrap px-2 py-2 border-t border-cs-border/60 mt-1" : "hidden md:flex"} items-center gap-1 font-mono text-xs text-cs-dim`}>
      {locales.map(([loc, label]) => (
        <a
          key={loc}
          href={landingPath(loc)}
          className={`inline-flex items-center justify-center min-w-[24px] min-h-[24px] px-1 rounded ${loc === current ? "text-cs-cyan" : "hover:text-cs-cyan transition-colors"}`}
          aria-current={loc === current ? "page" : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
