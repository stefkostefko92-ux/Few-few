// Registry of the machine's support in the room above the shaft (support.ts) and of the check of its beams
// (src/lib/lift/support.ts). Same form as norme.ts; Italian texts, clause numbers and values only.
import type { VoceVano } from './norme';

export const VOCI_SUPPORTO: readonly VoceVano[] = [
  {
    id: 'locale.basamento', gruppo: 'locale', titolo: 'Basamento dell\'argano',
    valore: 'su spessori di livellamento sotto gli appoggi (l\'asse della puleggia dove lo mette il software), su telaio di due profilati sul pavimento '
      + '(tipico UPN 200, alto quanto il profilato come i telai bassi universali), su due putrelle da muro a muro che possono stare sollevate dal '
      + 'pavimento (tipiche IPE 200, appoggio nei muri 150 mm), su piastre d\'acciaio sotto gli appoggi (tipiche 20 mm) o su plinto in calcestruzzo '
      + '(tipico 250 mm); tamponi antivibranti di 30 mm sotto gli appoggi, salvo sugli spessori; telaio e plinto 100 mm oltre il telaio dell\'argano a '
      + 'ogni estremità; l\'altezza del basamento porta l\'asse della puleggia, che il calcolo (tratto di fune oltre la corsa) e il 3D seguono',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8 (carichi sull\'edificio); scelta del costruttore',
    fonte: 'telaio basso universale per argano alto 200 mm (lift-store.it); tamponi antivibranti 25–30 mm (catalogo Donati); piastre di 20 mm e plinto di '
      + '250–300 mm nella pratica di installazione (fonti estere, da confermare); estratti di ricerca del 1° ottobre 2026',
    stato: 'scelta',
  },
  {
    id: 'locale.putrelle', gruppo: 'locale', titolo: 'Verifica delle putrelle sotto l\'argano',
    valore: 'ognuna delle due putrelle porta metà del carico dell\'argano (il suo peso più il carico statico sull\'asse per il coefficiente dinamico) '
      + 'come forza concentrata in mezzeria, più il proprio peso, sulla luce tra i centri degli appoggi nei muri (luce libera più 150 mm): '
      + 'σ = M/Wel,y ≤ fyk/γM0 con acciaio S275 (fyk 275 MPa) e γM0 = 1,05; freccia elastica f = F·L³/(48·E·I) + 5·q·L⁴/(384·E·I) ≤ 1/1500 '
      + 'della luce libera con E = 210000 MPa; proprietà dei profili EN 10365',
    riferimento: 'NTC 2018, §4.2.4.1.1 (γM0), Tab. 11.3.IX (S275), §11.3.4.1 (E); DPR 1497/1963, art. 5 (carichi fissi più 1,5 volte il carico '
      + 'statico delle funi; freccia ≤ 1/1500 della luce libera: regola storica, da confermare)',
    fonte: 'NTC 2018 (DM 17/01/2018); catalogo dei profilati ArcelorMittal (EN 10365) confrontato con due tabelle indipendenti; DPR 1497/1963 letto '
      + 'per intero (research/argano-geared, cap. 15, §1.1)', stato: 'da_verificare',
    verifiche: ['m_beam', 'm_beamf'],
    nota: 'verifica semplice a carico concentrato in mezzeria su trave appoggiata; gli appoggi nei muri e la muratura vanno verificati dal progettista',
  },
];
