// The sketches' panel as the browser gets it (round 50, src/components/schizzi/), rendered with the Italian texts: a
// reading under way keeps one fixed sentence in its live region, the seconds beside it out of the screen reader's way;
// a sketch drawn for another part says so over «Leggi lo schizzo»; the values the model read all start unticked (each
// one ticked by the technician, filled only from 0.6 up), the measures taken on a drawing ticked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import it from '../../../messages/it.json';
import ConfermaValori, { type Modulo } from '@/components/schizzi/ConfermaValori';
import LetturaSchizzo, { InLettura } from '@/components/schizzi/LetturaSchizzo';
import type { SchizzoView } from '@/server/schizzi/queries';

// the components are compiled with the classic JSX runtime here (tsconfig "jsx": "preserve")
Object.assign(globalThis, { React });

/** A component's markup with the Italian texts, as the application's pages render it. */
function html<P extends object>(c: React.ComponentType<P>, props: P): string {
  return renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale: 'it', messages: it, timeZone: 'Europe/Rome', children: React.createElement(c, props) }));
}

test('lettura in corso: la regione live ha un testo fisso, i secondi stanno fuori dal lettore di schermo', () => {
  const page = html(InLettura, { secondi: 37, onAnnulla: () => undefined });
  const live = [...page.matchAll(/<span[^>]*role="status"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(live, [it.schizzi.pannello.inLettura], 'one live region, its sentence fixed');
  assert.doesNotMatch(live[0] ?? '', /\d/, 'no counter in it');
  assert.match(page, /<span[^>]*aria-hidden="true"[^>]*>37 s<\/span>/, 'the seconds shown, not announced');
  assert.equal(html(InLettura, { secondi: 38, onAnnulla: () => undefined }).match(/role="status"[^>]*>([^<]*)</)?.[1], live[0], 'a second later the live text is the same');
});

const NESSUNO: Modulo = { attuale: () => null, applica: () => ({ applied: [], refused: [] }) };
/** A table row by its field's id, and whether its «Confermo» is ticked. */
const row = (page: string, id: string): string => new RegExp(`<tr[^>]*data-campo="${id.replace('.', '\\.')}"[\\s\\S]*?</tr>`).exec(page)?.[0] ?? '';
const ticked = (r: string): boolean => /<input type="checkbox"[^>]*checked=""/.test(r);

test('conferma: ogni valore letto dall’IA parte da spuntare — con il valore da 0,6 in su, vuoto sotto —, le misure del CAD spuntate', () => {
  const ai = html(ConfermaValori, {
    target: 'vano', fonte: 'ai', modulo: NESSUNO, caption: 'c', applicati: () => '',
    righe: [{ id: 'W', value: 1600, confidence: 0.95, read: '160' }, { id: 'D', value: 1750, confidence: 0.6, read: '175' }, { id: 'pit', value: 1400, confidence: 0.59, read: '140?' }],
  });
  for (const id of ['W', 'D', 'pit']) assert.equal(ticked(row(ai, id)), false, `${id}: the technician ticks it`);
  assert.match(row(ai, 'W'), /value="1600"/);
  assert.match(row(ai, 'D'), /value="1750"/);
  assert.match(row(ai, 'pit'), /type="number"[^>]*value=""/, 'under 0.6: empty');
  assert.match(row(ai, 'pit'), /140\?/, 'the text read stays as the hint');
  assert.match(ai, /<button type="button" class="btn btn-primary" disabled="">Applica i valori confermati<\/button>/, 'nothing confirmed yet');
  const cad = html(ConfermaValori, {
    target: 'locale', fonte: 'cad', modulo: NESSUNO, caption: 'c', applicati: () => '',
    righe: [{ id: 'room.W', value: 3000, confidence: null, read: '' }, { id: 'room.D', value: 2800, confidence: null, read: '' }],
  });
  assert.ok(ticked(row(cad, 'room.W')) && ticked(row(cad, 'room.D')), 'measured on the drawing: ticked');
  assert.doesNotMatch(cad, /btn-primary" disabled/);
});

const schizzo = (component: string | null): SchizzoView => ({ id: 's1', title: 'Rilievo', component, mime: 'image/png', pages: 1, width: 800, height: 600, createdAt: '2026-10-20T08:00:00.000Z' });
const lettura = (component: string | null, target: 'vano' | 'locale'): string => html(LetturaSchizzo, { projectId: 'p1', schizzo: schizzo(component), target, modulo: NESSUNO, quando: '20/10/2026' });

test('lettura: uno schizzo di un’altra parte lo dice sopra «Leggi lo schizzo» — solo i valori che vi compaiono', () => {
  const testi = it.schizzi.pannello;
  for (const [component, target, text] of [
    ['vano', 'locale', testi.altraParte.locale], ['locale', 'vano', testi.altraParte.vano],
    [null, 'locale', testi.nonDellaParte.locale], ['porte', 'vano', testi.nonDellaParte.vano],
  ] as const) {
    const page = lettura(component, target), at = page.indexOf(text);
    assert.ok(at > 0, `${component ?? 'none'} read for ${target}`);
    assert.ok(at < page.indexOf(testi.leggi), 'above the button');
  }
  assert.match(testi.altraParte.locale, /^Questo schizzo è del vano: leggendolo per il locale macchina verranno proposti solo i valori che vi compaiono\.$/);
  for (const target of ['vano', 'locale'] as const) {
    const page = lettura(target, target);
    for (const text of [...Object.values(testi.altraParte), ...Object.values(testi.nonDellaParte)]) assert.ok(!page.includes(text), `${target}: its own sketch, no note`);
  }
});

test('conferma: le fermate si chiamano come nel modulo — la principale col suo nome e il numero dal basso, il valore resta l’indice', () => {
  const nomi = ['S1', 'T', '1', '2'];
  const modulo: Modulo = { ...NESSUNO, attuale: (id) => (id === 'main' ? 1 : null), fermata: (i) => nomi[i] ?? String(i) };
  const page = html(ConfermaValori, {
    target: 'vano', fonte: 'ai', modulo, caption: 'c', applicati: () => '',
    righe: [{ id: 'rise.0', value: 3000, confidence: 0.9, read: '300' }, { id: 'fdoor.1', value: 'AB', confidence: 0.9, read: 'A+B' }, { id: 'main', value: 2, confidence: 0.9, read: 'PT' }],
  });
  assert.match(row(page, 'rise.0'), /<td class="row-title">Dalla fermata S1 a quella sopra<\/td>/);
  assert.match(row(page, 'fdoor.1'), /<td class="row-title">Accesso della fermata T<\/td>/);
  const main = row(page, 'main');
  assert.match(main, /type="number"[^>]*value="2"/, 'the value is the index from the bottom');
  assert.ok(main.includes('Fermata 1 (n. 2 dal basso)'), 'the proposed stop by its name');
  assert.ok(main.includes('Nel modulo: T (n. 1 dal basso)'), 'the form’s main stop by its name');
  // the default names are the indexes: nothing more to say
  const plain = html(ConfermaValori, {
    target: 'vano', fonte: 'ai', modulo: { ...NESSUNO, attuale: (id) => (id === 'main' ? 1 : null), fermata: String }, caption: 'c', applicati: () => '',
    righe: [{ id: 'rise.0', value: 3000, confidence: 0.9, read: '300' }, { id: 'main', value: 2, confidence: 0.9, read: '2' }],
  });
  assert.match(row(plain, 'rise.0'), /Dalla fermata 0 a quella sopra/);
  assert.doesNotMatch(plain, /dal basso/);
  assert.ok(row(plain, 'main').includes('Nel modulo: 1'));
});
