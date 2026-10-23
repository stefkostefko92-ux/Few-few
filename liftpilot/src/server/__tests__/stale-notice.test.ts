// The notice above a saved record the running engines no longer reproduce (src/components/StaleNotice.tsx), as the
// pages render it: the sentence about «Aggiorna con il software attuale» only beside the button; whoever may not make
// the record again reads which colleague does; an archived project says only what changed.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import it from '../../../messages/it.json';

// tsx compiles the component's JSX with the classic runtime (tsconfig "jsx": "preserve" is Next's): React.createElement
(globalThis as { React?: typeof React }).React = React;

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

const RefreshForm = (props: { kind: string; id: string }) => props;
mock.module(src('components/RefreshForm.tsx'), { defaultExport: RefreshForm });
mock.module(pkg('next-intl/server'), { namedExports: {
  getTranslations: async (ns: string) => (k: string) => ((it as unknown as Record<string, Record<string, string>>)[ns] ?? {})[k] ?? `${ns}.${k}`,
} });

type El = ReactElement<{ children?: ReactNode }>;
/** The words of the notice and what stands under them: the button (its record), the link given in its place, or nothing. */
async function notice(props: Record<string, unknown>): Promise<{ text: string; under: El | null }> {
  const { default: StaleNotice } = await import(src('components/StaleNotice.tsx'));
  const el = (await StaleNotice(props)) as El;
  const [p, under] = el.props.children as [El, El | null | undefined];
  return { text: ([] as ReactNode[]).concat(p.props.children).join(''), under: under ?? null };
}

const BUTTON = '«Aggiorna con il software attuale»';
const r = it.refresh;

test('chi può rifare il record: il testo con la frase del bottone, e il bottone', async () => {
  const n = await notice({ text: 'design', by: 'self', refresh: { kind: 'lift', id: 'd1' } });
  assert.equal(n.text, `${r.design} ${r.design_button}`);
  assert.equal(n.under?.type, RefreshForm);
  assert.deepEqual(n.under?.props, { kind: 'lift', id: 'd1' });
});

test('il Tecnico su un progetto o un locale macchina: chi lo aggiorna, nessun bottone né frase sul bottone', async () => {
  for (const text of ['design', 'room'] as const) {
    const n = await notice({ text, by: 'drawer', refresh: { kind: text === 'design' ? 'lift' : 'room', id: 'x' } });
    assert.equal(n.text, `${r[text]} Lo aggiorna un collega che disegna il progetto.`, text);
    assert.ok(!n.text.includes(BUTTON), text);
    assert.equal(n.under, null, text);
  }
});

test('il calcolo di una sostituzione per chi non fa i calcoli; il link al modulo resta al posto del bottone', async () => {
  const link = { type: 'a', props: { children: 'Apri il modulo' } };
  const n = await notice({ text: 'calc', by: 'calc', refresh: { kind: 'calc', id: 'c1' }, children: link });
  assert.equal(n.text, `${r.calc} Lo aggiorna un collega che fa i calcoli.`);
  assert.equal(n.under, link);
});

test('progetto archiviato o record illeggibile: solo che cosa è cambiato', async () => {
  assert.equal((await notice({ text: 'design', by: null, refresh: { kind: 'lift', id: 'd1' } })).text, r.design);
  // the button without the record to make again (unreadable lift design): neither the button nor its sentence
  const n = await notice({ text: 'design', by: 'self', refresh: null });
  assert.equal(n.text, r.design);
  assert.equal(n.under, null);
  assert.equal((await notice({ text: 'archive', by: 'drawer' })).text, r.archive);
});
