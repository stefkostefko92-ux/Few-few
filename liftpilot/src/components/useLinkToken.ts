'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { tokenShapeOk } from '@/lib/token-shape';

// The token of an e-mail link travels in the address's fragment (#…), which browsers never send to a server, so it
// stays out of every log. It is kept here once read and taken off the address bar; a newer link opened in the same
// tab (a new fragment) replaces it. `keep` leaves it in the address bar while the page's form is on screen (the
// registration of a beta invitation: a reload must not lose the invitation, and no browser storage holds it); that
// page takes it off itself once the form was sent (`clearLinkToken`).
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

/** Takes the fragment off the address bar (the token read stays in this page). */
export function clearLinkToken(): void {
  if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** null while the page is not in the browser yet, '' without a valid token, else the token. */
export function useLinkToken({ keep = false }: { keep?: boolean } = {}): string | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  useEffect(() => {
    if (!keep) clearLinkToken();
  }, [raw, keep]);
  return raw === null ? null : tokenShapeOk(raw) ? raw : '';
}
