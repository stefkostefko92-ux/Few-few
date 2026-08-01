'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui';

export function LogoutButton() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);

  async function esci() {
    setInCorso(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/accesso');
    router.refresh();
  }

  return (
    <Button
      variant="secondario"
      size="sm"
      className="mt-2 w-full"
      onClick={esci}
      disabled={inCorso}
    >
      {inCorso ? 'Uscita…' : 'Esci'}
    </Button>
  );
}
