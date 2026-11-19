/**
 * Филтър на изхода срещу изтичане на системния промпт („Reduce prompt leak“ → post-processing:
 * platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak).
 *
 * Списъкът е умишлено тесен и с висока точност: пълният `findMarkers` (за генерацията на
 * профили) хваща и „Edit“, „hooks“, „собственик“ — в живия чат това би блокирало нормални
 * отговори. Тук са само неща, които няма легитимна причина да се появят в отговор.
 */
const DOCTRINE_FRAGMENTS: Array<{ name: string; re: RegExp }> = [
  { name: 'доктрина', re: /Правила\s*—\s*с\s+приоритет\s+над\s+всичко/u },
  { name: 'доктрина', re: /Твоят\s+профил\s*\(експертиза\s+и\s+тон\)/u },
  { name: 'доктрина', re: /Контролен\s+код\s+на\s+тези\s+инструкции/u },
  { name: 'вътрешна папка', re: /\.claude\/|(?<![\p{L}\p{N}])_memory(?![\p{L}\p{N}])|_shared\//u },
  { name: 'памет', re: /```learn/ },
  { name: 'предаване', re: /##\s*ПРЕДАВАНЕ/u },
];

/** Колко знака задържаме, за да хванем маркер, разделен между две делти. */
export const HOLD_CHARS = 64;

export interface GuardStep {
  /** Безопасен текст за пращане сега. */
  emit: string;
  /** Име на засечения маркер (без съдържанието) или null. */
  leak: string | null;
}

export class LeakGuard {
  private acc = '';
  private emitted = 0;
  private readonly canary: string;

  constructor(canary: string) {
    this.canary = canary.toUpperCase();
  }

  private scan(window: string): string | null {
    // Канарчето се търси и с премахнати разделители/интервали („C S-12…“).
    const flat = window.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
    if (flat.includes(this.canary)) return 'канарче';
    for (const m of DOCTRINE_FRAGMENTS) if (m.re.test(window)) return m.name;
    return null;
  }

  /**
   * Добавя делта. Всяка поява на маркер (≤ HOLD_CHARS знака) е изцяло в прозореца, преди
   * което и да е нейно начало да бъде пуснато — затова нищо от нея не изтича.
   */
  push(text: string): GuardStep {
    this.acc += text;
    const leak = this.scan(this.acc.slice(Math.max(0, this.emitted - HOLD_CHARS)));
    if (leak) return { emit: '', leak };
    const safeEnd = Math.max(this.emitted, this.acc.length - HOLD_CHARS);
    const emit = this.acc.slice(this.emitted, safeEnd);
    this.emitted = safeEnd;
    return { emit, leak: null };
  }

  /** Краят на отговора: последна проверка и остатъкът. */
  flush(): GuardStep {
    const leak = this.scan(this.acc.slice(Math.max(0, this.emitted - HOLD_CHARS)));
    if (leak) return { emit: '', leak };
    const emit = this.acc.slice(this.emitted);
    this.emitted = this.acc.length;
    return { emit, leak: null };
  }
}
