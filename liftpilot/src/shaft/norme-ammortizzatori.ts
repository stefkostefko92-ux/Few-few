// Registry of the buffers in the pit (UNI EN 81-20:2020, 5.8) and of the runby over them: each type with the speeds it
// is allowed to and its stroke, cited only for the checks of the buffers of its type (the car's: b_car; the
// counterweight's: b_cw; b_type both), each check with its own clause. The constants are in KV_VERT (norme-vert.ts),
// the entries spread into VOCI_VERT; same form as norme.ts, Italian texts, clause numbers and values only.
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';
// the stroke's clauses of the polyurethane pads and of the hydraulic buffers, the car's and the counterweight's alike
const PU = `${T20}, 5.8.1.7, 5.8.2.1.2.1 e 5.8.2.1.2.2 (compresso al 90 %); ${T50}, 5.5.4 (esame di tipo)`;
const OIL = `${T20}, 5.8.2.2.1 (corsa); la corsa ridotta di 5.8.2.2.2 non è usata`;

export const VOCI_AMMORTIZZATORI: readonly VoceVano[] = [
  {
    id: 'ammortizzatori.corsa', gruppo: 'sezione', titolo: 'Ammortizzatori ad accumulo di energia lineari (molle)',
    valore: 'ammessi fino a 1 m/s; corsa ≥ 0,135·v² m e comunque ≥ 65 mm',
    riferimento: 'UNI EN 81-20:2020, 5.8.1.5 (fino a 1 m/s) e 5.8.2.1.1.1 (corsa)', fonte: letto(T20, 'p. 98'), stato: 'confermato',
    verifiche: ['b_type', 'b_car', 'b_cw'], ammortizzatore: 'spring',
    rifVerifica: { b_type: `${T20}, 5.8.1.5`, b_car: `${T20}, 5.8.2.1.1.1`, b_cw: `${T20}, 5.8.2.1.1.1` },
  },
  {
    id: 'ammortizzatori.extracorsa', gruppo: 'sezione', titolo: 'Extracorsa della cabina e del contrappeso',
    valore: 'dalla fermata estrema agli ammortizzatori ≥ 0 per la cabina e per il contrappeso, con ogni tipo di ammortizzatore: la norma non dà '
      + 'un’extracorsa minima in metri, l’interruttore di extracorsa interviene prima che la cabina o il contrappeso tocchino gli ammortizzatori',
    riferimento: 'UNI EN 81-20:2020, 5.12.2.1 (interruttori di extracorsa); nessuna extracorsa minima in metri', fonte: letto(T20, 'p. 131'),
    stato: 'confermato', verifiche: ['b_runby'],
  },
  {
    id: 'ammortizzatori.poliuretano', gruppo: 'sezione', titolo: 'Ammortizzatori ad accumulo di energia non lineari (tamponi in poliuretano)',
    valore: 'ammessi fino a 1 m/s come le molle; nessuna corsa minima da formula: il campo di masse del certificato di esame di tipo per la velocità '
      + 'deve comprendere, per ogni tampone, la cabina vuota e a pieno carico (o il contrappeso); «completamente compresso» vuol dire compresso del '
      + '90 % dell’altezza, quindi la corsa è 0,9·H negli spazi in fossa e in testata; tampone tipico alti 80 mm (P+S Diepocell D, Ø da 80 a 220 mm; '
      + 'ACLA AUTAN XL)',
    riferimento: 'UNI EN 81-20:2020, 5.8.1.5, 5.8.1.7, 5.8.2.1.2.1 e 5.8.2.1.2.2 (compresso al 90 %); UNI EN 81-50:2020, 5.5.4 (esame di tipo)',
    fonte: `${letto(T20, 'pp. 98–99')}; ${letto(T50, 'p. 24')}; il tampone tipico dai cataloghi P+S Diepocell (wwlift.de) e ACLA AUTAN XL `
      + '(acla.de), estratti di ricerca del 1° ottobre 2026', stato: 'confermato',
    nota: 'il tampone tipico alto 80 mm è un dato di catalogo, non della norma: va sostituito con quello montato',
    verifiche: ['b_type', 'b_car', 'b_cw'], ammortizzatore: 'pu', rifVerifica: { b_type: `${T20}, 5.8.1.5`, b_car: PU, b_cw: PU },
  },
  {
    id: 'ammortizzatori.idraulici', gruppo: 'sezione', titolo: 'Ammortizzatori a dissipazione di energia (idraulici)',
    valore: 'a ogni velocità; corsa ≥ 0,0674·v² m (arresto per gravità al 115 % della velocità nominale); la corsa ridotta con il controllo del '
      + 'rallentamento non è considerata; ammortizzatori tipici: Oleo LSB10 fino a 1 m/s, alto 222,2 mm con corsa 73,4 mm; LSB16 fino a 1,6 m/s, '
      + 'alto 485,5 mm con corsa 173,5 mm',
    riferimento: 'UNI EN 81-20:2020, 5.8.1.6 e 5.8.2.2.1 (corsa); la corsa ridotta di 5.8.2.2.2 non è usata',
    fonte: `${letto(T20, 'p. 99')}; gli ammortizzatori tipici dal catalogo Oleo LSB e SEB (oleo.co.uk), estratti di ricerca del 1° ottobre 2026`,
    stato: 'confermato',
    nota: 'gli ammortizzatori Oleo sono dati di catalogo, non della norma: vanno sostituiti con quelli montati',
    verifiche: ['b_type', 'b_car', 'b_cw'], ammortizzatore: 'oil', rifVerifica: { b_type: `${T20}, 5.8.1.6`, b_car: OIL, b_cw: OIL },
  },
];
