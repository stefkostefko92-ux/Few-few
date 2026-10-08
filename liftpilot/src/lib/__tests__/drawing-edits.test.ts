// Every dimension of every drawing of a design and of a replacement's machine room: each editable one, given 10 mm more
// the way the screens give it (the workspace's path: the drawn shaft, the support it shows, the panel the software
// placed), reads the new value once the design is derived and drawn again; the screens offer every editable one as a
// hit (every input a dimension changes is reachable there); the ones that cannot be changed are only the references the
// machine, the ropes and the calculation set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import type { Chain, Edit, Entity } from '@/drawing';
import { deriveLift, newLift, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { drawnShaft, edited, enteredShaft, movedPanel, panelEntered } from '@/lib/lift/panel-form';
import { editShaft } from '@/lib/shaft-edit';
import { deriveRoom } from '@/lib/room/derive';
import { applySurveyEdit } from '@/lib/room/edit';
import { startSurvey, surveySchema, type Survey } from '@/lib/room/survey';
import { belowPlanEntities, belowSectionEntities } from '@/lib/tavole/below-view';
import { belowGeoOf, detailWindow, realSection, screenView, type ScreenView } from '@/lib/tavole/views';
import { editValue, keptPlan, layout, planDims, planEntities, roomGeo, roomPlanEntities, roomSectionEntities, section, sectionDims, sectionEntities, type ShaftInputs } from '@/shaft';
import { roomPlanOn, roomSectionOn } from '@/shaft/room-view';

const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
const reads = (c: Chain, i: number): number => Math.round(c.edit?.[i]?.value ?? Math.abs(c.pts[i + 1] - c.pts[i]));
const label = (c: Chain, i: number): string => (c.text?.[i] ?? '{v}').replace('{v}', '#').replace(/\d+/g, '#');
const sig = (c: Chain): string => JSON.stringify([c.dir, (c.text ?? []).map((t) => (t ?? '').replace(/[\d.,]+/g, '#')), (c.edit ?? []).map((e) => e?.key ?? null)]);
/** The chain of `after` that is chain j of `before`: the same index when its signature agrees, else the k-th alike. */
function match(before: Chain[], after: Chain[], j: number): Chain | undefined {
  const s = sig(before[j]);
  if (after[j] && sig(after[j]) === s) return after[j];
  return after.filter((c) => sig(c) === s)[before.slice(0, j).filter((c) => sig(c) === s).length];
}

// the references: what the machine, the ropes and the calculation set, drawn to be read, not changed
const REFERENCES = new Set(['# Telaio argano', '# × # Telaio con rinvio', '# Telaio con rinvio', 'Asse rinvio #', 'Asse argano #', 'below-section:Asse #', 'below-plan:#',
  'survey-plan:#', 'Calata Funi #', '# Calata Funi (Rif.)', 'Vano # (Rif.)', 'survey-section:dx #', 'survey-section:h #']);
const isReference = (view: string, text: string): boolean => REFERENCES.has(text) || REFERENCES.has(`${view}:${text}`);

type View = { name: string; draw: (d: LiftDerived, I: ShaftInputs) => Entity[] | null };
const main = (I: ShaftInputs): number => Math.min(I.vertical.main, I.vertical.floors.length - 1);
const VIEWS: View[] = [
  ...(['main', 'top', 'pit'] as const).map((level): View => ({
    name: `plan-${level}`, draw: (_d, I) => {
      const L = layout(I), floor = level === 'top' ? I.vertical.floors.length - 1 : level === 'main' ? main(I) : 0;
      return [...planEntities(L, level, floor), ...planDims(L, level, floor, { level: 'x' })];
    },
  })),
  ...(['full', 'top', 'floor', 'pit'] as const).map((kind): View => ({
    name: `section-${kind}`, draw: (_d, I) => {
      const L = layout(I), S = section(L), v = kind === 'full' ? realSection(L) : detailWindow(L, kind, kind === 'floor' ? main(I) : kind === 'pit' ? 0 : I.vertical.floors.length - 1);
      return [...sectionEntities(L, v).entities, ...sectionDims(L, S, kind, v.carFloor, v.zmap)];
    },
  })),
  ...(['plan', 'section'] as const).map((kind): View => ({
    name: `room-${kind}`, draw: (d, I) => {
      if (d.bottom) return null;
      const L = layout(I), G = roomGeo(L, d.machine);
      return G ? (kind === 'plan' ? roomPlanEntities(L, d.machine, G) : roomSectionEntities(L, d.machine, G)).entities : null;
    },
  })),
  ...(['plan', 'section'] as const).map((kind): View => ({
    name: `below-${kind}`, draw: (d, I) => {
      if (!d.bottom) return null;
      const L = layout(I), g = belowGeoOf(d.analysis, L, d.machine, d.bottom);
      return (kind === 'plan' ? belowPlanEntities(L, d.machine, g) : belowSectionEntities(L, d.machine, g)).entities;
    },
  })),
];
const SCREEN: Readonly<Record<string, ScreenView>> = { 'plan-main': 'plan', 'plan-top': 'head', 'plan-pit': 'pit-plan', 'section-top': 'top', 'section-floor': 'floor',
  'section-pit': 'pit', 'room-plan': 'room-plan', 'room-section': 'room-section', 'below-plan': 'below-plan', 'below-section': 'below-section' };

/** The form after a drawing's edit, as LiftWorkspace applies it; null when refused. */
function applyLift(inp: LiftInputs, d: LiftDerived, e: Edit, length: number): LiftInputs | null {
  if (e.key.startsWith('calc.')) {
    const v = editValue(e, length);
    return e.key === 'calc.h' && v >= 0 ? { ...inp, calc: { ...inp.calc, h: v / 1000 } } : null;
  }
  const r = editShaft(edited(drawnShaft(inp.shaft, d), e, d), e, length);
  if (!r.ok) return null;
  const moved = movedPanel(r.inputs, d), out = moved ? panelEntered({ inputs: inp, blank: [] }, moved).inputs : inp;
  const sh: ShaftInputs = { ...out.shaft, ...enteredShaft(r.inputs, inp.shaft, d) };
  return { ...out, shaft: { ...sh, plan: keptPlan(out.shaft, sh) } };
}

function checkLift(name: string, inp: LiftInputs): void {
  const d = deriveLift(inp), I = drawnShaft(inp.shaft, d);
  for (const V of VIEWS) {
    const ents = V.draw(d, I);
    if (!ents) continue;
    const cs = chains(ents), editable: string[] = [];
    cs.forEach((c, j) => c.pts.slice(1).forEach((p, i) => {
      if (Math.abs(p - c.pts[i]) < 0.5) return;
      const e = c.edit?.[i], text = label(c, i);
      if (!e) { assert.ok(isReference(V.name, text), `${name} ${V.name}: «${text}» non si cambia`); return; }
      editable.push(e.key);
      if (e.pick) return;
      const now = reads(c, i), next = applyLift(inp, d, e, now + 10);
      if (!next) return;
      const d2 = deriveLift(next), after = V.draw(d2, drawnShaft(next.shaft, d2)), c2 = after ? match(cs, chains(after), j) : undefined;
      assert.equal(c2 ? reads(c2, i) : null, now + 10, `${name} ${V.name} ${e.key} «${text}»`);
    }));
    // the screens offer each editable one
    const sv = SCREEN[V.name];
    if (!sv) continue;
    const below = d.bottom ? { machine: d.machine, analysis: d.analysis, scheme: d.bottom } : null;
    const r = screenView(layout(I), sv, d.bottom ? null : d.machine, below);
    assert.ok(r, `${name} ${sv}`);
    assert.deepEqual([...new Set(r.hits.map((h) => h.edit.key))].sort(), [...new Set(editable)].sort(), `${name} ${sv}: colpi`);
  }
}

function checkSurvey(name: string, V: FormValues, s0: Survey): void {
  const s = surveySchema.parse(s0);
  for (const kind of ['plan', 'section'] as const) {
    const draw = (x: Survey): Entity[] | null => {
      const r = deriveRoom(V, x);
      return r.G ? (kind === 'plan' ? roomPlanOn(r.site, r.M, r.G) : roomSectionOn(r.site, r.M, r.G)).entities : null;
    };
    const ents = draw(s);
    assert.ok(ents, name);
    const cs = chains(ents);
    cs.forEach((c, j) => c.pts.slice(1).forEach((p, i) => {
      if (Math.abs(p - c.pts[i]) < 0.5) return;
      const e = c.edit?.[i], text = label(c, i);
      if (!e) { assert.ok(isReference(`survey-${kind}`, text), `${name} ${kind}: «${text}» non si cambia`); return; }
      if (e.pick) return;
      const now = reads(c, i), next = applySurveyEdit(s, e, now + 10);
      if (!next || !surveySchema.safeParse(next).success) return;
      const after = draw(next), c2 = after ? match(cs, chains(after), j) : undefined;
      assert.equal(c2 ? reads(c2, i) : null, now + 10, `${name} ${kind} ${e.key} «${text}»`);
    }));
  }
}

const base = newLift(), room = base.shaft.room;
const sh = (p: Partial<ShaftInputs>, i: LiftInputs = base): LiftInputs => ({ ...i, shaft: { ...i.shaft, ...p } });
const calc = (p: FormValues, i: LiftInputs = base): LiftInputs => ({ ...i, calc: { ...i.calc, ...p } });

test('ogni quota di ogni foglio del progetto si cambia e legge il valore dato', () => {
  assert.ok(room);
  const LIFTS: [string, LiftInputs][] = [
    ['rinvio', base],
    // a drop line askew (the counterweight off the car's axis): its true length typed (until LIFT 1.27.0 its leg along
    // the axis); the machine fixed, or the proposal takes another sheave and dx moves with it
    ['obliqua di lato', { ...sh({ cw: 'left', plan: { cwPos: 300 } }), auto: { ...base.auto, machine: false } }],
    ['obliqua dietro', { ...sh({ cw: 'rear', plan: { cwPos: 550 } }), auto: { ...base.auto, machine: false } }],
    ['tiro diretto 2:1', calc({ layout: 'top', r: '2' })],
    ['putrelle HEB', sh({ room: { ...room, support: { kind: 'shims' }, heb: {} } })],
    ['limitatore a mano', sh({ plan: { govX: 90, govY: 700 } })],
    ['macchina in basso', { ...calc({ layout: 'bottom' }), bottom: 'head' }],
    ['sotto il vano, locale a misura', { ...calc({ layout: 'bottom' }, sh({ below: { W: 2600, D: 2400, H: 2500 } })), bottom: 'under' }],
  ];
  for (const [name, inp] of LIFTS) checkLift(name, inp);
});

test('ogni quota del locale rilevato si cambia e legge il valore dato', () => {
  const V: FormValues = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 }, s0 = startSurvey(780);
  checkSurvey('rinvio', V, s0);
  checkSurvey('putrelle HEB', V, { ...s0, room: { ...s0.room, heb: {} } });
  checkSurvey('telaio', V, { ...s0, room: { ...s0.room, support: { kind: 'frame' } } });
});
