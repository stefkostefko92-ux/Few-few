// Side stabilisation of Blum's concealed runners (TANDEM 560H, MOVENTO 760H). The kits, their cutting sizes, the room
// they take (NL + 15 inner depth; on TANDEM 3 mm more under the runner) and TANDEM's TIP-ON exclusion are Blum's
// (engine/data/slide-systems.js, `stabiliser`, with the pages). WHEN to fit one Blum does not put in numbers: „We
// recommend using a side stabiliser with wide pull-outs with a short nominal length“ (TD-127/3, p. 4). The program
// fits it on its own when either rule below holds; both thresholds are our choice (наш избор):
// – KB ≥ 900 mm: Blum's only figures for side stabilisation, on its box systems — LEGRABOX „Recommendation: cabinet
//   width KB 900–1400 mm“ (catalogue 2022/2023, p. 239, https://publications.blum.com/2022/catalogue/en/239/) and
//   TANDEMBOX antaro „KB 900–1200 mm“ (catalogue 2024/2025, p. 329, https://publications.blum.com/2024/catalogue/en/329/);
// – SKW ≥ 1,5 × NL: our reading of „wide pull-outs with a short nominal length“.
// A kit that would cost a step of slide length (NL + 15 does not fit) is left out: the longer slide stays — it is the
// short slide Blum names as the reason — and the warning says how much deeper the cabinet has to be.
export const STABILISER_RULE = { kb: 900, ratio: 1.5 }; // наш избор (above)

// a: { where, KB, LW, NL, depth (inner depth), handle, narrower }. Returns how much more room the runner needs under
// the drawer bottom (mm) and the hardware line for each drawer, or null when the column gets no kit.
export function sideStabiliser(ctx, sys, a) {
  const st = sys.stabiliser;
  if (!st) return null;
  const { where, KB, LW, NL, depth, handle, narrower } = a;
  if (KB > st.maxKB) {
    ctx.warn('warn', ctx.t('w.stabTooWide', { where, kb: ctx.t.num(KB), brand: sys.brand, max: st.maxKB, narrower }));
    return null;
  }
  const SKW = LW - sys.innerWidthMinus;
  const byKB = KB >= STABILISER_RULE.kb;
  if (!byKB && SKW < STABILISER_RULE.ratio * NL) return null;
  const why = byKB
    ? ctx.t('w.stabWhyKB', { kb: ctx.t.num(KB), from: STABILISER_RULE.kb })
    : ctx.t('w.stabWhyRatio', { w: ctx.t.num(SKW), NL, ratio: ctx.t.num(STABILISER_RULE.ratio) });
  const sku = st.kits.find(([upTo]) => NL <= upTo)?.[1];
  if (!sku) return null;
  // without a handle the front opens with TIP-ON or a grip profile (the editor says so): TIP-ON rules the kit out
  if (st.noTipOn && handle === 'none') {
    ctx.warn('warn', ctx.t('w.stabTipOn', { where, sys: ctx.t.of(sys).split(' — ')[0], doc: ctx.t.of(st, 'noTipOn'), why, brand: sys.brand, sku, narrower: narrower.toLowerCase() }));
    return null;
  }
  const need = sys.depthNeeded(NL) + st.depthPlus;
  if (need > depth) {
    ctx.warn('warn', ctx.t('w.stabDepth', { where, why, brand: sys.brand, need: ctx.t.num(need), depth: ctx.t.num(depth), NL, more: ctx.t.num(need - depth) }));
    return null;
  }
  const shaft = Math.round(LW - st.shaftMinus);
  const rack = NL + st.rackPlus;
  ctx.warn('info', ctx.t(st.belowPlus ? 'w.stabAddedBelow' : 'w.stabAdded', { where, brand: sys.brand, sku, why, doc: ctx.t.of(st, 'doc'), need: ctx.t.num(need), below: st.belowPlus }));
  // one set (left/right) per drawer — our reading of „(left/right)“ in the set's name: one shaft across the drawer
  return {
    below: st.belowPlus,
    line: {
      key: `stabiliser:${sku}:${shaft}:${rack}`,
      name: ctx.t('hw.stabiliser', { sku, shaft, minus: st.shaftMinus, rack, plus: st.rackPlus }),
      qty: 1,
      unit: ctx.t('u.set'),
      group: ctx.t('g.hardware'),
      sku,
      brand: sys.brand,
    },
  };
}
