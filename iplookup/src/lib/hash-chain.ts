import { createHash } from "node:crypto";

/**
 * Верига от хешове — основата на одиторския дневник и на замразения архив.
 *
 * Чл. 25 от Директива (ЕС) 2016/680 иска дневникът да установява обосновката,
 * часа и самоличността на извършилия справката. Но „има запис" не е същото
 * като „записът не е пипан": дневник, който може да се редактира тихо, не
 * доказва нищо пред никого.
 *
 * Затова всеки запис носи хеша на предишния. Промени ли се един ред, веригата
 * се къса от него нататък и това се вижда веднага. Не е криптографски подпис —
 * не пази от някой, който презапише ЦЯЛАТА верига — но прави тихата поправка
 * на един ред невъзможна, а това е реалната заплаха при вътрешен дневник.
 *
 * Чист модул: без файлове, без мрежа, без време. Часовникът и дискът се подават
 * отвън, за да е тестваем и възпроизводим.
 */

/** Първото звено. Изборът е произволен, но трябва да е стабилен. */
export const GENESIS = "0".repeat(64);

export interface ChainedRecord {
  /** Хешът на предишния запис. За първия — `GENESIS`. */
  prev: string;
  /** Хешът на този запис: SHA-256 върху каноничния му вид + `prev`. */
  hash: string;
}

/**
 * Каноничен JSON: ключовете подредени, без излишни интервали.
 *
 * Без канонизация два еднакви по съдържание записа биха дали различни хешове
 * само защото ключовете са изброени в различен ред — и проверката на веригата
 * би падала без причина.
 *
 * `undefined` се изхвърля (както прави и `JSON.stringify`), но `null` се пази —
 * той е стойност, не липса.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("нечислова стойност не може да се канонизира");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item === undefined ? null : item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  // `undefined`, функции и символи нямат място в одиторски запис.
  throw new Error(`стойност от тип ${typeof value} не може да се канонизира`);
}

/** SHA-256 в шестнайсетичен вид. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Хешът на един запис при дадено предишно звено. */
export function hashRecord(payload: Record<string, unknown>, prev: string): string {
  // Полетата на самата верига се изключват — иначе хешът би зависел от себе си.
  const { prev: _ignoredPrev, hash: _ignoredHash, ...rest } = payload;
  void _ignoredPrev;
  void _ignoredHash;
  return sha256(`${prev}\n${canonicalize(rest)}`);
}

/** Добавя звената към запис, готов за дописване към дневника. */
export function link<T extends Record<string, unknown>>(payload: T, prev: string): T & ChainedRecord {
  return { ...payload, prev, hash: hashRecord(payload, prev) };
}

export interface ChainProblem {
  /** Номер на реда (от 0). */
  index: number;
  kind: "прекъсната-връзка" | "променено-съдържание";
  detail: string;
}

/**
 * Проверява цялата верига.
 *
 * Връща ВСИЧКИ проблеми, не само първия: при инцидент е важно да се види
 * докъде стига повредата, а не само откъде започва.
 */
export function verifyChain(
  records: readonly (Record<string, unknown> & ChainedRecord)[],
  /**
   * Откъде трябва да започва веригата. По подразбиране `GENESIS`, но при
   * дневник, който продължава запечатан архив, началото е звеното на архива.
   */
  startsFrom: string = GENESIS,
): ChainProblem[] {
  const problems: ChainProblem[] = [];
  let expectedPrev = startsFrom;

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;

    if (record.prev !== expectedPrev) {
      problems.push({
        index,
        kind: "прекъсната-връзка",
        detail: `очаквано предишно звено ${expectedPrev.slice(0, 12)}…, намерено ${String(record.prev).slice(0, 12)}…`,
      });
    }

    const recomputed = hashRecord(record, record.prev);
    if (recomputed !== record.hash) {
      problems.push({
        index,
        kind: "променено-съдържание",
        detail: "съдържанието на реда не отговаря на записания му хеш",
      });
    }

    // Нататък се продължава с ПРЕИЗЧИСЛЕНИЯ хеш, не със записания. Разликата е
    // съществена: така една тиха промяна в средата къса веригата от там надолу
    // и повредата се вижда по цялата ѝ дължина. Ако продължавахме със записания
    // хеш, редактираният ред щеше да остане единствената следа.
    expectedPrev = recomputed;
  }

  return problems;
}

/** Последното звено — оттам продължава дописването. */
export function tipOf(records: readonly ChainedRecord[]): string {
  return records.length === 0 ? GENESIS : (records[records.length - 1]?.hash ?? GENESIS);
}
