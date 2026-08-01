'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@/components/ui';

export function LoginForm({ destinazione }: { destinazione: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrore(body?.error?.message ?? 'Accesso non riuscito.');
        return;
      }
      router.replace(destinazione);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile. Controlla la connessione.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form onSubmit={invia} className="space-y-4">
      <Field label="Indirizzo e-mail" htmlFor="email" required>
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={inCorso}>
        {inCorso ? 'Accesso in corso…' : 'Accedi'}
      </Button>
    </form>
  );
}
