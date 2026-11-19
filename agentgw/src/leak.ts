/**
 * Филтър на изхода срещу изтичане на системния промпт („Reduce prompt leak“ → post-processing:
 * platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak).
 *
 * Списъкът е умишлено тесен и с висока точност: пълният `findMarkers` (за генерацията на
 * профили) хваща и „Edit“, „hooks“, „собственик“ — в живия чат това би блокирало нормални
 * отговори. Тук са само неща, които няма легитимна причина да се появят в отговор.
 *
 * Сравнява се с два нормализирани потока, водени знак по знак заедно с позицията в суровия текст:
 * - за канарчето: NFKD без комбиниращите знаци (покрива NFKC: fullwidth, математически букви) +
 *   главни + кирилски/гръцки двойници → латиница + само букви и цифри;
 * - за откъсите: NFKC, всяко тире → „-“, всяка поредица интервали → един интервал, без невидимите
 *   знаци за форматиране (нулева ширина и пр.).
 * Задържането се мери в знаци на тези потоци, не в сурови знаци — разредки и интервали не го
 * изчерпват.
 */
const DOCTRINE_FRAGMENTS: Array<{ name: string; re: RegExp }> = [
  { name: 'доктрина', re: /Правила ?- ?с приоритет над всичко/giu },
  { name: 'доктрина', re: /Твоят профил ?\(експертиза и тон\)/giu },
  { name: 'доктрина', re: /Контролен код на тези инструкции/giu },
  {
    name: 'вътрешна папка',
    re: /\.claude\/|(?<![\p{L}\p{N}])_memory(?![\p{L}\p{N}])|_shared\//giu,
  },
  { name: 'памет', re: /```learn/gu },
  { name: 'предаване', re: /## ?ПРЕДАВАНЕ/giu },
];

/** Колко знака от потока за откъсите задържаме — над най-дългия откъс (≈ 40). */
export const HOLD_CHARS = 64;

/** Кирилски и гръцки главни, които изглеждат като латински (малките минават през toUpperCase). */
const HOMOGLYPHS: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
  Ѕ: 'S', І: 'I', Ј: 'J', Ԛ: 'Q', Ԝ: 'W',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T',
  Υ: 'Y', Χ: 'X',
}; // prettier-ignore

const MARKS = /\p{M}/gu;
const ALNUM = /^[\p{L}\p{N}]$/u;
const SPACE = /^\s$/u;
const FORMAT = /^\p{Cf}$/u;
const DASHES = /[\p{Pd}−]/gu;

/** Знаците на една кодова точка в потока за канарчето. */
function canaryForm(cp: string): string {
  let out = '';
  for (const c of cp.normalize('NFKD').replace(MARKS, '').toUpperCase()) {
    const m = HOMOGLYPHS[c] ?? c;
    if (ALNUM.test(m)) out += m;
  }
  return out;
}

export interface GuardStep {
  /** Безопасен текст за пращане сега. */
  emit: string;
  /** Име на засечения маркер (без съдържанието) или null. */
  leak: string | null;
}

export class LeakGuard {
  /** Суровият текст; [0, emitted) е пуснат, [emitted, done) е нормализиран и задържан. */
  private acc = '';
  private done = 0;
  private emitted = 0;
  /** Поток за канарчето и началото в `acc` на всеки негов знак (UTF-16 единица). */
  private canon = '';
  private canonAt: number[] = [];
  private canonScanned = 0;
  /** Поток за откъсите и началото в `acc` на всеки негов знак. */
  private view = '';
  private viewAt: number[] = [];
  private viewScanned = 0;
  private readonly canary: string;

  constructor(canary: string) {
    this.canary = canaryForm(canary);
    if (this.canary.length < 2) throw new Error('канарчето е твърде късо');
  }

  /** Нормализира новите кодови точки; висящ висок сурогат чака следващата делта. */
  private ingest(final: boolean): void {
    while (this.done < this.acc.length) {
      const at = this.done;
      const hi = this.acc.charCodeAt(at);
      let len = 1;
      if (hi >= 0xd800 && hi <= 0xdbff) {
        if (at + 1 >= this.acc.length && !final) break;
        const lo = this.acc.charCodeAt(at + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) len = 2;
      }
      const cp = this.acc.slice(at, at + len);
      this.done = at + len;

      const c = canaryForm(cp);
      this.canon += c;
      for (let i = 0; i < c.length; i++) this.canonAt.push(at);

      let v: string;
      if (SPACE.test(cp)) v = this.view.endsWith(' ') ? '' : ' ';
      else if (FORMAT.test(cp)) v = '';
      else v = cp.normalize('NFKC').replace(DASHES, '-');
      this.view += v;
      for (let i = 0; i < v.length; i++) this.viewAt.push(at);
    }
  }

  private scan(final: boolean): string | null {
    // Нова поява на канарчето завършва в новите знаци → започва най-много L−1 знака назад.
    const from = Math.max(0, this.canonScanned - (this.canary.length - 1));
    if (this.canon.indexOf(this.canary, from) !== -1) return 'канарче';
    this.canonScanned = this.canon.length;

    // Регексите вървят по целия поток от lastIndex — lookbehind вижда истинския предишен знак.
    // Съвпадение точно в края още не е окончателно (`_memory` може да продължи като `_memorybank`);
    // то е изцяло в задържаното и се решава при следващата делта или при flush().
    const start = Math.max(0, this.viewScanned - HOLD_CHARS);
    for (const m of DOCTRINE_FRAGMENTS) {
      m.re.lastIndex = start;
      for (let r = m.re.exec(this.view); r; r = m.re.exec(this.view)) {
        if (final || r.index + r[0].length < this.view.length) return m.name;
        if (r[0].length === 0) m.re.lastIndex++;
      }
    }
    this.viewScanned = this.view.length;
    return null;
  }

  /** Докъде в `acc` е безопасно да се пусне: преди последните L−1 знака за канарчето и HOLD_CHARS за откъсите. */
  private safeEnd(): number {
    const ci = this.canon.length - (this.canary.length - 1);
    const canaryHold = ci <= 0 ? (this.canonAt[0] ?? this.done) : this.canonAt[ci]!;
    const vi = this.view.length - HOLD_CHARS;
    const viewHold = vi <= 0 ? (this.viewAt[0] ?? this.done) : this.viewAt[vi]!;
    return Math.max(this.emitted, Math.min(canaryHold, viewHold, this.done));
  }

  /**
   * Добавя делта. Всяка незавършена поява на маркер е изцяло в задържаното (по нормализираните
   * знаци), преди което и да е нейно начало да бъде пуснато — затова нищо от нея не изтича.
   */
  push(text: string): GuardStep {
    this.acc += text;
    this.ingest(false);
    const leak = this.scan(false);
    if (leak) return { emit: '', leak };
    const end = this.safeEnd();
    const emit = this.acc.slice(this.emitted, end);
    this.emitted = end;
    return { emit, leak: null };
  }

  /** Краят на отговора: последна проверка и остатъкът. */
  flush(): GuardStep {
    this.ingest(true);
    const leak = this.scan(true);
    if (leak) return { emit: '', leak };
    const emit = this.acc.slice(this.emitted);
    this.emitted = this.acc.length;
    return { emit, leak: null };
  }
}
