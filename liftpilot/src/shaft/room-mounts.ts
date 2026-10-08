// The machine's anti-vibration mounts and how its support is held to the building, in words (registry locale.basamento,
// locale.rinvio, locale.putrelle.vano): how many mounts, where, and the fixings against sliding and overturning — the
// type and the rated load of the mounts are the maker's, the fixings the structural engineer's to confirm. Section B-B
// writes it beside the support, the relazione tecnica in its rows. Italian; pure.
import type { MachineSpec, RoomGeo } from './machine-room';
import { onHeb, supportOf } from './support';

/** The mounts and the fixings of the machine's support, as a sentence. */
export function mountsText(G: RoomGeo, M: MachineSpec): string {
  const R = G.room, s = supportOf(R, M.Dp > 0), F = G.frame, heb = onHeb(R, M.Dp > 0), n = F.mounts.length * F.beams.length;
  const tail = ' — tipo e portata degli antivibranti del costruttore; fissaggi da verificare dallo strutturista';
  const onFloor = heb ? 'alle ali delle putrelle HEB con piastre e bulloni (o morsetti)' : 'alla soletta con tasselli (fermi contro lo scorrimento)';
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return `N. 4 antivibranti sotto le gambe del telaio con rinvio; gambe fissate ${onFloor}${tail}`;
  const mounts = `N. ${n} antivibranti sotto i ferri del telaio dell’argano`;
  switch (s.kind) {
    case 'shims': return `${mounts}, su spessori di livellamento fissati ${onFloor}${tail}`;
    case 'plates': return `${mounts}, imbullonati alle piastre d’acciaio fissate ${onFloor}${tail}`;
    case 'frame': return `${mounts}, imbullonati al telaio di profilati fissato ${onFloor}${tail}`;
    case 'beams': return `${mounts}, imbullonati alle putrelle murate negli appoggi${tail}`;
    case 'plinth': return `${mounts}, ancorati al plinto con tirafondi; plinto collegato alla soletta con barre di ripresa${tail}`;
    default: return `${mounts}${tail}`;
  }
}

/** The same in two short lines for section B-B: how many mounts under what, and how the support is held. */
export function mountsLines(G: RoomGeo, M: MachineSpec): [string, string] {
  const R = G.room, s = supportOf(R, M.Dp > 0), F = G.frame, heb = onHeb(R, M.Dp > 0), n = F.mounts.length * F.beams.length;
  const tail = ' — da verificare dallo strutturista', on = heb ? 'alle putrelle HEB con piastre e bulloni' : 'alla soletta con tasselli';
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return ['N. 4 antivibranti sotto le gambe del telaio (tipo e portata del costruttore)', `gambe fissate ${on}${tail}`];
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
