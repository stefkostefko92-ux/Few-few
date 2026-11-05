import { numero as formatoNumero } from '../argano/formato.js';
import type { Translator } from '../i18n.js';
import {
  numero,
  type DatiLimitatore,
  type RisultatoLimitatore,
  type SogliaMassima,
} from './calcolo.js';

/**
 * Резултатите като редове — едни и същи на страницата и в PDF-а, в реда на листа „Limitatore“ (редове 2–27):
 * входът и сметнатото, мярката, отметката (минава / не минава / липсва) и бележката на листа (колона D —
 * точката на нормата). Текстовете на изходите са дословно от листа (`limitatore.esito.*`).
 */

export interface RigaLimitatore {
  /** Ключът на реда (тестовете, CSS); клетката на листа е в коментара на всеки. */
  key: string;
  etichetta: string;
  valore: string;
  unita?: string;
  /** Проверка: true — минава, false — не минава, null — липсват данни; без — само стойност. */
  ok?: boolean | null;
  nota?: string;
}

export interface SezioneLimitatore {
  key: 'v1' | 'contatto' | 'forza' | 'fune';
  titolo: string;
  righe: RigaLimitatore[];
}

/** Числото по италиански, без излишни нули: 2,15625 · 1,5 · 25.000. */
function cifra(v: number, decimaliMax = 5): string {
  const fisso = formatoNumero(v, decimaliMax);
  return fisso.includes(',') ? fisso.replace(/0+$/, '').replace(/,$/, '') : fisso;
}

export function righeLimitatore(
  d: DatiLimitatore,
  r: RisultatoLimitatore,
  t: Translator,
): SezioneLimitatore[] {
  const vuoto = '—';
  const testoEsito = (codice: string) => t(`limitatore.esito.${codice}`);
  /** Ред с вход от формата; празното — „—“. */
  const ingresso = (key: keyof DatiLimitatore, unita: string, nota?: string): RigaLimitatore => {
    const v = d[key];
    return {
      key,
      etichetta: t(`limitatore.campo.${key}`),
      valore: typeof v === 'number' ? cifra(v) : vuoto,
      ...(typeof v === 'number' && unita ? { unita } : {}),
      ...(nota ? { nota } : {}),
    };
  };
  /** Ред със сметнато число или с текста на листа вместо него („Dato mancante“, „Vn non valida“). */
  const calcolato = (key: string, v: number | string | null, unita: string): RigaLimitatore => ({
    key,
    etichetta: t(`limitatore.r.${key}`),
    valore: v === null ? vuoto : numero(v) ? cifra(v) : testoEsito(v),
    ...(numero(v) && unita ? { unita } : {}),
    nota: t(`limitatore.nota.${key}`),
  });
  const esito = (key: string, codice: string, ok: boolean | null): RigaLimitatore => ({
    key,
    etichetta: t(`limitatore.r.${key}`),
    valore: testoEsito(codice),
    ok,
    nota: t(`limitatore.nota.${key}`),
  });
  const okDi = (codice: string): boolean | null =>
    codice === 'mancante'
      ? null
      : codice === 'entro' || codice === 'coerente' || codice === 'sufficiente';
  const sogliaMax: SogliaMassima = r.sogliaMax;

  return [
    {
      key: 'v1',
      titolo: t('limitatore.sezione.v1'),
      righe: [
        ingresso('vn', 'm/s'),
        {
          key: 'tipo',
          etichetta: t('limitatore.campo.tipo'),
          valore: d.tipo ? t(`limitatore.opzione.tipo.${d.tipo}`) : vuoto,
          nota: t('limitatore.nota.tipo'),
        },
        calcolato('sogliaMin', r.sogliaMin, 'm/s'), // B5
        calcolato('sogliaMax', sogliaMax, 'm/s'), // B6
        ingresso('v1', 'm/s', t('limitatore.nota.v1')), // B7
        esito('esitoV1', r.esitoV1, okDi(r.esitoV1)), // B8
        {
          ...calcolato('min2', r.min2, 'm/s'),
          valore: r.min2 === null ? vuoto : formatoNumero(r.min2, 2),
        }, // B9
        {
          ...calcolato('max2', r.max2, 'm/s'),
          valore: r.max2 === null ? vuoto : formatoNumero(r.max2, 2),
        }, // B10
      ],
    },
    {
      key: 'contatto',
      titolo: t('limitatore.sezione.contatto'),
      righe: [
        ingresso('vc', 'm/s', t('limitatore.nota.vc')), // B12
        {
          key: 'momento',
          etichetta: t('limitatore.r.momento'),
          valore: r.momento ? testoEsito(r.momento) : vuoto,
          nota: t('limitatore.nota.momento'),
        }, // B13
        esito('esitoContatto', r.esitoContatto, okDi(r.esitoContatto)), // B14
      ],
    },
    {
      key: 'forza',
      titolo: t('limitatore.sezione.forza'),
      righe: [
        ingresso('forzaParacadute', 'N'), // B16
        calcolato('forzaMinima', r.forzaMinima, 'N'), // B17
        ingresso('forzaLimitatore', 'N'), // B18
        esito('esitoForza', r.esitoForza, okDi(r.esitoForza)), // B19
      ],
    },
    {
      key: 'fune',
      titolo: t('limitatore.sezione.fune'),
      righe: [
        ingresso('mbl', 'N', t('limitatore.nota.mbl')), // B21
        calcolato('mblMinimo', r.mblMinimo, 'N'), // B22
        esito('esitoMbl', r.esitoMbl, okDi(r.esitoMbl)), // B23
        ingresso('d', 'mm'), // B24
        ingresso('dp', 'mm'), // B25
        calcolato('rapporto', r.rapporto, ''), // B26
        esito('esitoRapporto', r.esitoRapporto, okDi(r.esitoRapporto)), // B27
      ],
    },
  ];
}

/** Листът „Riferimenti“ на файла, в неговия ред (`limitatore.riferimenti.righe.<ключ>`). */
export const RIFERIMENTI = [
  'sogliaMin',
  'sogliaMax',
  'taratura',
  'tipo',
  'contatto',
  'altriContatti',
  'forza',
  'fune',
  'risposta',
  'prova',
  'targa',
  'contatto110',
  'contrappeso',
  'istantaneoContrappeso',
  'diametro6',
  'iso8100',
] as const;
