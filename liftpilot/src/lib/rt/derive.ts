// The derivation of a relazione tecnica di modifica (RT plan §4): from its base (the calculation reproduced with its
// room survey or lift design), the engineer's inputs, the installation's registry, the plant data and the files in their
// order — the regime, the rules and the «before and after», the sections and why each is in, each included component's
// data, checks and points, the building's structures, the expected documents, what is missing (blocking: the identity,
// the signatures, the regime; the rest is listed in the issue's confirmation), the verdict over the checks this
// modification requires. The same function on the server at issue and for the preview, never in the browser. Pure.
import type { Plant } from '../plant';
import { carichiOf } from '../lift/modifica';
import { anagraficaMancanti, type Anagrafica } from './anagrafica';
import { areaDopo } from './componenti/cabina';
import type { RtCtx } from './componenti/comune';
import { componentiOf } from './componenti';
import { documentiOf, struttureRt } from './documenti';
import { mancantiEmissione, type RtInputs } from './input';
import { primaDopoOf } from './prima-dopo';
import { regimeOf } from './regimi';
import { regoleOf } from './regole';
import { casiOf, sezioniOf } from './sezioni';
import { rtVerdict } from './snapshot';
import type { MancanteRt, RtAllegato, RtBase, RtDerived } from './types';
import { RT_ENGINE_VERSION } from './version';

export function deriveRt(base: RtBase, inputs: RtInputs, anagrafica: Anagrafica, plant: Plant, allegati: readonly RtAllegato[]): RtDerived {
  const sezioni = sezioniOf(base, inputs);
  const x: RtCtx = {
    base, inputs, plant, anagrafica, allegati, sezioni: sezioni.map((s) => s.key), norma: base.norma, parti: base.collaudo.parti, casi: casiOf(base),
    I: base.analysis.ctx.I, Mcw: base.analysis.res.Mcw, carichi: carichiOf(base.values),
  };
  const comp = componentiOf(x, sezioni), strutture = struttureRt(base, inputs), regime = regimeOf(anagrafica, base.norma);
  // blocking: the registry's identity, the inputs the issue cannot do without, a regime chosen or confirmed and coherent
  const bloccanti: MancanteRt[] = [
    ...anagraficaMancanti(anagrafica).map((c): MancanteRt => ({ dove: 'anagrafica', campo: `anagrafica.${c}`, bloccante: true })),
    ...mancantiEmissione(inputs),
    ...(regime.emettibile ? [] : [{ dove: 'regime' as const, campo: !regime.legge || !regime.coerente ? 'anagrafica.legge' : 'anagrafica.leggeConfermata', bloccante: true }]),
  ];
  const risposte = strutture.esito === 'manca_risposta'
    ? strutture.domande.filter((d) => inputs.strutture?.[d] === undefined).map((d): MancanteRt => ({ dove: 'strutture', campo: `strutture.${d}`, bloccante: false })) : [];
  const v = rtVerdict(comp.checks);
  return {
    engineVersion: RT_ENGINE_VERSION, path: base.path, tipo: base.tipo, norma: base.norma, regime, regole: regoleOf(base), sezioni,
    componenti: comp.componenti, checks: comp.checks, punti: comp.punti, strutture, documenti: documentiOf(base, sezioni, inputs, allegati, plant.safetyGear),
    primaDopo: primaDopoOf(base, anagrafica, areaDopo(x)), mancanti: [...bloccanti, ...risposte, ...comp.mancanti], ...v, base,
  };
}
