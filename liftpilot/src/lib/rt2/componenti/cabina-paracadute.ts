// The car's safety gear (the model's «38. Tipo di paracadute», TABELLE!B66:F70, chosen on its hidden sheet «Guide cabina
// solo inserimento» and read by the governor's page): one field, the same id on the pages «Cabina» and «Limitatore di
// velocità» — the value the RT holds once. An explicit choice without a default (the model's saved item 2 was used
// silently: E-L10); the model's own hint beside it (J17: «presa istantanea a rulli» under 0,63 m/s, else «presa
// progressiva») is the screen's warning. The type for the rated speed (UNI EN 81-20:2020, 5.6.2.1.2.1) and the band of a
// progressive gear chosen against the rated speed. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { str, verifica } from '../campi';
import { PARACADUTI, voceDi, type Paracadute } from '../cataloghi/cqpl';
import type { CampoRt2, ContestoRt2, DatiRt2, VerificaRt2 } from '../types';

export const campoParacadute = (req: boolean | ((x: DatiRt2, ctx: ContestoRt2) => boolean)): CampoRt2 =>
  ({ id: 'paracadute', t: 'scelta', label: '38. Tipo di paracadute:', opzioni: PARACADUTI.map((p) => ({ v: p.v, t: p.t })), req });

export const paracaduteDi = (x: DatiRt2): Paracadute | null => voceDi(PARACADUTI, str(x, 'paracadute'));

/** The screen's warnings: the band of a progressive gear against the rated speed (the window follows the speed, E-L1),
 *  and the model's hint on the type (J17). */
export function avvisiParacadute(p: Paracadute | null, v: number | null): string[] {
  if (!p || v === null) return [];
  const out: string[] = [];
  if (p.v === '3' && v > 1) out.push('Paracadute «Presa progressiva <= 1 m/s» con velocità nominale oltre 1 m/s: il limite d’intervento segue la velocità nominale.');
  if (p.v === '4' && v <= 1) out.push('Paracadute «Presa progressiva > 1 m/s» con velocità nominale fino a 1 m/s: il limite d’intervento segue la velocità nominale.');
  if (p.gear !== 'progressive' && v >= KV_VERT.gearInstantV) out.push('Con questa velocità nominale il modello suggerisce un paracadute a presa progressiva.');
  return out;
}

/** The type for the rated speed: an instantaneous gear (wedges or rollers) up to KV_VERT.gearInstantV; required with the
 *  gear replaced, the speed increased or the loads beyond prospetto 1 (6.6, 15.3), else information. A progressive gear
 *  has no limit: no line. */
export function verificaTipoParacadute(p: Paracadute | null, ctx: ContestoRt2): VerificaRt2 | null {
  const v = ctx.dopo.v;
  if (!p || p.gear === 'progressive') return null;
  const richiesta = ctx.parti.includes('safetyGear') || !!ctx.velocita?.aumento || !!ctx.carico?.p1;
  return verifica('cabina.paracadute', `Paracadute istantaneo (${p.t.toLowerCase()}): velocità nominale`, v, '<=', KV_VERT.gearInstantV,
    { unita: 'm/s', dec: 2, rif: 'UNI EN 81-20:2020, 5.6.2.1.2.1', info: !richiesta });
}
