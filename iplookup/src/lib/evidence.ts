import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalize, sha256 } from "./hash-chain";
import type { LookupReport } from "./lookup";

/**
 * Замразен архив на суровите отговори.
 *
 * Причината е доказателствена, не техническа. Разпечатка от частен инструмент
 * най-вероятно не е доказателствено средство сама по себе си — приобщаването
 * минава през експертиза или през искане до дружеството по НПК чл. 159, ал. 1.
 * И в двата случая се иска ОРИГИНАЛЪТ: какво точно е върнал всеки източник, в
 * кой момент, и с коя версия на офлайн базите.
 *
 * Кешът с шестчасов срок в `sources/rdap.ts` е оптимизация, не архив — той се
 * изтрива. Този файл не се изтрива и носи собствения си хеш.
 *
 * Няма `server-only`: истинската преграда пред клиента е `node:fs`, който не
 * съществува в браузър, а този модул трябва да е тестваем без Next. Кодът, който
 * доказва цялост, е последното място, което бива да остане непокрито.
 *
 * Артефактът е самодостатъчен: чете се и без нашия софтуер, защото е обикновен
 * JSON с изрично записани източници и часове.
 */

export interface EvidenceArtifact {
  /** Версия на формата — за да може артефакт от днес да се чете след години. */
  format: 1;
  /** Момент на замразяването, UTC с милисекунди. */
  frozenAt: string;
  /** Кой е направил справката. */
  actor: string;
  actorUnit: string;
  /** Номер на преписка и правно основание. */
  justification: string;
  /** Търсеният адрес в каноничен вид. */
  query: string;
  /** Пълният доклад, както е получен — без съкращения и без разкрасяване. */
  report: unknown;
  /** Версия/произход на офлайн данните, за да е възпроизводим резултатът. */
  datasets: Record<string, string>;
  /** Часовникът на машината — при спор се проверява срещу NTP източника. */
  clock: { iso: string; timezoneOffsetMinutes: number };
}

export interface FrozenEvidence {
  hash: string;
  path: string;
  artifact: EvidenceArtifact;
}

function evidenceDir(): string {
  return process.env.IPLOOKUP_EVIDENCE_DIR?.trim() || join(process.cwd(), "data", "evidence");
}

/**
 * Замразява доклада.
 *
 * Хешът се смята върху КАНОНИЧНИЯ вид, значи е възпроизводим: всеки, който има
 * артефакта, може да пресметне същия хеш и да сравни с този в дневника. Ако
 * някой промени файла, двете няма да съвпаднат.
 */
export function freezeEvidence(input: {
  actor: string;
  actorUnit: string;
  justification: string;
  query: string;
  report: LookupReport;
  datasets?: Record<string, string>;
  now?: Date;
}): FrozenEvidence {
  const now = input.now ?? new Date();
  const artifact: EvidenceArtifact = {
    format: 1,
    frozenAt: now.toISOString(),
    actor: input.actor,
    actorUnit: input.actorUnit,
    justification: input.justification,
    query: input.query,
    report: input.report as unknown,
    datasets: input.datasets ?? {},
    clock: { iso: now.toISOString(), timezoneOffsetMinutes: now.getTimezoneOffset() },
  };

  const hash = sha256(canonicalize(artifact as unknown as Record<string, unknown>));

  // Подредба по ден: при изземване или архивиране се копира цяла папка.
  const day = artifact.frozenAt.slice(0, 10);
  const directory = join(evidenceDir(), day);
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  const path = join(directory, `${hash}.json`);
  // Отстъпът е нарочен: артефактът се чете от човек в преписка, не само от код.
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });

  return { hash, path, artifact };
}

/** Пресмята наново хеша на артефакт — за проверка при спор. */
export function evidenceHash(artifact: EvidenceArtifact): string {
  return sha256(canonicalize(artifact as unknown as Record<string, unknown>));
}
