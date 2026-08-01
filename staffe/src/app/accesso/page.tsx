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
        {/*
          Primo livello dell'informativa (art. 12(1) GDPR: concisa; il dettaglio
          sta in /informativa).

          NON si nomina qui Carbon Stealth VCC come se fosse il titolare: il
          titolare del trattamento è l'azienda che usa il gestionale, Carbon
          Stealth è responsabile del trattamento (art. 28). Il testo precedente
          indicava il soggetto sbagliato, cioè proprio l'informazione che
          l'art. 13(1)(a) chiede per prima.
        */}
        <p className="mt-4 text-xs text-fg-muted">
          Gli accessi e le operazioni sono registrati per finalità di sicurezza e
          tracciabilità.{' '}
          <a href="/informativa" className="underline hover:text-fg">
            Informativa sul trattamento dei dati
          </a>
          .
        </p>
        <p className="mt-2 text-xs text-fg-muted">
          Software fornito da Carbon Stealth VCC (responsabile del trattamento).
        </p>
      </div>
    </main>
  );
}
