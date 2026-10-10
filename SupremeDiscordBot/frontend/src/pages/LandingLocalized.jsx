// frontend/src/pages/LandingLocalized.jsx
// Localized marketing landing pages (/bg, /de, /es, /fr, /it, /nl, /pl).
// The English landing remains at "/" (Login.jsx). Each locale page emits its
// own title/description/canonical/hreflang plus a translated FAQPage JSON-LD
// (the visible FAQ below keeps content parity with the structured data, as
// Google requires).
import { useMemo, useRef, lazy, Suspense } from "react";
import { Check } from "lucide-react";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo, { SITE, landingPath } from "../components/Seo";
import GameShowcase from "../components/GameShowcase";
import LandingNav from "../components/LandingNav";
import FeatureGroups from "../components/FeatureGroups";
import DeferredSections from "../components/DeferredSections";
import {
  ConceptHero, BotsSection, FeaturesSection, DemoCard, PlansSection, PlanCard, FaqSection, DiscordIcon,
} from "../components/LandingConcept";
import { LANDING_UI } from "../i18n/landingUi";
import { LANDING_CONCEPT } from "../i18n/landingConcept";
const TicketShowcase = lazy(() => import("../components/TicketShowcase"));
const ProductTour = lazy(() => import("../components/ProductTour"));
// Под сгъвката и със собствен текст на 8 езика → собствен чънк (бюджет 30 KB).
const BaitShowcase = lazy(() => import("../components/BaitShowcase"));
import { LandingFooter } from "../components/LandingParts";
import { LANDING_TRANSLATIONS } from "../i18n/landing";
import { useScrollReveal } from "../hooks/useScrollReveal";

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814416&scope=bot+applications.commands`;

// Същата разметка като английския (одобрената концепция, 10.10.2026):
// текстовете на концепцията — LANDING_CONCEPT[locale]; функциите, тарифите,
// въпросите и сравнението — LANDING_TRANSLATIONS[locale] (i18n/landing.js).
export default function LandingLocalized({ locale }) {
  const t = LANDING_TRANSLATIONS[locale];
  const c = LANDING_CONCEPT[locale] || LANDING_CONCEPT.en;
  const ui = LANDING_UI[locale] || LANDING_UI.en;

  const rootRef = useRef(null);
  useScrollReveal(rootRef);

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
      <div aria-hidden className="hero-backdrop absolute inset-x-0 top-0 h-[140vh] overflow-hidden pointer-events-none">
        <div className="hero-aurora" />
        <div className="grid-bg hero-grid-mask absolute inset-0" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="relative max-w-6xl w-full mx-auto px-6 sm:px-8 xl:px-0 py-5 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group no-underline">
            <SupremeLogo size={48} />
            <div className="hidden sm:block">
              <SupremeWordmark className="text-lg leading-none" />
              <div className="text-xs text-cs-dim mt-0.5 group-hover:text-cs-cyan transition-colors">
                by {COMPANY_NAME}
              </div>
            </div>
          </a>
          <LandingNav
            ui={ui.nav}
            onSignIn={handleLogin}
            inviteUrl={BOT_INVITE_URL}
            addLabel={c.add}
            extra={<LanguageSwitcher current={locale} />}
            menuFooter={<LanguageSwitcher current={locale} inMenu />}
            links={[
              { href: "#features", label: ui.nav.features },
              { href: "#pricing", label: ui.nav.pricing },
              { href: "#tour", label: c.nav.showcase },
              { href: "/commands", label: c.nav.docs },
              { href: SUPPORT_URL, label: c.nav.support, external: true },
            ]}
          />
        </header>

        <ConceptHero c={c} inviteUrl={BOT_INVITE_URL} onDashboard={handleLogin} />

        {/* Всичко под героя — след първото рисуване, на порции (TBT). */}
        <DeferredSections>
        <BotsSection c={c} />

        <FeaturesSection c={c}>
          <FeatureGroups features={t.features} ui={ui} aside={<DemoCard c={c} />} />
        </FeaturesSection>

        {/* Живо демо на тикетите */}
        <Suspense fallback={null}><TicketShowcase locale={locale} /></Suspense>

        {/* SERVER SEASON — играта (текстът по локал, картинките общи) */}
        {t.game && <GameShowcase heading={t.game.heading} sub={t.game.sub} bullets={t.game.bullets} link={t.game.link} />}

        {/* v52 — канал-стръв за спам ботове (текстът по локал) */}
        <Suspense fallback={null}><BaitShowcase locale={locale} /></Suspense>

        {/* Снимки от таблото — както на английския */}
        <Suspense fallback={null}><ProductTour locale={locale} /></Suspense>

        {/* PRICING + ЕС хостинг; сравнението Free/Premium е под картите (паритет с prerender) */}
        <PlansSection
          c={c}
          /* Преддоговорна информация (чл. 6(1)(д),(о) Дир. 2011/83): ДДС в
             цената + авто-подновяване — задължителна на ВСЕКИ език, не само EN. */
          note={t.priceNote || null}
          after={t.compare && (
            <details className="group mt-8 cs-card !p-0">
              <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none">
                <span className="font-semibold text-cs-text">{t.compare.heading}</span>
                <span className="text-cs-cyan text-xl leading-none group-open:rotate-45 transition-transform" aria-hidden="true">+</span>
              </summary>
              <div className="overflow-x-auto border-t border-cs-line">
                <table className="cs-table w-full">
                  <thead>
                    <tr>
                      <th>{t.compare.colCap}</th>
                      <th>{t.compare.colFree}</th>
                      <th className="!text-cs-cyan">{t.compare.colPremium}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.compare.rows.map(([cap, free, prem]) => (
                      <tr key={cap}>
                        <td className="text-cs-text font-medium">{cap}</td>
                        <td className="text-cs-muted">{free}</td>
                        <td className="text-cs-text">{prem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        >
          <TierCard tier={t.tiers.free} per={c.perServer} onCta={handleLogin} />
          <TierCard tier={t.tiers.premium} per={c.perServer} onCta={handleLogin} highlighted />
          <TierCard tier={t.tiers.whitelabel} per={c.perServer} onCta={handleLogin} />
        </PlansSection>

        {/* ЕС — какво точно се случва с данните (без „никога не напуска ЕС“) */}
        <section className="px-6 sm:px-8 py-16 sm:py-20">
          <div data-reveal className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_1.2fr] gap-10 items-start">
            <h2 className="cs-section-title">{t.euHeading}</h2>
            <ul className="space-y-4">
              {t.euBullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-cs-muted">
                  <span className="cs-icon-tile !w-7 !h-7 !rounded-md mt-0.5">
                    <Check className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ — видимото съдържание пази паритета с FAQPage JSON-LD горе */}
        <FaqSection c={c} items={t.faq} />

        {/* FINAL CTA */}
        <section data-reveal className="px-6 sm:px-8 py-20 sm:py-24 text-center">
          <h2 className="cs-section-title !text-4xl sm:!text-5xl">{t.finalH}</h2>
          <p className="text-cs-muted mt-4 mb-8 max-w-lg mx-auto">{t.finalSub}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="cs-btn-primary cs-btn-lg no-underline">
              <DiscordIcon />
              <span>{c.add}</span>
            </a>
            <button type="button" onClick={handleLogin} className="cs-btn-secondary cs-btn-lg">{c.dashboard}</button>
          </div>
        </section>
        </DeferredSections>

        {/* FOOTER — общ с английския (components/LandingParts.jsx) */}
        <LandingFooter lang={locale} ui={ui.footer} nav={ui.nav} guides={t.guides} supportUrl={SUPPORT_URL} company={COMPANY_NAME} />
      </div>
    </div>
  );
}

// v3.3 — само месечни цени: Discord Premium Apps не поддържа годишни абонаменти.
function TierCard({ tier, per, onCta, highlighted = false }) {
  return (
    <PlanCard
      name={tier.name}
      price={tier.price}
      per={per}
      bullets={tier.bullets}
      cta={tier.cta}
      onCta={onCta}
      badge={tier.badge}
      highlighted={highlighted}
    />
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
    <nav aria-label="Language" className={`${inMenu ? "flex flex-wrap px-2 py-2 border-t border-cs-border/60 mt-1" : "hidden xl:flex"} items-center gap-1 font-mono text-xs text-cs-dim`}>
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
