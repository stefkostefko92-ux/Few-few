import { Fragment, type ReactNode } from "react";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { loadSite } from "@/lib/content";
import { bundledWordAudio } from "@/lib/defaults";
import { responsive } from "@/lib/responsive";
import { isBrandIcon, safeAudio, safeFile, safeHref, safeImage, type SectionKey } from "@/lib/cms";
import { buildNav } from "@/lib/nav";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ContactForm from "@/components/ContactForm";
import FacebookEmbed from "@/components/FacebookEmbed";
import MapEmbed from "@/components/MapEmbed";
import CookieBanner from "@/components/CookieBanner";
import Gallery from "@/components/Gallery";
import Icon from "@/components/Icon";
import StitchedPhoto from "@/components/StitchedPhoto";
import Alphabet from "@/components/Alphabet";
import { RosetteMotif, StitchBand } from "@/components/Stitch";

export const dynamic = "force-dynamic";

const P = "/assets/img/photos";
// An icon chosen in the admin, or the given fallback when the value isn't one of ours.
const CardIcon = ({ name, fallback }: { name: string; fallback: string }) => (
  <Icon name={isBrandIcon(name) ? name : fallback} size={64} />
);
// Cyrillic inside an Italian or English sentence (e.g. «Училищен вестник») is
// still set in the Bulgarian letterforms: each Cyrillic run gets lang="bg".
const CYR = /([\u0400-\u04FF](?:[\u0400-\u04FF\s.,!?–—-]*[\u0400-\u04FF])?)/;
const Bg = ({ text }: { text: string }) => (
  <>{text.split(CYR).map((part, i) => (i % 2 ? <span lang="bg" key={i}>{part}</span> : part))}</>
);
// Longer texts are edited as plain text: an empty line starts a new paragraph.
const Paras = ({ text, className }: { text?: string; className?: string }) => {
  const ps = (text || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  return ps.length ? <div className={className}>{ps.map((x, i) => <p key={i}>{x}</p>)}</div> : null;
};

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (isLocale(raw) ? raw : "it") as Locale;
  const site = await loadSite(locale);
  const tt = (k: string) => t(locale, k, site.ui);

  const settings = site.get("settings");
  const hero = site.get("hero");
  const about = site.get("about");
  const school = site.get("school");
  const alphabet = site.get("alphabet");
  const courses = site.get("courses");
  const dance = site.get("dance");
  const facebook = site.get("facebook");
  const gallery = site.get("gallery");
  const faq = site.get("faq");
  const teachers = site.get("teachers");
  const documents = site.get("documents");
  const contact = site.get("contact");
  const cta = site.get("cta");
  const seo = site.get("seo");
  const org = site.get("org");

  // Lists share their structure across languages, so an item added in one
  // language exists, empty, in the others until it is translated. Empty items
  // are not shown (no blank question, no empty card).
  const has = (...v: unknown[]) => v.some((x) => typeof x === "string" && x.trim() !== "");
  const faqItems = faq.items.filter((f) => has(f.q) && has(f.a));
  const features = about.features.filter((f) => has(f.title, f.text));
  const modes = school.items.filter((c) => has(c.title, c.text));
  const courseItems = courses.items.filter((c) => has(c.title, c.text));
  const schedule = dance.schedule.filter((r) => has(r.day, r.time, r.place));
  const fbPoints = facebook.points.filter((x) => has(x));
  const topics = contact.topics.filter((x) => has(x));
  const highlights = hero.highlights.filter((h) => has(h.text));
  const docs = documents.items.map((d) => ({ ...d, file: safeFile(d.file) })).filter((d) => has(d.title) && d.file);

  // Photos as srcsets (AVIF/WebP, the width the screen needs), with their real
  // dimensions — also for pictures uploaded from the admin.
  const [heroImg, aboutImg, schoolImg, danceImg] = await Promise.all([
    responsive(safeImage(hero.image, `${P}/ballerini-in-costume.webp`), "(max-width: 900px) 100vw, 50vw", { width: 1400, height: 784 }),
    responsive(safeImage(about.image, `${P}/comunita-in-costume.webp`), "(max-width: 900px) 100vw, (max-width: 1440px) 55vw, 760px", { width: 1400, height: 933 }),
    responsive(safeImage(school.image, `${P}/docenti.webp`), "(max-width: 900px) 100vw, 650px", { width: 1024, height: 768 }),
    responsive(safeImage(dance.image, `${P}/gruppo-veselie.webp`), "100vw", { width: 1281, height: 707 }),
  ]);
  const staff = await Promise.all(
    teachers.items
      .filter((x) => has(x.fullName))
      .map(async (x) => ({ ...x, pic: x.photo ? await responsive(safeImage(x.photo, ""), "(max-width: 600px) 40vw, 160px", { width: 280, height: 280 }) : null })),
  );
  const issues = await Promise.all(
    documents.issues
      .map((d) => ({ ...d, file: safeFile(d.file), cover: safeImage(d.coverImage, "") }))
      .filter((d) => has(d.title) && d.file)
      .map(async (d) => ({ ...d, pic: d.cover ? await responsive(d.cover, "(max-width: 700px) 90vw, 360px", { width: 560, height: 315 }) : null })),
  );
  const instructorPic = dance.instructorPhoto
    ? await responsive(safeImage(dance.instructorPhoto, ""), "(max-width: 700px) 40vw, 200px", { width: 303, height: 253 })
    : null;
  const galleryPhotos = await Promise.all(
    gallery.photos
      .map((p) => ({ ...p, src: safeImage(p.src, "") }))
      .filter((p) => p.src)
      .map(async (p) => {
        const thumb = await responsive(p.src, "(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 430px", { width: 1200, height: 800 });
        const full = await responsive(p.src, "100vw", { width: 1200, height: 800 });
        return { ...p, thumb, full };
      }),
  );

  const fbHref = safeHref(settings.facebookUrl);
  const fbPage = safeHref(settings.facebookPageHref);
  const logo = safeImage(settings.logo, "/assets/img/brand/logo.webp");
  const mapHref = safeHref(settings.mapUrl, "");
  // What the embedded map looks up: the `q` of the admin's Google Maps link if
  // it has one, otherwise the street from the organisation's data.
  const mapQuery = (() => {
    try { return new URL(mapHref).searchParams.get("q") || ""; } catch { return ""; }
  })() || [org.streetAddress, `${org.postalCode} ${org.locality}`].filter((x) => x.trim()).join(", ");
  const nav = buildNav(locale, site.ui, site.sections);

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
    itemListElement: [{ "@type": "ListItem", position: 1, name: tt("nav.home"), item: `${base}/${locale}` }],
  };
  const courseLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: courses.title,
    itemListElement: courseItems.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "Course", name: c.title, description: c.text, inLanguage: "bg", provider: { "@id": `${base}/#organization` } },
    })),
  };
  const showFaq = site.sections.includes("faq") && faqItems.length > 0;
  const faqLd = showFaq && {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  // Escape so admin-editable values can never break out of the <script> tag.
  const ld = (o: unknown) =>
    JSON.stringify(o).replace(/[<>\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

  // ---- Sections, keyed so the editor's order decides the page order --------
  // The Bulgarian greeting at the start of the closing title is set in
  // Bulgarian letterforms on every page (lang="bg" switches them on).
  const greet = /^([Ѐ-ӿ][Ѐ-ӿ\s]*[!.?])\s*(.*)$/.exec(cta.title);
  const blocks: Record<SectionKey, ReactNode> = {
    about: (
      <section className="sec about" id="chi-siamo" aria-labelledby="about-title">
        <div className="wrap about__grid">
          <div className="about__copy">
            <h2 id="about-title">{about.title}</h2>
            <p className="lead">{about.lead}</p>
            <Paras text={about.body} className="prose" />
            {has(about.motto) && <blockquote className="about__motto"><p>{about.motto}</p></blockquote>}
          </div>
          <figure className="about__photo">
            <img {...aboutImg} alt={about.imageAlt} loading="lazy" decoding="async" />
          </figure>
          {features.length > 0 && (
            <dl className="trio about__trio">
              {features.map((f, i) => (
                <div key={i}><dt>{f.title}</dt><dd>{f.text}</dd></div>
              ))}
            </dl>
          )}
        </div>
      </section>
    ),

    alphabet: (
      <section className="sec sec--linen abc-sec" id="alfabeto" aria-labelledby="abc-title">
        <div className="wrap">
          <header className="sec__head">
            <h2 id="abc-title">{alphabet.title}</h2>
            <p className="lead">{alphabet.lead}</p>
          </header>
          <Alphabet
            letters={alphabet.letters.filter((l) => l.letter).map((l) => ({ ...l, audio: safeAudio(l.audio) || bundledWordAudio(l.word) }))}
            labels={{ pick: tt("alpha.pick"), latin: tt("alpha.latin"), meaning: tt("alpha.meaning"), listen: tt("alpha.listen") }}
          />
        </div>
      </section>
    ),

    school: (
      <section className="sec school" id="scuola" aria-labelledby="school-title">
        <div className="wrap">
          <header className="sec__head">
            <h2 id="school-title">{school.title}</h2>
            <p className="lead">{school.lead}</p>
          </header>
          <Paras text={school.body} className="prose prose--cols" />
          <ul className="trio modes">
            {modes.map((c, i) => (
              <li key={i}>
                <CardIcon name={c.icon} fallback="presence" />
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </li>
            ))}
          </ul>
          <figure className="voice">
            <img {...schoolImg} alt={school.imageAlt} loading="lazy" decoding="async" />
            <figcaption>
              <blockquote><p>{school.quote}</p></blockquote>
              <cite>{school.quoteCite}</cite>
            </figcaption>
          </figure>
        </div>
      </section>
    ),

    teachers: staff.length > 0 ? (
      <section className="sec sec--linen teachers" id="insegnanti" aria-labelledby="teachers-title">
        <div className="wrap">
          <header className="sec__head">
            <h2 id="teachers-title">{teachers.title}</h2>
            {has(teachers.lead) && <p className="lead">{teachers.lead}</p>}
          </header>
          <ul className="staff">
            {staff.map((x, i) => (
              <li key={i}>
                {x.pic ? <img {...x.pic} alt={x.fullName} loading="lazy" decoding="async" /> : <span className="staff__none" aria-hidden="true" />}
                <h3>{x.fullName}</h3>
                <p>{x.role}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    ) : null,

    courses: (
      <section className="sec courses" id="corsi" aria-labelledby="courses-title">
        <div className="wrap">
          <header className="sec__head">
            <h2 id="courses-title">{courses.title}</h2>
            <p className="lead">{courses.lead}</p>
          </header>
          <Paras text={courses.body} className="prose prose--narrow" />
          <div className="trio course-list">
            {courseItems.map((c, i) => (
              <article className="course" key={i}>
                <CardIcon name={c.icon} fallback="kids" />
                <h3>{c.title}</h3>
                <p>{c.text}</p>
                {c.bullets.some((b) => has(b)) && (
                  <ul className="stitch-list">
                    {c.bullets.filter((b) => has(b)).map((b, j) => (<li key={j}>{b}</li>))}
                  </ul>
                )}
                <a className="textlink" href="#contatti">{tt("nav.enroll")}</a>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),

    dance: (
      <section className="sec dance" id="danza" aria-labelledby="dance-title">
        <figure className="dance__photo">
          <img {...danceImg} alt={dance.imageAlt} loading="lazy" decoding="async" />
        </figure>
        <div className="wrap dance__grid">
          <div className="dance__copy">
            <h2 id="dance-title">{dance.title}</h2>
            <p className="lead">{dance.lead}</p>
            <p>{dance.body}</p>
            <Paras text={dance.story} />
          </div>
          <div className="dance__times">
            <h3>{dance.scheduleTitle}</h3>
            <table>
              <tbody>
                {schedule.map((row, i) => (
                  <tr key={i}>
                    <th scope="row">{row.day}</th>
                    <td className="dance__time">{row.time}</td>
                    <td>{row.place}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dance__note">{dance.groupNote}</p>
            <a className="btn btn--paper" href="#contatti">{dance.cta}</a>
          </div>
          {has(dance.instructorName) && (
            <div className="dance__teacher">
              {instructorPic && <img {...instructorPic} alt={dance.instructorName} loading="lazy" decoding="async" />}
              <div>
                <h3>{dance.instructorName}</h3>
                <p className="dance__role">{dance.instructorRole}</p>
                <Paras text={dance.instructorBio} className="dance__bio" />
              </div>
            </div>
          )}
        </div>
      </section>
    ),

    facebook: (
      <section className="sec fb" id="seguici" aria-labelledby="fb-title">
        <div className="wrap fb__grid">
          <div className="fb__copy">
            <h2 id="fb-title">{facebook.title}</h2>
            <p className="lead">{facebook.lead}</p>
            <ul className="stitch-list">
              {fbPoints.map((p, i) => (<li key={i}>{p}</li>))}
            </ul>
            <a className="btn btn--line" href={fbPage} target="_blank" rel="noopener noreferrer">{tt("fb.open")}</a>
          </div>
          <div className="fb__frame">
            <FacebookEmbed locale={locale} href={fbPage} />
          </div>
        </div>
      </section>
    ),

    gallery: (
      <section className="sec gallery" id="galleria" aria-labelledby="gallery-title">
        <div className="wrap">
          <header className="sec__head">
            <h2 id="gallery-title">{gallery.title}</h2>
          </header>
          <Gallery
            photos={galleryPhotos}
            labels={{ open: tt("gallery.open"), close: tt("gallery.close"), prev: tt("gallery.prev"), next: tt("gallery.next") }}
          />
        </div>
      </section>
    ),

    documents: docs.length + issues.length > 0 ? (
      <section className="sec documents" id="documenti" aria-labelledby="docs-title">
        <div className="wrap">
          <header className="sec__head">
            <h2 id="docs-title">{documents.title}</h2>
            {has(documents.lead) && <p className="lead"><Bg text={documents.lead ?? ""} /></p>}
          </header>
          {docs.length > 0 && (
            <ul className="doclist">
              {docs.map((d, i) => (
                <li key={i}>
                  <a href={d.file} target="_blank" rel="noopener noreferrer">
                    <span className="doclist__title"><Bg text={d.title} /></span>
                    {has(d.text) && <span className="doclist__text">{d.text}</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {issues.length > 0 && (
            <>
              <h3 className="issues__title"><Bg text={documents.issuesTitle} /></h3>
              <ul className="issues">
                {issues.map((d, i) => (
                  <li key={i}>
                    <a href={d.file} target="_blank" rel="noopener noreferrer">
                      {d.pic ? <img {...d.pic} alt="" loading="lazy" decoding="async" /> : <span className="issues__none" aria-hidden="true" />}
                      <span className="issues__no">{d.title}</span>
                      {has(d.text) && <span className="issues__head"><Bg text={d.text} /></span>}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    ) : null,

    faq: showFaq ? (
      <section className="sec faq" id="faq" aria-labelledby="faq-title">
        <div className="wrap faq__grid">
          <h2 id="faq-title">{faq.title}</h2>
          <div className="faq__list">
            {faqItems.map((f, i) => (
              <details key={i}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    ) : null,

    contact: (
      <section className="sec sec--linen contact" id="contatti" aria-labelledby="contact-title">
        <div className="wrap contact__grid">
          <div className="contact__copy">
            <h2 id="contact-title">{contact.title}</h2>
            <p className="lead">{contact.lead}</p>
            <dl className="contact__list">
              <div><dt>{tt("phone")}</dt><dd><a href={`tel:${settings.phoneHref}`}>{settings.phone}</a></dd></div>
              <div><dt>{tt("form.email")}</dt><dd><a href={`mailto:${settings.email}`}>{settings.email}</a></dd></div>
              <div><dt>{tt("addr")}</dt><dd>{mapHref ? <a href={mapHref} target="_blank" rel="noopener noreferrer">{settings.address}</a> : settings.address}</dd></div>
              {fbHref !== "#" && <div><dt>{tt("nav.facebook")}</dt><dd><a href={fbHref} target="_blank" rel="noopener noreferrer">{fbHref.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></dd></div>}
            </dl>
            {mapQuery && <MapEmbed locale={locale} query={mapQuery} address={settings.address} href={mapHref} />}
          </div>
          <ContactForm locale={locale} topics={topics} email={settings.email} />
        </div>
      </section>
    ),

    cta: (
      <section className="sec welcome" id="benvenuti" aria-labelledby="cta-title">
        <div className="wrap welcome__grid">
          <div>
            <h2 id="cta-title">
              {greet ? (<><span lang="bg">{greet[1]}</span> {greet[2]}</>) : cta.title}
            </h2>
            <p className="lead">{cta.body}</p>
            <div className="actions">
              <a className="btn btn--red" href={`mailto:${settings.email}`}>{cta.primary}</a>
              <a className="btn btn--line" href={`tel:${settings.phoneHref}`}>{cta.secondary}</a>
            </div>
          </div>
          <RosetteMotif size={11} className="welcome__rosette" />
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
      <a className="skip-link" href="#main">{tt("skip")}</a>

      <SiteHeader locale={locale} brandName={settings.brandName} brandSub={settings.brandSub} logo={logo} nav={nav} />

      <main id="main">
        {/* Hero — always first */}
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="wrap hero__grid">
            <div className="hero__copy">
              <p className="hero__kicker">{hero.badge}</p>
              <h1 id="hero-title">{hero.title}</h1>
              <p className="hero__lead">{hero.lead}</p>
              <div className="actions">
                <a className="btn btn--red" href="#corsi">{tt("cta.discover")}</a>
                <a className="btn btn--line" href="#chi-siamo">{tt("cta.know")}</a>
              </div>
            </div>
            <StitchedPhoto
              className="hero__photo"
              {...heroImg}
              alt={hero.imageAlt}
              priority
            />
          </div>
          {highlights.length > 0 && (
            <ul className="wrap facts" aria-label={hero.badge}>
              {highlights.map((h, i) => (
                <li key={i}><img className="facts__rose" src="/assets/img/brand/rose-bullet.webp" alt="" aria-hidden="true" width={26} height={26} />{h.text}</li>
              ))}
            </ul>
          )}
        </section>
        <StitchBand id="hero" />

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
    </>
  );
}
