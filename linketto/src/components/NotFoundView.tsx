import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

// Една 404 за целия сайт. Цифрата е единствената „голяма“ дума: огромна,
// избледняваща към дъното на милиметровката; останалото е тихо и води към
// изход. Работи и в глобалната 404 (без езиков контекст и без хедър).
export function NotFoundView({
  title,
  body,
  homeLabel,
  homeHref,
  withHeader = false,
}: {
  title: string;
  body: string;
  homeLabel: string;
  homeHref: string;
  withHeader?: boolean;
}) {
  return (
    <main
      id="main"
      className={`relative isolate flex ${
        withHeader ? 'min-h-[calc(100vh-var(--header-h))]' : 'min-h-screen'
      } flex-col items-center justify-center overflow-hidden px-6 py-20 text-center`}
    >
      <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
      <div aria-hidden className="bg-glow absolute inset-0 -z-10" />
      {!withHeader && (
        <Link
          href={homeHref}
          aria-label={homeLabel}
          className="focus-ring absolute start-6 top-6 rounded-control"
        >
          <Logo name={homeLabel} />
        </Link>
      )}
      <p
        aria-hidden
        className="enter select-none bg-gradient-to-b from-fg via-fg/40 to-transparent bg-clip-text text-[clamp(7rem,26vw,15rem)] font-extrabold leading-[0.9] tracking-[-0.06em] text-transparent"
      >
        404
      </p>
      <h1
        className="enter mt-4 text-balance text-heading text-fg"
        style={{ '--d': '0.08s' } as React.CSSProperties}
      >
        {title}
      </h1>
      <p
        className="enter mt-3 max-w-md text-balance text-lead text-fg-muted"
        style={{ '--d': '0.14s' } as React.CSSProperties}
      >
        {body}
      </p>
      <div className="enter mt-9" style={{ '--d': '0.2s' } as React.CSSProperties}>
        <ButtonLink href={homeHref} size="lg">
          {homeLabel}
        </ButtonLink>
      </div>
    </main>
  );
}
