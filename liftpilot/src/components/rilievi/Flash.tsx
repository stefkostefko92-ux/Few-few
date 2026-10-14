'use client';

import { useEffect } from 'react';
import Icon from '../Icon';

// The one-time notice after an action (rilievi's flash: «Scheda salvata.», «Scheda spostata nel cestino.»…): the action
// lands here with `?ok=<key>`; once shown, the key leaves the address, so a reload or a shared link does not say it again.
// The page opens at its top, where the notice and the title are — as rilievi's 303 to a new page did; an action's
// redirect would otherwise keep the scroll of the long form it came from.
export default function Flash({ text }: { text: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('ok')) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    url.searchParams.delete('ok');
    // (Next's router keeps its own state and follows the new address: its documented native-history integration)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return (
    <p className="alert alert-ok rv-flash" role="status">
      <Icon name="check-circle" size={18} />
      <span>{text}</span>
    </p>
  );
}
