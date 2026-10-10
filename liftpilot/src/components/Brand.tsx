import { Link } from '@/i18n/routing';
import { LOGO, LOGO_COMPACT } from '@/lib/brand';

/** The LiftPilot logo (for dark surfaces) as a link to the home of the site or of the application, with an optional
 *  line beside it (the company's name in the application, the tagline on the site). The compact lockup (emblem and
 *  name) by default, for headers under 40 px of height; `full` adds the "ELEVATOR DESIGN SOFTWARE" line, for 40 px and
 *  more (the template's landing header shows it at 190 px of width). */
export default function Brand({ href, sub, full = false }: { href: string; sub?: string; full?: boolean }) {
  const logo = full ? LOGO : LOGO_COMPACT;
  return (
    <Link href={href} className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes with a srcset (scripts/brand-assets.py), nothing to optimise */}
      <img src={logo.src} srcSet={logo.srcSet} width={logo.width} height={logo.height} alt="LiftPilot" decoding="async" />
      {sub ? <span>{sub}</span> : null}
    </Link>
  );
}
