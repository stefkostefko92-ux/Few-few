// The machine's anti-vibration mounts and how its support is held to the building, in words (registry locale.basamento,
// locale.rinvio, locale.putrelle.vano, carichi.reazioni): how many mounts, where, the fixings against sliding and — a
// bearing pulled up, its reaction negative (room-reactions.ts upliftOf, round 37) — the anchor in tension at that bearing
// with its pull; on a replacement's existing support kept (its position not surveyed), the mounts on it and its fixings
// to be surveyed, no new support named. The type and the rated load of the mounts are the maker's, the fixings the
// structural engineer's to confirm. Section B-B writes it beside the support, the relazioni in their rows. Italian; pure.
import type { MachineSpec, RoomGeo } from './machine-room';
import { upliftText, type Uplift } from './room-reactions';
import { onHeb, supportOf } from './support';

/** What the mounts' text adds to the room: `kept` — the existing support the new machine stands on, kept (its kind in
 *  words: a replacement's survey); `uplift` — the bearings pulled up at the load of the sheet. */
export interface MountsOpts {
  kept?: string | null;
  uplift?: readonly Uplift[];
}

/** The anchors in tension of the bearings pulled up, after the fixings; none pulled up: nothing. */
const anchors = (u: readonly Uplift[] | undefined): string => (u?.length ? `; ancoraggi a trazione contro il sollevamento: ${upliftText(u)}` : '');

/** The existing support kept as the text names it; the bedplate with the pulley stands on it, any other support is it. */
const onKept = (kept: string): string => `sul basamento esistente (${kept}) riusato: posizione, altezza e appoggi da rilevare`;

/** The mounts and the fixings of the machine's support, as a sentence. */
export function mountsText(G: RoomGeo, M: MachineSpec, o: MountsOpts = {}): string {
  const R = G.room, s = supportOf(R, M.Dp > 0), F = G.frame, heb = onHeb(R, M.Dp > 0), n = F.mounts.length * F.beams.length, up = anchors(o.uplift);
  const tail = ' — tipo e portata degli antivibranti del costruttore; fissaggi da verificare dallo strutturista';
  const onFloor = heb ? 'alle ali delle putrelle HEB con piastre e bulloni (o morsetti)' : 'alla soletta con tasselli (fermi contro lo scorrimento)';
  const bedplate = s.kind === 'rinvio' && M.rinvio?.on === 'frame';
  if (o.kept) {
    return bedplate ? `N. 4 antivibranti sotto le gambe del telaio con rinvio, ${onKept(o.kept)}; gambe fissate al basamento esistente${up}${tail}`
      : `N. ${n} antivibranti sotto i ferri del telaio dell’argano, ${onKept(o.kept)}; fissaggi al basamento esistente${up}${tail}`;
  }
  if (bedplate) return `N. 4 antivibranti sotto le gambe del telaio con rinvio; gambe fissate ${onFloor}${up}${tail}`;
  const mounts = `N. ${n} antivibranti sotto i ferri del telaio dell’argano`;
  switch (s.kind) {
    case 'shims': return `${mounts}, su spessori di livellamento fissati ${onFloor}${up}${tail}`;
    case 'plates': return `${mounts}, imbullonati alle piastre d’acciaio fissate ${onFloor}${up}${tail}`;
    case 'frame': return `${mounts}, imbullonati al telaio di profilati fissato ${onFloor}${up}${tail}`;
    case 'beams': return `${mounts}, imbullonati alle putrelle murate negli appoggi${up}${tail}`;
    case 'plinth': return `${mounts}, ancorati al plinto con tirafondi; plinto collegato alla soletta con barre di ripresa${up}${tail}`;
    default: return `${mounts}${up}${tail}`;
  }
}

/** The same in two short lines for section B-B: how many mounts under what, and how the support is held. */
export function mountsLines(G: RoomGeo, M: MachineSpec, o: MountsOpts = {}): [string, string] {
  const R = G.room, s = supportOf(R, M.Dp > 0), F = G.frame, heb = onHeb(R, M.Dp > 0), n = F.mounts.length * F.beams.length;
  const tail = `${o.uplift?.length ? `; a trazione ${upliftText(o.uplift)}` : ''} — da verificare dallo strutturista`, on = heb ? 'alle putrelle HEB con piastre e bulloni' : 'alla soletta con tasselli';
  const bedplate = s.kind === 'rinvio' && M.rinvio?.on === 'frame';
  if (o.kept) {
    const where = `sul basamento esistente (${o.kept}) riusato: posizione, altezza e fissaggi da rilevare${tail}`;
    return bedplate ? ['N. 4 antivibranti sotto le gambe del telaio (tipo e portata del costruttore)', `gambe ${where}`]
      : [`N. ${n} antivibranti sotto i ferri dell’argano (tipo e portata del costruttore)`, where];
  }
  if (bedplate) return ['N. 4 antivibranti sotto le gambe del telaio (tipo e portata del costruttore)', `gambe fissate ${on}${tail}`];
  const first = `N. ${n} antivibranti sotto i ferri dell’argano (tipo e portata del costruttore)`;
  switch (s.kind) {
    case 'shims': return [first, `spessori fissati ${on}${tail}`];
    case 'plates': return [first, `piastre fissate ${on}${tail}`];
    case 'frame': return [first, `telaio fissato ${on}${tail}`];
    case 'beams': return [first, `putrelle murate negli appoggi${tail}`];
    case 'plinth': return [first, `plinto con tirafondi e barre di ripresa nella soletta${tail}`];
    default: return [first, `fissaggi${tail}`];
  }
}
