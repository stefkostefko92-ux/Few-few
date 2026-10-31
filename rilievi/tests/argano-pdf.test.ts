// The machine calculation around the numbers: the form filled from the machine survey sheet (Italian
// numbers, "1:50" and "2:53", the motor poles, the compensation), a saved calculation read back into the
// form and parsed again to the same input, and the A4 PDF — every case of the workbook, at most two pages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { calcolaArgano } from '../src/argano/calcolo.js';
import { formDaDati, prefillArgano } from '../src/argano/da-scheda.js';
import { parseDatiArgano, type DatiArgano } from '../src/argano/dati.js';
import { renderCalcoloArgano } from '../src/argano/pdf.js';
import { righeRisultato } from '../src/argano/righe.js';
import { translatorFor } from '../src/i18n.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

const RT = JSON.parse(readFileSync(join(import.meta.dirname, 'argano-rt.json'), 'utf8')) as {
  casi: Record<string, { dati: DatiArgano }>;
};
const t = translatorFor('it');

describe('the calculation form filled from the machine survey sheet', () => {
  it('reads Italian numbers, the reduction ratio, the drive, the poles and the compensation', () => {
    const form = prefillArgano(
      {
        portata: '630 kg',
        pesoCabina: '1.100',
        pesoContrappeso: '1.415 kg',
        velocita: '1,6 m/s',
        corsa: 'Mt 32',
        taglia11: true,
        macchina: 'basso',
        rapportoRiduzione: '1/50',
        diametroPuleggia: 'Ø 520',
        cuneo: '40°',
        avvolgimento: '180°',
        funiN: '5',
        funiDiametro: '11',
        motoreAc2: true,
        giri: '1400',
        poli: '6',
        catenaSi: true,
      },
      320,
    );
    assert.deepEqual(form, {
      portata: '630',
      massaCabina: '1100',
      massaContrappeso: '1415',
      velocita: '1,6',
      corsa: '32',
      sospensione: '1:1',
      macchina: 'basso',
      azionamento: '2V',
      giriMotore: '1400',
      motoreVvvf: '1000',
      rapportoA: '1',
      rapportoB: '50',
      diametroPuleggia: '520',
      gola: 'cuneo',
      angoloGola: '40',
      angoloAvvolgimento: '180',
      funiNumero: '5',
      fune: 'telcal-11-152',
      compensazione: 'catene',
    });
  });

  it('falls back on the load of the scheda and leaves the rest empty without a survey sheet', () => {
    assert.deepEqual(prefillArgano(null, 480), { portata: '480' });
    assert.deepEqual(prefillArgano({ rapportoRiduzione: '2:53' }, null), {
      rapportoA: '2',
      rapportoB: '53',
    });
  });
});

describe('a saved calculation', () => {
  const altro: DatiArgano = {
    ...RT.casi.A_2v_11_cuneo!.dati,
    fune: 'altro',
    funeAltro: { d: 10.5, sezione: 41.2, rottura: 52_000, massa: 0.39 },
  };
  const casi = { ...RT.casi, altro: { dati: altro } };

  it('goes back into the form and is parsed again to the same input', () => {
    for (const [nome, caso] of Object.entries(casi)) {
      const { dati, errori } = parseDatiArgano(formDaDati(caso.dati));
      assert.deepEqual(errori, {}, nome);
      assert.deepEqual(dati, caso.dati, nome);
    }
  });

  it(
    'is drawn as an A4 PDF of at most two pages, with the company head',
    { skip: !fontsHere && 'DejaVu fonts are not installed here' },
    async () => {
      for (const [nome, caso] of Object.entries(casi)) {
        const pdf = await renderCalcoloArgano({
          dati: caso.dati,
          sezioni: righeRisultato(calcolaArgano(caso.dati), caso.dati, t),
          t,
          impianto: { indirizzo: 'Via Roma 1, Milano', matricola: '0012345', numeroImpianto: '7' },
          salvato: { quando: '31/10/2026, 10:00', autore: 'Giulia Bianchi' },
          testata: {
            intestazione: { nome: 'Ascensori Esempio S.r.l.', righe: ['Via Roma 12, Milano'] },
            logo: null,
          },
          fontDir,
        });
        const doc = await PDFDocument.load(pdf);
        assert.ok(
          doc.getPageCount() >= 1 && doc.getPageCount() <= 2,
          `${nome}: ${doc.getPageCount()} pages`,
        );
        const { width, height } = doc.getPage(0).getSize();
        assert.deepEqual([Math.round(width), Math.round(height)], [595, 842], nome);
      }
    },
  );
});
