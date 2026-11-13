/**
 * Съдържанието на страница (операторите на PDF) без изключените слоеве — без документ и без pdf-lib, само
 * текст: четене оператор по оператор и махане на рисуването в изключен слой. Документът — pdf-livelli.ts.
 */

export type StatoLivello = 'acceso' | 'spento';

interface Operatore {
  nome: string;
  /** Началото на първия операнд (без операнди — на самия оператор) и краят на оператора. */
  da: number;
  a: number;
  operandi: string[];
}

const SPAZI = '\u0000\t\n\f\r ';
const DELIMITATORI = '()<>[]{}/%';
const NUMERO = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export const rotto = (cosa: string): Error => new Error(`pdf-livelli: ${cosa}`);

/** Краят на обекта, който започва на `i` (низ, шестнадесетичен низ, речник, масив, име, число или дума). */
function fineOggetto(s: string, i: number): number {
  const c = s[i]!;
  if (c === '(') {
    let aperte = 0;
    for (let j = i; j < s.length; j += 1) {
      if (s[j] === '\\') j += 1;
      else if (s[j] === '(') aperte += 1;
      else if (s[j] === ')' && (aperte -= 1) === 0) return j + 1;
    }
    throw rotto('низ без край');
  }
  if (c === '<' && s[i + 1] !== '<') {
    const fine = s.indexOf('>', i);
    if (fine === -1) throw rotto('шестнадесетичен низ без край');
    return fine + 1;
  }
  if (c === '[' || c === '<') {
    const chiude = c === '[' ? ']' : '>>';
    let j = i + (c === '[' ? 1 : 2);
    for (;;) {
      j = dopoSpazi(s, j);
      if (j >= s.length) throw rotto('масив или речник без край');
      if (s.startsWith(chiude, j)) return j + chiude.length;
      j = fineOggetto(s, j);
    }
  }
  if (c === ')' || c === '>' || c === ']' || c === '{' || c === '}') throw rotto(`излишно „${c}“`);
  let j = i + 1;
  while (j < s.length && !SPAZI.includes(s[j]!) && !DELIMITATORI.includes(s[j]!)) j += 1;
  return j;
}

/** След празното и коментарите („%“ до края на реда). */
function dopoSpazi(s: string, i: number): number {
  let j = i;
  for (;;) {
    while (j < s.length && SPAZI.includes(s[j]!)) j += 1;
    if (s[j] !== '%') return j;
    while (j < s.length && s[j] !== '\n' && s[j] !== '\r') j += 1;
  }
}

/** Операторите на съдържанието един по един, всеки с операндите си и мястото си в текста. */
function* operatori(s: string): Generator<Operatore> {
  let operandi: string[] = [];
  let da = -1;
  for (let i = dopoSpazi(s, 0); i < s.length; i = dopoSpazi(s, i)) {
    const fine = fineOggetto(s, i);
    const pezzo = s.slice(i, fine);
    const operando =
      DELIMITATORI.includes(pezzo[0]!) ||
      NUMERO.test(pezzo) ||
      pezzo === 'true' ||
      pezzo === 'false' ||
      pezzo === 'null';
    if (operando) {
      if (da === -1) da = i;
      operandi.push(pezzo);
    } else {
      // Картинка в самото съдържание: данните ѝ не са оператори — не се среща в нашите формуляри.
      if (pezzo === 'BI') throw rotto('картинка в съдържанието (BI)');
      yield { nome: pezzo, da: da === -1 ? i : da, a: fine, operandi };
      operandi = [];
      da = -1;
    }
    i = fine;
  }
}

/** Рисуването на път: в изключен слой пътят само се приключва („n“) — изрязването след „W“ остава. */
const DIPINGE = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*']);
/** Картинка (XObject) и преливка: в изключен слой не се рисуват. */
const MOSTRA = new Set(['Do', 'sh']);
/** Показването на текст: мести и мястото за писане. */
const TESTO = new Set(['Tj', 'TJ', "'", '"']);
/** Операторите, които дават на текста ново място, независимо от написаното преди тях. */
const POSIZIONA = new Set(['BT', 'Td', 'TD', 'Tm', 'T*']);

const nomeDi = (operando: string): string =>
  operando
    .slice(1)
    .replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/**
 * Съдържанието на страница без изключените слоеве. `stato` казва за името от `/Properties` дали е включен
 * слой, изключен слой, или не е слой. Обвивката на слой („/OC /MC1 BDC … EMC“) се маха; в изключен слой
 * се маха само рисуването — шрифтът, цветът, матриците и изрязването, зададени там, остават, защото важат
 * и за следващото (ISO 32000-1, 8.11.3.2: скритото не се рисува, но състоянието се променя). Всичко друго
 * остава байт по байт. Каквото не може да се махне сигурно, спира с грешка — картинка в съдържанието,
 * текст като изрязване, видим текст, който продължава от мястото на скрит. Формулярите са закрепени по
 * SHA-256, затова грешката се вижда в тестовете, не при клиента.
 */
export function senzaLivelliSpenti(
  contenuto: string,
  stato: (nome: string) => StatoLivello | null,
): string {
  const parti: string[] = [];
  const pila: Array<StatoLivello | 'altro'> = [];
  let copiato = 0;
  let spenti = 0;
  // Последният режим на текста (`Tr`): от 4 нагоре текстът е и изрязване — махнат, би променил следващото.
  let resa = 0;
  // След махнат текст мястото за писане вече не е това, което вижда четец със слоеве (текстът го мести).
  let spostato = false;
  const cambia = (op: Operatore, con: string): void => {
    // Заместителят се огражда с интервали: пред оператора може да стои знак без разделител („Td(x)'“).
    parti.push(contenuto.slice(copiato, op.da), con ? ` ${con} ` : '');
    copiato = op.a;
  };
  const togliTesto = (op: Operatore, con: string): void => {
    if (resa >= 4) throw rotto('текст като изрязване в изключен слой');
    cambia(op, con);
    spostato = true;
  };
  for (const op of operatori(contenuto)) {
    if (op.nome === 'BDC' || op.nome === 'BMC') {
      let tipo: StatoLivello | 'altro' = 'altro';
      if (op.nome === 'BDC' && op.operandi[0] === '/OC') {
        const proprieta = op.operandi[1] ?? '';
        if (!proprieta.startsWith('/')) throw rotto('слой, описан в самата страница');
        tipo = stato(nomeDi(proprieta)) ?? 'altro';
      }
      pila.push(tipo);
      if (tipo === 'spento') spenti += 1;
      if (tipo !== 'altro') cambia(op, '');
    } else if (op.nome === 'EMC') {
      const tipo = pila.pop();
      if (tipo === 'spento') spenti -= 1;
      if (tipo === 'spento' || tipo === 'acceso') cambia(op, '');
    } else if (op.nome === 'Tr') {
      resa = Number(op.operandi[0]);
    } else if (POSIZIONA.has(op.nome)) {
      spostato = false;
    } else if (TESTO.has(op.nome)) {
      if (spenti > 0) {
        if (op.nome === "'") togliTesto(op, 'T*');
        else if (op.nome === '"') togliTesto(op, `${op.operandi[0]} Tw ${op.operandi[1]} Tc T*`);
        else togliTesto(op, '');
      } else if (op.nome === "'" || op.nome === '"') {
        // Видимият ред започва от началото на следващия ред — махнатото преди него не го мести.
        spostato = false;
      } else if (spostato) {
        throw rotto('видим текст веднага след скрит, без ново място');
      }
    } else if (spenti > 0) {
      if (DIPINGE.has(op.nome)) cambia(op, 'n');
      else if (MOSTRA.has(op.nome)) cambia(op, '');
    }
  }
  if (parti.length === 0) return contenuto;
  parti.push(contenuto.slice(copiato));
  return parti.join('');
}
