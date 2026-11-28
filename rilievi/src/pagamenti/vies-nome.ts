/**
 * Името от VIES срещу декларираното от клиента (прегледът на Данъчника, 28 ноември 2026 — H1; чл. 18, пар. 1, б. „а“
 * от Регламент за изпълнение (ЕС) № 282/2011: доставчикът получава потвърждение на номера „and of the associated
 * name and address“). Без база. Сравнението е след нормализиране — малки букви, без ударения и пунктуация, без
 * правната форма („S.r.l.“, „srl“, „S.p.A.“, „SNC“, „SAS“, „ditta“ …); размито сравнение няма. Разминаването НЕ
 * спира продажбата: на реда „Da fatturare“ стои бележка, а решението е на MASTER преди фактурата. Не е данъчен съвет.
 */

/** Правните форми като цели думи (след махането на точките: „S.r.l.“ → „srl“). */
const FORME = new Set([
  // Италия
  'srl',
  'srls',
  'spa',
  'sapa',
  'snc',
  'sas',
  'ss',
  'scarl',
  'scrl',
  'scpa',
  'soc',
  'coop',
  'ditta',
  'unipersonale',
  // Други държави от ЕС — най-честите
  'gmbh',
  'ag',
  'kg',
  'ohg',
  'ug',
  'sa',
  'sarl',
  'sasu',
  'eurl',
  'bv',
  'nv',
  'vof',
  'ltd',
  'limited',
  'plc',
  'sl',
  'slu',
  'lda',
  'eood',
  'ood',
  'ead',
  'ad',
  'et',
  'sro',
  'as',
  'oy',
  'ab',
  'aps',
  'kft',
  'zrt',
  'doo',
]);

/** Изписаните правни форми (след махането на ударенията и пунктуацията). */
const FORME_ESTESE = [
  'societa a responsabilita limitata semplificata',
  'societa a responsabilita limitata',
  'societa in accomandita per azioni',
  'societa in accomandita semplice',
  'societa in nome collettivo',
  'societa per azioni',
  'societa semplice',
  'societa cooperativa',
  'sp z o o',
];

/** Името без главни букви, ударения, пунктуация и правна форма; празно — нищо не остава. */
export function nomeNormalizzato(raw: string): string {
  let s = raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    // Точките вътре в съкращение не делят думата: „s.r.l.“ → „srl“, „s.p.a.“ → „spa“.
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  for (const forma of FORME_ESTESE) s = ` ${s} `.split(` ${forma} `).join(' ').trim();
  const parole = s.split(' ').filter((parola) => parola !== '');
  // Двубуквената форма („as“, „ab“, „et“, „sa“, „ss“ …) е форма само в началото или в края — вътре е част от
  // името („Lift AS Service“). По-дългите („srl“, „sas“, „ditta“) — навсякъде (ревюто на Кодаджията).
  return parole
    .filter(
      (parola, i) => !FORME.has(parola) || (parola.length <= 2 && i > 0 && i < parole.length - 1),
    )
    .join(' ');
}

export type ConfrontoNome = 'uguale' | 'diverso' | 'assente';

/** „---“ и празното са „не се съобщава“ (vies.ts пази тогава null). */
const vuoto = (v: string | null | undefined): boolean => !v || /^[\s-]*$/.test(v);

export function confrontaNomeVies(
  dichiarato: string,
  vies: string | null | undefined,
): ConfrontoNome {
  if (vuoto(vies)) return 'assente';
  // С интервалите: „Ross I“ не е „Rossi“.
  const a = nomeNormalizzato(dichiarato);
  const b = nomeNormalizzato(vies!);
  return a !== '' && a === b ? 'uguale' : 'diverso';
}

export interface PerAvvisoVies {
  regimeIva: string;
  viesAt: Date | null;
  viesNome: string | null;
  ragioneSociale: string;
}

/**
 * Бележката на реда за фактуриране: само при обратно начисляване с номер, потвърден от VIES (`viesAt`). Българският
 * ДДС (български номер или номер извън VIES) няма име от VIES за сравнение; плащане отпреди проверката — също.
 */
export function avvisoNomeVies(p: PerAvvisoVies): 'diverso' | 'assente' | null {
  if (p.regimeIva !== 'inversione' || !p.viesAt) return null;
  const esito = confrontaNomeVies(p.ragioneSociale, p.viesNome);
  return esito === 'uguale' ? null : esito;
}
