import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { config, isProduction } from './config.js';
import { errorMessage, logger } from './logger.js';
import { fromRoot } from './paths.js';

export interface AnchorPoint {
  id: number;
  hash: string;
}

export interface Anchor {
  head: AnchorPoint | null;
  base: AnchorPoint | null;
}

/**
 * Котвата е файл на сървъра извън базата: последният запис (и началото след изтриване по срок). Изтрит
 * край на веригата или подменено начало в базата не съвпада с нея. По подразбиране — само в продукция.
 */
function anchorFile(): string | null {
  const path = config().AUDIT_ANCHOR_PATH ?? (isProduction() ? 'data/audit-head.json' : null);
  return path ? fromRoot(path) : null;
}

export function readAnchor(): Anchor | null {
  const file = anchorFile();
  if (!file || !existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Anchor>;
    const point = (p: unknown) =>
      p &&
      typeof p === 'object' &&
      Number.isInteger((p as { id: unknown }).id) &&
      typeof (p as { hash: unknown }).hash === 'string'
        ? { id: (p as { id: number }).id, hash: (p as { hash: string }).hash }
        : null;
    return { head: point(raw.head), base: point(raw.base) };
  } catch {
    return null;
  }
}

let writing: Promise<void> = Promise.resolve();
let warned = false;

/** Записва котвата атомно (временен файл и преименуване), само напред по номер на записа. */
export function saveAnchor(change: Partial<Anchor>): Promise<void> {
  const file = anchorFile();
  if (!file) return Promise.resolve();
  writing = writing
    .then(() => {
      const current = readAnchor() ?? { head: null, base: null };
      if (change.head && current.head && current.head.id >= change.head.id) return;
      const next = { ...current, ...change };
      writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    })
    .catch((error: unknown) => {
      if (!warned) logger.error({ err: errorMessage(error) }, 'котвата на одита не се записа');
      warned = true;
    });
  return writing;
}

/** Какво показва базата в края на проверката. */
export interface ChainEnd {
  /** началото след изтриване по срок (AuditBase) */
  base: AnchorPoint | null;
  /** последният проверен запис */
  lastId: number;
  /** хешът на записа с номера на котвата; null — в базата няма такъв запис */
  headHash: string | null;
}

/**
 * Номерът, на който базата се разминава с котвата, или null. Мерилото е котвата, не AuditBase: който
 * пише само в базата, може да подправи и началото. Затова липсващ запис от котвата се приема за изтрит
 * по срок само ако началото ПО КОТВАТА е след него, а начало в базата без същото начало в котвата е
 * подмяна.
 */
export function anchorBreak(anchor: Anchor | null, end: ChainEnd): number | null {
  if (!anchor) return null;
  const { head, base } = anchor;
  if (head) {
    // котвата е напред от базата (изрязан край) или записът на нейния номер е друг
    if (head.id > end.lastId) return head.id;
    if (end.headHash === null ? (base?.id ?? 0) < head.id : end.headHash !== head.hash)
      return head.id;
  }
  const same = base?.id === end.base?.id && base?.hash === end.base?.hash;
  return same ? null : ((base ?? end.base)?.id ?? 0);
}
