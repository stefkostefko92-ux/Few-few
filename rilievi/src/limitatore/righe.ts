import { numero as formatoNumero } from '../argano/formato.js';
import type { Translator } from '../i18n.js';
import { numero, type DatiLimitatore, type RisultatoLimitatore } from './calcolo.js';

/**
 * Резултатът с думи — един и същ на страницата и в PDF-а, без обяснения (собственикът, 7 ноември 2026 —
 * „il risultato senza troppe spiegazioni“): между кои стойности се настройва V1 (с 2 знака — по тях се
 * настройва), точният праг на нормата и кога действа контактът; иначе — само защо няма праг.
 */

export interface SintesiLimitatore {
  vn: string;
  tipo: string;
  norma: string;
  /** „da 1,84 a 2,15 m/s“ — null, когато няма допустим праг. */
  v1: string | null;
  /** „da 1,84 m/s (incluso) a 2,15625 m/s (escluso)“ — null, когато няма допустим праг. */
  limite: string | null;
  /** „Prima di V1“, „Al più tardi a V1“ или двата случая на UNI EN 81-1:1987. */
  contatto: string | null;
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
  const contatto = !ammesso
    ? null
    : r.momento === 'alPiuTardi1987' && r.contatto115 !== null
      ? t('limitatore.esito.alPiuTardi1987', { v: cifra(r.contatto115, 2) })
      : r.momento
        ? t(`limitatore.esito.${r.momento}`)
        : null;
  // Без долен праг (D.P.R. 1497/1963, art. 32) — само „fino a“, горният праг е включен.
  const conMinimo = ammesso && r.sogliaMin !== null && r.min2 !== null;
  return {
    vn: `${cifra(d.vn)} m/s`,
    tipo: t(`limitatore.opzione.tipo.${d.tipo}`),
    // В резултата и в PDF-а — цялото име; в менюто — краткото (събира се на телефон).
    norma: t(`limitatore.nomeNorma.${d.norma}`),
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
        : t('limitatore.r.limiteFino', { max: cifra(max) }),
    contatto,
    motivo: ammesso ? null : t(`limitatore.esito.${String(r.sogliaMax)}`),
  };
}
