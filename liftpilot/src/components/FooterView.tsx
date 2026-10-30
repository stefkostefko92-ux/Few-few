import { Link } from '@/i18n/routing';
import { LOGO_COMPACT } from '@/lib/brand';
import Credit from './Credit';

/** The footer's words (messages: common.*), read by whoever draws it: the server's Footer, or the error page in the
 *  browser. */
export interface FooterTexts {
  note: string;
  legal: string;
  pricing: string;
  data: string;
  guide: string;
  provider: string;
}

// The footer of every page (public and application), after the Premium template: the logo, the year and the note on
// the results, the public links (the guide, privacy and terms, prices, data), the Carbon Stealth credit (the owner's
// fixed English signature), then the provider's details in small print. No hooks and no server API, so that the error
// page — a client component — draws the same footer (src/app/[locale]/error.tsx).
export default function FooterView({ texts }: { texts: FooterTexts }) {
  return (
    <footer className="site-footer">
      <div className="inner">
        <Link href="/" className="site-logo footer-logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes with a srcset (scripts/brand-assets.py), nothing to optimise */}
          <img src={LOGO_COMPACT.src} srcSet={LOGO_COMPACT.srcSet} width={LOGO_COMPACT.width} height={LOGO_COMPACT.height} alt="LiftPilot" loading="lazy" decoding="async" />
        </Link>
        <span className="footer-note">© {new Date().getFullYear()} {texts.note}</span>
        <span className="footer-links">
          <Link className="footer-link" href="/guida">{texts.guide}</Link>
          <Link className="footer-link" href="/privacy">{texts.legal}</Link>
          <Link className="footer-link" href="/pricing">{texts.pricing}</Link>
          <Link className="footer-link" href="/data">{texts.data}</Link>
        </span>
        <Credit />
        <small className="footer-provider">{texts.provider}</small>
      </div>
    </footer>
  );
}
