import { Link } from '@/i18n/routing';

// The mark of public/icon.svg (sheave, car and counterweight), inline so it needs no request.
export default function Brand({ href, sub }: { href: string; sub?: string }) {
  return (
    <Link href={href} className="brand">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#1d3271" />
        <circle cx="32" cy="26" r="14" fill="none" stroke="#ffffff" strokeWidth="4" />
        <circle cx="32" cy="26" r="3.5" fill="#ffffff" />
        <path d="M18 26v24M46 26v14" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
        <rect x="11" y="46" width="14" height="10" rx="2" fill="#ffffff" />
        <rect x="41" y="38" width="10" height="12" rx="2" fill="#9db1ff" />
      </svg>
      <b>Argano</b>
      {sub ? <span>{sub}</span> : null}
    </Link>
  );
}
