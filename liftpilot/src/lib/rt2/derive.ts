// The RT after the owner's model derived from its base and its inputs (round 52): the context (contesto.ts), the
// components the fascicolo carries (the required ones with their reasons, the added ones), each component's result
// (its module's checks, values and missing inputs), the documents declared, what the issue still needs, and the verdict —
// not met while any check of a component is not met. Everything the document prints and the screen shows comes from
// here; the server derives it again at issue (nothing computed in the browser is trusted). Pure.
import type { Anagrafica } from '../rt/anagrafica';
import { regimeOf } from '../rt/regimi';
import { allegatiDichiarati, allegatiProposti, type AllegatoRt2, type TipiAmm } from './allegati';
import { conProposte } from './campi';
import { CONDIVISI, moduloDi } from './componenti';
import { contestoRt2, type BaseRt2 } from './contesto';
import { componentiRichiesti, componentiScelti, type MotivoRt2 } from './generale';
import type { Rt2Inputs } from './input';
import type { ComponenteRt2, ContestoRt2, DatiRt2, EsitoRt2, VerificaRt2 } from './types';

export type DoveRt2 = 'doc' | 'firme' | 'tecnici' | 'anagrafica' | 'base' | ComponenteRt2;
export interface MancanteRt2 { dove: DoveRt2; campo: string }

export interface Rt2Derivato {
  ctx: ContestoRt2;
  richiesti: { id: ComponenteRt2; motivi: MotivoRt2[] }[];
  componenti: ComponenteRt2[];
  /** each component's inputs with the software's proposals under them, and its result */
  dati: Partial<Record<ComponenteRt2, DatiRt2>>;
  esiti: Partial<Record<ComponenteRt2, EsitoRt2>>;
  verifiche: (VerificaRt2 & { componente: ComponenteRt2 })[];
  proposti: AllegatoRt2[];
  allegati: AllegatoRt2[];
  mancanti: MancanteRt2[];
  esito: 'ok' | 'warn' | 'fail';
  fails: number;
  warns: number;
}

const tipoAmm = (x: DatiRt2 | undefined): string | undefined => (typeof x?.tipo === 'string' ? x.tipo : undefined);

/** What the first page and the signatures need to issue (blocking). */
function mancantiDoc(x: Rt2Inputs, a: Anagrafica, ctx: ContestoRt2): MancanteRt2[] {
  const d = x.doc, r = x.firme?.redatto, v = x.firme?.verificato;
  const campi: [DoveRt2, string, boolean][] = [
    ['doc', 'doc.costruttore', !d?.costruttore], ['doc', 'doc.utentiEsperti', !d?.utentiEsperti],
    ['doc', 'doc.ascensorista', (d?.ascensorista?.length ?? 0) < 2], ['doc', 'doc.componentiModificati', (d?.componentiModificati?.length ?? 0) < 20],
    ['firme', 'firme.redatto.nome', (r?.nome?.length ?? 0) < 2], ['firme', 'firme.verificato.titolo', !v?.titolo],
    ['firme', 'firme.verificato.nome', (v?.nome?.length ?? 0) < 2], ['firme', 'firme.verificato.provincia', (v?.provincia?.length ?? 0) < 2],
    ['firme', 'firme.verificato.numero', !v?.numero],
    ['anagrafica', 'anagrafica.proprietario.nome', !a.proprietario?.nome],
    ['anagrafica', 'anagrafica.legge', !regimeOf(a, ctx.norma).emettibile],
    ['base', 'calcolo.carichi', ctx.dopo.Q === null || ctx.dopo.P === null || ctx.dopo.Mcw === null],
    ['base', 'calcolo.velocita', ctx.dopo.v === null], ['base', 'calcolo.corsa', ctx.dopo.H === null],
  ];
  return campi.filter(([, , manca]) => manca).map(([dove, campo]) => ({ dove, campo }));
}

/** The components' inputs with each shared field (CONDIVISI) at its one value: the first component of its group that has
 *  it gives it to the others. */
export function datiCondivisi(dati: Rt2Inputs['dati']): Partial<Record<ComponenteRt2, DatiRt2>> {
  const out: Partial<Record<ComponenteRt2, DatiRt2>> = { ...(dati ?? {}) };
  for (const [campo, gruppo] of Object.entries(CONDIVISI)) {
    const v = gruppo.map((c) => out[c]?.[campo]).find((x) => x !== undefined);
    if (v === undefined) continue;
    for (const c of gruppo) out[c] = { ...(out[c] ?? {}), [campo]: v };
  }
  return out;
}

export function deriveRt2(base: BaseRt2, x: Rt2Inputs): Rt2Derivato {
  const ctx = contestoRt2(base, x.tecnici ?? {});
  const req = componentiRichiesti(ctx);
  const componenti = componentiScelti(req, x.aggiunti ?? []).filter((c) => moduloDi(c) !== null), condivisi = datiCondivisi(x.dati);
  const dati: Partial<Record<ComponenteRt2, DatiRt2>> = {}, esiti: Partial<Record<ComponenteRt2, EsitoRt2>> = {};
  const verifiche: Rt2Derivato['verifiche'] = [], mancanti: MancanteRt2[] = [...mancantiDoc(x, base.anagrafica, ctx)];
  for (const c of componenti) {
    const m = moduloDi(c);
    if (!m) continue;
    const d = conProposte(condivisi[c] ?? {}, m.proposte?.(ctx));
    const e = m.calcola(ctx, d);
    dati[c] = d;
    esiti[c] = e;
    verifiche.push(...e.verifiche.map((v) => ({ ...v, componente: c })));
    mancanti.push(...e.mancanti.map((campo) => ({ dove: c, campo })));
  }
  const amm: TipiAmm = { ammCabina: tipoAmm(dati.ammCabina), ammCwt: tipoAmm(dati.ammCwt) };
  const proposti = allegatiProposti(ctx, componenti, amm);
  const fails = verifiche.filter((v) => v.esito === 'fail').length, warns = verifiche.filter((v) => v.esito === 'warn').length;
  return {
    ctx, richiesti: [...req].map(([id, motivi]) => ({ id, motivi })), componenti, dati, esiti, verifiche,
    proposti: [...proposti], allegati: allegatiDichiarati(proposti, x.dichiarati), mancanti,
    esito: fails ? 'fail' : warns ? 'warn' : 'ok', fails, warns,
  };
}
