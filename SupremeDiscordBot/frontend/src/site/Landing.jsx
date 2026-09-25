// frontend/src/site/Landing.jsx
// Лендингът на всичките 8 езика (редизайн 25.09.2026, умението frontend-design).
// Един компонент, едно оформление: английският (LANDING_EN) и 7-те превода
// (LANDING_TRANSLATIONS) са само съдържание във формата на landing.js.
//
// Посоката (одобрена от собственика): хромът от буквите на логото върху
// графит; зеленото е САМО бранд и основният бутон, ember — само Premium;
// Tektur за заглавия, Onest за текст. Смелостта е на едно място — hero-то е
// истински тикет в Discord, изигран веднъж. Всичко останало е тихо: без
// анимирана поява на секции, без неонов glow, без „→“, без етикети с главни
// букви над заглавията, функциите са канали, не еднакви карти.
import { useState, useRef } from "react";
import { Check } from "lucide-react";
import { SiteHeader, SiteFooter, DiscordMark, signIn } from "./SiteChrome";
import DiscordReplay from "./DiscordReplay";
import { SHOWCASE_COMPANIONS } from "../components/GameShowcase";
import { TOUR_CHANNELS } from "../i18n/siteStrings";

const noArrow = (s = "") => s.replace(/\s*→\s*$/, "");
const clauses = (s = "") => s.split(/\s+·\s+/).filter(Boolean);

const AUTH_ERRORS = {
  blacklisted: "You have been blacklisted from this platform.",
  oauth_failed: "Discord authentication failed. Please try again.",
  no_code: "The Discord sign-in was not completed. Please try again.",
};

/** @param {{ t: object, s: object, locale: string, home: string, authError?: string|null }} p */
export default function Landing({ t, s, locale, home, authError = null }) {
  return (
    <div className="site min-h-screen" lang={locale}>
      <SiteHeader nav={s.nav} home={home} onLanding />
      <main id="main" className="site-main">
        <Hero t={t} s={s} authError={authError} />
        <Tour t={t} s={s} />
        <Season t={t} />
        <Pricing t={t} />
        <Europe t={t} />
        <Faq t={t} />
        <Final t={t} />
      </main>
      <SiteFooter locale={locale} t={t} />
    </div>
  );
}

function Hero({ t, s, authError }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-20 sm:pb-28 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-14 items-start">
      <div className="lg:pt-8">
        {/* LCP елементът: обикновен текст, без анимация, в един цвят. */}
        <h1 className="site-h font-bold text-site-chrome text-[2.6rem] leading-[1.02] sm:text-6xl xl:text-[4.4rem]">
          {t.h1a}<br />{t.h1b}
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-site-steel leading-relaxed max-w-[34rem]">{t.sub}</p>

        {authError && (
          <p role="alert" className="mt-6 max-w-[34rem] rounded-lg border border-[#da373c]/60 bg-[#da373c]/10 px-4 py-3 text-site-chrome">
            {AUTH_ERRORS[authError] || "Something went wrong while signing in. Please try again."}
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" onClick={signIn} className="site-btn">
            <DiscordMark />
            <span>{t.cta}</span>
          </button>
          <a href="#pricing" className="site-btn-quiet">{noArrow(t.seePricing)}</a>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-site-steel">
          {clauses(t.ctaNote).map((c) => (
            <li key={c} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-site-supreme" aria-hidden="true" />{c}</li>
          ))}
        </ul>
      </div>
      <DiscordReplay d={s.demo} />
    </section>
  );
}

function Tour({ t, s }) {
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const byKey = Object.fromEntries(t.features.map((f) => [f.key, f]));
  const ch = TOUR_CHANNELS[active];

  const onKey = (e, i) => {
    const n = TOUR_CHANNELS.length;
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? (i + 1) % n
      : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (i - 1 + n) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="features" className="border-t border-site-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <h2 className="site-h font-bold text-site-chrome text-3xl sm:text-[2.6rem]">{s.tour.heading}</h2>
        <p className="mt-3 text-site-steel text-lg max-w-[40rem]">{s.tour.sub}</p>

        <div className="mt-10 grid lg:grid-cols-[13rem_1fr] gap-6 lg:gap-10">
          {/* Каналите — табове (WAI-ARIA tabs, стрелки + Home/End). */}
          <div role="tablist" aria-orientation="vertical" aria-label={s.tour.heading}
               className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0">
            {TOUR_CHANNELS.map((c, i) => {
              const on = i === active;
              return (
                <button key={c.id} ref={(el) => { tabs.current[i] = el; }}
                  type="button" role="tab" id={`tab-${c.id}`} aria-controls={`panel-${c.id}`}
                  aria-selected={on} tabIndex={on ? 0 : -1}
                  onClick={() => setActive(i)} onKeyDown={(e) => onKey(e, i)}
                  className={`flex items-center gap-2 h-10 px-3 rounded-md text-left whitespace-nowrap text-[15px] ${on ? "bg-site-channel text-site-chrome" : "text-site-steel hover:bg-site-channel/60 hover:text-site-chrome"}`}>
                  <span aria-hidden="true" className="text-lg leading-none opacity-70">#</span>{s.tour.channels[c.id]}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={`panel-${ch.id}`} aria-labelledby={`tab-${ch.id}`} tabIndex={0}>
            <div className="rounded-xl overflow-hidden border border-site-line bg-site-deep">
              <img src={`/screens/${ch.screen}.webp`} alt={`${s.tour.shot}: #${s.tour.channels[ch.id]}`}
                   width="1440" height="900" loading="lazy" decoding="async" className="w-full h-auto block" />
            </div>
            <dl className="mt-8 grid sm:grid-cols-2 gap-x-10 gap-y-6">
              {ch.features.map((k) => byKey[k] && (
                <div key={k}>
                  <dt className="font-semibold text-site-chrome">{byKey[k].title}</dt>
                  <dd className="mt-1.5 text-site-steel leading-relaxed">{byKey[k].desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Season({ t }) {
  const g = t.game;
  return (
    <section id="game" className="border-t border-site-line bg-site-deep">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24 grid lg:grid-cols-[1fr_1.1fr] gap-12 items-center">
        <div>
          <h2 className="site-h font-bold text-site-chrome text-3xl sm:text-[2.6rem]">{g.heading}</h2>
          <p className="mt-4 text-site-steel text-lg leading-relaxed max-w-[36rem]">{g.sub}</p>
          <ul className="mt-7 space-y-3 max-w-[36rem]">
            {g.bullets.map((b) => (
              <li key={b} className="flex gap-3 text-site-chrome/90 leading-relaxed">
                <Check className="w-4 h-4 mt-1.5 flex-shrink-0 text-site-supreme" aria-hidden="true" />{b}
              </li>
            ))}
          </ul>
          <a href="/features/discord-leveling-game" className="site-btn-quiet mt-6">{noArrow(g.link)}</a>
        </div>
        {/* Истинските спътници от играта — колекцията е „най-характерното“ в този свят. */}
        <ul className="grid grid-cols-3 gap-3 sm:gap-4" aria-label="Server Season companions">
          {SHOWCASE_COMPANIONS.map((c) => (
            <li key={c.id} className="rounded-xl bg-site-channel border border-site-line p-2 sm:p-3">
              <img src={`/game/companions/${c.id}-${c.stage}.jpg`} alt={c.name} width="256" height="256"
                   loading="lazy" decoding="async" className="w-full h-auto rounded-lg" />
              <div className="mt-2 text-center text-sm text-site-steel">{c.name}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pricing({ t }) {
  const order = [["free", false], ["premium", true], ["whitelabel", false]];
  return (
    <section id="pricing" className="border-t border-site-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <h2 className="site-h font-bold text-site-chrome text-3xl sm:text-[2.6rem]">{t.pricingHeading}</h2>
        <p className="mt-3 text-site-steel text-lg">{t.pricingSub}</p>

        {/* Три колони с разделители, не три еднакви карти; Premium носи ember. */}
        <div className="mt-10 grid md:grid-cols-3 border-y border-site-line md:divide-x divide-site-line">
          {order.map(([key, hi]) => {
            const p = t.tiers[key];
            return (
              <div key={key} className={`py-8 md:px-7 first:md:pl-0 last:md:pr-0 border-b md:border-b-0 border-site-line last:border-b-0 ${hi ? "md:bg-gradient-to-b md:from-site-ember/[0.06] md:to-transparent" : ""}`}>
                <div className="flex items-center gap-3">
                  <h3 className={`site-h font-bold text-2xl ${hi ? "text-site-ember" : "text-site-chrome"}`}>{p.name}</h3>
                  {p.badge && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-site-ember/15 text-site-ember">{p.badge}</span>}
                </div>
                <p className="mt-2 text-site-steel leading-relaxed min-h-[3rem]">{p.tagline}</p>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="site-h font-bold text-4xl text-site-chrome">{p.price}</span>
                  <span className="text-site-steel">{p.per}</span>
                </div>
                <button type="button" onClick={signIn}
                  className={hi ? "site-btn mt-6 w-full" : "mt-6 w-full inline-flex items-center justify-center min-h-[48px] rounded-[10px] border border-site-line font-semibold text-site-chrome hover:border-site-steel"}>
                  {p.cta}
                </button>
                <ul className="mt-7 space-y-2.5">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5 text-site-chrome/90">
                      <Check className={`w-4 h-4 mt-1 flex-shrink-0 ${hi ? "text-site-ember" : "text-site-steel"}`} aria-hidden="true" />{b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-site-steel max-w-[62rem]">
          {clauses(t.priceNote).map((c) => <li key={c}>{c.replace(/\.$/, "")}</li>)}
        </ul>

        {/* Телефон: списък — в таблица колоната Premium се режеше вдясно. */}
        <div className="mt-14 sm:hidden">
          <h3 className="site-h font-bold text-xl text-site-chrome mb-4">{t.compare.heading}</h3>
          <dl className="border-t border-site-line">
            {t.compare.rows.map(([cap, free, prem]) => (
              <div key={cap} className="py-3 border-b border-site-line/70">
                <dt className="font-medium text-site-chrome">{cap}</dt>
                <dd className="mt-1 grid grid-cols-[6.5rem_1fr] gap-x-3 text-sm">
                  <span className="text-site-steel">{t.compare.colFree}</span><span className="text-site-steel">{free}</span>
                  <span className="text-site-ember">{t.compare.colPremium}</span><span className="text-site-chrome">{prem}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-14 hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[15px]">
            <caption className="text-left site-h font-bold text-xl text-site-chrome mb-4">{t.compare.heading}</caption>
            <thead>
              <tr className="text-site-steel border-b border-site-line">
                <th scope="col" className="py-3 pr-4 font-medium">{t.compare.colCap}</th>
                <th scope="col" className="py-3 pr-4 font-medium">{t.compare.colFree}</th>
                <th scope="col" className="py-3 font-medium text-site-ember">{t.compare.colPremium}</th>
              </tr>
            </thead>
            <tbody>
              {t.compare.rows.map(([cap, free, prem]) => (
                <tr key={cap} className="border-b border-site-line/70">
                  <th scope="row" className="py-3 pr-4 font-medium text-site-chrome">{cap}</th>
                  <td className="py-3 pr-4 text-site-steel">{free}</td>
                  <td className="py-3 text-site-chrome">{prem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Europe({ t }) {
  return (
    <section className="border-t border-site-line bg-site-deep">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="site-h font-bold text-site-chrome text-2xl sm:text-3xl">{t.euHeading}</h2>
        <ul className="mt-8 grid md:grid-cols-3 gap-8">
          {t.euBullets.map((b) => <li key={b} className="text-site-steel leading-relaxed border-l-2 border-site-line pl-4">{b}</li>)}
        </ul>
        <p className="mt-8"><a href="/status" className="site-btn-quiet">{t.footer.status}</a></p>
      </div>
    </section>
  );
}

function Faq({ t }) {
  return (
    <section id="faq" className="border-t border-site-line">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <h2 className="site-h font-bold text-site-chrome text-3xl sm:text-[2.6rem]">{t.faqHeading}</h2>
        <div className="mt-8 border-t border-site-line">
          {t.faq.map(({ q, a }) => (
            <details key={q} className="group border-b border-site-line">
              <summary className="flex items-center justify-between gap-6 py-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="font-semibold text-site-chrome text-[17px]">{q}</span>
                <span aria-hidden="true" className="text-site-steel text-2xl leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="pb-6 -mt-1 text-site-steel leading-relaxed max-w-[65ch]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Final({ t }) {
  return (
    <section className="border-t border-site-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <h2 className="site-h font-bold text-site-chrome text-3xl sm:text-5xl">{t.finalH}</h2>
        <p className="mt-4 text-site-steel text-lg">{t.finalSub}</p>
        <button type="button" onClick={signIn} className="site-btn mt-9">
          <DiscordMark /><span>{t.finalCta}</span>
        </button>
      </div>
    </section>
  );
}
