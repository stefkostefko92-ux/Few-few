'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationLevel, NotificationType } from '@prisma/client';
import { Badge, Button, Card } from '@/components/ui';
import { NOTIFICATION_LABELS, NOTIFICATION_TONE, formatDateTime } from '@/lib/labels';

/**
 * Elenco interattivo delle notifiche: segna come letto e leggi tutto.
 *
 * È l'unica parte client della sezione. Dopo ogni azione si chiede al server di
 * rigenerare la pagina (`router.refresh()`) invece di correggere lo stato in
 * locale: il conteggio deve venire dal database, altrimenti due schede aperte
 * mostrano due verità diverse.
 */

export type NotificaVista = {
  id: string;
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  body: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function ElencoNotifiche({ notifiche }: { notifiche: NotificaVista[] }) {
  const router = useRouter();
  const [inCorso, avviaTransizione] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  async function chiama(url: string, corpo: Record<string, unknown> = {}) {
    setErrore(null);
    try {
      const risposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!risposta.ok) {
        const dati = (await risposta.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setErrore(dati?.error?.message ?? 'Operazione non riuscita.');
        return;
      }
      avviaTransizione(() => router.refresh());
    } catch {
      setErrore('Nessuna risposta dal server. Controlla la connessione.');
    }
  }

  const nonLette = notifiche.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondario"
          disabled={inCorso || nonLette === 0}
          onClick={() => chiama('/api/notifiche/leggi-tutte')}
        >
          Segna tutte come lette
        </Button>
        <span className="text-sm text-fg-muted" aria-live="polite">
          {nonLette === 0
            ? 'Nessuna notifica da leggere in questo elenco.'
            : `${nonLette} da leggere in questo elenco.`}
        </span>
      </div>

      {errore && (
        <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm" role="alert">
          {errore}
        </p>
      )}

      <ul className="space-y-2">
        {notifiche.map((n) => (
          <li key={n.id}>
            <Card className={n.readAt ? 'opacity-70' : 'border-l-4 border-l-brand'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={NOTIFICATION_TONE[n.level]}>
                      {NOTIFICATION_LABELS[n.type]}
                    </Badge>
                    {!n.readAt && <Badge tone="corso">Da leggere</Badge>}
                    <span className="text-xs text-fg-muted">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-fg-muted">{n.body}</p>}
                </div>
                <div className="no-print flex gap-2">
                  {n.entity === 'Product' && n.entityId && (
                    <a
                      href={`/prodotti/${n.entityId}`}
                      className="inline-flex h-8 items-center rounded border border-border px-3 text-sm hover:bg-muted"
                    >
                      Apri prodotto
                    </a>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="fantasma"
                    disabled={inCorso}
                    onClick={() =>
                      chiama(`/api/notifiche/${n.id}/letta`, { letta: !n.readAt })
                    }
                  >
                    {n.readAt ? 'Segna da leggere' : 'Segna come letta'}
                  </Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
