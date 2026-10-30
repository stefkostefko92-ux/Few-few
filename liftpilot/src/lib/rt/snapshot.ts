// What an issued relazione tecnica di modifica keeps and hashes (RT plan §4.7): its results (everything the document
// prints of the derivation), its verdict over the checks this modification requires, and the canonical snapshot whose
// SHA-256 is the record's — the RT engine's version, the number and revision, the base's records (id, SHA-256, engine
// each), the test, the registry, the project and plant data and the company as printed, the inputs with each file named
// by its place in the RT (never a database id), the files as they were at issue, the results, the SHA of the document
// built from them (docSha: the builder's wording is inside the hash). Pure; hashed on the server (src/lib/rt-hash.ts).
import type { Collaudo } from '../lift/collaudo';
import type { Plant } from '../plant';
import type { Anagrafica } from './anagrafica';
import type { RtInputs } from './input';
import type { RecordRef, RtAllegato, RtBase, RtCheck, RtDerived, RtResults, RtTipo, RtVerdict } from './types';
import { RT_ENGINE_VERSION } from './version';

/** The verdict over the checks this modification requires (those of the parts that stay are not counted). */
export function rtVerdict(checks: readonly RtCheck[]): { verdict: RtVerdict; failCount: number; warnCount: number } {
  const on = checks.filter((c) => c.ambito === 'richiesta'), failCount = on.filter((c) => c.status === 'fail').length, warnCount = on.filter((c) => c.status === 'warn').length;
  return { verdict: failCount ? 'FAIL' : warnCount ? 'WARN' : 'OK', failCount, warnCount };
}

/** The results an issued RT keeps: the derivation without its base. */
export function rtResults(d: RtDerived): RtResults {
  return {
    engineVersion: d.engineVersion, path: d.path, tipo: d.tipo, norma: d.norma, regime: d.regime, regole: d.regole, sezioni: d.sezioni, componenti: d.componenti,
    checks: d.checks, punti: d.punti, strutture: d.strutture, documenti: d.documenti, primaDopo: d.primaDopo, mancanti: d.mancanti, verdict: d.verdict,
    failCount: d.failCount, warnCount: d.warnCount,
  };
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The inputs with every file's id replaced by its place in the RT («allegato»: 1..40; null for an id not among them):
 *  the snapshot names the files as the document does. */
export function inputsDelSnapshot(inputs: RtInputs, allegati: readonly RtAllegato[]): Json {
  const pos = (id: unknown): number | null => allegati.find((a) => a.attachmentId === id)?.position ?? null;
  const walk = (x: unknown): Json => {
    if (Array.isArray(x)) return x.map(walk);
    if (!isRecord(x)) return typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean' ? x : null;
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(x)) {
      if (v === undefined) continue;
      if (k === 'attachmentId') out.allegato = pos(v);
      else out[k] = walk(v);
    }
    return out;
  };
  const { documenti, ...rest } = inputs, base = walk(rest);
  if (!documenti || !isRecord(base)) return base;
  return { ...base, documenti: Object.fromEntries(Object.entries(documenti).map(([k, v]) => [k, v === 'separato' ? v : pos(v)])) };
}

export interface RtSnapshotInput {
  number: string;
  revision: number;
  revisions: Json;
  base: Pick<RtBase, 'path' | 'records'>;
  tipo: RtTipo;
  collaudo: Collaudo;
  anagrafica: Anagrafica;
  projectData: Json;
  plant: Plant;
  company: { name: string; logoSha256: string | null };
  inputs: RtInputs;
  allegati: readonly RtAllegato[];
  results: RtResults;
  docSha: string;
}

const ref = (r: RecordRef | undefined): Json => (r ? { id: r.id, sha256: r.sha256, engineVersion: r.engineVersion } : null);

/** The canonical record of an issued RT, what its SHA-256 covers. */
export function rtSnapshot(i: RtSnapshotInput): Json {
  const r = i.base.records;
  return {
    engine: RT_ENGINE_VERSION, number: i.number, revision: i.revision, revisions: i.revisions,
    base: { path: i.base.path, calc: ref(r.calc), ...(r.room ? { room: ref(r.room) } : {}), ...(r.lift ? { lift: ref(r.lift) } : {}), ...(r.shaft ? { shaft: ref(r.shaft) } : {}) },
    tipo: i.tipo, collaudo: JSON.parse(JSON.stringify(i.collaudo)) as Json, anagrafica: JSON.parse(JSON.stringify(i.anagrafica)) as Json, projectData: i.projectData,
    plant: JSON.parse(JSON.stringify(i.plant)) as Json, company: i.company, inputs: inputsDelSnapshot(i.inputs, i.allegati),
    allegati: i.allegati.map((a) => ({ position: a.position, sha256: a.sha256, mime: a.mime, pages: a.pages, kind: a.kind, title: a.title, component: a.component })),
    results: JSON.parse(JSON.stringify(i.results)) as Json, docSha: i.docSha,
  };
}
