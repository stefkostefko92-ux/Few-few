// The counterweight and the shaft in the relazione tecnica di modifica (RT plan §4.5): the counterweight's mass after the
// modification against the documented one, its intervention (the prospetto 2 test always comes from the loads:
// regole.ts), the design's checks of its place, its guided travel and its screen on the shaft path, the points of UNI
// EN 81-20 5.2.5.6.2 and 5.2.5.5.1 on the room path; the shaft path's other checks of the shaft — headroom, pit,
// clearances — in «Vano, fossa e testata». Pure.
import type { ShaftCheckId } from '@/shaft/types';
import { HEAD, PIT } from '../../lift/ambito';
import type { Parte } from '../../lift/collaudo';
import { conId, daVano, dato, mancantiDi, nuova, type RtCtx } from './comune';
import type { EsitoSezione } from './esito';
import { ID_LIMITATORE } from './limitatore';
import { ID_PORTE } from './porte';
import { SITO_RT, sito } from './punti';

/** The design's checks of the counterweight, printed in its section. */
export const ID_CONTRAPPESO: readonly ShaftCheckId[] = ['h_cw', 'p_screen', 'p_screenlo', 'p_screenw', 'v_cw', 'v_cwlen', 'v_niche', 'h_cwgap', 'v_staffa'];
/** The design's checks other sections print: the car's area, the buffers', the governor's, the doors', the counterweight's. */
const ALTROVE: readonly ShaftCheckId[] = ['v_area', 'b_type', 'b_car', 'b_cw', 'sl_frame', 'tr_d1', 'tr_d2', 'fm_z', 'fm_d1', 'fm_d2', 'fm_comp', ...ID_LIMITATORE, ...ID_PORTE, ...ID_CONTRAPPESO];

export function contrappeso(x: RtCtx): EsitoSezione {
  const L = x.base.path === 'vano', checks = L ? conId(x.base.lift?.checks ?? [], ID_CONTRAPPESO).map((c) => daVano(x, c, 'contrappeso')) : [];
  const punti = L ? [] : [sito('contrappeso', SITO_RT.corsaGuidataCw), sito('contrappeso', SITO_RT.difesaCw)];
  const doc = x.base.collaudo.documentato, stato = nuova(x, 'cw') ? 'nuovo' : 'esistente';
  const dati = [
    dato('massaDocumentata', doc?.Mcw ?? null, 'kg', 0, 'esistente', 'documentato'), dato('massa', x.Mcw, 'kg', 0, stato, 'calcolo'),
    dato('intervento', x.inputs.componenti?.contrappeso?.intervento ?? null, '', 0, stato, ''),
  ].filter((d) => d.valore !== null);
  return { componente: { sezione: 'contrappeso', stato, dati }, checks, punti, mancanti: mancantiDi('contrappeso', checks) };
}

/** The headroom's and the pit's checks the acceptance test's table leaves to fewer parts than the RT reads: UNI 10411-1
 *  15.11 and 16 j), -11 15 e) and 16 i) want the whole headroom and pit to UNI EN 81-20 5.2.5.7 and 5.2.5.8 with the speed
 *  or the travel changed — the crosshead under the ceiling (5.2.5.7.2, with a new machine as h_top), the standing place on
 *  the roof (5.2.5.7.1/5.2.5.7.3, with the car doors made sliding as h_refuge) and the buffers' place against the pit's
 *  refuge (5.2.5.8.1). The RT's reading: the shared table (ambito.ts, the documents of the calculation and of the design)
 *  keeps its scope until the engines' versions move (owner's decision). */
export const SPAZI_RT: Readonly<Partial<Record<ShaftCheckId, readonly Parte[]>>> = { h_cross: [...HEAD, 'machine'], h_stand: [...HEAD, 'slidingDoors'], v_buffer: PIT };

/** The shaft path's checks of the shaft no other section prints (the machine room's are the room's). */
export function vano(x: RtCtx): EsitoSezione {
  const checks = (x.base.lift?.checks ?? []).filter((c) => !c.id.startsWith('m_') && !ALTROVE.includes(c.id)).map((c) => {
    const k = daVano(x, c, 'vano'), parti = SPAZI_RT[c.id];
    return parti && x.parti.some((p) => parti.includes(p)) ? { ...k, ambito: 'richiesta' as const } : k;
  });
  return { componente: { sezione: 'vano', stato: 'esistente', dati: [] }, checks, punti: [], mancanti: mancantiDi('vano', checks) };
}
