import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-4xl font-semibold text-white">404</p>
      <p className="text-ink-400">Страницата не е намерена или нямате достъп до нея.</p>
      <Link href="/dashboard" className="btn-primary">
        Към таблото
      </Link>
    </main>
  );
}
