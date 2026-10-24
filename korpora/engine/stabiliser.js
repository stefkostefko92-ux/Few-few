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
import { dimTxt } from './util.js';

export const STABILISER_RULE = { kb: 900, ratio: 1.5 }; // наш избор (above)

const comma = (v) => String(v).replace('.', ',');

// a: { where, KB, LW, NL, depth (inner depth), handle, narrower }. Returns how much more room the runner needs under
// the drawer bottom (mm) and the hardware line for each drawer, or null when the column gets no kit.
export function sideStabiliser(ctx, sys, a) {
  const st = sys.stabiliser;
  if (!st) return null;
  const { where, KB, LW, NL, depth, handle, narrower } = a;
  if (KB > st.maxKB) {
    ctx.warn('warn', `${where}: шкаф ${dimTxt(KB)} mm — ${sys.brand} препоръчва странична стабилизация за широки чекмеджета с къс водач, а комплектът е за шкафове до ${st.maxKB} mm. ${narrower}.`);
    return null;
  }
  const SKW = LW - sys.innerWidthMinus;
  const byKB = KB >= STABILISER_RULE.kb;
  if (!byKB && SKW < STABILISER_RULE.ratio * NL) return null;
  const why = byKB
    ? `шкафът е ${dimTxt(KB)} mm — слага се от ${STABILISER_RULE.kb} mm, наш избор`
    : `вътрешната ширина на чекмеджето е ${dimTxt(SKW)} mm при водач NL ${NL} mm — слага се от ${comma(STABILISER_RULE.ratio)} × NL, наш избор`;
  const sku = st.kits.find(([upTo]) => NL <= upTo)?.[1];
  if (!sku) return null;
  // without a handle the front opens with TIP-ON or a grip profile (the editor says so): TIP-ON rules the kit out
  if (st.noTipOn && handle === 'none') {
    ctx.warn('warn', `${where}: странична стабилизация не е добавена — фронтът е без дръжка (TIP-ON или профил), а комплектът за ${sys.name.split(' — ')[0]} не е съвместим с TIP-ON (${st.noTipOn}). Програмата би я сложила тук (${why}; ${sys.brand} я препоръчва за широки чекмеджета с къс водач): при профил поръчайте ${sku} отделно, при TIP-ON — ${narrower.toLowerCase()}.`);
    return null;
  }
  const need = sys.depthNeeded(NL) + st.depthPlus;
  if (need > depth) {
    ctx.warn('warn', `${where}: програмата слага странична стабилизация (${why}; ${sys.brand} я препоръчва за широки чекмеджета с къс водач), но с нея водачът иска ${dimTxt(need)} mm вътрешна дълбочина (NL + 15), а има ${dimTxt(depth)} mm. Оставен е водачът NL ${NL} mm без нея — задълбочете шкафа с ${dimTxt(need - depth)} mm, за да се добави.`);
    return null;
  }
  const shaft = Math.round(LW - st.shaftMinus);
  const rack = NL + st.rackPlus;
  ctx.warn('info', `${where}: добавена е странична стабилизация ${sys.brand} ${sku}, 1 компл. на чекмедже (${why}). ${sys.brand} я препоръчва за широки чекмеджета с къс водач (${st.doc}); тя иска ${dimTxt(need)} mm вътрешна дълбочина (NL + 15)${st.belowPlus ? ` и ${st.belowPlus} mm повече място под водача (най-долната кутия е вдигната с толкова)` : ''}.`);
  // one set (left/right) per drawer — our reading of „(left/right)“ in the set's name: one shaft across the drawer
  return {
    below: st.belowPlus,
    line: {
      key: `stabiliser:${sku}:${shaft}:${rack}`,
      name: `Странична стабилизация (ляв/десен) ${sku}, за рязане: вал ${shaft} mm (LW − ${st.shaftMinus}), зъбна рейка ${rack} mm (NL + ${st.rackPlus})`,
      qty: 1,
      unit: 'компл.',
      group: 'Обков',
      sku,
      brand: sys.brand,
    },
  };
}
