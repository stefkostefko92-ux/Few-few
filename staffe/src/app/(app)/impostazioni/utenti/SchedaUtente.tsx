'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/rbac';
import { PASSWORD_MIN, RUOLI } from '@/lib/validation/inventario';
import { Button, Card, Field, Input, Select } from '@/components/ui';

const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

function passwordCasuale(lunghezza = 16): string {
  const valori = new Uint32Array(lunghezza);
  crypto.getRandomValues(valori);
  return [...valori].map((v) => ALFABETO[v % ALFABETO.length]).join('');
}

type Utente = {
  id: string;
  name: string;
  email: string;
  role: (typeof RUOLI)[number];
  active: boolean;
};

/**
 * Modifica di un utente.
 *
 * Disattivazione, cambio di ruolo e nuova password revocano le sessioni vive
 * (lo fa il server): senza revoca la scheda già aperta continuerebbe a lavorare
 * con i vecchi permessi, e «disattivato» vorrebbe dire soltanto «da domani».
 */
export function SchedaUtente({ utente, sonoIo }: { utente: Utente; sonoIo: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(utente.name);
  const [role, setRole] = useState<Utente['role']>(utente.role);
  const [password, setPassword] = useState('');
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [confermaStato, setConfermaStato] = useState(false);

  async function chiama(
    url: string,
    metodo: 'PATCH' | 'POST',
    corpo: Record<string, unknown>,
    successo: (dati: { sessioniRevocate?: number }) => string,
  ) {
    setInCorso(true);
    setErrore(null);
    setEsito(null);
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Operazione non riuscita.');
        return;
      }
      setEsito(successo(body?.data ?? {}));
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile: nessuna modifica salvata.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-6">
      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}
      {esito && !errore && (
        <p className="rounded bg-ok/10 px-3 py-2 text-sm text-ok" aria-live="polite">
          {esito}
        </p>
      )}

      <Card>
        <h2 className="font-semibold">Anagrafica e ruolo</h2>
        <form
          className="mt-3 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            chiama(`/api/utenti/${utente.id}`, 'PATCH', { name, role }, () =>
              role === utente.role
                ? 'Modifiche salvate.'
                : 'Ruolo cambiato: le sessioni aperte sono state revocate.',
            );
          }}
        >
          <Field label="Nome e cognome" htmlFor="nome" required>
            <Input
              id="nome"
              value={name}
              required
              minLength={2}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field
            label="Ruolo"
            htmlFor="ruolo"
            hint={
              sonoIo
                ? 'Non puoi declassare il tuo stesso account: serve un altro amministratore.'
                : 'Il cambio di ruolo revoca le sessioni aperte.'
            }
          >
            <Select
              id="ruolo"
              value={role}
              disabled={sonoIo && utente.role === 'AMMINISTRATORE'}
              onChange={(e) => setRole(e.target.value as Utente['role'])}
            >
              {RUOLI.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>

          <Button type="submit" disabled={inCorso}>
            {inCorso ? 'Salvataggio…' : 'Salva'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Reimposta la password</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Tutte le sessioni aperte vengono revocate: se la password è cambiata
          perché sospetti un accesso altrui, lasciare aperta quella sessione
          renderebbe il cambio inutile.
        </p>
        <form
          className="mt-3 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            chiama(
              `/api/utenti/${utente.id}/password`,
              'POST',
              { password },
              (dati) =>
                `Password reimpostata. Sessioni revocate: ${dati.sessioniRevocate ?? 0}. Consegnala di persona.`,
            );
            setPassword('');
          }}
        >
          <Field
            label="Nuova password"
            htmlFor="password"
            required
            hint={`Almeno ${PASSWORD_MIN} caratteri.`}
          >
            <div className="flex gap-2">
              <Input
                id="password"
                type="text"
                value={password}
                required
                minLength={PASSWORD_MIN}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="secondario"
                onClick={() => setPassword(passwordCasuale())}
              >
                Genera
              </Button>
            </div>
          </Field>
          <Button type="submit" variant="secondario" disabled={inCorso}>
            Reimposta
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">
          {utente.active ? 'Disattivazione' : 'Riattivazione'}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Gli utenti non si cancellano: ordini, movimenti e audit devono restare
          leggibili. Un utente disattivato non entra più e le sue sessioni vengono
          revocate subito.
        </p>
        {sonoIo ? (
          <p className="mt-3 text-sm text-warn">
            Non puoi disattivare il tuo stesso account.
          </p>
        ) : confermaStato ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={utente.active ? 'pericolo' : 'primario'}
              disabled={inCorso}
              onClick={() => {
                chiama(
                  `/api/utenti/${utente.id}`,
                  'PATCH',
                  { active: !utente.active },
                  () =>
                    utente.active
                      ? 'Utente disattivato: sessioni revocate.'
                      : 'Utente riattivato.',
                );
                setConfermaStato(false);
              }}
            >
              {utente.active ? 'Sì, disattiva' : 'Sì, riattiva'}
            </Button>
            <Button
              type="button"
              variant="secondario"
              onClick={() => setConfermaStato(false)}
            >
              Annulla
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="mt-3"
            variant={utente.active ? 'pericolo' : 'primario'}
            onClick={() => setConfermaStato(true)}
          >
            {utente.active ? 'Disattiva utente' : 'Riattiva utente'}
          </Button>
        )}
      </Card>
    </div>
  );
}
