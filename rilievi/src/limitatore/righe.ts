import { numero as formatoNumero } from '../argano/formato.js';
import type { Translator } from '../i18n.js';
import { numero, type DatiLimitatore, type RisultatoLimitatore } from './calcolo.js';

/**
 * Резултатът с думи — един и същ на страницата и в PDF-а, без обяснения (собственикът, 7 ноември 2026 —
 * „il risultato senza troppe spiegazioni“): между кои стойности се настройва V1 (с 2 знака — по тях се
 * настройва), точният праг на нормата и кога действа контактът; при недопустим вид парашут — само защо.
 */

export interface SintesiLimitatore {
  vn: string;
  tipo: string;
  /** „da 1,84 a 2,15 m/s“ — null, когато няма допустим праг. */
  v1: string | null;
  /** „≥ 1,84 m/s e < 2,15625 m/s“ — null, когато няма допустим праг. */
  limite: string | null;
  /** „Prima di V1“ / „Al più tardi a V1“. */
  contatto: string | null;
  /** Защо няма праг („Paracadute istantaneo non ammesso con Vn > 0,63 m/s …“). */
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
  const ammesso = numero(r.sogliaMax) && r.sogliaMin !== null && r.min2 !== null && r.max2 !== null;
  return {
    vn: `${cifra(d.vn)} m/s`,
    tipo: t(`limitatore.opzione.tipo.${d.tipo}`),
    v1: ammesso
      ? t('limitatore.r.v1Valore', { da: formatoNumero(r.min2!, 2), a: formatoNumero(r.max2!, 2) })
      : null,
    limite: ammesso
      ? t('limitatore.r.limiteValore', {
          min: cifra(r.sogliaMin!),
          max: cifra(r.sogliaMax as number),
        })
      : null,
    contatto: ammesso && r.momento ? t(`limitatore.esito.${r.momento}`) : null,
    motivo: ammesso ? null : t(`limitatore.esito.${String(r.sogliaMax)}`),
  };
}
