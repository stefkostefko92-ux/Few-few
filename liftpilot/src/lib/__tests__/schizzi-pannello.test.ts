// The sketches' panel as the browser gets it (round 50, src/components/schizzi/), rendered with the Italian texts: a
// reading under way keeps one fixed sentence in its live region, the seconds beside it out of the screen reader's way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import it from '../../../messages/it.json';
import { InLettura } from '@/components/schizzi/LetturaSchizzo';

// the components are compiled with the classic JSX runtime here (tsconfig "jsx": "preserve")
Object.assign(globalThis, { React });

/** A component's markup with the Italian texts, as the application's pages render it. */
function html<P extends object>(c: React.ComponentType<P>, props: P): string {
  return renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale: 'it', messages: it, timeZone: 'Europe/Rome' }, React.createElement(c, props)));
}

test('lettura in corso: la regione live ha un testo fisso, i secondi stanno fuori dal lettore di schermo', () => {
  const page = html(InLettura, { secondi: 37, onAnnulla: () => undefined });
  const live = [...page.matchAll(/<span[^>]*role="status"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(live, [it.schizzi.pannello.inLettura], 'one live region, its sentence fixed');
  assert.doesNotMatch(live[0] ?? '', /\d/, 'no counter in it');
  assert.match(page, /<span[^>]*aria-hidden="true"[^>]*>37 s<\/span>/, 'the seconds shown, not announced');
  assert.equal(html(InLettura, { secondi: 38, onAnnulla: () => undefined }).match(/role="status"[^>]*>([^<]*)</)?.[1], live[0], 'a second later the live text is the same');
});
