// The landing and car doors in the relazione tecnica di modifica (RT plan §4.5): new landing doors not lower in fire
// resistance than the existing ones (rt_door_fire, UNI 10411-1:2024, 19.2 — the order of the classes E and EI the
// software's reading: more minutes without the I of the existing door, or the I with fewer minutes, is not decided: an
// attention), as high as UNI EN 81-20 asks or, where the building's openings do not allow it (the engineer's statement,
// an attention), not lower than the existing ones nor than UNI EN 81-21 5.12's minimum (rt_door_height, 19.1), under
// KR.doorHeightEn8121 the points of UNI EN 81-21 5.12; the design's checks of the doors on
// the shaft path; the powered doors' limits of UNI EN 81-20 as a point on site. Registry rt.porte.*. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import type { ShaftCheckId } from '@/shaft/types';
import { CLASSI_FUOCO } from '../input-componenti';
import { KR } from '../norme';
import type { PuntoRt, RtCheck } from '../types';
import { ambito, conId, daVano, dato, fonteDi, mancante, mancantiDi, nuova, rtCheck, type RtCtx } from './comune';
import type { Esito, EsitoSezione } from './esito';
import { SITO_RT, sito } from './punti';

type Classe = (typeof CLASSI_FUOCO)[number];
const classe = (c: Classe): { min: number; i: boolean } => (c === 'nessuna' ? { min: 0, i: false } : { min: Number(c.replace(/^EI?/, '')), i: c.startsWith('EI') });

/** rt_door_fire: the new door's class against the existing one's — not lower (minutes not fewer, the I kept): ok; lower
 *  (minutes not more and the I not gained, e.g. EI60 → E60 or E60 → E30): fail; the two not comparable (more minutes
 *  without the existing I, or the I gained with fewer minutes): warn. Value and limit: the minutes. */
export function confrontoFuoco(esistente: Classe, nuova: Classe): Esito {
  const e = classe(esistente), n = classe(nuova), minuti = n.min >= e.min, conI = n.i || !e.i;
  const status = e.min === 0 || (minuti && conI) ? 'ok' : n.min <= e.min && (!n.i || e.i) ? 'fail' : 'warn';
  return { status, value: n.min, limit: e.min };
}
/** rt_door_height: the new door at least KV_VERT.entranceH (UNI EN 81-20 5.3.2.1): ok. Lower only where the building's
 *  openings do not allow it — a condition the engineer states (19.1), so an attention —, never lower than the existing
 *  door nor, under KR.doorHeightEn8121, than KR.doorHeightMin8121 (UNI EN 81-21 5.12): below either, not met [mm]. An
 *  existing door already at KV_VERT.entranceH shows the openings allow it: the limit stays KV_VERT.entranceH. */
export function altezzaPorta(nuova: number, esistente: number): Esito {
  if (nuova >= KV_VERT.entranceH - 1e-9) return { status: 'ok', value: nuova, limit: KV_VERT.entranceH };
  if (esistente >= KV_VERT.entranceH - 1e-9) return { status: 'fail', value: nuova, limit: KV_VERT.entranceH };
  const limit = Math.max(esistente, KR.doorHeightMin8121);
  return { status: nuova >= limit - 1e-9 ? 'warn' : 'fail', value: nuova, limit };
}

/** The design's checks of the doors, printed in this section. */
export const ID_PORTE: readonly ShaftCheckId[] = ['h_door', 'v_sill', 'v_wall', 'v_land', 'v_land2', 'v_door', 'v_door2', 'v_op', 'v_telaio', 'p_toe', 'h_staffe'];

export function porte(x: RtCtx): EsitoSezione {
  const p = x.inputs.componenti?.porte?.piano, k = x.inputs.componenti?.porte?.cabina, piano = nuova(x, 'landingDoors'), checks: RtCheck[] = [], punti: PuntoRt[] = [];
  const o = { sezione: 'porte' as const, ambito: ambito(piano), upper: false }, c = (f: string): string => `componenti.porte.piano.${f}`;
  if (p?.fuocoEsistente && p.fuocoNuova) {
    const e = confrontoFuoco(p.fuocoEsistente, p.fuocoNuova);
    checks.push({ ...rtCheck(x, 'rt_door_fire', e.status === 'ok', e.value, e.limit, 0, '', { ...o, nota: `${p.fuocoNuova} / ${p.fuocoEsistente}` }), status: e.status });
  } else if (piano) checks.push(mancante(x, 'rt_door_fire', [...(p?.fuocoEsistente ? [] : [c('fuocoEsistente')]), ...(p?.fuocoNuova ? [] : [c('fuocoNuova')])], null, 0, '', o));
  const L = x.base.path === 'vano' ? x.base.lift?.layout : undefined, alta = L ? L.inputs.doorHeight : p?.altezzaNuova;
  if (alta !== undefined && p?.altezzaEsistente !== undefined) {
    const e = altezzaPorta(alta, p.altezzaEsistente);
    checks.push({ ...rtCheck(x, 'rt_door_height', e.status === 'ok', e.value, e.limit, 0, 'mm', o), status: e.status });
  } else if (piano) checks.push(mancante(x, 'rt_door_height', [...(alta === undefined ? [c('altezzaNuova')] : []), ...(p?.altezzaEsistente === undefined ? [c('altezzaEsistente')] : [])], null, 0, 'mm', o));
  if (piano && alta !== undefined && alta < KV_VERT.entranceH) punti.push(sito('porte', SITO_RT.porteVincoli(x.norma)));
  if (piano && alta !== undefined && alta < KR.doorHeightEn8121) punti.push(sito('porte', SITO_RT.porteBasse));
  if (L) checks.push(...conId(x.base.lift?.checks ?? [], ID_PORTE).map((v) => daVano(x, v, 'porte')));
  // the design's doors (telescopic or central, T2/C2) are automatic sliding ones
  const automatiche = [p?.tipo, k?.tipo].includes('scorrevoli_automatiche') || (!!L && !p?.tipo && !k?.tipo);
  if ((piano || nuova(x, 'carDoors')) && automatiche) punti.push(sito('porte', SITO_RT.porteMotorizzate));
  const stato = piano && nuova(x, 'carDoors') ? 'nuovo' : piano || nuova(x, 'carDoors') ? 'misto' : 'esistente', src = fonteDi(p?.fonte, x.allegati), srcK = fonteDi(k?.fonte, x.allegati);
  const sp = piano ? 'nuovo' : 'esistente', sk = nuova(x, 'carDoors') ? 'nuovo' : 'esistente';
  const dati = [
    dato('piano.tipo', p?.tipo ?? null, '', 0, sp, src), dato('piano.fuocoEsistente', p?.fuocoEsistente ?? null, '', 0, 'esistente', src),
    dato('piano.fuocoNuova', p?.fuocoNuova ?? null, '', 0, 'nuovo', src), dato('piano.altezzaEsistente', p?.altezzaEsistente ?? null, 'mm', 0, 'esistente', src),
    dato('piano.altezzaNuova', alta ?? null, 'mm', 0, 'nuovo', L ? 'progetto' : src), dato('piano.serratureNuove', p?.serratureNuove === undefined ? null : p.serratureNuove ? 'si' : 'no', '', 0, sp, src),
    dato('cabina.tipo', k?.tipo ?? null, '', 0, sk, srcK), dato('cabina.tensioneOperatore', k?.tensioneOperatore ?? null, 'V', 0, sk, srcK),
  ].filter((d) => d.valore !== null);
  return { componente: { sezione: 'porte', stato, dati }, checks, punti, mancanti: mancantiDi('porte', checks) };
}
