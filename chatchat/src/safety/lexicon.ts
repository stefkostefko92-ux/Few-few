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

/** Сгъване + еднакви апострофи и интервали (шаблоните са с единичен интервал). */
function prepare(value: string): string {
  return foldText(value)
    .replace(/[’`´]/gu, "'")
    .replace(/[^\S\n]+/gu, ' ');
}

export interface Classification {
  actionClass: ActionClass;
  matched: string[];
}

/** Най-строгият клас, който речникът открива в текста; INFORMATIVE ако нищо не съвпада. */
export function classifyActionText(text: string): Classification {
  const folded = prepare(text);
  let actionClass: ActionClass = 'INFORMATIVE';
  const matched: string[] = [];
  for (const rule of RULES) {
    const hit = rule.pattern.exec(folded);
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
  const hit = BYPASS_RULE.pattern.exec(prepare(text));
  return hit ? { bypass: true, matched: [hit[0]] } : { bypass: false, matched: [] };
}
