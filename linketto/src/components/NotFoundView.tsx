import Link from 'next/link';

// Една 404 за целия сайт: същата нощна аврора като hero-то. Цифрата е
// единствената „голяма“ дума — останалото е тихо и води към изход.
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
    <main className={`font-ui auth-stage grain flex ${withHeader ? 'min-h-[calc(100vh-4.1rem)]' : 'min-h-screen'} flex-col items-center justify-center px-6 py-20 text-center text-white`}>
      <div
        aria-hidden
        className="aurora-conic pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
      <p
        aria-hidden
        className="title-shimmer animate-rise select-none text-[clamp(6rem,24vw,13rem)] font-extrabold leading-none tracking-tighter"
      >
        404
      </p>
      <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-balance leading-relaxed text-slate-300">
        {body}
      </p>
      <Link
        href={homeHref}
        className="btn-shine mt-9 rounded-full bg-white px-7 py-3.5 font-semibold text-slate-900 shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-sky-400/30"
      >
        {homeLabel}
      </Link>
    </main>
  );
}
