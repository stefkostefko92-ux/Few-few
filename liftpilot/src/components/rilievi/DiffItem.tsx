// One datum the sheet and its modules say differently (rilievi _discrepanza.ejs): its name in bold, then what each place
// says («Fermate — Scheda: 5 · Ordine quadro: 6»). No state, no hooks: the sheet's page renders it on the server, the form
// in the browser (the server's list, then its own while it is typed).
import { discrepanzaText } from '@/lib/rilievi/form-help';
import type { RilieviT } from '@/lib/rilievi/t';

/** A difference as the lists say it — the server's (ordini/collegati.ts) or the page's own (collegati-client.ts). */
export interface DiffLine {
  key: string;
  voci: readonly { luogo: string; valore: string }[];
}

export function DiffItem({ d, t }: { d: DiffLine; t: RilieviT }) {
  const { nome, dove } = discrepanzaText(d, t);
  return <li><strong>{nome}</strong> — {dove}</li>;
}
