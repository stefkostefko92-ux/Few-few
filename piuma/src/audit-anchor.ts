import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/**
 * Котвата на одит-веригата: главата (id + hash на последния запис), записана ИЗВЪН базата — файл на
 * сървъра. Който пише само в базата, може да изреже края на веригата (веригата пак е цяла сама по
 * себе си) — котвата е напред от базата и това се вижда. Без база и без конфиг — за тестовете.
 */

export interface AnchorPoint {
  id: number;
  hash: string;
  /**
   * Последният номер на v1 запис (отпреди ключа), закован при първия запис с котва. v1 над него е
   * подмяна без ключ — без това цялата v2 опашка може да се свали до валидна v1 верига.
   */
  v1MaxId?: number;
}

export const ANCHOR_FILE = 'audit-head.json';

export function readAnchor(file: string): AnchorPoint | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AnchorPoint>;
    if (
      !Number.isInteger(raw.id) ||
      typeof raw.hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(raw.hash)
    ) {
      return null;
    }
    const point: AnchorPoint = { id: raw.id as number, hash: raw.hash };
    if (Number.isInteger(raw.v1MaxId) && (raw.v1MaxId as number) >= 0) point.v1MaxId = raw.v1MaxId;
    return point;
  } catch {
    return null;
  }
}

let writing: Promise<void> = Promise.resolve();

/**
 * Записва котвата атомно (временен файл + преименуване, права 600), само напред по номер на записа.
 * `v1MaxId` се записва веднъж и после не се сменя. Сериализирано в процеса; временният файл носи
 * pid-а — панелът и работникът могат да делят папката. Хвърля при провал — извикващият решава.
 */
export function saveAnchor(file: string, point: AnchorPoint): Promise<void> {
  const run = writing.then(() => {
    const current = readAnchor(file);
    const v1MaxId = current?.v1MaxId ?? point.v1MaxId;
    const head = current && current.id >= point.id ? current : point;
    if (head === current && current.v1MaxId === v1MaxId) return;
    const next: AnchorPoint = { id: head.id, hash: head.hash };
    if (v1MaxId !== undefined) next.v1MaxId = v1MaxId;
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
    renameSync(tmp, file);
  });
  writing = run.catch(() => undefined);
  return run;
}

/** Какво показва базата в края на проверката. */
export interface ChainEnd {
  /** последният проверен запис */
  lastId: number;
  /** хешът в базата на записа с номера на котвата; null — няма такъв запис */
  headHash: string | null;
}

/**
 * Номерът, на който базата се разминава с котвата, или null. Котвата напред от базата = изрязан
 * край; записът на нейния номер липсва или е с друг хеш = пренаписана опашка.
 */
export function anchorBreak(anchor: AnchorPoint | null, end: ChainEnd): number | null {
  if (!anchor) return null;
  if (anchor.id > end.lastId) return anchor.id;
  if (end.headHash !== anchor.hash) return anchor.id;
  return null;
}
