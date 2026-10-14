// Round 37: a distance of the plan set by hand never puts a part beyond the shaft's walls (src/shaft/plan-inside.ts):
// the save refuses it at that distance with the range it may take, the drawing's edit says it, and a machine below's
// runs never measure NaN round a counterweight placed past the wall (bottom.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { checkedInputs } from '@/lib/shaft-edit';
import { layout, planOutside, type ShaftInputs } from '@/shaft';

const withPlan = (S: ShaftInputs, plan: NonNullable<ShaftInputs['plan']>): ShaftInputs => ({ ...S, plan: { ...(S.plan ?? {}), ...plan } });
const refused = (S: ShaftInputs) => {
  const r = shaftInputsSchema.safeParse(S);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, max: i.code === 'too_big' ? Number(i.maximum) : null, min: i.code === 'too_small' ? Number(i.minimum) : null }));
};

test('distanze della pianta oltre le pareti del vano: rifiutate a quella distanza, con il campo che possono prendere', () => {
  const S = newLift().shaft, L = layout(S), { W, D } = S;
  assert.deepEqual(planOutside(L), [], 'senza distanze a mano nulla è fuori');
  // the counterweight at the rear: its start past W less its length
  const len = L.cw.w;
  assert.deepEqual(refused(withPlan(S, { cwPos: W + 40 })), [{ path: 'plan.cwPos', code: 'too_big', max: W - len, min: null }]);
  assert.deepEqual(refused(withPlan(S, { cwPos: W - len })), [], 'contro la parete laterale: dentro');
  // its length alone (centred) longer than the wall
  assert.deepEqual(refused(withPlan(S, { cwLen: 3000 })).map((x) => x.path), ['plan.cwLen']);
  // the car, a door's opening (car and landing), the buffers' plates, the governor's rope and the car rails
  for (const [plan, path] of [
    [{ carX: W }, 'plan.carX'], [{ doorA: W }, 'plan.doorA'], [{ landA: W }, 'plan.landA'], [{ bufX: W + 500 }, 'plan.bufX'],
    [{ bufY: D + 500 }, 'plan.bufY'], [{ cwBufPos: W + 500 }, 'plan.cwBufPos'], [{ govX: 2900 }, 'plan.govX'], [{ govY: D + 500 }, 'plan.govY'],
    [{ railY: D + 500 }, 'plan.railY'],
  ] as const) {
    const r = refused(withPlan(S, plan));
    assert.deepEqual(r.map((x) => x.path), [path], JSON.stringify(plan));
    const max = r[0]?.max;
    assert.ok(max !== null && max !== undefined && max > 0, `${path}: il massimo che prende`);
    assert.deepEqual(refused(withPlan(S, { [path.slice(5)]: max })), [], `${path} = ${max}: dentro`);
  }
  // the edit on the drawing gives the bound of the value typed
  const e = checkedInputs(withPlan(S, { cwPos: W + 40 }), S);
  assert.deepEqual(e, { ok: false, min: null, max: W - len, path: 'plan.cwPos' });
});

test('contrappeso oltre la parete con l’argano in basso: nessuna verifica NaN, il salvataggio lo rifiuta', () => {
  const n = newLift();
  for (const bottom of ['head', 'room', 'under'] as const) {
    const inp: LiftInputs = { ...n, calc: { ...n.calc, layout: 'bottom' }, shaft: { ...n.shaft, room: null, plan: { cwPos: n.shaft.W + 40 } }, bottom };
    assert.equal(liftInputsSchema.safeParse(inp).success, false, bottom);
    // the derivation (the browser shows it while the value is typed) stays finite: until round 37 the runs' offset was
    // the root of a negative number and m_runs, m_fit, m_panel and m_free were NaN, the drawing set threw
    const d = deriveLift(inp);
    assert.deepEqual(d.supportChecks.filter((c) => c.value !== null && !Number.isFinite(c.value)).map((c) => c.id), [], bottom);
    if (d.bottomGap) assert.ok(Number.isFinite(d.bottomGap.now), bottom);
    // a record saved so before the save refused it: the derivation names the distance, its documents wait (lift-record.ts)
    assert.ok(d.issues.includes('shaft.plan.cwPos'), bottom);
  }
});
