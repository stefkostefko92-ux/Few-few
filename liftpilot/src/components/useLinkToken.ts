'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { tokenShapeOk } from '@/lib/token-shape';

// The token of an e-mail link travels in the address's fragment (#…), which browsers never send to a server, so it
// stays out of every log. It is kept here once read and taken off the address bar; a newer link opened in the same
// tab (a new fragment) replaces it.
let captured = '';
function read(): string {
  const hash = window.location.hash.slice(1);
  if (hash) captured = hash;
  return captured;
}
function subscribe(changed: () => void): () => void {
  window.addEventListener('hashchange', changed);
  return () => window.removeEventListener('hashchange', changed);
}

/** null while the page is not in the browser yet, '' without a valid token, else the token. */
export function useLinkToken(): string | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [raw]);
  return raw === null ? null : tokenShapeOk(raw) ? raw : '';
}
