import Image from 'next/image';

// Обща рамка за вход/регистрация: същата нощна аврора като hero-то на
// landing-а, а формата стои върху светла карта с ясна йерархия.
export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="auth-stage grain flex min-h-[calc(100vh-4.1rem)] items-center justify-center px-4 py-12 sm:py-16">
      <div
        aria-hidden
        className="aurora-conic pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
      <div
        aria-hidden
        className="animate-aurora pointer-events-none absolute -left-24 top-10 -z-10 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-aurora-slow pointer-events-none absolute -bottom-24 -right-16 -z-10 h-80 w-80 rounded-full bg-violet-500/25 blur-3xl"
      />
      <div className="auth-card animate-rise relative w-full max-w-md rounded-3xl bg-white px-6 py-9 sm:px-10 sm:py-11">
        <Image
          src="/logo.png"
          alt=""
          width={132}
          height={50}
          className="h-9 w-auto"
        />
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.75rem]">
          {title}
        </h1>
        {children}
        <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">
          {footer}
        </div>
      </div>
    </main>
  );
}

export const AUTH_SUBMIT_CLASS =
  'btn-shine w-full rounded-full bg-linketto-600 py-3 font-semibold text-white shadow-lg shadow-linketto-600/25 transition hover:-translate-y-0.5 hover:bg-linketto-700 hover:shadow-xl active:translate-y-0';
