'use client';

// The remedies of the Progetto's checks (round 54): the search on the drawing as it stands (lib/rimedi/progetto.ts) —
// only once what is shown has caught up with the form —, «Applica» as a dimension typed on the drawings (setDrawn), a
// check of the machine sent to «Calcolo argano» with the drawing kept first («Porta nel calcolo»).
import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { LiftDerived } from '@/lib/lift';
import type { BaseCalcolo, ProgettoDraft } from '@/lib/lift/progetto';
import { doveProgetto, rimediProgetto } from '@/lib/rimedi/progetto';
import { editLabel, type BracketPitches, type ShaftInputs } from '@/shaft';
import { senzaUnita, type FonteRimedi } from '../rimedi/RimediVerifica';

export function useRimediProgetto({ form, base, derived, pitches, settled, applica, calcolo }: {
  form: ProgettoDraft; base: BaseCalcolo; derived: LiftDerived | null; pitches?: BracketPitches; settled: boolean;
  applica(shaft: ShaftInputs): void; calcolo: (() => void) | null;
}): FonteRimedi<ShaftInputs> | null {
  const ts = useTranslations('shaft'), tr = useTranslations('rimedi');
  // the screen's own callbacks change each render: the search starts again only when the drawing does
  const act = useRef({ applica, calcolo });
  useEffect(() => { act.current = { applica, calcolo }; });
  const conCalcolo = !!calcolo;
  return useMemo(() => {
    if (!derived || !settled) return null;
    const c = { form, base, derived, ...(pitches ? { pitches } : {}) }, cantilever = derived.layout.frame.kind === 'cantilever';
    return {
      dove: (id) => doveProgetto(c, id),
      cerca: (id, o) => rimediProgetto(c, id, (k) => ts(k), o),
      applica: (r) => act.current.applica(r.inputs),
      // the drawing's numbers are millimetres
      // the machine room's sizes named as the room's (its fields read «Larghezza interna», «Altezza libera» …)
      leva: (key) => {
        const nome = senzaUnita(ts(key === 'governor' ? 'gov_title' : editLabel(key, cantilever)));
        return key.startsWith('room.') && key !== 'room.motor' ? `${tr('locale')}: ${nome.charAt(0).toLowerCase()}${nome.slice(1)}` : nome;
      },
      unita: () => 'mm',
      // a refuge of type 2 or 3 asks what the type asks (rimedi.notaRifugio)
      notaLeva: (r) => ((r.key === 'v.topRefuge' || r.key === 'v.pitRefuge') && r.a !== '1' ? tr('notaRifugio') : null),
      calcolo: conCalcolo ? () => act.current.calcolo?.() : null,
    };
  }, [form, base, derived, pitches, settled, conCalcolo, ts, tr]);
}
