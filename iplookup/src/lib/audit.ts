import "server-only";

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { GENESIS, link, tipOf, verifyChain, type ChainProblem, type ChainedRecord } from "./hash-chain";

/**
 * Одиторският дневник на следственото издание.
 *
 * Изискването е чл. 25 от Директива (ЕС) 2016/680: записват се събиране,
 * промяна, **справка**, разкриване, комбиниране и изтриване; при справка и
 * разкриване записът установява **обосновката, датата и часа**, доколкото е
 * възможно **самоличността на извършилия справката** и на получателите.
 * Ползва се единствено за проверка на законосъобразността, самоконтрол,
 * цялост и наказателни производства.
 *
 * Това е пълна противоположност на публичното издание, където заявките
 * нарочно НЕ се пазят. Двете не могат да делят инсталация — виж `mode.ts`.
 *
 * Формат: JSONL, дописване без пренаписване, всеки ред носи хеша на предишния.
 * Избран е пред база данни, защото при локална инсталация един файл се
 * архивира, подписва и предава по-лесно от база, а веригата прави тихата
 * поправка на един ред видима.
 */

export type AuditAction =
  | "вход"
  | "изход"
  | "справка"
  | "активна-проверка"
  | "следствена-справка"
  | "износ"
  | "проверка-на-дневника";

export interface AuditEntry {
  /** Момент в UTC с милисекунди. */
  ts: string;
  /** Индивидуален идентификатор на служителя. Споделени акаунти са забранени. */
  actor: string;
  actorUnit: string;
  actorRole: string;
  action: AuditAction;
  /**
   * Обосновката — номер на преписка и правно основание. Изисква се изрично от
   * чл. 25 за справка и разкриване. Празна стойност е допустима само за вход
   * и изход.
   */
  justification: string;
  /** Какво е било потърсено. */
  query: string;
  /** Кои източници са отговорили — част от проследимостта. */
  sources: string[];
  /** Хеш на замразения артефакт, ако е направен такъв. */
  evidence?: string;
  /** Адресът, от който е дошла заявката. */
  clientIp?: string;
}

export type StoredAuditEntry = AuditEntry & ChainedRecord;

function auditPath(): string {
  const directory = process.env.IPLOOKUP_AUDIT_DIR?.trim() || join(process.cwd(), "data", "audit");
  return join(directory, "audit.jsonl");
}

function ensureFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Създаваме го предварително с ограничени права: дневникът съдържа кой какво
  // е разследвал и не бива да е четим от всеки на машината.
  if (!existsSync(path)) writeFileSync(path, "", { mode: 0o600 });
}

/** Чете целия дневник. Повреден ред НЕ се прескача тихо — той е находка. */
export function readAudit(): { entries: StoredAuditEntry[]; malformed: number[] } {
  const path = auditPath();
  if (!existsSync(path)) return { entries: [], malformed: [] };

  const entries: StoredAuditEntry[] = [];
  const malformed: number[] = [];
  const lines = readFileSync(path, "utf8").split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim();
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as StoredAuditEntry);
    } catch {
      malformed.push(index + 1);
    }
  }
  return { entries, malformed };
}

/**
 * Дописва запис.
 *
 * Синхронно и без буфериране нарочно: запис, който е „на път да се запише",
 * не струва нищо, ако процесът падне между действието и дневника. Цената е
 * едно синхронно писане на справка — приемливо при мащаба на едно РПУ.
 */
export function appendAudit(entry: AuditEntry): StoredAuditEntry {
  const path = auditPath();
  ensureFile(path);

  const { entries } = readAudit();
  const record = link(entry as unknown as Record<string, unknown>, tipOf(entries)) as unknown as StoredAuditEntry;
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

export interface AuditIntegrity {
  entryCount: number;
  problems: ChainProblem[];
  malformedLines: number[];
  /**
   * Последното звено — записва се при архивиране, за да се засече отрязване.
   * `null` при повредена верига: там краят не значи нищо и не бива да се
   * представя като валиден.
   */
  tip: string | null;
  intact: boolean;
}

/** Проверява целостта на целия дневник. */
export function verifyAudit(): AuditIntegrity {
  const { entries, malformed } = readAudit();
  const problems = verifyChain(entries as unknown as (Record<string, unknown> & ChainedRecord)[]);
  return {
    entryCount: entries.length,
    problems,
    malformedLines: malformed,
    tip: problems.length > 0 ? null : entries.length === 0 ? GENESIS : tipOf(entries),
    intact: problems.length === 0 && malformed.length === 0,
  };
}

/** Обосновката е задължителна за всичко освен вход и изход. */
export function requiresJustification(action: AuditAction): boolean {
  return action !== "вход" && action !== "изход";
}
