import { Link } from '@/i18n/routing';
import { LOGO } from '@/lib/brand';

/** The LiftPilot logo (emblem and wordmark, for dark surfaces) as a link to the home of the site or of the application,
 *  with an optional line beside it (the company's name in the application, the tagline on the site). */
export default function Brand({ href, sub }: { href: string; sub?: string }) {
  return (
    <Link href={href} className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes with a srcset (scripts/brand-assets.py), nothing to optimise */}
      <img src={LOGO.src} srcSet={LOGO.srcSet} width={LOGO.width} height={LOGO.height} alt="LiftPilot" decoding="async" />
      {sub ? <span>{sub}</span> : null}
    </Link>
  );
}
