import { numero as formatoNumero } from '../argano/formato.js';
import type { Translator } from '../i18n.js';
import {
  normaDeiLimiti,
  numero,
  primaDelCe,
  type DatiLimitatore,
  type RisultatoLimitatore,
} from './calcolo.js';

/**
 * Резултатът с думи — един и същ на страницата и в PDF-а, без обяснения (собственикът, 7 ноември 2026 —
 * „il risultato senza troppe spiegazioni“): между кои стойности се настройва V1 (с 2 знака — по тях се
 * настройва), точният праг на нормата, кога действа контактът и по коя норма и точка са границите; иначе —
 * защо няма праг и пак по коя норма.
 */

export interface SintesiLimitatore {
  vn: string;
  tipo: string;
  /** Нормата при монтажа — цялото име. */
  norma: string;
  /** Какво се сменя заедно с ограничителя. */
  intervento: string;
  /** „UNI EN 81-20:2020 — UNI 10411-1:2024, punto 6.7“ — по коя норма и точка са границите. */
  applicata: string;
  /** „da 1,84 a 2,15 m/s“ — null, когато няма допустим праг. */
  v1: string | null;
  /** „da 1,84 m/s (incluso) a 2,15625 m/s (escluso)“ — null, когато няма допустим праг. */
  limite: string | null;
  /** „Prima di V1“ или „Al più tardi a V1“. */
  contatto: string | null;
  /**
   * D.P.R. 1497/1963 с моментален парашут над 0,50 m/s: при montalettighe кат. A там е нужен прогресивен
   * (art. 32.3) — картата не знае категорията, затова само предупреждение.
   */
  avviso: string | null;
  /** Защо няма праг (недопустим вид, норма без стойности в нашите бележки). */
  motivo: string | null;
}

/** Числото по италиански, без излишни нули: 2,15625 · 1,5 · 1,6. */
function cifra(v: number, decimaliMax = 5): string {
  const fisso = formatoNumero(v, decimaliMax);
  return fisso.includes(',') ? fisso.replace(/0+$/, '').replace(/,$/, '') : fisso;
}

export function sintesiLimitatore(
  d: DatiLimitatore,
  r: RisultatoLimitatore,
  t: Translator,
): SintesiLimitatore {
  const ammesso = numero(r.sogliaMax) && r.max2 !== null;
  const max = numero(r.sogliaMax) ? r.sogliaMax : 0;
  const contatto = ammesso && r.momento ? t(`limitatore.esito.${r.momento}`) : null;
  // UNI 10411-1:2024 за уредбите отпреди CE, UNI 10411-11:2024 за CE — точката по смяната.
  const gruppo = primaDelCe(d.norma) ? 'primaCe' : 'ce';
  // Без долен праг (D.P.R. 1497/1963, art. 32.2) — само „fino a“; горният праг е включен (+40/33/25 %),
  // а при V ≤ 0,60 m/s — „sotto 0,85 m/s“, изключен.
  const conMinimo = ammesso && r.sogliaMin !== null && r.min2 !== null;
  const dpr = normaDeiLimiti(d) === 'dpr-1497-1963';
  const limiteSenzaMinimo = () =>
    r.maxIncluso && r.aumento !== null
      ? t('limitatore.r.limiteFino', { max: cifra(max), perc: 100 + r.aumento })
      : t('limitatore.r.limiteSotto', { max: cifra(max) });
  return {
    vn: `${cifra(d.vn)} m/s`,
    tipo: t(`limitatore.opzione.tipo.${d.tipo}`),
    // В резултата и в PDF-а — цялото име; в менюто — краткото (събира се на телефон).
    norma: t(`limitatore.nomeNorma.${d.norma}`),
    intervento: t(`limitatore.opzione.intervento.${d.intervento}`),
    applicata: t('limitatore.r.applicataValore', {
      norma: t(`limitatore.nomeNorma.${normaDeiLimiti(d)}`),
      punto: t(`limitatore.riferimento.${gruppo}.${d.intervento}`),
    }),
    v1: !ammesso
      ? null
      : conMinimo
        ? t('limitatore.r.v1Valore', {
            da: formatoNumero(r.min2!, 2),
            a: formatoNumero(r.max2!, 2),
          })
        : t('limitatore.r.v1Fino', { a: formatoNumero(r.max2!, 2) }),
    limite: !ammesso
      ? null
      : conMinimo
        ? t('limitatore.r.limiteValore', { min: cifra(r.sogliaMin!), max: cifra(max) })
        : limiteSenzaMinimo(),
    contatto,
    avviso:
      ammesso && dpr && d.tipo !== 'progressivo' && d.vn > 0.5
        ? t('limitatore.esito.montalettighe')
        : null,
    motivo: ammesso ? null : t(`limitatore.esito.${String(r.sogliaMax)}`),
  };
}
