// The components' names as the screens and the issued RT's page write them (the modules' titles, without importing the
// modules into a page that only reads a record). Pure.
import { COMPONENTI_RT2, type ComponenteRt2 } from './types';

export const TITOLI_RT2: Readonly<Record<ComponenteRt2, string>> = {
  quadro: 'Quadro di manovra', cabina: 'Cabina', funi: 'Funi di trazione', guideCabina: 'Guide di cabina', ammCabina: 'Ammortizzatori di cabina',
  contrappeso: 'Contrappeso', ammCwt: 'Ammortizzatori del contrappeso', macchina: 'Macchina', limitatore: 'Limitatore di velocità', porte: 'Porte',
};
export const titoloComponente = (c: string): string => (COMPONENTI_RT2.some((x) => x === c) ? TITOLI_RT2[c as ComponenteRt2] : c);
