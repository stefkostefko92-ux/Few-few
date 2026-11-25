// The content of a page without the layers that are off (src/ordini/pdf-livelli-contenuto.ts) — the text of
// the page read operator by operator, without a document. The DMG forms keep three languages as layers of one
// page (tests/pdf-livelli.test.ts tells the whole story); here: what is on stays without its wrapper, what is
// off is no longer drawn but keeps its effect on what follows, and what cannot be taken out safely stops.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { senzaLivelliSpenti } from '../src/ordini/pdf-livelli-contenuto.js';

/** MC0 and MC1 are on, MC2 is off; anything else is not a layer. */
const stato = (nome: string) =>
  nome === 'MC2' ? 'spento' : nome === 'MC0' || nome === 'MC1' ? 'acceso' : null;
const piatto = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('the content of a page without the layers that are off', () => {
  it('keeps what is on, without its wrapper, and stops drawing what is off', () => {
    const pagina =
      '/OC /MC0 BDC q 1 0 0 1 5 5 cm 0 0 m 1 1 l S Q EMC\n' +
      '/OC /MC1 BDC BT /F1 9 Tf 10 20 Td (Ciao) Tj ET EMC\n' +
      '/OC /MC2 BDC BT /F2 8 Tf 0.5 g 10 20 Td (Hello \\) EMC \\( BDC) Tj [(a) 3 <0042>] TJ ET ' +
      '0 0 m 5 5 l h f* q 2 0 0 2 0 0 cm /Im0 Do Q /Sh0 sh EMC\n' +
      'BT 1 1 Td (dopo) Tj ET';
    assert.equal(
      piatto(senzaLivelliSpenti(pagina, stato)),
      'q 1 0 0 1 5 5 cm 0 0 m 1 1 l S Q ' +
        'BT /F1 9 Tf 10 20 Td (Ciao) Tj ET ' +
        // The font and the grey set in the hidden layer still hold for «dopo», as in a viewer with layers.
        'BT /F2 8 Tf 0.5 g 10 20 Td ET 0 0 m 5 5 l h n q 2 0 0 2 0 0 cm Q ' +
        'BT 1 1 Td (dopo) Tj ET',
    );
  });

  it('follows the nesting, strings and comments, never the letters «EMC» alone', () => {
    const pagina =
      '/OC /MC2 BDC /Span <</Lang (fr) /Alt (EMC)>> BDC BT (uno) Tj ET EMC ' +
      '/Artifact BMC BT (due) Tj ET EMC % EMC in a comment\n' +
      'BT (tre) \' 1 2 (quattro) " ET EMC BT (visibile) Tj ET';
    assert.equal(
      piatto(senzaLivelliSpenti(pagina, stato)),
      '/Span <</Lang (fr) /Alt (EMC)>> BDC BT ET EMC /Artifact BMC BT ET EMC % EMC in a comment ' +
        'BT T* 1 Tw 2 Tc T* ET BT (visibile) Tj ET',
    );
  });

  it('leaves a page without layers byte for byte as it was', () => {
    const pagina =
      '/Span <</MCID 0>> BDC BT /F1 9 Tf (testo) Tj ET EMC\n/OC /Altro BDC 0 0 1 1 re f EMC\n' +
      '/P BMC q Q EMC';
    assert.equal(senzaLivelliSpenti(pagina, stato), pagina);
  });

  it('never glues what it writes to the operator before it', () => {
    // «Td(x)'» has no space before the string: the «T*» that replaces the row must not become «TdT*».
    assert.equal(
      piatto(senzaLivelliSpenti("BT 0 0 Td /OC /MC2 BDC 1 2 Td(x)' EMC ET", stato)),
      'BT 0 0 Td 1 2 Td T* ET',
    );
    assert.equal(
      piatto(senzaLivelliSpenti('/OC /MC2 BDC 0 0 m 5 5 l h(x)pop f EMC', stato)),
      '0 0 m 5 5 l h(x)pop n',
    );
  });

  it('lets visible text follow hidden text only from a place of its own', () => {
    // Hidden text still moves the pen in a viewer with layers: text that goes on from there would land
    // somewhere else once the hidden text is gone — refused, not guessed.
    assert.throws(
      () => senzaLivelliSpenti('BT 0 0 Td /OC /MC2 BDC (Ciao )Tj EMC (Hello)Tj ET', stato),
      /видим текст/,
    );
    // With a place of its own (Td, Tm, T*, a new BT, or the next-line operators) it is the same sheet.
    for (const [pagina, atteso] of [
      [
        'BT 0 0 Td /OC /MC2 BDC (Ciao )Tj EMC 0 -12 Td (Hello)Tj ET',
        'BT 0 0 Td 0 -12 Td (Hello)Tj ET',
      ],
      ["BT 0 0 Td /OC /MC2 BDC (Ciao )Tj EMC (Hello)' ET", "BT 0 0 Td (Hello)' ET"],
      [
        'BT /OC /MC2 BDC (Ciao )Tj EMC ET BT 1 0 0 1 5 5 Tm (Hello)Tj ET',
        'BT ET BT 1 0 0 1 5 5 Tm (Hello)Tj ET',
      ],
    ] as const)
      assert.equal(piatto(senzaLivelliSpenti(pagina, stato)), atteso);
  });

  it('refuses what it cannot take out safely', () => {
    // An inline picture, a layer given in the page itself, text used as a clip inside a hidden layer.
    assert.throws(() => senzaLivelliSpenti('/OC /MC2 BDC BI /W 1 /H 1 ID x EI EMC', stato));
    assert.throws(() => senzaLivelliSpenti('/OC <</Type /OCG>> BDC 0 0 1 1 re f EMC', stato));
    assert.throws(() => senzaLivelliSpenti('/OC /MC2 BDC BT 7 Tr (x) Tj ET EMC', stato));
    // …also when the clipping mode was set before the hidden layer began.
    assert.throws(
      () => senzaLivelliSpenti('BT 7 Tr /OC /MC2 BDC (x) Tj EMC ET', stato),
      /изрязване/,
    );
    assert.throws(() => senzaLivelliSpenti('/OC /MC2 BDC (senza fine', stato));
  });
});
