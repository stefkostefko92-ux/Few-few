'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui';

type Tema = 'chiaro' | 'scuro';

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>('chiaro');

  useEffect(() => {
    setTema(document.documentElement.classList.contains('dark') ? 'scuro' : 'chiaro');
  }, []);

  function cambia() {
    const nuovo: Tema = tema === 'scuro' ? 'chiaro' : 'scuro';
    document.documentElement.classList.toggle('dark', nuovo === 'scuro');
    try {
      localStorage.setItem('staffe-tema', nuovo);
    } catch {
      // Modalità privata senza storage: il tema vale per questa sessione.
    }
    setTema(nuovo);
  }

  return (
    <Button
      variant="fantasma"
      size="sm"
      onClick={cambia}
      aria-label={tema === 'scuro' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      title={tema === 'scuro' ? 'Tema chiaro' : 'Tema scuro'}
    >
      <span aria-hidden="true">{tema === 'scuro' ? '☀' : '☾'}</span>
    </Button>
  );
}
