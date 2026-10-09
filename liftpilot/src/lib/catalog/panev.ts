// Panev's 48 brackets as the 2026 catalogue lists them (panev/docs/catalogo-staffe-panev-2026.pdf in the monorepo): the
// code, what the part is, its size, the sheet's thickness and the page (the list prices of p. 65 are in panev-prices.ts,
// never in the screens' code). And the bill of materials of a design: the articles its landing doors (under the sills
// and over the doors) and counterweight rails take, as many as the software places (src/shaft/staffe-*.ts). Pure.
import {
  bracketCode, bracketHeights, cwBracket, cwBracketsOf, cwSpecialOf, doorBracketCount, doorPairOf, landingOf, plateReach, railSpan, topBracketSpan, topPairStops,
  type Layout,
} from '@/shaft';
import { cwNiche, wallLength } from '@/shaft/niche';
import { hasHead, headOf } from '@/shaft/head';
import { section } from '@/shaft/section';

export type PanevKind = 'plateA' | 'bracketB' | 'supportSU' | 'supportSD' | 'supportSC' | 'guideSG' | 'madeSC' | 'madeSG' | 'cornerSN' | 'squareSN' | 'arm';

export interface PanevArticle {
  code: string;
  kind: PanevKind;
  /** the catalogue's size of the part [mm] */
  size: string;
  /** sheet thickness [mm] */
  t: 4 | 5;
  page: number;
}

/** The list the prices come from. */
export const PANEV_LISTINO = { year: 2026, page: 65 } as const;

// the list prices are in panev-prices.ts, out of the pages' code (they are the company's price list's start, server side)
const a = (code: string, kind: PanevKind, size: string, t: 4 | 5, page: number): PanevArticle => ({ code, kind, size, t, page });

export const PANEV_ARTICLES: readonly PanevArticle[] = [
  // section 01 — landing doors (pp. 14-18)
  a('A 65 170 7', 'plateA', '170 × 75', 5, 14), a('A 45 170 7', 'plateA', '170 × 70', 5, 15), a('A 45 175 2', 'plateA', '175 × 60', 5, 16),
  a('A 37 150 7', 'plateA', '150 × 70', 4, 17), a('A 37 170 2', 'plateA', '170 × 60', 4, 18),
  a('B 65 320', 'bracketB', '320 × 65 × 65', 5, 14), a('B 65 220', 'bracketB', '220 × 65 × 65', 5, 14),
  a('B 45 320', 'bracketB', '320 × 45 × 60', 5, 15), a('B 45 220', 'bracketB', '220 × 45 × 60', 5, 15),
  a('B 37 320', 'bracketB', '320 × 37 × 60', 4, 17), a('B 37 220', 'bracketB', '220 × 37 × 60', 4, 17),
  // sections 02-04 — counterweight rail supports (pp. 20-55)
  a('SU 220 160', 'supportSU', '220 × 160', 5, 20), a('SU 220 180', 'supportSU', '220 × 180', 5, 22), a('SU 220 200', 'supportSU', '220 × 200', 5, 24),
  a('SD 150 160', 'supportSD', '150 × 160', 5, 27), a('SD 150 180', 'supportSD', '150 × 180', 5, 29), a('SD 150 200', 'supportSD', '150 × 200', 5, 31),
  a('SD 220 160', 'supportSD', '220 × 160', 5, 33), a('SD 220 180', 'supportSD', '220 × 180', 5, 35), a('SD 220 200', 'supportSD', '220 × 200', 5, 37),
  a('SC 50 200', 'supportSC', '50 × 200', 4, 40), a('SC 60 200', 'supportSC', '60 × 200', 4, 42), a('SC 80 200', 'supportSC', '80 × 200', 4, 44),
  a('SC 90 200', 'supportSC', '90 × 200', 4, 46), a('SC 50 220', 'supportSC', '50 × 220', 4, 48), a('SC 60 220', 'supportSC', '60 × 220', 4, 50),
  a('SC 80 220', 'supportSC', '80 × 220', 4, 52), a('SC 90 220', 'supportSC', '90 × 220', 4, 54),
  // section 05 — SG guide brackets (pp. 57-59)
  ...([50, 60, 80] as const).flatMap((w) =>
    ([130, 150, 170, 190, 220] as const).map((l) => a(`SG ${w} ${l}`, 'guideSG', `${w} × ${l}`, 4, l <= 150 ? 57 : l <= 190 ? 58 : 59))),
  // section 06 — to the site's drawing (pp. 61-62)
  a('SC 50 170', 'madeSC', '50 × 170', 4, 61), a('SG 225 50', 'madeSG', '150 + 30', 5, 61),
  a('SN 60 65', 'cornerSN', '65 × 65 × 60', 5, 62), a('SN 65 200', 'squareSN', '65 × 200 × 50', 5, 62), a('BRACCIO 160 190', 'arm', '190', 5, 62),
];

export const panevArticle = (code: string): PanevArticle | undefined => PANEV_ARTICLES.find((x) => x.code === code);

/** A line of the bill: the article, how many, where; `cut`: A cut to that length on site; `short`: A shorter than the
 *  sill's depth; `drawing`: to the site's drawing. */
export interface BomRow { article: PanevArticle; qty: number; use: 'door' | 'cw'; cut?: number; short?: boolean; drawing?: boolean }

export interface PanevBom {
  rows: BomRow[];
  /** brackets of the counterweight rails no article of the catalogue takes */
  missing: number;
}

/** The articles of a design: under every landing sill and over every landing door where they find the wall the pair of
 *  its doors, one every 400 mm (staffe-porte.ts); on the counterweight rails, at every bracket's height, the support with
 *  its SG or the solution to drawing chosen. */
export function panevBom(L: Layout): PanevBom {
  const I = L.inputs, S = section(L), pair = doorPairOf(I), rows = new Map<string, BomRow>();
  // one row per article and use: a door's and a rail's never merge, whatever part of the acceptance test counts them
  const add = (code: string, qty: number, use: BomRow['use'], extra: Partial<BomRow> = {}): void => {
    const article = panevArticle(code);
    if (!article || qty <= 0) return;
    const row = rows.get(`${use} ${code}`);
    if (row) row.qty += qty;
    else rows.set(`${use} ${code}`, { article, qty, use, ...extra });
  };
  const tops = topPairStops(L, S.levels);
  for (const d of L.doors) {
    // under the sill at every stop the entrance serves, over the door where its pairs find the wall (staffe-porte.ts)
    const ld = landingOf(d), stops = tops.filter((s) => s.d === d), over = stops.filter((s) => s.room >= 0).length;
    const n = doorBracketCount(ld.u0 + 10, ld.u1 - 10) * stops.length + doorBracketCount(...topBracketSpan(ld, wallLength(I, ld.wall))) * over;
    const reach = plateReach(pair.a, I.landingDepth);
    add(pair.a.code, n, 'door', { cut: reach.cut < pair.a.length ? reach.cut : undefined, short: reach.short || undefined });
    add(pair.b.code, n, 'door');
  }
  let missing = 0;
  if (cwBracketsOf(I) === 'panev') {
    const special = cwSpecialOf(I), niche = cwNiche(I, L.cwSide), span = niche ? [niche.at, niche.at + niche.width] as const : undefined;
    const zHead = hasHead(I) ? S.levels[I.vertical.floors.length - 1] ?? Infinity : Infinity, [z0, z1] = railSpan(S);
    for (const r of L.rails.filter((x) => x.kind === 'cw')) {
      const main = special ? null : cwBracket(I, L.doors, r, span), head = special ? null : cwBracket(I, L.doors, r, span, headOf(I));
      for (const z of bracketHeights(z0, z1, I.cwRail, L.cwBracketPitch)) {
        const br = z >= zHead ? head : main;
        if (special) for (const code of special.split(' + ')) add(code, 1, 'cw', { drawing: true });
        else if (br) for (const code of bracketCode(br).split(' + ')) add(code, 1, 'cw');
        else missing += 1;
      }
    }
  }
  return { rows: [...rows.values()], missing };
}
