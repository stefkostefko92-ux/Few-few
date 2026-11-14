import Link from 'next/link';

// Обща рамка за публичните страници-инструменти и сравненията: тъмен hero
// с бранд сиянието, бяла работна карта и CTA към регистрацията.
export function ToolPage({
  eyebrow,
  title,
  intro,
  children,
  cta,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
  cta: { title: string; text: string; href: string; label: string };
}) {
  return (
    <main>
      <section className="grain relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-aurora absolute -top-40 left-[-10%] h-[30rem] w-[30rem] rounded-full bg-linketto-600/40 blur-3xl" />
          <div className="animate-aurora-slow absolute -bottom-52 right-[-8%] h-[32rem] w-[32rem] rounded-full bg-violet-600/30 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-16 text-center sm:pt-20">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-200 backdrop-blur">
            {eyebrow}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            {intro}
          </p>
        </div>
      </section>
      <div className="relative mx-auto -mt-14 max-w-4xl px-4 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-8">
          {children}
        </div>
      </div>
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {cta.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">{cta.text}</p>
        <Link
          href={cta.href}
          className="btn-shine mt-7 inline-block rounded-full bg-linketto-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-linketto-600/25 transition hover:-translate-y-0.5 hover:bg-linketto-700"
        >
          {cta.label}
        </Link>
      </section>
    </main>
  );
}
