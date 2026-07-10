// Футър — 3 колони (услуги / компания / правни) + бадж ред + кредит.
import { useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { homePath } from '@/lib/i18n';
import { scrollToId } from '@/lib/scroll';
import type { FooterLink } from '@/lib/types';

export default function Footer(): React.JSX.Element {
  const { content, lang, site } = useContent();
  const f = content.footer;
  const navigate = useNavigate();

  const prefix = lang === 'it' ? '' : `/${lang}`;

  const go = (target?: string): void => {
    if (!target) return;
    if (target.startsWith('http')) {
      window.open(target, '_blank', 'noopener');
      return;
    }
    // секция на началната страница
    if (window.location.pathname === homePath(lang)) scrollToId(target);
    else navigate(homePath(lang) + '#' + target);
  };

  const Column = ({ title, links }: { title: string; links: FooterLink[] }) => (
    <div>
      <h4 style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--cyan)', marginBottom: 16 }}>
        {title}
      </h4>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {links.map((l, i) => (
          <li key={i}>
            {l.href ? (
              <a
                href={prefix + l.href}
                onClick={(e) => {
                  if (l.href && l.href.startsWith('/') && !l.href.includes('.xml')) {
                    e.preventDefault();
                    navigate(prefix + l.href);
                  }
                }}
                style={{ fontSize: 11, color: 'var(--text)' }}
              >
                {l.label}
              </a>
            ) : (
              <button
                onClick={() => go(l.target)}
                style={{ fontSize: 11, color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
              >
                {l.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer
      style={{
        borderTop: '1px solid rgba(245,245,240,.08)',
        background: 'rgba(0,0,0,.5)',
        padding: '64px 20px 40px',
      }}
    >
      <div className="cs-container">
        <div className="cs-footer-grid">
          <div>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Carbon Stealth VCC"
              style={{ height: 40, marginBottom: 16, filter: 'drop-shadow(0 0 8px rgba(0,229,255,.3))' }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 320, lineHeight: 1.9 }}>
              {content.ui.ft_desc}
            </p>
            <p style={{ fontSize: 11, color: 'var(--cyan)', marginTop: 16 }}>{site.slogan}</p>
          </div>
          <Column title={content.ui.ft_servizi} links={f.services} />
          <Column title={content.ui.ft_azienda} links={f.company} />
          <Column title={content.ui.ft_legale} links={f.legal} />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            marginTop: 40,
            paddingTop: 24,
            borderTop: '1px solid rgba(245,245,240,.06)',
          }}
        >
          {f.badges.map((b) => (
            <span
              key={b}
              className="cs-hud"
              style={{ border: '1px solid rgba(0,229,255,.15)', padding: '6px 12px' }}
            >
              {b}
            </span>
          ))}
        </div>

        <div style={{ marginTop: 24, fontSize: 10, color: 'var(--muted)', lineHeight: 2 }}>
          <div>
            {f.registeredOfficeLabel} {f.registeredOffice}
          </div>
          <div>{f.copyright}</div>
          <div style={{ color: 'var(--credit)', marginTop: 8 }}>{f.createdBy}</div>
          <div style={{ color: 'var(--credit)' }}>{f.techLine}</div>
        </div>
      </div>
    </footer>
  );
}
