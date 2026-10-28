// The remedies of a check of the machine room surveyed for a replacement (round 54): the levers of the Progetto's machine
// room (vano.ts) that the survey holds — the new machine's support (profile, height, length), the HEB beams, the motor's
// side, the control panel (place and size), the room's size, height and door as masonry — tried on the survey worked out
// again with its calculation (deriveRoom, the calculation analysed once), validated as the save validates it. What was
// measured of the shaft and the existing drops is never a lever. Pure.
import type { FormValues } from '@/calc/types';
import { analyse, type Analysis } from '@/lib/present/analysis';
import { deriveRoom } from '@/lib/room/derive';
import { surveySaveSchema, type Survey } from '@/lib/room/survey';
import { HEB_PROFILES, PROFILE_NAMES, supportOf } from '@/shaft';
import { withHebChoice } from '@/shaft/heb';
import { cercaRimedi, type Opzioni } from './cerca';
import { esitoDi } from './margine';
import type { Esito, Leva, Rimedio, Valuta } from './tipi';
import { costoDi, leveDi } from './vano';

/** The survey as the screen holds it, on its calculation. */
export interface ContestoLocale {
  values: FormValues;
  survey: Survey;
}

const NUM_ROOM = ['W', 'D', 'H', 'doorAt', 'doorW', 'doorH', 'panelAt', 'panelW', 'panelD', 'panelH'] as const;
type NumRoom = (typeof NUM_ROOM)[number];
const isNumRoom = (k: string): k is NumRoom => (NUM_ROOM as readonly string[]).includes(k);

/** The survey validated as the save validates it; null: refused. */
const valida = (s: Survey): Survey | null => (surveySaveSchema.safeParse(s).success ? s : null);

/** A survey's result: its checks (every one that does not pass or passes with «Attenzione»). */
export const esitoLocale = (V: FormValues, s: Survey, a: Analysis = analyse(V)): { esito: Esito; issues: readonly string[] } => {
  const d = deriveRoom(V, s, a);
  return { esito: esitoDi(null, [], d.checks), issues: d.issues };
};

/** The survey worked out again; null where it raises an issue it did not raise before. */
export function valutaLocale(c: ContestoLocale): Valuta<Survey> {
  const a = analyse(c.values), before = new Set(esitoLocale(c.values, c.survey, a).issues);
  return (s) => {
    try {
      const r = esitoLocale(c.values, s, a);
      return r.issues.some((i) => !before.has(i)) ? null : r.esito;
    } catch {
      return null;
    }
  };
}

/** The levers of check `id` the survey holds (`label`: a list entry's name by its message key). */
export function leveLocale(id: string, s: Survey, label: (key: string) => string): Leva<Survey>[] {
  const R = s.room;
  return leveDi(id).flatMap((w): Leva<Survey>[] => {
    const m = /^(.*?)([+\-±])?$/.exec(w), key = m?.[1] ?? w, costo = costoDi(key), sign = m?.[2], dir = sign === '+' ? 1 : sign === '-' ? -1 : 0;
    if (!costo) return [];
    const sub = key.slice(key.indexOf('.') + 1);
    if (key.startsWith('room.') && isNumRoom(sub)) {
      const da = R[sub];
      return [{ tipo: 'num', key, costo, da, dir, passo: 10, min: Math.max(0, da - 1500), max: da + 1500, set: (S, x) => valida({ ...S, room: { ...S.room, [sub]: Math.round(x) } }) }];
    }
    if (key === 'sup.height' || key === 'sup.length') {
      const k = key === 'sup.height' ? 'height' : 'length', sup = supportOf(R), da = sup[k];
      return da === undefined ? [] : [{ tipo: 'num', key, costo, da, dir, passo: 10, min: 0, max: da + 1500, set: (S, x) => valida({ ...S, room: { ...S.room, support: { ...supportOf(S.room), [k]: Math.round(x) } } }) }];
    }
    if (key === 'sup.profile') {
      const sup = supportOf(R);
      return [{ tipo: 'scelta', key, costo, da: sup.profile ?? '', opzioni: PROFILE_NAMES.map((p) => ({ id: p, label: p })),
        set: (S, p) => valida({ ...S, room: { ...S.room, support: { kind: supportOf(S.room).kind, profile: PROFILE_NAMES.find((x) => x === p) ?? sup.profile } } }) }];
    }
    if (key === 'heb.option' && R.heb) {
      const da = R.heb.profile && R.heb.dir ? `${R.heb.dir}:${R.heb.profile}` : '';
      return [{ tipo: 'scelta', key, costo, da, opzioni: (['x', 'y'] as const).flatMap((d) => HEB_PROFILES.map((p) => ({ id: `${d}:${p}`, label: `${p} · ${d}` }))),
        set: (S, o) => { const room = withHebChoice(S.room, 'heb.option', o); return room ? valida({ ...S, room }) : null; } }];
    }
    if (key === 'room.motor') {
      return [{ tipo: 'scelta', key, costo, da: R.motor ?? '', opzioni: (['cw', 'car'] as const).map((x) => ({ id: x, label: label(`rm_motor_${x}`) })),
        set: (S, x) => (x === 'cw' || x === 'car' ? valida({ ...S, room: { ...S.room, motor: x } }) : null) }];
    }
    return [];
  });
}

/** The remedies of check `id` of the survey. */
export function rimediLocale(c: ContestoLocale, id: string, label: (key: string) => string, o: Opzioni = {}): Promise<Rimedio<Survey>[]> {
  const a = analyse(c.values);
  return cercaRimedi(c.survey, esitoLocale(c.values, c.survey, a).esito, id, leveLocale(id, c.survey, label), valutaLocale(c), { ogni: 5, ...o });
}
