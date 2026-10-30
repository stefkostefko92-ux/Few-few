// The registry of the RT after the owner's model (round 52): every entry complete with a unique id and a status, every
// constant of KR2 and of the areas' registries stated by an entry whose text carries its value (Italian format), and no
// entry with a broken text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KR2 } from '@/lib/rt2/norme';
import { K_AMM } from '@/lib/rt2/norme-amm';
import { K_CQPL } from '@/lib/rt2/norme-cqpl';
import { K_GUIDE } from '@/lib/rt2/norme-guide';
import { VOCI_RT2 } from '@/lib/rt2/norme-voci';

const it = (x: number): string => String(x).replace('.', ',');
const REGISTRI: readonly [string, Readonly<Record<string, unknown>>][] = [['KR2', KR2], ['K_AMM', K_AMM], ['K_CQPL', K_CQPL], ['K_GUIDE', K_GUIDE]];

test('rt2-norme: voci complete, identificativi unici, uno stato del registro', () => {
  const ids = VOCI_RT2.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'identificativi duplicati');
  for (const v of VOCI_RT2) {
    for (const f of ['titolo', 'valore', 'riferimento', 'fonte', 'area'] as const) assert.ok(v[f].trim().length > 0, `${v.id}: ${f} vuoto`);
    assert.ok(['confermato', 'da_verificare', 'stima', 'derivazione', 'scelta', 'prassi'].includes(v.stato), `${v.id}: stato`);
    assert.ok(!/undefined|NaN|\[object/.test(`${v.titolo} ${v.valore} ${v.riferimento} ${v.fonte} ${v.nota ?? ''}`), `${v.id}: testo rotto`);
  }
});

test('rt2-norme: ogni costante ha la sua voce, che ne scrive il valore', () => {
  for (const [nome, K] of REGISTRI) {
    for (const [k, val] of Object.entries(K)) {
      const voci = VOCI_RT2.filter((v) => v.costanti?.includes(k));
      assert.ok(voci.length > 0, `${nome}.${k} senza voce`);
      if (typeof val === 'number') assert.ok(voci.some((v) => v.valore.includes(it(val))), `${nome}.${k}: nessuna voce scrive ${it(val)}`);
    }
  }
});
