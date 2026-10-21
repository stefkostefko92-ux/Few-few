// The component sections of the relazione tecnica di modifica run in the document's order (RT plan §4.3, §4.5): each
// included section's data, checks, points and missing data, then the obligations of the parts and cases (punti.ts) and
// a point on site for each check missing its data. A check is computed only inside an included section. Pure.
import type { ComponenteRt, MancanteRt, PuntoRt, RtCheck, SezioneKey, SezioneRt } from '../types';
import { ammortizzatori } from './ammortizzatori';
import { cabina } from './cabina';
import type { RtCtx } from './comune';
import { contrappeso, vano } from './contrappeso';
import type { EsitoSezione } from './esito';
import { argano, funi } from './funi-argano';
import { guideCabina } from './guide';
import { guideContrappeso } from './guide-cw';
import { limitatore } from './limitatore';
import { porte } from './porte';
import { puntiMancanti, puntiObblighi } from './punti';
import { locale, quadro } from './quadro';

export const PER_SEZIONE: Readonly<Record<SezioneKey, (x: RtCtx) => EsitoSezione>> = {
  quadro, cabina, funi, argano, locale, guideCabina, guideContrappeso, ammortizzatori, limitatore, porte, contrappeso, vano,
};

export interface Componenti {
  componenti: ComponenteRt[];
  checks: RtCheck[];
  punti: PuntoRt[];
  mancanti: MancanteRt[];
}

export function componentiOf(x: RtCtx, sezioni: readonly SezioneRt[]): Componenti {
  const per = sezioni.map((s) => PER_SEZIONE[s.key](x)), checks = per.flatMap((e) => e.checks);
  return {
    componenti: per.map((e) => e.componente), checks,
    punti: [...puntiObblighi(x, sezioni), ...per.flatMap((e) => e.punti), ...puntiMancanti(checks)],
    mancanti: per.flatMap((e) => e.mancanti),
  };
}
