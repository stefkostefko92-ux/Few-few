// The notes under the rails' development (rails-sheet.ts): what the installer needs to build the rails as checked — for
// the car rails and for the counterweight's their profile, lengths and joints, how many brackets on each rail and the
// longest interval between them (the l of the car rails' check on sheet 1), every rail's bracket with its articles at
// the main floor's walls and in the headroom where its walls stand elsewhere (the counts the plans write: rail-brackets.ts
// levelHeights), how far each wall (or a side counterweight's bridge) stands from each rail, and what a car rail's
// bracket brings to the wall for the check of its anchors; a side counterweight's bridge with its count, its length and
// what it carries. Italian, like the drawings. Pure.
import { RAIL_LENGTH, lastPieceMin } from '@/shaft/brackets';
import { headOf, headRail } from '@/shaft/head';
import { cwPlanCode } from '@/shaft/plan-staffe';
import { bridgeHeights, designPieces, headFrom, levelHeights, maxSpanOf, onBridge, railHeights } from '@/shaft/rail-brackets';
import { railClip, railLabel } from '@/shaft/rails';
import { cwBracketsOf } from '@/shaft/staffe';
import { bracketReach, carBracketType, twoPieces } from '@/shaft/staffe-cabina';
import type { Layout, Rail } from '@/shaft/types';
import type { Fmt } from '../present/tr';

const WALL: Readonly<Record<string, string>> = { left: 'SX', right: 'DX', front: 'FRONTE', rear: 'RETRO' };

/** The side of its pair a rail stands on, as the notes name it: SX/DX along the front or the rear wall, FRONTE/RETRO
 *  along a side wall. */
function sideOf(L: Layout, r: Rail): string {
  const pair = L.rails.filter((x) => x.kind === r.kind), along = pair.every((x) => Math.abs(x.y - r.y) < 1);
  const lo = along ? r.x <= Math.min(...pair.map((x) => x.x)) : r.y <= Math.min(...pair.map((x) => x.y));
  return along ? (lo ? 'SX' : 'DX') : lo ? 'FRONTE' : 'RETRO';
}

/** One text for each rail, the rails alike merged ("per guida"), else each by its side. */
function perRail(L: Layout, rails: readonly Rail[], text: (r: Rail) => string): string {
  const ts = rails.map(text);
  return new Set(ts).size <= 1 ? (ts[0] ?? '') : rails.map((r, i) => `guida ${sideOf(L, r)} ${ts[i]}`).join('; ');
}

/** The notes under the elevation: one paragraph a kind of rail (one more for a side counterweight's bridge), one on the
 *  heights; `kept`: the rails stay as they are; `fx`, `fy`: the thrusts a car rail's bracket brings to the wall [daN]. */
export function railsNotes(L: Layout, x: { fx: string; fy: string; kept: boolean }, fmt: Fmt): string[] {
  const I = L.inputs, { pieces, joints } = designPieces(L), zHead = headFrom(L), head = zHead !== Infinity;
  const min = lastPieceMin([I.carRail, I.cwRail]), cut = pieces.length > 1 && (pieces[0] ?? 0) < RAIL_LENGTH - 1e-6;
  const lengths = `${pieces.length} spezzoni (${pieces.map((p) => fmt(p, 0)).join(' + ')} mm), ${joints.length} giunzioni con piastra`
    + (cut ? ` (il primo accorciato perché l’ultimo sia di almeno ${fmt(min, 0)} mm: la piastra di giunzione e la staffa in cima vi trovano posto)` : '');
  const top = I.vertical.floors.at(-1)?.label ?? '', inHead = 'in testata';
  // how far the wall (or the bridge) stands from a rail at the main floor, and in the headroom when it differs there
  const reachOf = (r: Rail, up: boolean): string => {
    if (onBridge(L, r)) return `${sideOf(L, r)} sulla staffa a ponte`;
    const b = bracketReach(L, up ? headRail(I, r) : r);
    return `${WALL[b.wall] ?? b.wall} ${fmt(b.reach, 0)} mm ${b.to === 'foot' ? 'al piede' : 'all’asse'}${r.kind === 'car' && twoPieces(b.reach) ? ' (in due pezzi, 4 bulloni M12 in asola)' : ''}`;
  };
  const reaches = (kind: 'car' | 'cw'): string => [...new Set(L.rails.filter((r) => r.kind === kind).map((r) => {
    const main = reachOf(r, false), up = head ? reachOf(r, true) : main;
    return up === main ? main : `${main} (${inHead} ${up})`;
  }))].join('; ');
  // the brackets on each rail anchored to a wall (the one on a side counterweight's bridge has the bridge's)
  const counts = (kind: 'car' | 'cw'): string => {
    const rails = L.rails.filter((r) => r.kind === kind && !onBridge(L, r)), on = L.rails.find((r) => r.kind === kind && onBridge(L, r));
    const each = perRail(L, rails, (r) => {
      const n = railHeights(L, r).length, up = head ? levelHeights(L, r, true).length : 0;
      return `${n} staffe${up > 0 ? `, di cui ${up} ${inHead}` : ''}`;
    });
    const one = rails.length === 1 && rails[0] ? `guida ${sideOf(L, rails[0])}` : 'per guida';
    return (on ? each.replace(/^(\d+ staffe)/, `$1 sulla ${one}`) : each.replace(/^(\d+ staffe)/, `$1 ${one}`))
      + (on ? ` (la guida ${sideOf(L, on)} sulla staffa a ponte, alle sue quote)` : '');
  };
  // the articles of the counterweight rails' brackets at each level, every rail with its own (the plans' codes)
  const panev = cwBracketsOf(I) === 'panev' ? perRail(L, L.rails.filter((r) => r.kind === 'cw'), (r) => {
    const main = cwPlanCode(L, r), up = head ? cwPlanCode(L, r, headOf(I)) : null;
    return [main, up ? `${inHead} ${up}` : null].filter((t) => t !== null).join('; ');
  }) : null;
  const bridge = L.bridge, carOn = L.rails.find((r) => onBridge(L, r)), wall = L.rails.find((r) => r.kind === 'car' && !onBridge(L, r));
  return [
    ...(x.kept ? ['GUIDE ESISTENTI: le quote sono quelle della regola di montaggio, da confrontare con le staffe in opera prima della verifica delle guide.'] : []),
    `GUIDE DI CABINA ${railLabel(I.carRail)}: ${lengths}; ${counts('car')}, `
      + `interasse massimo ${fmt(maxSpanOf(L, 'car'), 0)} mm (la l della verifica delle guide, foglio 1); staffa ${carBracketType(L)}; dal muro alla guida: ${reaches('car')}; `
      + `ogni staffa ${carOn ? `della guida ${sideOf(L, wall ?? carOn)} ` : ''}porta alla parete fino a Fx ${x.fx} e Fy ${x.fy} daN (verifica degli ancoraggi).`,
    `GUIDE DEL CONTRAPPESO ${railLabel(I.cwRail)}: ${lengths}; ${counts('cw')}, interasse massimo ${fmt(maxSpanOf(L, 'cw'), 0)} mm; `
      + `${panev ? `staffe Panev ${panev}` : `staffa ${carBracketType(L).replace(/, 2 GRAFFE M\d+$/, '')} (da dimensionare a parte)`}; dal muro alla guida: ${reaches('cw')}.`,
    ...(bridge && carOn ? [`STAFFA A PONTE DEL CONTRAPPESO LATERALE: ${bridgeHeights(L).length} pezzi lunghi ${fmt(bridge.y1 - bridge.y0, 0)} mm, uno a ogni staffa delle `
      + `guide del contrappeso, tra i piedi delle due guide e fissati a esse; vi è fissata la guida di cabina ${sideOf(L, carOn)} (${railLabel(I.carRail)}, piede `
      + `a ${fmt(Math.abs(carOn.bracketTo - bridge.x), 0)} mm dal ponte) con piastra e 2 graffe M${railClip(I.carRail).bolt} alle stesse quote, senza tasselli: le sue `
      + `spinte (fino a Fx ${x.fx} e Fy ${x.fy} daN) vanno al ponte e alle staffe del contrappeso, da dimensionare a parte.`] : []),
    'Quote dal fondo della fossa al lato inferiore di ogni staffa (alta 150 mm); guide in spezzoni da 5 m dal fondo della fossa, le staffe fuori dalle piastre di giunzione. '
      + `${head ? `In testata: dall’ultimo piano "${top}" (+${Math.round(zHead)}) in su, dove le pareti stanno come nella pianta in testata. ` : ''}`
      + 'Quote calcolate dalla regola di montaggio: non si cambiano qui.',
  ];
}
