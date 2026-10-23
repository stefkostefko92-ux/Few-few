'use client';

// The print page's tools (rilievi app.js): «Stampa» opens the browser's print dialog; opened from the sheet's «Stampa»
// (`?auto=1`), the page prints once by itself — the mark leaves the address first (a reload does not print again), the
// fonts are waited for, then a short pause so the sheet is drawn.
import { useEffect } from 'react';

export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn btn-primary" onClick={() => window.print()}>{label}</button>;
}

export function AutoPrint() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('auto') !== '1') return;
    url.searchParams.delete('auto');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    let timer: number | undefined;
    void document.fonts.ready.then(() => { timer = window.setTimeout(() => window.print(), 250); });
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
