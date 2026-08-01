'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/rbac';
import { PASSWORD_MIN, RUOLI } from '@/lib/validation/inventario';
import { Button, Field, Input, Select } from '@/components/ui';

/** Alfabeto senza caratteri ambigui (0/O, 1/l/I): la password iniziale si detta. */
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

function passwordCasuale(lunghezza = 16): string {
  const valori = new Uint32Array(lunghezza);
  crypto.getRandomValues(valori);
  return [...valori].map((v) => ALFABETO[v % ALFABETO.length]).join('');
}

/**
 * Creazione di un utente. La password iniziale si può generare qui: è mostrata
 * una sola volta, viaggia sul server dentro la richiesta e da lì diventa solo un
 * hash bcrypt. Non viene mai registrata in chiaro, nemmeno nell'audit.
 */
export function NuovoUtenteForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof RUOLI)[number]>('MAGAZZINO');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (password.length < PASSWORD_MIN) {
      setErrore(`La password deve avere almeno ${PASSWORD_MIN} caratteri.`);
      return;
    }
    setInCorso(true);
    try {
      const res = await fetch('/api/utenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Creazione non riuscita.');
        return;
      }
      router.push(`/impostazioni/utenti/${body.data.id}`);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile. Controlla la connessione.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form onSubmit={invia} className="max-w-xl space-y-4">
      <Field label="Nome e cognome" htmlFor="nome" required>
        <Input
          id="nome"
          value={name}
          required
          minLength={2}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Indirizzo e-mail" htmlFor="email" required>
        <Input
          id="email"
          type="email"
          value={email}
          required
          maxLength={200}
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Ruolo" htmlFor="ruolo" required>
        <Select
          id="ruolo"
          value={role}
          onChange={(e) => setRole(e.target.value as (typeof RUOLI)[number])}
        >
          {RUOLI.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Password iniziale"
        htmlFor="password"
        required
        hint={`Almeno ${PASSWORD_MIN} caratteri. Consegnala di persona e falla cambiare al primo accesso.`}
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

      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Creazione…' : 'Crea utente'}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondario"
          onClick={() => router.push('/impostazioni/utenti')}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
