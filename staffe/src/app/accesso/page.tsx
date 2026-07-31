import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { destinazioneSicura } from '@/lib/redirect';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Accesso' };

export default async function AccessoPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect('/pannello');

  const { da } = await searchParams;
  const destinazione = destinazioneSicura(da);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Staffe</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Gestionale di magazzino — staffe e accessori per ascensori.
        </p>
        <div className="mt-6 rounded border border-border bg-surface p-5">
          <LoginForm destinazione={destinazione} />
        </div>
        <p className="mt-4 text-xs text-fg-muted">
          Strumento interno di Carbon Stealth VCC. Gli accessi sono registrati per
          finalità di sicurezza.
        </p>
      </div>
    </main>
  );
}
