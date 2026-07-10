// Начална страница — пълният спектакъл. Всички секции са data-driven от content.<lang>.json.
import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { useSeo } from '@/lib/seo';
import { homePath } from '@/lib/i18n';
import { scrollToId } from '@/lib/scroll';
import { useReveal } from '@/hooks/useReveal';
import MagneticText from '@/components/MagneticText';
import MagneticButton from '@/components/MagneticButton';
import ScrambleText from '@/components/ScrambleText';
import GhostHeading from '@/components/GhostHeading';
import ContactForm from '@/components/ContactForm';
import LiquidHeading from '@/components/effects/LiquidHeading';
import GenerativeCanvas from '@/components/effects/GenerativeCanvas';

// Тежката WebGL сцена се зарежда lazy — не бави първоначалния paint/LCP.
const HeroCanvas = lazy(() => import('@/components/effects/HeroCanvas'));
// Canvas ефектите се зареждат lazy — не тежат на initial bundle/LCP.
const PrintForge = lazy(() => import('@/components/effects/PrintForge'));
const LivingMonument = lazy(() => import('@/components/effects/LivingMonument'));

export default function Home(): React.JSX.Element {
  const { content, lang, site } = useContent();
  const ui = content.ui;
  const location = useLocation();
  useSeo(homePath(lang), { jsonLd: site.jsonLdGraph });

  // Скрол към секция при пристигане с #hash (напр. от друга страница)
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      setTimeout(() => scrollToId(id), 300);
    }
  }, [location.hash]);

  return (
    <main>
      <Hero />
      <div className="cs-divider" />
      <About />
      <Services />
      <WorldFirsts />
      <Portfolio />
      <Products />
      <Lab />
      <Faq />
      <Contact />
    </main>
  );

  // --- HERO ---
  function Hero(): React.JSX.Element {
    return (
      <section
        id="top"
        style={{
          position: 'relative',
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Suspense fallback={null}>
          <HeroCanvas />
        </Suspense>
        {/* Диагонална скен линия през целия hero */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: 2,
              background:
                'linear-gradient(90deg, transparent, rgba(0,229,255,.3), transparent)',
              animation: 'cs-diag-scan 6s linear infinite',
            }}
          />
        </div>

        <div className="cs-container" style={{ position: 'relative', zIndex: 2, paddingTop: 80 }}>
          <div className="cs-tag">{ui.hero_eyebrow}</div>
          <h1
            style={{
              fontSize: 'clamp(2.2rem, 7vw, 5.5rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.04em',
              margin: '0 0 24px',
              maxWidth: 1000,
            }}
          >
            <MagneticText text={ui.hero_title} />
          </h1>
          <p style={{ fontSize: 13, color: 'var(--cyan)', letterSpacing: '.1em', marginBottom: 16 }}>
            {ui.hero_sub}
          </p>
          <p style={{ maxWidth: 560, color: 'var(--text)', lineHeight: 1.9, marginBottom: 32 }}>
            {ui.hero_desc}
          </p>
          <MagneticButton
            as="button"
            onClick={() => scrollToId('contact')}
            style={{
              padding: '16px 32px',
              border: '1px solid var(--cyan)',
              color: 'var(--cyan)',
              fontSize: 12,
              letterSpacing: '.15em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {ui.cta_btn}
          </MagneticButton>
        </div>

        {/* HUD ъгли */}
        <div
          className="cs-hud"
          style={{ position: 'absolute', bottom: 24, left: 20, zIndex: 2 }}
        >
          {String(content.decor.hero_coordinates ?? '')}
        </div>
        <div
          className="cs-hud"
          style={{ position: 'absolute', bottom: 24, right: 20, zIndex: 2 }}
        >
          {String(content.decor.hero_cs_core ?? '')}
        </div>
      </section>
    );
  }

  // --- ABOUT ---
  function About(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>();
    return (
      <section id="about" className="cs-section" ref={ref}>
        <div className="cs-container">
          <div className="cs-tag cs-reveal">{ui.about_tag}</div>
          <h2
            className="cs-reveal"
            style={{
              fontSize: 'clamp(1.5rem, 4vw, 3rem)',
              maxWidth: 1100,
              lineHeight: 1.15,
              marginBottom: 40,
              color: 'var(--off-white)',
            }}
          >
            <ScrambleText text={ui.about_scroll} autoOnMount />
          </h2>
          <p className="cs-reveal" style={{ maxWidth: 620, color: 'var(--text)', lineHeight: 2 }}>
            {ui.about_body}
          </p>
          <div className="cs-stats-grid cs-reveal">
            {content.stats.map((s) => (
              <div key={s.label} style={{ borderTop: '1px solid rgba(245,245,240,.08)', paddingTop: 16 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(2rem,4vw,3rem)',
                    fontWeight: 900,
                    color: 'var(--cyan)',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--text-2)' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // --- SERVICES ---
  function Services(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>({ stagger: 40 });
    return (
      <section id="services" className="cs-section" ref={ref} style={{ background: 'var(--bg-1)' }}>
        <div className="cs-container">
          <div className="cs-tag cs-reveal">{ui.srv_tag}</div>
          <GhostHeading text={ui.srv_title} className="cs-section-title cs-reveal">
            {ui.srv_title}
          </GhostHeading>
          <div className="cs-cards-grid" style={{ marginTop: 48 }}>
            {content.services.map((s) => (
              <article
                key={s.n}
                className="cs-reveal cs-card"
                data-cursor
              >
                <div style={{ fontSize: 10, color: 'var(--cyan)', letterSpacing: '.2em' }}>
                  {s.n}
                </div>
                <h3 style={{ fontSize: '1.15rem', margin: '10px 0', color: 'var(--off-white)' }}>
                  <ScrambleText text={s.t} />
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.8 }}>{s.d}</p>
                <div style={{ fontSize: 9, color: 'var(--placeholder)', letterSpacing: '.15em', marginTop: 14 }}>
                  {s.tags}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // --- WORLD FIRSTS ---
  function WorldFirsts(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>({ stagger: 30 });
    return (
      <section id="firsts" className="cs-section" ref={ref}>
        <div className="cs-container">
          <div className="cs-tag cs-reveal">{content.misc.wf_tag}</div>
          <GhostHeading text={content.misc.wf_title} className="cs-section-title cs-reveal">
            {content.misc.wf_title}
          </GhostHeading>
          <p className="cs-reveal" style={{ maxWidth: 620, color: 'var(--text)', margin: '16px 0 40px' }}>
            {content.misc.wf_sub}
          </p>
          <div className="cs-wf-grid">
            {content.worldFirsts.map((w) => (
              <article
                key={w.id}
                className="cs-reveal cs-card"
                style={{ borderColor: 'rgba(0,229,255,.12)' }}
                data-cursor
              >
                <div
                  style={{
                    display: 'inline-block',
                    fontSize: 9,
                    color: 'var(--cyan)',
                    background: 'rgba(0,229,255,.08)',
                    padding: '3px 8px',
                    letterSpacing: '.15em',
                  }}
                >
                  {w.id} · {w.year}
                </div>
                <h3 style={{ fontSize: '1rem', margin: '12px 0 8px', color: 'var(--off-white)' }}>
                  {w.title}
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.8 }}>{w.desc}</p>
                <div style={{ fontSize: 9, color: 'var(--placeholder)', letterSpacing: '.15em', marginTop: 12 }}>
                  {w.tech}
                </div>
              </article>
            ))}
          </div>
          <div className="cs-hud cs-reveal" style={{ marginTop: 32, textAlign: 'center' }}>
            {content.misc.wf_footer}
          </div>
        </div>
      </section>
    );
  }

  // --- PORTFOLIO ---
  function Portfolio(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>({ stagger: 50 });
    return (
      <section
        id="work"
        className="cs-section"
        ref={ref}
        style={{ background: 'var(--bg-1)', position: 'relative', overflow: 'hidden' }}
      >
        {/* WF-007 Generative Canvas Painting — трайно платно от курсора във фона на секцията */}
        <GenerativeCanvas />
        <div className="cs-container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="cs-tag cs-reveal">{ui.work_tag}</div>
          <GhostHeading text={ui.work_title} className="cs-section-title cs-reveal">
            {ui.work_title}
          </GhostHeading>
          <div style={{ marginTop: 40 }}>
            {content.portfolio.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener"
                className="cs-reveal cs-portfolio-row"
                data-cursor
              >
                <span style={{ fontSize: 10, color: 'var(--cyan)', letterSpacing: '.2em' }}>{p.id}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 'clamp(1.2rem,3vw,2rem)',
                    color: 'var(--off-white)',
                    textTransform: 'uppercase',
                  }}
                >
                  <ScrambleText text={p.name} />
                </span>
                <span style={{ fontSize: 10, color: 'var(--placeholder)', letterSpacing: '.15em' }}>
                  {p.category} →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // --- PRODUCTS ---
  function Products(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>({ stagger: 40 });
    return (
      <section id="products" className="cs-section" ref={ref}>
        <div className="cs-container">
          <div className="cs-tag cs-reveal">{ui.prod_tag}</div>
          <GhostHeading text={ui.prod_title} className="cs-section-title cs-reveal">
            {ui.prod_title}
          </GhostHeading>
          <div className="cs-cards-grid cs-cards-2" style={{ marginTop: 48 }}>
            {content.products.items.map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener"
                className="cs-reveal cs-card"
                data-cursor
              >
                <div style={{ fontSize: 9, color: 'var(--cyan)', letterSpacing: '.2em' }}>{p.tag}</div>
                <h3 style={{ fontSize: '1.3rem', margin: '10px 0', color: 'var(--off-white)' }}>
                  {p.name}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.8 }}>{p.desc}</p>
                <div style={{ fontSize: 10, color: 'var(--cyan)', marginTop: 14 }}>
                  {p.url.replace('https://', '')} →
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // --- LAB ---
  function Lab(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>();
    return (
      <section id="lab" className="cs-section" ref={ref} style={{ background: 'var(--bg-1)' }}>
        <div className="cs-container" style={{ maxWidth: 820 }}>
          <div className="cs-tag cs-reveal">{ui.lab_tag}</div>
          {/* WF-004 SVG Liquid Distortion — течен feTurbulence филтър върху заглавието */}
          <LiquidHeading text={ui.lab_title} className="cs-section-title cs-reveal" />
          <p className="cs-reveal" style={{ color: 'var(--text)', lineHeight: 2, margin: '20px 0 24px' }}>
            {ui.lab_desc}
          </p>
          {/* WF-001 Live Print Forge — canvas 2D 3D-принтер: слой по слой + reverse scan */}
          <div className="cs-reveal" style={{ margin: '8px 0 28px' }}>
            <Suspense fallback={null}>
              <PrintForge />
            </Suspense>
          </div>
          <ul className="cs-reveal" style={{ listStyle: 'none', display: 'grid', gap: 12, marginBottom: 28 }}>
            {[ui.lab_b1, ui.lab_b2, ui.lab_b3].map((b) => (
              <li key={b} style={{ paddingLeft: 20, position: 'relative', color: 'var(--text-2)' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--cyan)' }}>▸</span>
                {b}
              </li>
            ))}
          </ul>
          {/* WF-011 Living Monument — вечен кристал, растящ от поведението на посетителите */}
          <div className="cs-reveal" style={{ margin: '8px 0 28px' }}>
            <div className="cs-hud" style={{ marginBottom: 10, color: 'var(--cyan)' }}>
              // LIVING MONUMENT · SHA-256 ENTROPY + PHYLLOTAXIS
            </div>
            <Suspense fallback={null}>
              <LivingMonument />
            </Suspense>
          </div>
          <MagneticButton
            as="button"
            onClick={() => scrollToId('contact')}
            className="cs-reveal"
            style={{
              padding: '14px 28px',
              border: '1px solid var(--cyan)',
              color: 'var(--cyan)',
              fontSize: 12,
              letterSpacing: '.1em',
              cursor: 'pointer',
            }}
          >
            {ui.lab_cta}
          </MagneticButton>
        </div>
      </section>
    );
  }

  // --- FAQ ---
  function Faq(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>({ stagger: 30 });
    return (
      <section id="faq" className="cs-section" ref={ref}>
        <div className="cs-container" style={{ maxWidth: 860 }}>
          <div className="cs-tag cs-reveal">{ui.faq_tag}</div>
          <h2 className="cs-section-title cs-reveal">{ui.faq_title}</h2>
          <div style={{ marginTop: 40 }}>
            {content.faq.map((f, i) => (
              <details
                key={i}
                className="cs-reveal"
                style={{ borderBottom: '1px solid rgba(245,245,240,.08)', padding: '20px 0' }}
              >
                <summary
                  data-cursor
                  style={{
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--off-white)',
                    listStyle: 'none',
                  }}
                >
                  <span style={{ color: 'var(--cyan)', marginRight: 10 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {f.q}
                </summary>
                <p style={{ marginTop: 14, color: 'var(--text)', lineHeight: 2, fontSize: 13 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // --- CONTACT ---
  function Contact(): React.JSX.Element {
    const ref = useReveal<HTMLDivElement>();
    return (
      <section id="contact" className="cs-section" ref={ref} style={{ background: 'var(--bg-1)' }}>
        <div className="cs-container" style={{ maxWidth: 720 }}>
          <h2
            className="cs-reveal"
            style={{
              fontSize: 'clamp(2rem, 6vw, 5rem)',
              lineHeight: 0.9,
              letterSpacing: '-.04em',
              color: 'var(--cyan)',
              marginBottom: 12,
            }}
          >
            {ui.cta_title}
          </h2>
          <p className="cs-reveal" style={{ color: 'var(--text)', marginBottom: 32, letterSpacing: '.05em' }}>
            {ui.cta_sub}
          </p>
          <div className="cs-reveal">
            <ContactForm />
          </div>
          <div className="cs-reveal" style={{ marginTop: 24, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <a href={`mailto:${site.email}`} className="cs-hud">
              {site.email}
            </a>
            {Object.values(site.phones).map((ph) => (
              <a key={ph.tel} href={`tel:${ph.tel}`} className="cs-hud">
                {ph.display}
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }
}
