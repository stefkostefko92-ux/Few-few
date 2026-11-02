import type { RisultatoArgano } from './calcolo.js';
import type { DatiArgano } from './dati.js';
import { numero, percentuale } from './formato.js';
import { funeDi } from './tabelle.js';

/**
 * Резултатите като редове за показване — едни и същи на страницата и в PDF-а: раздел (скорост, въжета,
 * компенсация, сцепление, натиск), редове „надпис — стойност — мярка“, отметка ОК/НЕ на проверките и
 * заключението на раздела. Текстовете са от речника (`argano.r.*`).
 */

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface Riga {
  etichetta: string;
  valore: string;
  unita?: string;
  /** Проверка: true — минава, false — не; без — само стойност. */
  ok?: boolean;
}

export interface SezioneRisultati {
  key: string;
  titolo: string;
  righe: Riga[];
  esito: { ok: boolean; testo: string };
}

export function righeRisultato(
  r: RisultatoArgano,
  d: DatiArgano,
  t: Translate,
): SezioneRisultati[] {
  const v = r.velocita;
  const velocita: Riga[] = [
    { etichetta: t('argano.r.vNuova'), valore: numero(v.nuova, 3), unita: 'm/s' },
    { etichetta: t('argano.r.vPre'), valore: numero(v.preesistente, 2), unita: 'm/s' },
    { etichetta: t('argano.r.variazione'), valore: percentuale(v.variazione), ok: v.ok },
  ];
  if (v.vvvf) {
    velocita.push(
      {
        etichetta: t('argano.r.giriVvvf'),
        valore: numero(v.vvvf.giriArrotondati, 0),
        unita: 'rpm',
      },
      { etichetta: t('argano.r.hzVvvf'), valore: numero(v.vvvf.hz, 1), unita: 'Hz' },
    );
  }
  const f = r.funi;
  const funi: Riga[] = [
    { etichetta: t('argano.r.numeroFuni'), valore: String(d.funiNumero), ok: f.okNumero },
    {
      etichetta: t('argano.r.diametroFune'),
      valore: numero(f.d, 1),
      unita: 'mm',
      ok: f.okDiametro,
    },
    { etichetta: t('argano.r.rottura'), valore: numero(f.rottura, 0), unita: 'N' },
    { etichetta: t('argano.r.massaFuni'), valore: numero(f.massa, 1), unita: 'kg' },
    { etichetta: t('argano.r.caricoTotale'), valore: numero(f.caricoTotale, 0), unita: 'N' },
    { etichetta: t('argano.r.caricoFune'), valore: numero(f.caricoFune, 0), unita: 'N' },
    {
      etichetta: t('argano.r.sollecitazione'),
      valore: numero(f.sollecitazione, 1),
      unita: 'N/mm²',
    },
    {
      etichetta: t('argano.r.sicurezza', { min: f.sicurezzaMinima }),
      valore: numero(f.sicurezza, 2),
      ok: f.okSicurezza,
    },
    { etichetta: t('argano.r.diametroMinimo'), valore: numero(f.diametroMinimo, 0), unita: 'mm' },
    {
      etichetta: t('argano.r.rapportoDiametri'),
      valore: numero(f.rapportoDiametri, 1),
      ok: f.okDiametri,
    },
  ];
  const c = r.compensazione;
  const compensazione: Riga[] =
    d.compensazione === 'nessuna'
      ? [
          {
            etichetta: t('argano.campo.compensazione'),
            valore: t('argano.opzione.compensazione.nessuna'),
          },
        ]
      : [
          {
            etichetta: t('argano.campo.compensazione'),
            valore: `${d.compNumero} × ${t(`argano.opzione.compensazione.${d.compensazione}`)} ${numero(c.d, c.d % 1 ? 1 : 0)} mm`,
          },
          { etichetta: t('argano.r.compCabina'), valore: numero(c.massaCabina, 1), unita: 'kg' },
          {
            etichetta: t('argano.r.compContrappeso'),
            valore: numero(c.massaContrappeso, 1),
            unita: 'kg',
          },
          ...(c.rapportoDiametri === null
            ? []
            : [
                {
                  etichetta: t('argano.r.compDiametri'),
                  valore: numero(c.rapportoDiametri, 1),
                  ok: c.ok,
                },
              ]),
        ];
  const a = r.aderenza;
  const aderenza: Riga[] = [
    { etichetta: t('argano.r.t1'), valore: numero(a.t1, 0), unita: 'N' },
    { etichetta: t('argano.r.t2'), valore: numero(a.t2, 0), unita: 'N' },
    { etichetta: t('argano.r.t1Alto'), valore: numero(a.t1Alto, 0), unita: 'N' },
    { etichetta: t('argano.r.t2Alto'), valore: numero(a.t2Alto, 0), unita: 'N' },
    { etichetta: t('argano.r.decelerazione'), valore: numero(a.decelerazione, 2), unita: 'm/s²' },
    { etichetta: 'C1 = (g + a) / (g − a)', valore: numero(a.c1, 3) },
    { etichetta: 'C2', valore: numero(a.c2, 2) },
    { etichetta: t('argano.r.f'), valore: numero(a.f, 3) },
    { etichetta: 'e^(f·α)', valore: numero(a.efa, 3) },
    { etichetta: t('argano.r.rapportoBasso'), valore: numero(a.rapportoBasso, 3), ok: a.okBasso },
    { etichetta: t('argano.r.rapportoAlto'), valore: numero(a.rapportoAlto, 3), ok: a.okAlto },
  ];
  const p = r.pressione;
  const pressione: Riga[] = [
    { etichetta: t('argano.r.velocitaFuni'), valore: numero(p.velocitaFuni, 2), unita: 'm/s' },
    { etichetta: t('argano.r.caricoStatico'), valore: numero(p.carico, 0), unita: 'N' },
    { etichetta: t('argano.r.p'), valore: numero(p.p, 2), unita: 'N/mm²', ok: p.ok },
    { etichetta: t('argano.r.pLim'), valore: numero(p.pLim, 2), unita: 'N/mm²' },
  ];
  const esito = (key: string, ok: boolean) => ({
    ok,
    testo: t(`argano.esito.${key}.${ok ? 'ok' : 'no'}`),
  });
  const funiOk = f.okNumero && f.okDiametro && f.okSicurezza && f.okDiametri;
  return [
    {
      key: 'velocita',
      titolo: t('argano.r.velocita'),
      righe: velocita,
      esito: esito('velocita', v.ok),
    },
    { key: 'funi', titolo: t('argano.r.funi'), righe: funi, esito: esito('funi', funiOk) },
    {
      key: 'compensazione',
      titolo: t('argano.r.compensazione'),
      righe: compensazione,
      esito: esito('compensazione', c.ok),
    },
    {
      key: 'aderenza',
      titolo: t('argano.r.aderenza'),
      righe: aderenza,
      esito: esito('aderenza', a.okBasso && a.okAlto),
    },
    {
      key: 'pressione',
      titolo: t('argano.r.pressione'),
      righe: pressione,
      esito: esito('pressione', p.ok),
    },
  ];
}

/** „TELCAL 10 mm, 6 trefoli (6*19 + FC = 114 fili)“. */
export function nomeFune(id: string): string {
  const f = funeDi(id);
  return f ? `${f.marca} ${f.d} mm, ${f.trefoli} trefoli (${f.formazione})` : id;
}
