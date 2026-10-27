import 'server-only';
// One way to make the RT after the owner's model from its parts (round 52): the derivation on the base (derive.ts), the
// fascicolo built from it (report/rt2/build.ts), its SHA (blocks and meta), the results kept, the canonical snapshot and
// its SHA-256. The issue, the preview and the record's reproduction (record.ts, «one rule») go through composeRt2 with
// the same parts read the same way, so an RT the running engines still reproduce hashes to its stored SHA-256.
import type { SheetImage } from '@/drawing';
import type { FascicoloDoc } from '@/lib/report/rt2/model';
import { buildFascicolo } from '@/lib/report/rt2/build';
import type { IdentRt2 } from '@/lib/report/rt2/generale';
import { giorno, sha16 } from '@/lib/report/rt/testi';
import type { RevisioneRt } from '@/lib/report/rt/build';
import { deriveRt2, type Rt2Derivato } from '@/lib/rt2/derive';
import type { Rt2Inputs } from '@/lib/rt2/input';
import { RT2_ENGINE_VERSION } from '@/lib/rt2/version';
import type { RtAllegato } from '@/lib/rt/types';
import { rtDocSha, rtHash } from '@/lib/rt-hash';
import type { ProjectRt2, Rt2Base } from './base';

export interface Rt2Parts {
  /** null: a draft (the preview) */
  number: string | null;
  revision: number;
  revisions: readonly RevisioneRt[];
  base: Rt2Base;
  inputs: Rt2Inputs;
  project: ProjectRt2;
  company: { name: string; logo: SheetImage | null; logoSha256: string | null };
  allegati: readonly RtAllegato[];
}

export interface Rt2Composed {
  derived: Rt2Derivato;
  doc: FascicoloDoc;
  docSha: string;
  results: unknown;
  snapshot: unknown;
  sha256: string;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const asJson = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The results an issued RT keeps: the derivation without its base and context's calculation. */
export function rt2Results(d: Rt2Derivato): Json {
  return asJson({
    engineVersion: RT2_ENGINE_VERSION, norma: d.ctx.norma, dopo: d.ctx.dopo, prima: d.ctx.prima, richiesti: d.richiesti, componenti: d.componenti,
    valori: Object.fromEntries(Object.entries(d.esiti).map(([k, e]) => [k, e?.valori ?? {}])), verifiche: d.verifiche, allegati: d.allegati,
    mancanti: d.mancanti, esito: d.esito, fails: d.fails, warns: d.warns,
  }) as unknown as Json;
}

/** The inputs with each file named by its place in the RT (never a database id). */
function inputsSnapshot(x: Rt2Inputs, allegati: readonly RtAllegato[]): Json {
  const pos = (id: string): number | null => allegati.find((a) => a.attachmentId === id)?.position ?? null;
  return asJson({ ...x, allegati: (x.allegati ?? []).map((a) => ({ allegato: pos(a.attachmentId), ...(a.titolo ? { titolo: a.titolo } : {}) })) }) as unknown as Json;
}

const identDi = (p: Rt2Parts): IdentRt2 => ({
  matricola: p.project.plantNumber ?? '', indirizzo: p.project.address ?? '',
  capCitta: [p.project.city, p.project.province ? `(${p.project.province})` : null].filter(Boolean).join(' '),
  proprietario: p.base.base.anagrafica.proprietario?.nome ?? '', azienda: p.company.name, logo: p.company.logo ? 'logo' : null,
  numero: p.number ? `RT ${p.number} R${p.revision}` : 'BOZZA',
});

export function composeRt2(p: Rt2Parts): Rt2Composed {
  const derived = deriveRt2(p.base.base, p.inputs), id = identDi(p);
  const code = p.number ? `${id.numero} · calcolo ${sha16(p.base.calc.sha256)}… · ${giorno(p.inputs.doc?.data)}` : 'BOZZA — non emessa, non valida per la firma';
  const doc = buildFascicolo(derived, p.inputs, id, p.allegati.map((a) => ({ position: a.position, title: a.title })), { code }, p.company.logo);
  const docSha = rtDocSha(doc), results = rt2Results(derived);
  const snapshot = {
    engine: RT2_ENGINE_VERSION, number: p.number ?? '', revision: p.revision, revisions: asJson(p.revisions) as unknown as Json,
    calc: { id: p.base.calc.id, sha256: p.base.calc.sha256 }, collaudo: asJson(p.base.base.C) as unknown as Json,
    anagrafica: asJson(p.base.base.anagrafica) as unknown as Json, liftUse: p.base.base.liftUse ?? null, project: asJson(p.project) as unknown as Json,
    company: { name: p.company.name, logoSha256: p.company.logoSha256 }, inputs: inputsSnapshot(p.inputs, p.allegati),
    allegati: p.allegati.map((a) => ({ position: a.position, kind: a.kind, title: a.title, sha256: a.sha256, pages: a.pages })), results, docSha,
  };
  return { derived, doc, docSha, results, snapshot, sha256: rtHash(snapshot) };
}
