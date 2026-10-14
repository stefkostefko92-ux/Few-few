// The installations a survey probably belongs to (round 44, «Collega a un impianto»): among the company's active ones,
// first those of the same matricola (their «Numero di matricola» or one of their surveys'), then those with a survey of the
// same lift's number, then those at the same address (by its words, testo.ts) — each with why it is suggested. The installation the
// survey is already linked to is not suggested. Pure: the candidates come from the server, always of one company.
import { indirizzoImpianto, stessoCodice, stessoIndirizzo } from './testo';

export type Motivo = 'matricola' | 'numero' | 'indirizzo';

export interface Candidato {
  id: string;
  name: string;
  kind: 'REPLACEMENT' | 'FULL';
  address: string | null;
  city: string | null;
  province: string | null;
  plantNumber: string | null;
  updatedAt: Date;
  /** the installation's linked surveys (not in the trash) */
  schede: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null }[];
}

export interface Suggerimento {
  id: string;
  name: string;
  kind: Candidato['kind'];
  indirizzo: string | null;
  plantNumber: string | null;
  motivi: Motivo[];
}

const PESO: Readonly<Record<Motivo, number>> = { matricola: 3, numero: 2, indirizzo: 1 };

/** Why an installation fits the survey, strongest first; empty — it does not. */
export function motiviDi(r: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null }, c: Candidato): Motivo[] {
  const out: Motivo[] = [];
  if (r.matricola && (stessoCodice(c.plantNumber, r.matricola) || c.schede.some((s) => stessoCodice(s.matricola, r.matricola)))) out.push('matricola');
  if (r.numeroImpianto && c.schede.some((s) => stessoCodice(s.numeroImpianto, r.numeroImpianto))) out.push('numero');
  if (r.indirizzo && (stessoIndirizzo(indirizzoImpianto(c), r.indirizzo) || stessoIndirizzo(c.address, r.indirizzo)
    || c.schede.some((s) => stessoIndirizzo(s.indirizzo, r.indirizzo)))) out.push('indirizzo');
  return out;
}

/** The suggestions in order: the strongest reason, then the number of reasons, then the latest changed; at most `max`. */
export function suggerimenti(r: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null; projectId: string | null },
  candidati: readonly Candidato[], max = 5): Suggerimento[] {
  return candidati
    .filter((c) => c.id !== r.projectId)
    .map((c) => ({ c, motivi: motiviDi(r, c) }))
    .filter((x) => x.motivi.length > 0)
    .sort((a, b) => PESO[b.motivi[0] as Motivo] - PESO[a.motivi[0] as Motivo] || b.motivi.length - a.motivi.length || b.c.updatedAt.getTime() - a.c.updatedAt.getTime())
    .slice(0, max)
    .map(({ c, motivi }) => ({ id: c.id, name: c.name, kind: c.kind, indirizzo: indirizzoImpianto(c), plantNumber: c.plantNumber, motivi }));
}
