/**
 * Кое важи за уредбата по годината на монтажа и CE маркировката (полетата `annoInstallazione` и `marcaturaCe`
 * на картата) — без база, без гадаене: липсва ли едното, отговорът е „данните липсват“. Решението за конкретния
 * асансьор е на инженера и на проверяващия; тук е само указателят към правилото.
 *
 * - D.M. 23/07/2009, чл. 1, ал. 1 — за асансьорите, монтирани преди влизането в сила на D.P.R. 162/1999;
 *   чл. 2, ал. 2 — извънредната проверка за анализа на рисковете в срок 2 / 3 / 4 / 5 години (от влизането в
 *   сила на наредбата) за монтираните преди 15/11/1964, 24/10/1979, 9/04/1991, 24/06/1999
 *   (research/norme-ascensori/leggi/dm-23-07-2009.md:34-37 и :48-51). С година, не с ден: в граничната година
 *   са възможни и двата срока — казват се и двата, денят решава.
 * - Промените на съществуващ асансьор: без CE — UNI 10411-1:2024 (електрически) / UNI 10411-2:2024
 *   (хидравлични); с CE — UNI 10411-11:2024 / UNI 10411-12:2024 (rilievi/CLAUDE.md, изчислението за
 *   ограничителя: „Уредба отпреди CE (UNI 10411-1:2024)“, „CE уредба (UNI 10411-11:2024)“, хидравличните —
 *   `uni-10411-2-2024.md` и `uni-10411-12-2024.md`). Само номерът на нормата — без текст от нея.
 */

import { modificheCostruttive } from '../cartelli/da-scheda.js';
import type { Translator } from '../i18n.js';

export type TermineDm2009 = 2 | 3 | 4 | 5;

export type RegimeDm2009 =
  /** Годината или отговорът за CE липсва — нищо не се предполага. */
  | { esito: 'datiMancanti' }
  /** С CE маркировка: асансьорът е по D.P.R. 162/1999 — D.M. 23/07/2009 не се прилага. */
  | { esito: 'ce' }
  /**
   * CE и година преди 1999 (годината на D.P.R. 162/1999, който въвежда 95/16/CE): данните не се връзват —
   * нищо не се препоръчва, докато годината и CE не се проверят.
   */
  | { esito: 'incoerente' }
  /** Без CE, монтиран след 1999: извън D.M. 23/07/2009 (чл. 2, ал. 2 спира при 24/06/1999) — да се провери. */
  | { esito: 'dopoDpr162' }
  /**
   * Без CE, отпреди D.P.R. 162/1999: сроковете по чл. 2, ал. 2 (един, или два в граничната година);
   * `forseDopo` — 1999: монтиран след 24/06/1999, асансьорът вече не е в D.M. 23/07/2009.
   */
  | { esito: 'anteriore'; anni: TermineDm2009[]; forseDopo?: true };

/** Годината на D.P.R. 162/1999: CE с по-ранна година на монтажа е `incoerente`. */
export const ANNO_DPR162 = 1999;

/** D.M. 23/07/2009, чл. 2, ал. 2: „монтиран преди“ → срокът в години. */
export const FASCE_DM2009: ReadonlyArray<{ prima: string; anni: TermineDm2009 }> = [
  { prima: '1964-11-15', anni: 2 },
  { prima: '1979-10-24', anni: 3 },
  { prima: '1991-04-09', anni: 4 },
  { prima: '1999-06-24', anni: 5 },
];

const annoDi = (giorno: string): number => Number(giorno.slice(0, 4));

export function regimeDm2009(anno: number | null, ce: boolean | null): RegimeDm2009 {
  if (ce === true)
    return anno !== null && anno < ANNO_DPR162 ? { esito: 'incoerente' } : { esito: 'ce' };
  if (anno === null || ce === null || !Number.isInteger(anno)) return { esito: 'datiMancanti' };
  const ultima = FASCE_DM2009.at(-1)!;
  if (anno > annoDi(ultima.prima)) return { esito: 'dopoDpr162' };
  // Срокът на пояса е възможен, ако годината може да е преди границата му и не преди предишната.
  const anni = FASCE_DM2009.filter((fascia, i) => {
    const precedente = FASCE_DM2009[i - 1];
    return anno <= annoDi(fascia.prima) && (!precedente || anno >= annoDi(precedente.prima));
  }).map((fascia) => fascia.anni);
  return anno === annoDi(ultima.prima)
    ? { esito: 'anteriore', anni, forseDopo: true }
    : { esito: 'anteriore', anni };
}

/** Частта на UNI 10411 за промените по CE и вида; null — CE или видът липсват. */
export function normaModifiche(ce: boolean | null, tipoImpianto: readonly string[]): string | null {
  if (ce === null) return null;
  const idraulico = tipoImpianto.includes('IDRAULICO');
  const fune = tipoImpianto.includes('ELETTRICO') || tipoImpianto.includes('GEARLESS');
  if (idraulico === fune) return null;
  if (ce) return idraulico ? 'UNI 10411-12:2024' : 'UNI 10411-11:2024';
  return idraulico ? 'UNI 10411-2:2024' : 'UNI 10411-1:2024';
}

export interface RiferimentiNormativi {
  /** Редовете за D.M. 23/07/2009 и за UNI 10411 — или подканата да се попълнят годината и CE. */
  righe: string[];
  /** Напомнянето за извънредната проверка при modifica costruttiva (src/cartelli/da-scheda.ts); null — няма. */
  modifica: string | null;
}

/** Каквото страницата на картата казва под табелата — с думи от речника (`normativa.*`). */
export function riferimentiNormativi(
  scheda: Record<string, unknown>,
  t: Translator,
): RiferimentiNormativi {
  const anno = typeof scheda.annoInstallazione === 'number' ? scheda.annoInstallazione : null;
  const ce = typeof scheda.marcaturaCe === 'boolean' ? scheda.marcaturaCe : null;
  const tipo = Array.isArray(scheda.tipoImpianto)
    ? scheda.tipoImpianto.filter((v): v is string => typeof v === 'string')
    : [];
  const righe: string[] = [];
  const regime = regimeDm2009(anno, ce);
  if (regime.esito === 'datiMancanti') righe.push(t('normativa.datiMancanti'));
  else if (regime.esito === 'incoerente')
    righe.push(t('normativa.incoerente', { anno: String(anno) }));
  else if (regime.esito === 'ce') righe.push(t('normativa.dm2009.ce'));
  else if (regime.esito === 'dopoDpr162')
    righe.push(t('normativa.dm2009.dopoDpr162', { anno: String(anno) }));
  else {
    const [a, b] = regime.anni;
    const anni = b ? t('normativa.anni', { a: a!, b }) : String(a);
    righe.push(t('normativa.dm2009.anteriore', { anno: String(anno), anni }));
    if (b) righe.push(t('normativa.dm2009.confine', { anno: String(anno) }));
    if (regime.forseDopo) righe.push(t('normativa.dm2009.forseDopo'));
  }
  // Данни, които не се връзват, не дават норма за промените.
  const norma = regime.esito === 'incoerente' ? null : normaModifiche(ce, tipo);
  if (norma) righe.push(t('normativa.modifiche', { norma }));
  const parti = modificheCostruttive(scheda).map((p) => t(`normativa.modifica.parte.${p}`));
  const elenco =
    parti.length > 1 ? `${parti.slice(0, -1).join(', ')} e ${parti.at(-1)}` : parti.join('');
  return {
    righe,
    modifica: parti.length ? t('normativa.modifica.testo', { parti: elenco }) : null,
  };
}
