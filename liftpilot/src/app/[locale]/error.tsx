'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LOGO_COMPACT } from '@/lib/brand';
import ErrorView from '@/components/ErrorView';
import FooterView from '@/components/FooterView';
import '@/app/public.css';

// An unexpected error on a page whose own frame failed too (a public page, or the application's layout): the logo back
// to the home page, the error (ErrorView: no technical detail; the digest links it to the server log) and the public
// footer with the Carbon Stealth credit — the owner's rule for every page. A client component: the server's Footer
// cannot be drawn here, FooterView takes the words from the browser's messages (common, sent with the public pages).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const tc = useTranslations('common');
  return (
    <>
      <header className="site-header lean">
        <div className="site-header-inner">
          <Link href="/" className="site-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes with a srcset (scripts/brand-assets.py) */}
            <img src={LOGO_COMPACT.src} srcSet={LOGO_COMPACT.srcSet} width={LOGO_COMPACT.width} height={LOGO_COMPACT.height} alt="LiftPilot" decoding="async" />
          </Link>
        </div>
      </header>
      <ErrorView error={error} reset={reset} />
      <FooterView texts={{ note: tc('footerNote'), legal: tc('legal'), pricing: tc('pricingLink'), data: tc('dataLink'), guide: tc('guideLink'), provider: tc('provider') }} />
    </>
  );
}
