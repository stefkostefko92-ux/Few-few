// The ropes of the machine calculation (the owner, 2 November 2026 — "manca la cordatura, classe e
// formazione"; a manual choice for compensation ropes and chains too): the table ropes keep the
// construction, strands and grade of the RT workbook; the lay is chosen for any rope; a rope typed by hand
// can carry strands, construction and grade; a compensation outside the tables is typed by hand and
// weighs exactly like the same size taken from the tables. A calculation saved before all this reads the
// same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { calcolaArgano } from '../src/argano/calcolo.js';
import { formDaDati } from '../src/argano/da-scheda.js';
import { datiSalvati, parseDatiArgano, type DatiArgano } from '../src/argano/dati.js';
import {
  caratteristicheFune,
  datiFune,
  etichettaFune,
  formazioneLeggibile,
} from '../src/argano/fune.js';
import { righeRisultato } from '../src/argano/righe.js';
import { funeDi, FUNI } from '../src/argano/tabelle.js';
import { translatorFor } from '../src/i18n.js';

const RT = JSON.parse(readFileSync(join(import.meta.dirname, 'argano-rt.json'), 'utf8')) as {
  casi: Record<string, { dati: DatiArgano }>;
};
const BASE = RT.casi.A_2v_11_cuneo!.dati;
const FORM = formDaDati(BASE as unknown as Record<string, unknown>);
const t = translatorFor('it');

const riga = (dati: DatiArgano, sezione: string, etichetta: string) =>
  righeRisultato(calcolaArgano(dati), dati, t)
    .find((s) => s.key === sezione)!
    .righe.find((r) => r.etichetta === etichetta);

describe('the table ropes', () => {
  it('read their construction plainly and keep the data of the workbook', () => {
    assert.equal(formazioneLeggibile('6*19S + FC = 114 fili'), '6×19S + FC, 114 fili');
    assert.equal(formazioneLeggibile('8*19 + FC = 152 fili', true), '8×19 + FC');
    const f = funeDi('donati-10-152')!;
    assert.equal(etichettaFune(f), 'Ø 10 mm · 8×19S + FC');
    assert.deepEqual(datiFune(f), {
      formazione: '8×19S + FC, 152 fili',
      trefoli: '8',
      classe: '1370/1770 N/mm²',
      sezione: '36,5 mm²',
      rottura: '46.000 N',
      massa: '0,34 kg/m',
    });
    // The construction says the number of strands it has.
    for (const fune of FUNI) assert.ok(fune.formazione.startsWith(`${fune.trefoli}*`), fune.id);
  });

  it('show construction, strands, grade and lay among the results', () => {
    const dati = { ...BASE, funeCordatura: 'zZ' as const };
    assert.equal(riga(dati, 'funi', 'Costruttore')?.valore, 'TELCAL');
    assert.equal(riga(dati, 'funi', 'Formazione')?.valore, '6×19 + FC, 114 fili');
    assert.equal(riga(dati, 'funi', 'Numero trefoli')?.valore, '6');
    assert.deepEqual(
      [
        riga(dati, 'funi', 'Classe di resistenza dei fili')?.valore,
        riga(dati, 'funi', 'Classe di resistenza dei fili')?.unita,
      ],
      ['1370/1770', 'N/mm²'],
    );
    assert.equal(riga(dati, 'funi', 'Cordatura')?.valore, 'Parallela (Lang) destra (zZ)');
    assert.equal(riga(BASE, 'funi', 'Cordatura')?.valore, '—', 'no lay chosen');
  });
});

describe('the lay of the rope', () => {
  it('is one of the four of EN 12385-2, for a table rope or one typed by hand, and may stay empty', () => {
    assert.equal(parseDatiArgano({ ...FORM, funeCordatura: 'sZ' }).dati?.funeCordatura, 'sZ');
    const vuota = parseDatiArgano({ ...FORM, funeCordatura: '' }).dati!;
    assert.ok(!('funeCordatura' in vuota), 'nothing stored when empty');
    assert.deepEqual(parseDatiArgano({ ...FORM, funeCordatura: 'Z' }).errori, {
      funeCordatura: 'option',
    });
    assert.equal(datiSalvati({ ...BASE, funeCordatura: 'ZZ' }), null);
  });
});

describe('a rope typed by hand', () => {
  const ALTRO = {
    ...FORM,
    fune: 'altro',
    altroD: '10,5',
    altroSezione: '41,2',
    altroRottura: '52000',
    altroMassa: '0,39',
  };

  it('can carry strands, construction and grade; what is left empty is not stored', () => {
    const { dati, errori } = parseDatiArgano({
      ...ALTRO,
      altroTrefoli: '8',
      altroFormazione: '  8×19 Seale\t+ FC ',
      altroClasse: '1370 / 1770',
    });
    assert.deepEqual(errori, {});
    assert.deepEqual(dati!.funeAltro, {
      d: 10.5,
      sezione: 41.2,
      rottura: 52_000,
      massa: 0.39,
      trefoli: 8,
      formazione: '8×19 Seale + FC',
      classe: '1370/1770',
    });
    assert.deepEqual(parseDatiArgano(ALTRO).dati!.funeAltro, {
      d: 10.5,
      sezione: 41.2,
      rottura: 52_000,
      massa: 0.39,
    });
    assert.equal(riga(dati!, 'funi', 'Costruttore')?.valore, 'Dati a mano');
    assert.equal(riga(parseDatiArgano(ALTRO).dati!, 'funi', 'Formazione')?.valore, '—');
  });

  it('refuses a grade that is not N/mm², a construction too long and half strands', () => {
    const { errori } = parseDatiArgano({
      ...ALTRO,
      altroTrefoli: '8,5',
      altroFormazione: 'x'.repeat(41),
      altroClasse: 'alta',
    });
    assert.deepEqual(errori, {
      altroTrefoli: 'integer',
      altroFormazione: 'tooLong',
      altroClasse: 'classe',
    });
  });

  it('goes back into the form and is parsed again to the same input', () => {
    const { dati } = parseDatiArgano({
      ...ALTRO,
      funeCordatura: 'zS',
      altroTrefoli: '6',
      altroFormazione: '6×19 Warrington + FC',
      altroClasse: '1570',
    });
    const again = parseDatiArgano(formDaDati(dati! as unknown as Record<string, unknown>));
    assert.deepEqual(again.errori, {});
    assert.deepEqual(again.dati, dati);
    assert.deepEqual(caratteristicheFune(dati!).cordatura, 'zS');
  });
});

describe('a compensation outside the tables', () => {
  const COMP = {
    ...FORM,
    compensazione: 'funi',
    compNumero: '2',
    diametroTenditore: '400',
  };

  it('is typed by hand and weighs like the same size from the tables', () => {
    const mano = parseDatiArgano({
      ...COMP,
      compMisura: 'altro',
      compAltroD: '11',
      compAltroMassa: '0,42',
    });
    assert.deepEqual(mano.errori, {});
    assert.deepEqual(mano.dati!.compAltro, { d: 11, massa: 0.42 });
    const tabella = parseDatiArgano({ ...COMP, compMisura: '11' });
    assert.deepEqual(tabella.errori, {});
    assert.ok(!('compAltro' in tabella.dati!));
    const a = calcolaArgano(mano.dati!);
    const b = calcolaArgano(tabella.dati!);
    assert.deepEqual(a.compensazione, b.compensazione);
    assert.deepEqual(a.aderenza, b.aderenza);
    assert.equal(a.compensazione.rapportoDiametri, 400 / 11);
    assert.equal(
      riga(mano.dati!, 'compensazione', 'Compensazione')?.valore,
      '2 × Funi 11 mm (Dati a mano)',
    );
    assert.equal(
      riga(mano.dati!, 'compensazione', 'Massa lineare della compensazione')?.valore,
      '0,42',
    );
  });

  it('wants its size and mass, in range, and comes back into the form as "Altra misura"', () => {
    const { errori } = parseDatiArgano({
      ...COMP,
      compensazione: 'catene',
      compMisura: 'altro',
      compAltroD: '50',
    });
    assert.deepEqual(errori, { compAltroD: 'range', compAltroMassa: 'required' });
    const { dati } = parseDatiArgano({
      ...COMP,
      compensazione: 'catene',
      compMisura: 'altro',
      compAltroD: '9,5',
      compAltroMassa: '1,6',
    });
    const form = formDaDati(dati! as unknown as Record<string, unknown>);
    assert.deepEqual(
      [form.compMisura, form.compAltroD, form.compAltroMassa],
      ['altro', '9,5', '1,6'],
    );
    assert.deepEqual(parseDatiArgano(form).dati, dati);
  });

  it('is ignored without a compensation', () => {
    const { dati } = parseDatiArgano({ ...FORM, compMisura: 'altro', compAltroD: '11' });
    assert.ok(dati && !('compAltro' in dati));
  });
});

describe('a calculation saved before the rope data', () => {
  it('reads the same: no lay, no strands or grade typed by hand, compensation from the tables', () => {
    for (const [nome, caso] of Object.entries(RT.casi)) {
      const dati = datiSalvati(caso.dati);
      assert.deepEqual(dati, caso.dati, nome);
      assert.deepEqual(calcolaArgano(dati!), calcolaArgano(caso.dati), nome);
    }
    const altro = datiSalvati({
      ...BASE,
      fune: 'altro',
      funeAltro: { d: 10.5, sezione: 41.2, rottura: 52_000, massa: 0.39 },
    });
    assert.ok(altro);
    assert.equal(caratteristicheFune(altro).trefoli, null);
  });
});
