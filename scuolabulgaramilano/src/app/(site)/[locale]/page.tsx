import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/content";
import { defaultFor } from "@/lib/defaults";
import { isLocale, t, type Locale } from "@/lib/i18n";
import type {
  About, Cards, Contact as ContactT, Cta, Dance, Facebook, Gallery, Hero, Settings, Stats,
} from "@/lib/content";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Enhancements from "@/components/Enhancements";
import ContactForm from "@/components/ContactForm";
import FacebookEmbed from "@/components/FacebookEmbed";
import CookieBanner from "@/components/CookieBanner";

export const dynamic = "force-dynamic";

type Loaded = { get: (key: string) => unknown; enabled: (key: string) => boolean };

async function load(locale: Locale): Promise<Loaded> {
  let byKey = new Map<string, { it: string; bg: string; en: string; enabled: boolean }>();
  try {
    await ensureSeeded();
    const rows = await prisma.content.findMany();
    byKey = new Map(rows.map((r) => [r.key, r as any]));
  } catch {
    // DB not ready yet → fall back to bundled defaults.
  }
  const get = (key: string) => {
    const row = byKey.get(key);
    let data = defaultFor(key, locale);
    if (row) {
      try {
        const parsed = JSON.parse((row as any)[locale] || row.en || "{}");
        if (parsed && Object.keys(parsed).length) data = parsed;
      } catch {}
    }
    return data;
  };
  const enabled = (key: string) => {
    const row = byKey.get(key);
    return row ? row.enabled : true;
  };
  return { get, enabled };
}

const ICONS: Record<string, ReactNode> = {
  presence: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 5h18M5 5v14m14-14v14M3 19h18M9 9h6M9 13h4" strokeLinecap="round" /></svg>),
  distance: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" strokeLinecap="round" /></svg>),
  hybrid: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v18M4 7h16M4 17h16" strokeLinecap="round" /></svg>),
  kids: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" /></svg>),
  adults: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16v12H4zM4 6l8 6 8-6" strokeLinejoin="round" /></svg>),
  culture: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 2 8l10 5 10-5-10-5Z" strokeLinejoin="round" /><path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" strokeLinecap="round" /></svg>),
};
const Check = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const Arrow = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>);

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const { get, enabled } = await load(locale);

  const settings = get("settings") as Settings;
  const hero = get("hero") as Hero;
  const about = get("about") as About;
  const school = get("school") as Cards & { quote: string; quoteCite: string };
  const stats = get("stats") as Stats;
  const courses = get("courses") as Cards;
  const dance = get("dance") as Dance;
  const facebook = get("facebook") as Facebook;
  const gallery = get("gallery") as Gallery;
  const contact = get("contact") as ContactT;
  const cta = get("cta") as Cta;

  const nav = [
    { id: "chi-siamo", label: t(locale, "nav.about") },
    { id: "scuola", label: t(locale, "nav.school") },
    { id: "corsi", label: t(locale, "nav.courses") },
    { id: "danza", label: t(locale, "nav.dance") },
    { id: "facebook", label: t(locale, "nav.facebook") },
    { id: "contatti", label: t(locale, "nav.contact") },
  ];

  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const org = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": `${base}/#organization`,
    name: "Associazione Qui Bulgaria — Scuola bulgara di Milano",
    alternateName: "Scuola bulgara “P. Yavorov”",
    url: `${base}/${locale}`,
    logo: `${base}/assets/img/brand/logo.webp`,
    image: `${base}/assets/img/photos/community.png`,
    description:
      "Centro linguistico e culturale a Milano (Lombardia): lingua e cultura bulgara, scuola “P. Yavorov”, corsi per bambini e adulti e danza tradizionale.",
    foundingDate: "2014-01-12",
    email: settings.email,
    telephone: `+${settings.phoneHref.replace(/\D/g, "")}`,
    sameAs: [settings.facebookUrl],
    address: {
      "@type": "PostalAddress",
      streetAddress: "Via Giovanni Battista Piazzetta",
      addressLocality: "Milano",
      addressRegion: "Lombardia",
      postalCode: "20138",
      addressCountry: "IT",
    },
    geo: { "@type": "GeoCoordinates", latitude: 45.4642, longitude: 9.19 },
    areaServed: [
      { "@type": "City", name: "Milano" },
      { "@type": "AdministrativeArea", name: "Lombardia" },
      { "@type": "Country", name: "Italia" },
    ],
    knowsLanguage: ["bg", "it"],
  };

  // AEO — concise question/answer pairs for answer engines.
  const faqByLocale: Record<Locale, { q: string; a: string }[]> = {
    it: [
      { q: "Dove si trova la scuola bulgara di Milano?", a: "Siamo a Milano, in Lombardia (Via Giovanni Battista Piazzetta, 20138 Milano). Le prove di danza si tengono vicino a Piazzale Corvetto e in zona Rho." },
      { q: "A chi sono rivolti i corsi di bulgaro?", a: "A bambini delle famiglie bulgare e miste e ad adulti di ogni livello, dai principianti agli avanzati, in presenza, online o in formato ibrido." },
      { q: "I diplomi sono riconosciuti?", a: "Sì. Operiamo secondo i programmi del Ministero dell’Istruzione e della Scienza bulgaro e i diplomi sono riconosciuti nel sistema educativo bulgaro." },
      { q: "Offrite anche danza tradizionale bulgara?", a: "Sì, con il gruppo “Veselie”: due appuntamenti settimanali a Milano per bambini e adulti, italiani inclusi." },
    ],
    bg: [
      { q: "Къде се намира българското училище в Милано?", a: "Намираме се в Милано, Ломбардия (Via Giovanni Battista Piazzetta, 20138 Милано). Репетициите по танци са до Пиазале Корвето и в зона Rho." },
      { q: "За кого са курсовете по български?", a: "За деца от български и смесени семейства и за възрастни от всички нива — присъствено, онлайн или хибридно." },
      { q: "Признати ли са дипломите?", a: "Да. Работим по програмите на българското Министерство на образованието и науката и дипломите се признават в българската образователна система." },
      { q: "Предлагате ли и народни танци?", a: "Да, с групата „Веселие“: две седмични занятия в Милано за деца и възрастни." },
    ],
    en: [
      { q: "Where is the Bulgarian school in Milan located?", a: "We are in Milan, Lombardy (Via Giovanni Battista Piazzetta, 20138 Milan). Dance rehearsals are held near Piazzale Corvetto and in the Rho area." },
      { q: "Who are the Bulgarian courses for?", a: "For children of Bulgarian and mixed families and for adults of all levels, in person, online or hybrid." },
      { q: "Are the diplomas recognised?", a: "Yes. We follow the programmes of the Bulgarian Ministry of Education and Science, and diplomas are recognised in the Bulgarian education system." },
      { q: "Do you also offer Bulgarian folk dance?", a: "Yes, with the “Veselie” group: two weekly sessions in Milan for children and adults." },
    ],
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqByLocale[locale].map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <a className="skip-link btn btn--primary" href="#main" style={{ position: "absolute", left: "-9999px", top: 0, zIndex: 200 }}>
        {t(locale, "skip")}
      </a>

      <SiteHeader locale={locale} brandName={settings.brandName} brandSub={settings.brandSub} nav={nav} />

      <main id="main">
        <span id="top" />

        {/* Hero */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__bg" aria-hidden="true" />
          <div className="container">
            <div className="hero__grid">
              <div className="hero__copy">
                <span className="hero__flag reveal">
                  <span className="stripes" aria-hidden="true"><i style={{ background: "#fff" }} /><i style={{ background: "#00966e" }} /><i style={{ background: "#d62612" }} /></span>
                  {hero.badge}
                </span>
                <h1 id="hero-title" className="reveal" data-delay="1">
                  {hero.titleA}<span className="accent">{hero.titleAccent}</span>{hero.titleB}
                </h1>
                <p className="lead hero__lead reveal" data-delay="2">{hero.lead}</p>
                <div className="hero__cta reveal" data-delay="2">
                  <a className="btn btn--primary btn--lg" href="#corsi">{t(locale, "cta.discover")}<Arrow /></a>
                  <a className="btn btn--ghost btn--lg" href="#chi-siamo">{t(locale, "cta.know")}</a>
                </div>
                <div className="hero__trust reveal" data-delay="3">
                  <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {hero.trust}
                </div>
              </div>
              <div className="hero__visual reveal" data-delay="2">
                <img className="hero__swoosh" src="/assets/img/brand/swoosh.svg" alt="" aria-hidden="true" />
                <figure className="hero__photo">
                  <img src="/assets/img/photos/community.png" alt={about.tag} width={526} height={452} />
                </figure>
                <div className="hero__badge">
                  <span className="num" data-count={hero.stat}>{hero.stat}</span>
                  <small><span className="since">{(hero.statLabel || "").split(" ")[0]}</span> {(hero.statLabel || "").split(" ").slice(1).join(" ")}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <section className="trustbar" aria-label="Highlights">
          <div className="container">
            <div className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>{(school.items?.[0]?.title) || ""}</div>
            <div className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 2 8.5 12 14l10-5.5L12 3Z" strokeLinejoin="round" /><path d="M6 10.5V16c0 1 2.7 3 6 3s6-2 6-3v-5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{about.features?.[2]?.title || ""}</div>
            <div className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="9" r="3.2" /><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" strokeLinecap="round" /></svg>{about.features?.[1]?.title || ""}</div>
            <div className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7-4.4-7-10a7 7 0 0 1 14 0c0 5.6-7 10-7 10Z" strokeLinejoin="round" /><circle cx="12" cy="11" r="2.4" /></svg>{about.tag}</div>
          </div>
        </section>

        {/* About */}
        {enabled("about") && (
        <section className="section" id="chi-siamo" aria-labelledby="about-title">
          <div className="container">
            <div className="grid about__grid">
              <div className="about__media reveal">
                <img src="/assets/img/photos/community.png" alt={about.tag} loading="lazy" />
                <span className="tag"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-4.4-7-10a7 7 0 0 1 14 0c0 5.6-7 10-7 10Z" strokeLinejoin="round" /></svg>{about.tag}</span>
              </div>
              <div className="about__copy reveal" data-delay="1">
                <span className="eyebrow">{about.eyebrow}</span>
                <h2 id="about-title">{about.title}</h2>
                <p className="lead">{about.lead}</p>
                <div className="feature-list">
                  {(about.features || []).map((f, i) => (
                    <div className="feature" key={i}>
                      <span className="feature__icon">{[ICONS.hybrid, ICONS.distance, ICONS.culture][i] || ICONS.culture}</span>
                      <div><h4>{f.title}</h4><p>{f.text}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Stats */}
        <section className="section section--tight" aria-label="Numbers">
          <div className="container">
            <div className="stats">
              {(stats.items || []).map((s, i) => (
                <div className="stat reveal" data-delay={i} key={i}>
                  <div className="stat__num"><span data-count={/^\d+$/.test(s.num) ? s.num : undefined}>{s.num}</span></div>
                  <div className="stat__label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="ribbon" role="presentation" aria-hidden="true" />

        {/* School */}
        {enabled("school") && (
        <section className="section" id="scuola" aria-labelledby="school-title" style={{ background: "var(--paper-2)" }}>
          <div className="container">
            <div className="section-head center reveal">
              <span className="eyebrow eyebrow--center">{school.eyebrow}</span>
              <h2 id="school-title">{school.title}</h2>
              <p className="lead">{school.lead}</p>
            </div>
            <div className="grid cards" style={{ marginTop: "3rem" }}>
              {(school.items || []).map((c, i) => (
                <article className="card reveal" data-delay={i} key={i}>
                  <div className="card__icon">{ICONS[c.icon] || ICONS.presence}</div>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                </article>
              ))}
            </div>
            <div className="quote reveal" style={{ marginTop: "4rem" }}>
              <div className="quote__mark" aria-hidden="true">“</div>
              <blockquote>{school.quote}</blockquote>
              <cite>{school.quoteCite}</cite>
            </div>
          </div>
        </section>
        )}

        {/* Courses */}
        {enabled("courses") && (
        <section className="section" id="corsi" aria-labelledby="courses-title">
          <div className="container">
            <div className="section-head reveal">
              <span className="eyebrow">{courses.eyebrow}</span>
              <h2 id="courses-title">{courses.title}</h2>
              <p className="lead">{courses.lead}</p>
            </div>
            <div className="grid cards" style={{ marginTop: "3rem" }}>
              {(courses.items || []).map((c, i) => (
                <article className="card reveal" data-delay={i} key={i}>
                  <div className="card__icon">{ICONS[c.icon] || ICONS.kids}</div>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  {c.bullets?.length > 0 && (
                    <ul className="card__list">
                      {c.bullets.map((b, j) => (<li key={j}><Check /> {b}</li>))}
                    </ul>
                  )}
                  <a className="card__link" href="#contatti">{t(locale, "nav.contact")} <Arrow /></a>
                </article>
              ))}
            </div>
          </div>
        </section>
        )}

        <div className="ribbon ribbon--soft" role="presentation" aria-hidden="true" />

        {/* Dance */}
        {enabled("dance") && (
        <section className="section dance" id="danza" aria-labelledby="dance-title">
          <div className="container">
            <div className="grid dance__grid">
              <div className="dance__copy reveal">
                <span className="eyebrow">{dance.eyebrow}</span>
                <h2 id="dance-title">{dance.title}</h2>
                <p className="lead" style={{ color: "rgba(251,248,241,.85)" }}>{dance.lead}</p>
                <p>{dance.body}</p>
                <div className="dance__instructor">
                  <span className="ava" aria-hidden="true">{(dance.instructorName || "").split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
                  <div><b>{dance.instructorName}</b><span>{dance.instructorRole}</span></div>
                </div>
              </div>
              <div className="dance__card reveal" data-delay="1">
                <h3 style={{ fontFamily: "var(--font-body)", fontSize: "1.05rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--lime-400)" }}>{dance.scheduleTitle}</h3>
                <div className="schedule">
                  {(dance.schedule || []).map((row, i) => (
                    <div className="schedule__row" key={i}>
                      <div className="schedule__day">{row.day}<small>{row.time}</small></div>
                      <div className="schedule__info"><b>{row.title}</b><span>{row.place}</span></div>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: "1.4rem", fontSize: ".92rem" }}>{dance.groupNote}</p>
                <a className="btn btn--accent" href="#contatti" style={{ marginTop: "1.4rem" }}>{dance.cta}</a>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Facebook */}
        {enabled("facebook") && (
        <section className="section" id="facebook" aria-labelledby="fb-title">
          <div className="container">
            <div className="grid fb__grid">
              <div className="fb__copy reveal">
                <span className="eyebrow">{facebook.eyebrow}</span>
                <h2 id="fb-title">{facebook.title}</h2>
                <p className="lead">{facebook.lead}</p>
                <div className="fb__points">
                  {(facebook.points || []).map((p, i) => (
                    <div className="fb__point" key={i}><Check /> {p}</div>
                  ))}
                </div>
                <a className="btn btn--primary btn--lg" href={settings.facebookPageHref} target="_blank" rel="noopener" style={{ marginTop: "1.8rem" }}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2 0-3.5 1.5-3.5 3.5V12H8v3h2.5v6h3v-6H16l.5-3H13.5V9.8c0-.5.3-.8.8-.8Z" /></svg>
                  {t(locale, "fb.open")}
                </a>
              </div>
              <div className="fb__frame reveal" data-delay="1">
                <div className="fb__bar" aria-hidden="true">
                  <span className="fb__bar-logo"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" /></svg></span>
                  <span className="fb__bar-name">{settings.brandName} · {settings.brandSub}</span>
                </div>
                <FacebookEmbed locale={locale} href={settings.facebookPageHref} />
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Gallery */}
        {enabled("gallery") && (
        <section className="section" aria-labelledby="gallery-title">
          <div className="container">
            <div className="section-head center reveal">
              <span className="eyebrow eyebrow--center">{gallery.eyebrow}</span>
              <h2 id="gallery-title">{gallery.title}</h2>
            </div>
            <div className="gallery reveal" style={{ marginTop: "2.5rem" }}>
              {(gallery.tiles || []).map((tile, i) => {
                if (tile.kind === "image") {
                  return (<figure className="span-2 row-2" key={i}><img src={tile.src} alt={tile.alt || ""} loading="lazy" /></figure>);
                }
                return (
                  <figure className={`tile tile--${tile.kind}`} key={i}>
                    <div>
                      {tile.big && <div className="big">{tile.big}</div>}
                      {tile.script && <div className="script">{tile.script}</div>}
                      {tile.small && <div className="small">{tile.small}</div>}
                    </div>
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
        )}

        {/* Contact */}
        <section className="section" id="contatti" aria-labelledby="contact-title" style={{ background: "var(--paper-2)" }}>
          <div className="container">
            <div className="grid contact__grid">
              <div className="contact__copy reveal">
                <span className="eyebrow">{contact.eyebrow}</span>
                <h2 id="contact-title">{contact.title}</h2>
                <p className="lead">{contact.lead}</p>
                <div className="contact__info">
                  <div className="contact__row">
                    <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" /></svg></span>
                    <div><small>{t(locale, "phone")}</small><a href={`tel:${settings.phoneHref}`}>{settings.phone}</a></div>
                  </div>
                  <div className="contact__row">
                    <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" strokeLinejoin="round" /></svg></span>
                    <div><small>{t(locale, "form.email")}</small><a href={`mailto:${settings.email}`}>{settings.email}</a></div>
                  </div>
                  <div className="contact__row">
                    <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7-4.4-7-10a7 7 0 0 1 14 0c0 5.6-7 10-7 10Z" strokeLinejoin="round" /><circle cx="12" cy="11" r="2.4" /></svg></span>
                    <div><small>{t(locale, "addr")}</small><b>{settings.address}</b></div>
                  </div>
                </div>
                <div className="socials">
                  <a href={settings.facebookUrl} target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2 0-3.5 1.5-3.5 3.5V12H8v3h2.5v6h3v-6H16l.5-3H13.5V9.8c0-.5.3-.8.8-.8Z" /></svg></a>
                  <a href={`mailto:${settings.email}`} aria-label="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" strokeLinejoin="round" /></svg></a>
                  <a href={`tel:${settings.phoneHref}`} aria-label="Phone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" strokeLinejoin="round" /></svg></a>
                </div>
              </div>
              <ContactForm locale={locale} topics={contact.topics || []} />
            </div>

            <div className="cta-band reveal" style={{ marginTop: "4rem" }}>
              <div className="rose-ornament" aria-hidden="true"><span className="rose-photo"><img src="/assets/img/photos/rose-damascena.jpg" alt="" loading="lazy" /></span></div>
              <h2>{cta.title}</h2>
              <p>{cta.body}</p>
              <div className="hero__cta">
                <a className="btn btn--light btn--lg" href={`mailto:${settings.email}`}>{cta.primary}</a>
                <a className="btn btn--accent btn--lg" href={`tel:${settings.phoneHref}`}>{cta.secondary}</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter
        locale={locale}
        brandName={settings.brandName}
        description={about.lead || ""}
        phone={settings.phone}
        phoneHref={settings.phoneHref}
        email={settings.email}
        address={settings.address}
        facebookUrl={settings.facebookUrl}
        nav={nav}
      />

      <CookieBanner locale={locale} />
      <Enhancements />
    </>
  );
}
