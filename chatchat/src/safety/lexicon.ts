import type { ActionClass } from '../domain/response.js';
import {
  ACTION_PARTICIPLES,
  ACTION_VERBS,
  BYPASS_ALONE,
  BYPASS_OBJECTS,
  BYPASS_PARTICIPLES,
  BYPASS_VERBS,
  CONFIG_ALONE,
  CONFIG_OBJECTS,
  CONFIG_VERBS,
  DIAGNOSTIC_TERMS,
  DIRECT_COMMAND_TERMS,
  HOLD_OBJECTS,
  HOLD_VERBS,
  RUN_DOORS_OPEN,
  SAFETY_DEVICES,
  SAFETY_OPERATIONS,
  SAFETY_PLACES,
} from './terms.js';
import { alt, near, after } from './patterns.js';

/**
 * Речник за детерминистичната класификация на действия (§11.1) — независим от модела.
 * Safety Gate взима ПО-СТРОГИЯ клас от обявения от модела и открития тук, затова пропуск тук
 * не отслабва защитата, а излишно съвпадение само изисква повече доказателства.
 * Езици: IT (основен за таблата), EN, BG. Само термини и жаргон от терена — без текст от нормите.
 *
 * РЕШЕНИЕ (§11, „verificare il contatto porta“): стъпка, която ДЕЙСТВА върху защитен елемент —
 * мери, проверява, отваря, сменя, регулира, пипа го или работи в шахтата/фосата/на покрива —
 * е SAFETY_RELEVANT, дори да е „само“ измерване. Аргументи:
 *  1. Измерването по веригата за безопасност е под напрежение и често при отворена етажна врата,
 *     в шахтата или на покрива на кабината — рискът е за човека, не само за асансьора.
 *  2. „Мерене между клемите на веригата“ е и първата стъпка към мостване; без одобрена процедура
 *     моделът не бива свободно да води техника по тези клеми.
 *  3. Цената е малка: за честите проверки се публикува одобрена процедура в базата знания —
 *     тогава стъпката минава, само с човешко потвърждение.
 * Само ОБЯСНЕНИЕ на значение („E37 значи отворена верига“) остава INFORMATIVE — затова защитните
 * елементи не стигат сами: нужен е глагол/уред за действие до тях (`near`). Изключение са самите
 * операции (аварийно спасяване, заклещени хора, ръчно освобождаване на спирачката) — тях ги няма
 * като „обяснение“, те са действие по природа.
 *
 * Отрицанието НЕ сваля класа: „non ponticellare mai…“ остава SAFETY_RELEVANT, иначе „non dimenticare
 * di ponticellare…“ би минало. Предупрежденията не са стъпки.
 * Двузначните думи („test“, „controllo“, „ponticello/jumper“ на платка, „bypass“ във „valvola di bypass“,
 * „мостов изправител“, „cavallotto“ на въжетата) са ограничени по форма или искат защитен обект до тях;
 * сам „ponticello/jumper“ (без обект) е смяна на мостче по платката — CONFIGURATIVE.
 */

interface Rule {
  actionClass: ActionClass;
  pattern: RegExp;
}

/**
 * `\\b` в JS познава само латински букви — за кирилицата границата на дума е през Unicode
 * класове. Шаблонът се пише без граници; тук се обвива. Изходникът минава през същото
 * сгъване на диакритиците като текста („й“ → „и“, „à“ → „a“), за да се пише естествено.
 */
function words(source: string): RegExp {
  const folded = source.normalize('NFD').replace(/\p{M}/gu, '');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${folded})(?![\\p{L}\\p{N}])`, 'u');
}

// ── Защитни устройства (веригата за безопасност и механичните защити) ─────────────────────────

// ── Заобикаляне на защита (`detectBypassIntent`) ─────────────────────────────────────────────

const BYPASS_SOURCE = alt([
  ...BYPASS_ALONE,
  near(BYPASS_VERBS, BYPASS_OBJECTS, 3, true),
  after(BYPASS_OBJECTS, BYPASS_PARTICIPLES, 3),
  near(HOLD_VERBS, HOLD_OBJECTS, 3),
  ...RUN_DOORS_OPEN,
]);

// ── Действие върху защитен елемент ───────────────────────────────────────────────────────────

// ── Конфигурация и диагностика ───────────────────────────────────────────────────────────────

const BYPASS_RULE: Rule = { actionClass: 'SAFETY_RELEVANT', pattern: words(BYPASS_SOURCE) };

/** Подредени от най-строгия надолу — първото съвпадение решава класа. */
const RULES: readonly Rule[] = [
  { actionClass: 'DIRECT_COMMAND', pattern: words(alt(DIRECT_COMMAND_TERMS)) },
  BYPASS_RULE,
  {
    actionClass: 'SAFETY_RELEVANT',
    pattern: words(
      alt([
        ...SAFETY_OPERATIONS,
        near(ACTION_VERBS, [...SAFETY_DEVICES, ...SAFETY_PLACES], 4),
        after([...SAFETY_DEVICES, ...SAFETY_PLACES], ACTION_PARTICIPLES, 3),
      ]),
    ),
  },
  {
    actionClass: 'CONFIGURATIVE',
    pattern: words(alt([...CONFIG_ALONE, near(CONFIG_VERBS, CONFIG_OBJECTS, 3)])),
  },
  { actionClass: 'DIAGNOSTIC', pattern: words(alt(DIAGNOSTIC_TERMS)) },
];

/** Без диакритици и на малки букви — „Velocità“ и „velocita“ съвпадат еднакво. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Хомоглифи (Unicode confusables), които изглеждат като латински букви след toLowerCase —
 * кирилица и гръцки. Прилагат се само върху смесени думи (виж `unmixScripts`), за да не
 * пипаме истинския български текст.
 */
const TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', к: 'k',
  ԁ: 'd', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w', в: 'b', м: 'm', н: 'h', т: 't',
  α: 'a', ο: 'o', ρ: 'p', ε: 'e', ι: 'i', κ: 'k', ν: 'v', τ: 't', υ: 'u', χ: 'x',
}; // prettier-ignore
/** Обратното: латински букви, вмъкнати в кирилска дума („мocт“ с латински o, c). */
const TO_CYRILLIC: Readonly<Record<string, string>> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
}; // prettier-ignore

const LATIN = /\p{Script=Latin}/u;
const NON_LATIN_LETTER = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

/** Смесена дума → в писмеността на мнозинството ѝ букви („ponticellаre“ с кирилско „а“). */
function unmixScripts(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    let latin = 0;
    let other = 0;
    for (const ch of word) {
      if (LATIN.test(ch)) latin += 1;
      else if (NON_LATIN_LETTER.test(ch)) other += 1;
    }
    if (latin === 0 || other === 0) return word;
    const map = latin >= other ? TO_LATIN : TO_CYRILLIC;
    return [...word].map((ch) => map[ch] ?? ch).join('');
  });
}

/**
 * Сгъване срещу заобикаляне (червен екип, OWASP LLM01): NFKC (широки/лигатури), махане на
 * невидимите форматиращи знаци (zero-width, мек пренос, bidi, BOM), смесени писмености,
 * еднакви апострофи и интервали, слепване на разредени букви („p o n t i c e l l a r e“).
 */
function prepare(value: string): string {
  const visible = value.normalize('NFKC').replace(/\p{Cf}/gu, '');
  return unmixScripts(foldText(visible))
    .replace(/[’`´]/gu, "'")
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])(?:\p{L}[ ._*·-]){3,}\p{L}(?![\p{L}\p{N}])/gu, (m) =>
      m.replace(/[ ._*·-]/gu, ''),
    );
}

/** Втори вариант за проверка: разделители между букви в една дума („ponti-cellare“, „by.pass“). */
function squash(prepared: string): string {
  return prepared.replace(/(?<=\p{L})[._*·/|\\-]+(?=\p{L})/gu, '');
}

export interface Classification {
  actionClass: ActionClass;
  matched: string[];
}

/** Най-строгият клас, който речникът открива в текста; INFORMATIVE ако нищо не съвпада. */
export function classifyActionText(text: string): Classification {
  const prepared = prepare(text);
  const variants = [prepared, squash(prepared)];
  let actionClass: ActionClass = 'INFORMATIVE';
  const matched: string[] = [];
  for (const rule of RULES) {
    const hit = variants.map((v) => rule.pattern.exec(v)).find((h) => h !== null);
    if (!hit) continue;
    matched.push(hit[0]);
    if (actionClass === 'INFORMATIVE') actionClass = rule.actionClass;
  }
  return { actionClass, matched };
}

/**
 * Молба за заобикаляне на защита (§16.3 „prompt che chiede di bypassare una sicurezza“).
 * Не е нужен глагол на молба — самото споменаване на мост/байпас на защита стига.
 */
export function detectBypassIntent(text: string): { bypass: boolean; matched: string[] } {
  const prepared = prepare(text);
  const hit = BYPASS_RULE.pattern.exec(prepared) ?? BYPASS_RULE.pattern.exec(squash(prepared));
  return hit ? { bypass: true, matched: [hit[0]] } : { bypass: false, matched: [] };
}
