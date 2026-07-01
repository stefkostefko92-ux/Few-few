import Link from "next/link";

// Лек 404 за публичните сайтове (различен от тъмния 404 на панела).
export function PublicNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      <p className="text-5xl font-bold text-slate-900">404</p>
      <p className="text-slate-500">Страницата не е намерена.</p>
      <Link href="/" className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
        Към началото
      </Link>
    </main>
  );
}
