// A group's name with its «?» (round 52) — for a fieldset what components/aiuto/Etichetta.tsx is for a label: a choice of
// the sheet, a stop's «Display», a group of a supplier's module, the print's choices. The name and the «?» sit together
// inside the legend (hovering the name shows the explanation too, as with a label), and the group stays named by the
// name alone — the fieldset's aria-labelledby points at it —, so a screen reader reads the group as before and the «?» as
// a button of its own. Without a text: the bare name, and the group named by its legend as before.
import type { ReactNode } from 'react';
import Aiuto from '../aiuto/Aiuto';

export function legenda(id: string, nome: string, aiuto: string | null): { testo: ReactNode; labelledBy: string | undefined } {
  if (!aiuto) return { testo: nome, labelledBy: undefined };
  return { testo: <span className="lbl"><span id={id}>{nome}</span><Aiuto testo={aiuto} nome={nome} /></span>, labelledBy: id };
}
