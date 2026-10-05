import { Fragment, type ReactNode } from "react";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { loadSite } from "@/lib/content";
import { isBrandIcon, safeHref, safeImage, type SectionKey } from "@/lib/cms";
import { buildNav } from "@/lib/nav";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Enhancements from "@/components/Enhancements";
import ContactForm from "@/components/ContactForm";
import FacebookEmbed from "@/components/FacebookEmbed";
import CookieBanner from "@/components/CookieBanner";
import Gallery from "@/components/Gallery";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

const P = "/assets/img/photos";
const Check = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const Arrow = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
// An icon chosen in the admin, or the given fallback when the value isn't one of ours.
const CardIcon = ({ name, fallback }: { name: string; fallback: string }) => (
  <Icon name={isBrandIcon(name) ? name : fallback} size={40} />
);

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const site = await loadSite(locale);
  const tt = (k: string) => t(locale, k, site.ui);

  const settings = site.get("settings");
  const hero = site.get("hero");
  const about = site.get("about");
  const school = site.get("school");
  const stats = site.get("stats");
  const courses = site.get("courses");
  const dance = site.get("dance");
  const facebook = site.get("facebook");
  const gallery = site.get("gallery");
  const faq = site.get("faq");
  const contact = site.get("contact");
  const cta = site.get("cta");
  const seo = site.get("seo");
  const org = site.get("org");

  const fbHref = safeHref(settings.facebookUrl);
  const fbPage = safeHref(settings.facebookPageHref);
  const logo = safeImage(settings.logo, "/assets/img/brand/logo.webp");
  const mapHref = safeHref(settings.mapUrl, "");
  const nav = buildNav(locale, site.ui, site.enabled);

  // ---- Structured data (search + answer engines) -------------------------
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const lat = Number(org.latitude), lng = Number(org.longitude);
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": `${base}/#organization`,
    name: org.name,
    alternateName: org.alternateName,
    url: `${base}/${locale}`,
    logo: `${base}${logo}`,
    image: `${base}${safeImage(hero.image, `${P}/ballerini-in-costume.webp`)}`,
    description: seo.description,
    foundingDate: org.foundingDate,
    email: settings.email,
    telephone: `+${(settings.phoneHref || "").replace(/\D/g, "")}`,
    sameAs: fbHref !== "#" ? [fbHref] : [],
    address: {
      "@type": "PostalAddress",
      streetAddress: org.streetAddress,
      addressLocality: org.locality,
      addressRegion: org.region,
      postalCode: org.postalCode,
      addressCountry: org.country,
    },
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
    ...(mapHref ? { hasMap: mapHref } : {}),
    areaServed: [
      { "@type": "City", name: org.locality },
      { "@type": "AdministrativeArea", name: org.region },
    ],
    knowsLanguage: ["bg", "it", "en"],
  };
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: base,
    name: seo.title,
    inLanguage: ["it", "bg", "en"],
    publisher: { "@id": `${base}/#organization` },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${base}/${locale}` }],
  };
  const courseLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: courses.title,
    itemListElement: courses.items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "Course", name: c.title, description: c.text, inLanguage: "bg", provider: { "@id": `${base}/#organization` } },
    })),
  };
  const showFaq = site.sections.includes("faq") && faq.items.length > 0;
  const faqLd = showFaq && {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  // Escape so admin-editable values can never break out of the <script> tag.
  const ld = (o: unknown) =>
    JSON.stringify(o).replace(/[<>\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

  // ---- Sections, keyed so the editor's order decides the page order --------
  const blocks: Record<SectionKey, ReactNode> = {
    about: (
      <section className="section" id="chi-siamo" aria-labelledby="about-title">
        <div className="container">
          <div className="grid about__grid">
            <div className="about__media reveal">
              <img src={safeImage(about.image, `${P}/comunita-in-costume.webp`)} alt={about.imageAlt} width={1400} height={933} loading="lazy" decoding="async" />
              <span className="tag"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-4.4-7-10a7 7 0 0 1 14 0c0 5.6-7 10-7 10Z" strokeLinejoin="round" /></svg>{about.tag}</span>
            </div>
            <div className="about__copy reveal" data-delay="1">
              <span className="eyebrow">{about.eyebrow}</span>
              <h2 id="about-title">{about.title}</h2>
              <p className="lead">{about.lead}</p>
              <div className="feature-list">
                {about.features.map((f, i) => (
                  <div className="feature" key={i}>
                    <span className="feature__icon"><CardIcon name={f.icon} fallback={["hybrid", "distance", "culture"][i] || "culture"} /></span>
                    <div><h4>{f.title}</h4><p>{f.text}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    ),

    stats: (
      <section className="section section--tight stats-band" id="numeri" aria-label="Numbers">
        <div className="container">
          <div className="stats">
            {stats.items.map((s, i) => (
              <div className="stat reveal" data-delay={i} key={i}>
                <div className="stat__num"><span data-count={/^\d+$/.test(s.num) ? s.num : undefined}>{s.num}</span></div>
                <div className="stat__label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),

    school: (
      <>
        <div className="ribbon" role="presentation" aria-hidden="true" />
        <section className="section" id="scuola" aria-labelledby="school-title" style={{ background: "var(--paper-2)" }}>
          <div className="container">
            <div className="section-head center reveal">
              <span className="eyebrow eyebrow--center">{school.eyebrow}</span>
              <h2 id="school-title">{school.title}</h2>
              <p className="lead">{school.lead}</p>
            </div>
            <div className="grid cards" style={{ marginTop: "3rem" }}>
              {school.items.map((c, i) => (
                <article className="card reveal" data-delay={i} key={i}>
                  <div className="card__icon"><CardIcon name={c.icon} fallback="presence" /></div>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                </article>
              ))}
            </div>
            {/* The teachers, next to their own words. */}
            <div className="voice reveal">
              <figure className="voice__photo">
                <img src={safeImage(school.image, `${P}/docenti.webp`)} alt={school.imageAlt} width={1024} height={768} loading="lazy" decoding="async" />
              </figure>
              <div className="quote">
                <div className="quote__mark" aria-hidden="true">“</div>
                <blockquote>{school.quote}</blockquote>
                <cite>{school.quoteCite}</cite>
              </div>
            </div>
          </div>
        </section>
      </>
    ),

    courses: (
      <section className="section" id="corsi" aria-labelledby="courses-title">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">{courses.eyebrow}</span>
            <h2 id="courses-title">{courses.title}</h2>
            <p className="lead">{courses.lead}</p>
          </div>
          <div className="grid cards" style={{ marginTop: "3rem" }}>
            {courses.items.map((c, i) => (
              <article className="card reveal" data-delay={i} key={i}>
                <div className="card__icon"><CardIcon name={c.icon} fallback="kids" /></div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
                {c.bullets.length > 0 && (
                  <ul className="card__list">
                    {c.bullets.map((b, j) => (<li key={j}><Check /> {b}</li>))}
                  </ul>
                )}
                <a className="card__link" href="#contatti">{tt("nav.contact")} <Arrow /></a>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),

    dance: (
      <>
        <div className="ribbon ribbon--soft" role="presentation" aria-hidden="true" />
        <section className="section dance" id="danza" aria-labelledby="dance-title">
          <div className="container">
            <figure className="dance__photo reveal">
              <img src={safeImage(dance.image, `${P}/gruppo-veselie.webp`)} alt={dance.imageAlt} width={1281} height={707} loading="lazy" decoding="async" />
            </figure>
            <div className="grid dance__grid">
              <div className="dance__copy reveal">
                <span className="eyebrow">{dance.eyebrow}</span>
                <h2 id="dance-title">{dance.title}</h2>
                <p className="lead" style={{ color: "rgba(251,248,241,.85)" }}>{dance.lead}</p>
                <p>{dance.body}</p>
                <div className="dance__instructor">
                  <span className="ava" aria-hidden="true">{dance.instructorName.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
                  <div><b>{dance.instructorName}</b><span>{dance.instructorRole}</span></div>
                </div>
              </div>
              <div className="dance__card reveal" data-delay="1">
                <h3 style={{ fontFamily: "var(--font-body)", fontSize: "1.05rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--lime-400)" }}>{dance.scheduleTitle}</h3>
                <div className="schedule">
                  {dance.schedule.map((row, i) => (
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
      </>
    ),

    facebook: (
      <section className="section" id="facebook" aria-labelledby="fb-title">
        <div className="container">
          <div className="grid fb__grid">
            <div className="fb__copy reveal">
              <span className="eyebrow">{facebook.eyebrow}</span>
              <h2 id="fb-title">{facebook.title}</h2>
              <p className="lead">{facebook.lead}</p>
              <div className="fb__points">
                {facebook.points.map((p, i) => (<div className="fb__point" key={i}><Check /> {p}</div>))}
              </div>
              <a className="btn btn--primary btn--lg" href={fbPage} target="_blank" rel="noopener noreferrer" style={{ marginTop: "1.8rem" }}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2 0-3.5 1.5-3.5 3.5V12H8v3h2.5v6h3v-6H16l.5-3H13.5V9.8c0-.5.3-.8.8-.8Z" /></svg>
                {tt("fb.open")}
              </a>
            </div>
            <div className="fb__frame reveal" data-delay="1">
              <div className="fb__bar" aria-hidden="true">
                <span className="fb__bar-logo"><Icon name="facebook-circle" size={22} /></span>
                <span className="fb__bar-name">{settings.brandName} · {settings.brandSub}</span>
              </div>
              <FacebookEmbed locale={locale} href={fbPage} />
            </div>
          </div>
        </div>
      </section>
    ),

    gallery: (
      <section className="section" id="galleria" aria-labelledby="gallery-title">
        <div className="container">
          <div className="section-head center reveal">
            <span className="eyebrow eyebrow--center">{gallery.eyebrow}</span>
            <h2 id="gallery-title">{gallery.title}</h2>
          </div>
          <div className="reveal" style={{ marginTop: "2.5rem" }}>
            <Gallery
              photos={gallery.photos
                .map((p) => ({ ...p, src: safeImage(p.src, "") }))
                .filter((p) => p.src)}
              labels={{ open: tt("gallery.open"), close: tt("gallery.close"), prev: tt("gallery.prev"), next: tt("gallery.next") }}
            />
          </div>
        </div>
      </section>
    ),

    faq: showFaq ? (
      <section className="section" id="faq" aria-labelledby="faq-title">
        <div className="container">
          <div className="section-head center reveal">
            <span className="eyebrow eyebrow--center">{faq.eyebrow}</span>
            <h2 id="faq-title">{faq.title}</h2>
          </div>
          <div className="faq reveal" style={{ marginTop: "2.5rem" }}>
            {faq.items.map((f, i) => (
              <details className="faq__item" key={i}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    ) : null,

    contact: (
      <section className="section" id="contatti" aria-labelledby="contact-title" style={{ background: "var(--paper-2)" }}>
        <div className="container">
          <div className="grid contact__grid">
            <div className="contact__copy reveal">
              <span className="eyebrow">{contact.eyebrow}</span>
              <h2 id="contact-title">{contact.title}</h2>
              <p className="lead">{contact.lead}</p>
              <div className="contact__info">
                <div className="contact__row">
                  <span className="ic"><Icon name="phone" size={24} /></span>
                  <div><small>{tt("phone")}</small><a href={`tel:${settings.phoneHref}`}>{settings.phone}</a></div>
                </div>
                <div className="contact__row">
                  <span className="ic"><Icon name="envelope" size={24} /></span>
                  <div><small>{tt("form.email")}</small><a href={`mailto:${settings.email}`}>{settings.email}</a></div>
                </div>
                <div className="contact__row">
                  <span className="ic"><Icon name="location-pin" size={24} /></span>
                  <div><small>{tt("addr")}</small><b>{settings.address}</b></div>
                </div>
              </div>
              <div className="socials">
                {fbHref !== "#" && <a href={fbHref} target="_blank" rel="noopener noreferrer" aria-label="Facebook"><Icon name="facebook-f" size={22} /></a>}
                <a href={`mailto:${settings.email}`} aria-label="Email"><Icon name="envelope" size={22} /></a>
                <a href={`tel:${settings.phoneHref}`} aria-label="Phone"><Icon name="phone" size={22} /></a>
              </div>
            </div>
            <ContactForm locale={locale} topics={contact.topics} email={settings.email} />
          </div>
        </div>
      </section>
    ),

    cta: (
      <section className="section section--cta" aria-labelledby="cta-title" style={{ background: "var(--paper-2)" }}>
        <div className="container">
          <div className="cta-band reveal">
            <div className="rose-ornament" aria-hidden="true">
              <span className="rose-photo"><img src={safeImage(cta.image, `${P}/rose-damascena.webp`)} alt="" width={400} height={400} loading="lazy" decoding="async" /></span>
            </div>
            <h2 id="cta-title">{cta.title}</h2>
            <p>{cta.body}</p>
            <div className="hero__cta">
              <a className="btn btn--light btn--lg" href={`mailto:${settings.email}`}>{cta.primary}</a>
              <a className="btn btn--accent btn--lg" href={`tel:${settings.phoneHref}`}>{cta.secondary}</a>
            </div>
          </div>
        </div>
      </section>
    ),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(websiteLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(faqLd) }} />}
      {site.sections.includes("courses") && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(courseLd) }} />}
      <a className="skip-link btn btn--primary" href="#main">{tt("skip")}</a>

      <SiteHeader locale={locale} brandName={settings.brandName} brandSub={settings.brandSub} logo={logo} nav={nav} />

      <main id="main">
        {/* Hero — always first */}
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
                  <a className="btn btn--primary btn--lg" href="#corsi">{tt("cta.discover")}<Arrow /></a>
                  <a className="btn btn--ghost btn--lg" href="#chi-siamo">{tt("cta.know")}</a>
                </div>
                <div className="hero__trust reveal" data-delay="3">
                  <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {hero.trust}
                </div>
              </div>
              <div className="hero__visual">
                <figure className="hero__photo">
                  <img src={safeImage(hero.image, `${P}/ballerini-in-costume.webp`)} alt={hero.imageAlt} width={1400} height={784} fetchPriority="high" decoding="async" />
                </figure>
                <img className="hero__swoosh" src="/assets/img/brand/swoosh.svg" alt="" aria-hidden="true" loading="lazy" width={180} height={56} />
                <div className="hero__badge">
                  <span className="num" data-count={hero.stat}>{hero.stat}</span>
                  <small><span className="since">{hero.statLabel.split(" ")[0]}</span> {hero.statLabel.split(" ").slice(1).join(" ")}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust bar — always second; its four highlights are edited with the intro. */}
        {hero.highlights.length > 0 && (
          <section className="trustbar" aria-label="Highlights">
            <div className="container">
              {hero.highlights.map((h, i) => (
                <div className="trust-item" key={i}><Icon name={isBrandIcon(h.icon) ? h.icon : "presence"} size={26} />{h.text}</div>
              ))}
            </div>
          </section>
        )}

        {site.sections.map((k) => <Fragment key={k}>{blocks[k]}</Fragment>)}
      </main>

      <SiteFooter
        locale={locale}
        ui={site.ui}
        logo={logo}
        brandName={settings.brandName}
        description={about.lead || ""}
        phone={settings.phone}
        phoneHref={settings.phoneHref}
        email={settings.email}
        address={settings.address}
        facebookUrl={fbHref}
        nav={nav}
      />

      <CookieBanner locale={locale} />
      <Enhancements />
    </>
  );
}
