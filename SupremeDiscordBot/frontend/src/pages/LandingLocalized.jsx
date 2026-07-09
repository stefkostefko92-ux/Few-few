// frontend/src/pages/LandingLocalized.jsx
// Localized marketing landing pages (/bg, /de, /es, /fr, /it, /nl, /pl).
// The English landing remains at "/" (Login.jsx). Each locale page emits its
// own title/description/canonical/hreflang plus a translated FAQPage JSON-LD
// (the visible FAQ below keeps content parity with the structured data, as
// Google requires).
import { useMemo, useState } from "react";
import {
  Ticket, FileText, ShieldCheck, BarChart3, Gift, Pin, CalendarClock,
  Webhook, Sparkles, Check, Star, Zap, Crown, ArrowRight, Globe, Building2,
} from "lucide-react";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo, { SITE, landingPath } from "../components/Seo";
import { LANDING_TRANSLATIONS } from "../i18n/landing";

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";

const FEATURE_ICONS = [Ticket, FileText, ShieldCheck, BarChart3, Gift, Pin, CalendarClock, Webhook, Sparkles];

export default function LandingLocalized({ locale }) {
  const t = LANDING_TRANSLATIONS[locale];

  // Billing interval for the pricing section — a real keyboard-operable control
  // (radiogroup below). Free is always €0; paid tiers switch price/per.
  const [interval, setInterval] = useState("month");

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
    <div className="relative min-h-screen bg-transparent overflow-hidden">
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
        <header className="px-6 sm:px-8 py-6 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 group">
            <SupremeLogo size={52} />
            <div>
              <SupremeWordmark className="text-lg leading-none" />
              <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-cs-dim mt-0.5 group-hover:text-cs-cyan transition-colors">
                by {COMPANY_NAME}
              </div>
            </div>
          </a>
          <div className="flex items-center gap-4">
            <LanguageSwitcher current={locale} />
            <button onClick={handleLogin} className="cs-btn-primary text-xs">SIGN IN →</button>
          </div>
        </header>

        {/* HERO */}
        <section className="px-6 sm:px-8 pt-16 pb-24 flex items-center justify-center">
          <div className="w-full max-w-4xl text-center">
            <div className="cs-eyebrow mb-4 justify-center flex">{t.eyebrow}</div>
            <h1 className="font-display font-black text-5xl sm:text-7xl tracking-tight-4 text-balance text-cs-text leading-[0.95] mb-6">
              {t.h1a}<br />
              <span className="text-cs-cyan">{t.h1b}</span>
            </h1>
            <p className="text-cs-muted text-lg sm:text-xl leading-relaxed mb-10 text-pretty max-w-2xl mx-auto">
              {t.sub}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
                <span>{t.cta}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
              <a href="#pricing" className="text-cs-muted hover:text-cs-cyan transition-colors text-sm font-mono uppercase tracking-wider">
                {t.seePricing}
              </a>
            </div>
            <p className="text-xs text-cs-dim mt-6 font-mono">{t.ctaNote}</p>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                {t.featuresHeading}
              </h2>
              <p className="text-cs-muted max-w-2xl mx-auto">{t.featuresSub}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {t.features.map((f, i) => {
                const Icon = FEATURE_ICONS[i] || Sparkles;
                return (
                  <div key={f.title} className="cs-card hover:border-cs-cyan/50 transition-colors">
                    <Icon className="w-6 h-6 text-cs-cyan mb-3" />
                    <h3 className="text-cs-text font-bold mb-2">{f.title}</h3>
                    <p className="text-sm text-cs-muted leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* EU TRUST */}
        <section className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-3xl mx-auto text-center">
            <Globe className="w-8 h-8 text-cs-cyan mx-auto mb-4" />
            <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-8">
              {t.euHeading}
            </h2>
            <ul className="space-y-3 text-left max-w-xl mx-auto">
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
        <section id="faq" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-4">
                {t.faqHeading}
              </h2>
            </div>
            <div className="space-y-3">
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
          <section className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="font-display font-black text-3xl sm:text-4xl text-cs-text mb-4">
                  {t.compare.heading}
                </h2>
              </div>
              <div className="cs-card overflow-x-auto">
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
        <section id="pricing" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text mb-4">
                {t.pricingHeading}
              </h2>
              <p className="text-cs-muted">{t.pricingSub}</p>
            </div>
            {t.pricingToggle && (
              <BillingToggle labels={t.pricingToggle} interval={interval} onChange={setInterval} />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TierCard icon={Zap} tier={t.tiers.free} interval={interval} onCta={handleLogin} />
              <TierCard icon={Star} tier={t.tiers.premium} interval={interval} onCta={handleLogin} highlighted />
              <TierCard icon={Crown} tier={t.tiers.whitelabel} interval={interval} onCta={handleLogin} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <TierCard icon={Building2} tier={t.tiers.agency5} interval={interval} onCta={handleLogin} compact />
              <TierCard icon={Building2} tier={t.tiers.agency10} interval={interval} onCta={handleLogin} compact />
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="px-6 sm:px-8 py-20 border-t border-cs-border/50 text-center">
          <h2 className="font-display font-black text-3xl sm:text-5xl text-cs-text mb-6">
            {t.finalH}
          </h2>
          <p className="text-cs-muted mb-8 max-w-lg mx-auto">{t.finalSub}</p>
          <button onClick={handleLogin} className="cs-btn-primary text-base px-8 py-4">
            <span>{t.finalCta}</span>
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
                <a href="/terms" className="hover:text-cs-cyan transition-colors uppercase">{t.footer.terms}</a>
                <a href="/privacy" className="hover:text-cs-cyan transition-colors uppercase">{t.footer.privacy}</a>
                <a href="/cookies" className="hover:text-cs-cyan transition-colors uppercase">{t.footer.cookies}</a>
                <a href="/accessibility" className="hover:text-cs-cyan transition-colors uppercase">{t.footer.accessibility || "Accessibility"}</a>
                <a href="/status" className="hover:text-cs-cyan transition-colors uppercase">{t.footer.status}</a>
                <a href={SUPPORT_URL} target="_blank" rel="noopener" className="hover:text-cs-cyan transition-colors">DISCORD</a>
              </div>
            </div>
            <div className="text-center text-xs font-mono text-cs-dim border-t border-cs-border/30 pt-4">
              Created and Designed by{" "}
              <a href="https://carbonstealth.eu" target="_blank" rel="noopener" className="text-cs-cyan underline">
                Carbon Stealth VCC
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Accessible monthly/annual switch — a radiogroup of two buttons (aria-checked),
// fully keyboard-operable. The annual option carries a "2 months free" badge.
// All motion is via a CSS transition that prefers-reduced-motion neutralizes.
function BillingToggle({ labels, interval, onChange }) {
  return (
    <div className="flex flex-col items-center gap-2 mb-10">
      <div
        role="radiogroup"
        aria-label={labels.monthly + " / " + labels.annual}
        className="inline-flex items-center gap-1 p-1 rounded-full border border-cs-border bg-cs-surface/60"
      >
        {[["month", labels.monthly], ["year", labels.annual]].map(([value, label]) => {
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
      <span className="cs-badge-cyan text-[10px]">{labels.annualBadge}</span>
    </div>
  );
}

function TierCard({ icon: Icon, tier, interval = "month", onCta, ctaHref, highlighted = false, compact = false }) {
  // Free has no yearly price; paid tiers switch on the interval toggle.
  const yearly = interval === "year" && tier.priceYearly;
  const price = yearly ? tier.priceYearly : tier.price;
  const per = yearly ? tier.perYear : tier.per;
  const cardCls = highlighted
    ? "cs-card flex flex-col border-2 border-cs-gold/50 bg-cs-gold/5 relative"
    : "cs-card flex flex-col";
  return (
    <div className={cardCls}>
      {highlighted && tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-cs-gold text-black text-[10px] font-bold uppercase tracking-wider">
          {tier.badge}
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-5 h-5 ${highlighted ? "text-cs-gold fill-current" : "text-cs-cyan"}`} />
          <h3 className="text-xl font-bold text-cs-text">{tier.name}</h3>
        </div>
        {tier.seats && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-cs-cyan mb-1">{tier.seats}</div>
        )}
        <p className="text-sm text-cs-muted">{tier.tagline}</p>
      </div>
      <div className="mb-6" aria-live="polite">
        <div className="font-display text-4xl font-black text-cs-text">{price}</div>
        <div className="text-xs text-cs-dim font-mono">{per}</div>
        {tier.trial && (
          <div className={`text-xs font-mono mt-1 ${highlighted ? "text-cs-gold" : "text-cs-dim"}`}>
            {tier.trial}
          </div>
        )}
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
function LanguageSwitcher({ current }) {
  const locales = [
    ["en", "EN"], ["bg", "БГ"], ["de", "DE"], ["es", "ES"],
    ["fr", "FR"], ["it", "IT"], ["nl", "NL"], ["pl", "PL"],
  ];
  return (
    <nav aria-label="Language" className="hidden md:flex items-center gap-1 font-mono text-[10px] text-cs-dim">
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
