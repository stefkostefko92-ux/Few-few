// The documents the fascicolo declares attached (the owner's model, sheet «Allegati», B63:B77 in its order): each one
// «si» or «no», proposed by the components of the RT and by the changes of the loads — the engineer confirms or changes
// each — and printed as a list on the «Allegati» page, only those «si» (the model leaves an empty line for the others:
// E-AL-2). The files uploaded to the RT are attached after the body (report/pdf-tool.mjs). Pure.
import type { ComponenteRt2, ContestoRt2 } from './types';

export const ALLEGATI_RT2 = [
  'schemaElettrico', 'ceQuadro', 'paracadute', 'serrature', 'limitatore', 'porteEI', 'funiTrazione', 'funeLimitatore', 'ceArgano',
  'ammortizzatori', 'molle', 'idoneitaEdificio', 'disegno', 'telesoccorso', 'libretto',
] as const;
export type AllegatoRt2 = (typeof ALLEGATI_RT2)[number];

/** The line printed for each (the model's text) and the label of its choice on the screen (the model's, sheet
 *  «Allegati» E4:M10). */
export const ALLEGATO_TESTO: Readonly<Record<AllegatoRt2, { stampa: string; scelta: string }>> = {
  schemaElettrico: { stampa: 'Schema elettrico impianto', scelta: 'Schema elettrico' },
  ceQuadro: { stampa: 'Dichiarazione CE di conformità Quadro Manovra', scelta: 'CE quadro' },
  paracadute: { stampa: 'Dichiarazione CE di conformità e di esame di tipo per Blocco Paracadute', scelta: 'Certificato Blocco paracadute' },
  serrature: { stampa: 'Dichiarazione CE di conformità per Blocco Serrature porte di piano', scelta: 'Certificato serrature porte' },
  limitatore: { stampa: 'Dichiarazione CE di conformità per Limitatore di velocità', scelta: 'Certificato limitatore' },
  porteEI: { stampa: 'Certificato di resistenza al fuoco per le porte di piano', scelta: 'Certificato EI porte Tagliafuoco' },
  funiTrazione: { stampa: 'Certificato di conformità funi di trazione', scelta: 'Funi di trazione' },
  funeLimitatore: { stampa: 'Certificato di conformità fune limitatore', scelta: 'fune limitatore' },
  ceArgano: { stampa: 'Dichiarazione CE di conformità Argano', scelta: 'CE argano' },
  ammortizzatori: { stampa: 'Dichiarazione CE di conformità Ammortizzatore', scelta: 'Certificati ammortizzatori in autan o idraulici' },
  molle: { stampa: 'Caratteristiche Ammortizzatori a molla', scelta: 'molle' },
  idoneitaEdificio: { stampa: 'Dichiarazione idoneità statica strutture portanti dell\'edificio', scelta: 'Dichiarazione di idoneità strutture portanti edificio' },
  disegno: { stampa: 'Disegno Disposizione impianto (post-ammodernamento)', scelta: 'Disegno di Disposizione' },
  telesoccorso: { stampa: 'Dichiarazione CE di conformità Dispositivo Telesoccorso', scelta: 'CE telesoccorso' },
  libretto: { stampa: 'Copia Libretto originale impianto', scelta: 'Copia Libretto Originale' },
};

/** The type of each buffer module («molla», «autan», «idraulici»), as its inputs say. */
export type TipiAmm = Partial<Record<'ammCabina' | 'ammCwt', string>>;

/** The documents the RT proposes «si»: by the components chosen, the parts replaced and the loads changed beyond
 *  prospetto 1 (the declaration of the building's fitness: Dati Generali G92, E-DG-5). */
export function allegatiProposti(ctx: ContestoRt2, componenti: readonly ComponenteRt2[], amm: TipiAmm): Set<AllegatoRt2> {
  const out = new Set<AllegatoRt2>(), has = (c: ComponenteRt2): boolean => componenti.includes(c);
  if (has('quadro')) out.add('schemaElettrico').add('ceQuadro');
  if (ctx.parti.includes('safetyGear')) out.add('paracadute');
  if (has('porte')) out.add('serrature');
  if (has('limitatore')) out.add('limitatore').add('funeLimitatore');
  if (has('funi') && ctx.funiSostituite) out.add('funiTrazione');
  if (has('macchina') && ctx.parti.includes('machine')) out.add('ceArgano');
  for (const k of ['ammCabina', 'ammCwt'] as const) {
    if (!has(k)) continue;
    if (amm[k] === 'molla') out.add('molle');
    else out.add('ammortizzatori');
  }
  if (ctx.carico?.p1) out.add('idoneitaEdificio');
  if (ctx.parti.includes('alarm')) out.add('telesoccorso');
  out.add('libretto');
  return out;
}

/** The documents declared: the proposal with the engineer's answers over it. */
export function allegatiDichiarati(proposti: ReadonlySet<AllegatoRt2>, scelte: Partial<Record<AllegatoRt2, boolean>> | undefined): AllegatoRt2[] {
  return ALLEGATI_RT2.filter((a) => scelte?.[a] ?? proposti.has(a));
}
