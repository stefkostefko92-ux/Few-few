// The components of the RT after the owner's model, by id (types.ts COMPONENTI_RT2). Pure.
import type { ComponenteRt2, ModuloRt2 } from '../types';
import { AMM_CABINA, AMM_CWT } from './ammortizzatori';
import { CABINA } from './cabina';
import { CONTRAPPESO } from './contrappeso';
import { GUIDE_CABINA } from './guide-cabina';
import { LIMITATORE } from './limitatore';
import { PORTE } from './porte';
import { QUADRO } from './quadro';
import { FUNI } from './funi';
import { MACCHINA } from './macchina';

/** The modules written so far; a component without one is not offered. */
export const MODULI: Readonly<Partial<Record<ComponenteRt2, ModuloRt2>>> = {
  quadro: QUADRO, cabina: CABINA, funi: FUNI, guideCabina: GUIDE_CABINA, ammCabina: AMM_CABINA, contrappeso: CONTRAPPESO, ammCwt: AMM_CWT, macchina: MACCHINA,
  limitatore: LIMITATORE, porte: PORTE,
};

/** The fields components share — one value, asked on each page that prints it (the model's same input read by several
 *  sheets): the car's safety gear (cabin, its rails, governor), the door operator's supply (controller and doors), the
 *  headroom and the pit (the car's and the counterweight's rails; the model's Dati Generali K74/K75). */
export const CONDIVISI: Readonly<Record<string, readonly ComponenteRt2[]>> = {
  paracadute: ['cabina', 'guideCabina', 'limitatore'], tensioneOperatore: ['quadro', 'porte'], frequenzaOperatore: ['quadro', 'porte'],
  testata: ['guideCabina', 'contrappeso'], fossa: ['guideCabina', 'contrappeso'],
};
export const moduloDi = (c: ComponenteRt2): ModuloRt2 | null => MODULI[c] ?? null;
