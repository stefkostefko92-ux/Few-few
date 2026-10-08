// What NOTA 1 on sheet 1 adds about the shaft's details the building and the installer owe (round 36), in our words with
// the numbers of the registry: the pit's access and controls with its signs (src/shaft/pit-kit.ts; registries
// fossa.accesso, fossa.comandi), the plate under each landing sill (toe.ts, porte.sottosoglia), the sign of the
// counterweight's clearance (cw-gap.ts, contrappeso.cartello) and what each car rail bracket brings to the wall for the
// check of its anchors (registry guide.staffe.cabina). Italian, like the drawings. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { pitKit } from '@/shaft/pit-kit';
import { toeOf } from '@/shaft/toe';
import type { Layout } from '@/shaft/types';

/** The values sheet 1 knows: the clearance on the counterweight's sign [mm] (null: the headroom's checks do not pass)
 *  and the thrusts on the car rails [daN], written. */
export interface ShaftDetailValues {
  cwGap: string | null;
  fx: string;
  fy: string;
}

/** The sentences of NOTA 1 on the pit, the sills, the counterweight's sign and the rail brackets' anchors. */
export function shaftDetailText(L: Layout, x: ShaftDetailValues): string {
  const K = KV_VERT, V = L.inputs.vertical, k = pitKit(L), t = toeOf(L.inputs);
  const access = k.ladderAllowed ? 'scala nel vano secondo l’appendice F, a riposo fuori dagli spazi di rifugio' : `porta di accesso (fossa oltre ${K.pitLadderMax} mm)`;
  const stops = k.twoStops
    ? `due STOP, l’alto almeno ${K.stopUpper} mm sopra il piano più basso, il basso non oltre ${K.stopLower} mm dal fondo e raggiungibile da uno spazio di rifugio`
    : `STOP almeno ${K.stopOverLanding} mm sopra il piano più basso e non oltre ${K.stopOverPit} mm dal fondo`;
  const missing = [...(k.ladderAllowed && !k.ladder ? ['scala'] : []), ...(!k.box ? ['pulsantiera'] : [])];
  const sign = x.cwGap === null ? 'gioco massimo da stabilire quando le verifiche della testata passano' : `gioco massimo ${x.cwGap} mm`;
  const where = missing.length ? `${missing.join(' e ')} da collocare: nei disegni non c’è un posto libero` : 'posizioni e quote nella pianta e nella sezione della fossa';
  return `Fossa (${V.pit} mm): ${access}; ${stops}, a non più di ${K.pitReach} mm dal telaio della porta; comando d’ispezione, presa e comando della `
    + `luce; cartelli con persone ammesse e postura (${where}). Cartello sulla protezione del contrappeso: ${sign}. Lamiera `
    + `sottosoglia alta ${t.h} mm sotto ogni soglia di piano${t.entered ? '' : ` (zona di sbloccaggio assunta ${t.zone} mm)`}. Ogni staffa delle guide di `
    + `cabina porta alla parete fino a Fx ${x.fx} e Fy ${x.fy} daN, per la verifica degli ancoraggi. `;
}
