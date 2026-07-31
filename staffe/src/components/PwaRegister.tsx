'use client';

import { useEffect } from 'react';

/**
 * Registra `sw.js` solo in produzione: in sviluppo un service worker in
 * cache romperebbe l'hot reload (si vedrebbe il bundle vecchio finché non lo
 * si disinstalla a mano). Componente client "vuoto": non renderizza nulla,
 * serve solo l'effetto collaterale della registrazione.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registrazione fallita (es. contesto non sicuro): l'app resta usabile
      // come sito web normale, solo senza le funzioni offline/installazione.
    });
  }, []);

  return null;
}
