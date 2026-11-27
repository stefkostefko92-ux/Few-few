/**
 * Класовете на писмата — детерминистично, BG/EN/IT (SPEC §1.2). Приоритет: dsar > legal > complaint >
 * payment > technical > question; spam по оценката на Brevo (rspamd). Грешката е в посока на по-строгото:
 * думата „данни“ + „изтри“ стига, за да чака човек.
 */
export type TicketClass =
  'question' | 'technical' | 'payment' | 'complaint' | 'dsar' | 'legal' | 'spam';

/** Пращането иска второ потвърждение. */
export const RISKY: ReadonlySet<TicketClass> = new Set(['payment', 'complaint', 'dsar', 'legal']);
/** Без AI чернова: DSAR (умението dsar-response), правно (юрист), спам. */
export const NO_AI: ReadonlySet<TicketClass> = new Set(['dsar', 'legal', 'spam']);

export const SPAM_SCORE = 5;

const RULES: [Exclude<TicketClass, 'question' | 'spam'>, RegExp][] = [
  [
    'dsar',
    /лични(те)?\s+(ми\s+)?данни|gdpr|оргд|орзд|право\s+да\s+бъда\s+забравен|изтри\S*\s+(\S+\s+){0,3}(данни|профил|акаунт)|достъп\s+до\s+(моите\s+)?данни|personal\s+data|my\s+data|right\s+to\s+(erasure|be\s+forgotten|access)|subject\s+access|data\s+(deletion|request)|dati\s+personali|miei\s+dati|cancellazione\s+dei\s+(miei\s+)?dati|diritto\s+all'oblio/i,
  ],
  [
    'legal',
    /адвокат|съд(а|ебн|я)|\bще\s+ви\s+съдя|нотари|lawyer|attorney|legal\s+action|lawsuit|\bsue\b|avvocat|tribunale|diffida|querela|denuncia/i,
  ],
  [
    'complaint',
    /жалба|оплакван|недоволн|ужасн|безобраз|измам|complaint|unacceptable|disappointed|terrible|scam|reclamo|lamentel|vergogn|truffa/i,
  ],
  [
    'payment',
    /плащане|платих|фактур|таксува|върн\S*\s+(\S+\s+)?парите|възстановяване\s+на\s+(сума|пари)|сметка\s+за|refund|charge|invoice|payment|billing|rimborso|fattura|pagament|addebit/i,
  ],
  [
    'technical',
    /грешка|не\s+работи|бъг|срив|не\s+мога\s+да\s+вляза|не\s+се\s+зарежда|error|bug|crash|doesn't\s+work|not\s+working|can't\s+log\s*in|cannot\s+log\s*in|errore|non\s+funziona|bloccat|non\s+riesco\s+ad?\s+accedere/i,
  ],
];

export function classify(m: {
  subject: string;
  text: string;
  spamScore: number | null;
}): TicketClass {
  if (m.spamScore !== null && m.spamScore >= SPAM_SCORE) return 'spam';
  const hay = `${m.subject}\n${m.text}`;
  for (const [cls, re] of RULES) if (re.test(hay)) return cls;
  return 'question';
}

/** Началното състояние по клас: спамът се затваря, dsar/legal чакат човек, останалите — чернова. */
export function initialStatus(
  cls: TicketClass,
  fromAddress = 'x@x.x',
): 'new' | 'needs_human' | 'closed' {
  if (!fromAddress) return 'needs_human'; // без подател няма на кого да се отговори — човек решава
  if (cls === 'spam') return 'closed';
  if (NO_AI.has(cls)) return 'needs_human';
  return 'new';
}
