// G-code posts for one nested sheet: ISO / Fanuc style (industrial nesting router, automatic tool change, canned
// cycles) and GRBL v1.1 (hobby router, manual tool change). GRBL knows no G41/G42, no canned cycles (G81/G83), no M6
// and no G43 H (gnea/grbl README, "Supported G-Codes"): the cutter radius is in the path (profilePath) and holes are
// drilled with G0/G1. Z0 is the sheet top, XY0 its lower left corner; no rapid goes below the R plane.
import { sheetOps, num, POSTS, SPOIL, CLEAR, ONION, profilePath } from './cam.js';
import { GROOVE_MILL, contourTool, cuttingFeed, pecks, THROUGH_SLOW } from './tooling.js';
import { asciiName, dimTxt } from './util.js';

export const RAMP_MAX_DEG = 15; // the steepest a contour enters the material
const RAMP_MAX_LEN = 80; // the longest ramp leg, mm
const SAFE = 20; // safe height above the sheet top, mm
const PARK = 50; // where the program leaves the tool, mm above the sheet top
const ISO_DWELL_MS = 5000; // our assumption: the spindle is at speed after 5 s; no spindle-at-speed signal is relied on

export function toGcode(model, sheet, meta) {
  const post = POSTS[model.spec.post];
  const ops = sheetOps(model, sheet);
  const { T } = ops;
  const safe = SAFE;
  const iso = post.id === 'iso';
  const stepDown = iso ? Infinity : model.spec.grblStepDown ?? post.stepDown;
  const maxFeed = iso ? Infinity : model.spec.grblMaxFeed ?? post.maxFeed;
  const L = [];
  const moves = [];
  let pos = { X: 0, Y: 0, Z: PARK };
  let curF = 0;
  const words = (X, Y, Z) => [X !== undefined && `X${num(X)}`, Y !== undefined && `Y${num(Y)}`, Z !== undefined && `Z${num(Z)}`].filter(Boolean);
  const go = (type, X, Y, Z, F, tool) => {
    const w = words(X, Y, Z);
    if (F !== undefined) {
      curF = Math.min(F, maxFeed);
      w.push(`F${Math.round(curF)}`);
    }
    L.push(`${type === 'rapid' ? 'G0' : 'G1'} ${w.join(' ')}`);
    const nxt = { X: X ?? pos.X, Y: Y ?? pos.Y, Z: Z ?? pos.Z };
    moves.push({ type, from: pos, to: nxt, tool, F: curF });
    pos = nxt;
  };
  const rapid = (X, Y, Z) => go('rapid', X, Y, Z);
  const feed = (X, Y, Z, F, tool) => go('feed', X, Y, Z, F, tool);
  const arc = (seg, Z, tool) => {
    const [fx, fy] = seg.from;
    const [tx, ty] = seg.to;
    L.push(`G2 X${num(tx)} Y${num(ty)} I${num(seg.center[0] - fx)} J${num(seg.center[1] - fy)}`);
    const nxt = { X: tx, Y: ty, Z };
    moves.push({ type: 'arc', from: pos, to: nxt, center: seg.center, tool, F: curF });
    pos = nxt;
  };
  const title = `${asciiName(meta.product)} - SHEET ${sheet.index}/${meta.sheetCount}`;
  if (iso) L.push('%', `O${String(1000 + sheet.index)} (${title})`);
  else L.push(`(${title})`);
  L.push(`(SPEC SHA256 ${meta.hash.slice(0, 16)} - POST ${post.version})`);
  L.push(`(STOCK ${sheet.stock.toUpperCase()} ${sheet.w}X${sheet.h}X${T} - Z0 TOP OF SHEET - XY0 LOWER LEFT)`);
  if (!iso) L.push(`(STEP DOWN ${num(stepDown).replace(/\.$/, '')} MM - MAX FEED ${Math.round(maxFeed)} MM/MIN - SET IN THE PROJECT)`);
  L.push(`(END: SPINDLE OFF, Z${PARK} ABOVE THE SHEET TOP - CHECK THE Z TRAVEL)`);
  L.push('(SIMULATE AND DRY RUN BEFORE CUTTING)');
  if (ops.manual.length) L.push(`(${ops.manual.length} HOLES WITHOUT A TOOL IN THE LIBRARY - DRILL BY HAND)`);
  // GRBL v1.1 takes all of these; G40/G49/G80 only cancel (no G41/G42, no G43 H, no canned cycles)
  L.push(iso ? 'G21 G17 G90 G94 G40 G49 G80' : 'G21 G17 G90 G94 G40 G49 G80 G54');
  if (iso) L.push('G54');

  // GRBL: when the cap cuts a tool's feed, the spindle slows in proportion, so the chip load stays (Onsrud, "The Router
  // Way") — never below the post's floor, never above the tool's own speed; a mill that still runs under its chip load
  // says so on its tool line.
  const speedFor = (tool) => {
    const F = cuttingFeed(tool);
    if (iso || F <= maxFeed) return { S: tool.rpm, note: '' };
    const S = Math.max(Math.min(tool.rpm, post.minRpm), Math.round((tool.rpm * maxFeed) / F));
    const fz = maxFeed / (S * (tool.flutes ?? 2));
    return { S, note: tool.kind === 'mill' && fz < tool.fz - 1e-3 ? `CHIP LOAD ${num(fz)} MM - BELOW ${num(tool.fz)} - RAISE MAX FEED` : '' };
  };
  const startTool = (tool, note) => {
    const { S, note: slow } = speedFor(tool);
    L.push(`(${tool.id} ${tool.label}${note ? ` - ${note}` : ''}${slow ? ` - ${slow}` : ''})`);
    if (iso) {
      // Z to the machine's reference point before the change, then the length offset of the new tool; the dwell lets
      // the spindle reach its speed; G0 on the G43 line: the first approach must not depend on the power-on motion mode
      L.push('G91 G28 Z0', 'G90', `${tool.id} M6`, `S${S} M3`, `G4 P${ISO_DWELL_MS}`, `G0 G43 H${tool.h} Z${num(safe)}`);
      pos = { ...pos, Z: safe };
    } else {
      // the bit was just touched off on the sheet top: lift to safe Z before the spindle starts
      L.push('M5', `(INSERT ${tool.label} AND SET Z0 ON SHEET TOP, THEN RESUME)`, 'M0');
      rapid(undefined, undefined, safe);
      L.push(`S${S} M3`, 'G4 P2');
    }
  };
  const endTool = () => {
    rapid(undefined, undefined, safe);
    L.push('M5');
  };

  // A hole drilled with G1 from the R plane, `from` mm already drilled: a deep hole in pecks, each back up to R and down
  // again at feed (no rapid below R); a through hole's last THROUGH_SLOW mm at half feed. Returns the feed path (mm) at
  // the full and at the half feed, for the time estimate.
  const strokes = (h, tool, F, from = 0) => {
    const end = h.through ? Math.max(from, h.depth - THROUGH_SLOW) : h.depth;
    const q = pecks(h.depth, tool.d) ?? Infinity;
    let at = from;
    let cut = 0;
    rapid(undefined, undefined, CLEAR);
    while (at < end - 1e-9) {
      const next = Math.min(end, at + q);
      feed(undefined, undefined, -next, F, tool.id);
      cut += next + CLEAR;
      at = next;
      if (at < end - 1e-9) rapid(undefined, undefined, CLEAR); // clears the chips
    }
    if (!h.through) return { cut, slow: 0 };
    if (pos.Z > -at + 1e-9) {
      feed(undefined, undefined, -at, F, tool.id); // down the hole the canned cycle drilled
      cut += at + CLEAR;
    }
    feed(undefined, undefined, -h.depth, F / 2, tool.id);
    return { cut, slow: h.depth - at };
  };
  // G81/G83 move inside the control: in at feed from R, out at rapid to the initial level (G98); G83 also goes back up
  // to R after each peck.
  const canned = (depth, q) => {
    let retract = safe - CLEAR + depth + safe;
    if (q) for (let z = q; z < depth - 1e-9; z += q) retract += 2 * (z + CLEAR);
    return { cut: depth + CLEAR, slow: 0, retract };
  };

  for (const { tool, holes } of ops.drillOps) {
    startTool(tool, `${holes.length} HOLES`);
    const F = Math.min(tool.feed, maxFeed);
    let cycle = null;
    for (const h of holes) {
      const q = pecks(h.depth, tool.d);
      let est;
      if (!iso) {
        rapid(h.X, h.Y);
        est = { ...strokes(h, tool, F), retract: 0 };
        rapid(undefined, undefined, CLEAR);
      } else if (h.through && !q) {
        // one feed per canned cycle: a through hole that needs no pecks is drilled with G1
        if (cycle) L.push('G80');
        cycle = null;
        rapid(h.X, h.Y);
        est = { ...strokes(h, tool, F), retract: 0 };
        rapid(undefined, undefined, safe);
      } else {
        // canned cycle (G83 pecks with Q); the depth differs per hole, so Z and R are on every line; a through hole
        // stops THROUGH_SLOW short and is finished with G1 at half feed
        const cyc = q ? 'G83' : 'G81';
        const depth = h.through ? h.depth - THROUGH_SLOW : h.depth;
        moves.push({ type: 'rapid', from: pos, to: { X: h.X, Y: h.Y, Z: safe } });
        pos = { X: h.X, Y: h.Y, Z: safe };
        const w = `X${num(h.X)} Y${num(h.Y)} Z${num(-depth)} R${num(CLEAR)}${q ? ` Q${num(q)}` : ''}`;
        L.push(cycle === cyc ? w : `G98 ${cyc} ${w} F${F}`);
        cycle = cyc;
        est = canned(depth, q);
        if (h.through) {
          L.push('G80');
          cycle = null;
          const s = strokes(h, tool, F, depth);
          rapid(undefined, undefined, safe);
          est = { cut: est.cut + s.cut, slow: s.slow, retract: est.retract };
        }
      }
      moves.push({ type: 'drill', at: [h.X, h.Y], depth: h.depth, tool: tool.id, F, ...est });
    }
    if (cycle) L.push('G80');
    endTool();
  }

  if (ops.grooves.length) {
    const tool = GROOVE_MILL;
    const F = cuttingFeed(tool);
    startTool(tool, `${ops.grooves.length} GROOVES`);
    for (const g of ops.grooves) {
      const passes = Math.ceil(g.depth / Math.min(4, stepDown));
      rapid(g.X1, g.Y1);
      rapid(undefined, undefined, CLEAR);
      let atStart = true;
      for (let k = 1; k <= passes; k++) {
        feed(undefined, undefined, -Math.min(g.depth, (g.depth * k) / passes), tool.plunge, tool.id);
        if (atStart) feed(g.X2, g.Y2, undefined, F, tool.id);
        else feed(g.X1, g.Y1, undefined, F, tool.id);
        atStart = !atStart;
      }
      rapid(undefined, undefined, CLEAR);
    }
    endTool();
  }

  const tool = contourTool(model.spec.tool);
  const r = tool.d / 2;
  const Fc = cuttingFeed(tool);
  const passes = model.spec.onion && T > 6 ? [-(T - ONION), -(T + SPOIL)] : [-(T + SPOIL)];
  const tan = Math.tan((RAMP_MAX_DEG * Math.PI) / 180);
  // From z0 down to z1 along the first edge, from its start: one leg of at most RAMP_MAX_LEN mm, or legs forth and back
  // over the same stretch while one is too steep. Returns the stretch, whose wedge the last move of the level cleans.
  const rampDown = (first, z0, z1, edge) => {
    const leg = Math.min(RAMP_MAX_LEN, edge);
    const n = Math.max(1, Math.ceil((z0 - z1) / (leg * tan) - 1e-9));
    const [x, y] = first.from;
    for (let k = 1; k <= n; k++) feed(x, k % 2 ? y + leg : y, z0 - ((z0 - z1) * k) / n, tool.plunge, tool.id);
    return leg;
  };
  startTool(tool, `${ops.contours.length} PROFILES${passes.length > 1 ? ' - ONION SKIN' : ''}`);
  passes.forEach((z, pi) => {
    // the levels of this pass, evenly from the bottom of the pass before, none deeper than stepDown (one with ISO)
    const top = pi ? passes[pi - 1] : 0;
    const n = Math.max(1, Math.ceil((top - z) / stepDown - 1e-9));
    const levels = Array.from({ length: n }, (_, i) => (i === n - 1 ? z : top - ((top - z) * (i + 1)) / n));
    L.push(`(PROFILE PASS ${pi + 1}/${passes.length} Z${num(z)}${n > 1 ? ` - ${n} LEVELS` : ''})`);
    for (const c of ops.contours) {
      const path = profilePath(c, r);
      const first = path[0];
      const edge = Math.abs(first.to[1] - first.from[1]);
      L.push(`(${c.partId} ${asciiName(c.name)} ${dimTxt(c.w).replace(',', '.')}X${dimTxt(c.h).replace(',', '.')})`);
      rapid(first.from[0], first.from[1]);
      rapid(undefined, undefined, CLEAR);
      levels.forEach((zl, li) => {
        // a level below another goes back to the start through the slot already cut; the first level of a pass goes
        // down in air, to the sheet top or to the bottom of the pass before; every level then ramps into the material
        let z0 = top;
        if (li > 0) {
          z0 = levels[li - 1];
          feed(first.from[0], first.from[1], undefined, Fc, tool.id);
        } else feed(undefined, undefined, top, tool.plunge, tool.id);
        const leg = rampDown(first, z0, zl, edge);
        feed(first.to[0], first.to[1], undefined, Fc, tool.id);
        for (const seg of path.slice(1)) {
          if (seg.kind === 'line') feed(seg.to[0], seg.to[1], undefined, undefined, tool.id);
          else arc(seg, zl, tool.id);
        }
        feed(first.from[0], first.from[1] + leg, undefined, undefined, tool.id); // clean the ramp wedge
      });
      rapid(undefined, undefined, CLEAR);
    }
  });
  endTool();
  rapid(undefined, undefined, PARK);
  L.push('M30');
  if (iso) L.push('%');
  const tools = [...ops.drillOps.map((o) => o.tool), ...(ops.grooves.length ? [GROOVE_MILL] : []), tool];
  return { text: `${L.join('\n')}\n`, moves, ops, tools, post: post.id };
}
