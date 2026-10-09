// Registry of what the drawing set writes by the software's choice or by the rules of the trade: the smallest lettering,
// the plant number, the revisions, the machine's name, where the loads are tagged, the governor's load when it is not
// known, the records sheet 1
// cites, the CAD files of an issued set. Same form as the values filled in (src/lib/lift/norme.ts), with which the list
// for the engineer prints them; Italian texts, clause numbers and values only. The values are the constants of the
// drawing set (tavole.test.ts checks them).
import type { VoceImpianto } from '../lift/norme';

export const VOCI_TAVOLE: readonly VoceImpianto[] = [
  {
    id: 'tavole.caratteri', titolo: 'Altezza minima delle scritte dei disegni',
    valore: 'nomi, sigle e richiami dei carichi a corpo 2,5 mm sul foglio (maiuscole alte 1,8 mm); una scritta che alla scala del foglio non ci sta '
      + 'non si rimpicciolisce: esce dal disegno con una linea di richiamo; le etichette del cartiglio e della striscia a corpo 2 mm, le quote con le '
      + 'proprie altezze',
    riferimento: 'UNI EN ISO 3098-1 (serie delle altezze nominali della scrittura: 1,8 – 2,5 – 3,5 mm …)',
    fonte: 'scelta del software sulla serie della norma; misura del carattere DejaVu Sans (maiuscole 0,73 del corpo)', stato: 'scelta',
    nota: 'prima i nomi che non stavano si rimpicciolivano sotto i 2,5 mm di corpo, fino a non leggersi in stampa',
  },
  {
    id: 'tavole.matricola', titolo: 'Numero di matricola nel cartiglio e nella striscia',
    valore: 'quello dei dati dell’impianto; se manca, «DA ASSEGNARE» per un impianto nuovo (il Comune lo assegna dopo la comunicazione della messa '
      + 'in esercizio) e «DA COMUNICARE» per un impianto esistente modificato, che il Comune e l’organismo delle verifiche conoscono per matricola',
    riferimento: 'DPR 162/1999 e s.m.i., art. 12 c.1–3 (matricola entro 30 giorni dalla comunicazione), c.4–5 (modifica)',
    fonte: 'DPR 162/1999 (testo su Normattiva)', stato: 'confermato',
  },
  {
    id: 'tavole.revisioni', titolo: 'Revisioni nel cartiglio',
    valore: 'R0 «PRIMA EMISSIONE» con la data della prima emissione, poi R1, R2 … con la nota e la data di ciascuna; il cartiglio ne mostra le ultime '
      + '4; la casella del DIS. N° e la striscia di ogni foglio portano la revisione corrente con la sua data; una bozza (non emessa) non ha R0 e '
      + 'lascia la casella da compilare a mano; sotto il cartiglio la cella del timbro e della firma del progettista',
    riferimento: 'ISO 7200 (campi del cartiglio: numero del disegno, indice di revisione, data)', fonte: 'prassi dei disegni tecnici', stato: 'prassi',
  },
  {
    id: 'tavole.argano', titolo: 'Nome dell’argano nei disegni',
    valore: 'il modello del catalogo su cui è fatto il calcolo, con accanto «(rif. impianto: …)» il testo dei dati dell’impianto quando è diverso; il '
      + 'testo deve nominare quel modello a parole intere (senza la nota fra parentesi, la puleggia «Ø…» e «con …»; «M 73» è M73, ma «Sx» è una '
      + 'parola a sé) e nessun altro modello o costruttore del catalogo (SH130G non è SH130, M73S non è M73): altrimenti l’emissione delle tavole '
      + 'si ferma finché non si corregge',
    riferimento: 'relazione di calcolo e tavole dello stesso impianto: un solo argano', fonte: 'scelta del software', stato: 'scelta',
  },
  {
    id: 'tavole.carichi', titolo: 'Richiami dei carichi P1…P8 sulle tavole',
    valore: 'dove ogni carico agisce: P1 sull’argano nel locale (con la macchina in basso sulle pulegge di rinvio in testata, tratteggiate nella '
      + 'pianta in testata, un richiamo con una linea a ciascuna), P2 e P3 sugli attacchi delle funi a 2:1, P4 sul limitatore, P5–P8 su guide e '
      + 'ammortizzatori nella pianta della fossa; ogni cerchio ad almeno 2r + 0,5 mm dagli altri e fuori dalle scritte, al primo posto libero intorno '
      + 'a ciò che indica',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8 (carichi sulla struttura dell’edificio: voci carichi.macchina e carichi.fossa)', fonte: 'scelta del software', stato: 'scelta',
  },
  {
    id: 'tavole.limitatore', titolo: 'Carico del limitatore (P4) non noto',
    valore: 'senza il carico del limitatore nei dati dell’impianto il foglio 1 scrive «DA FORNITORE» e non lo somma: lo dà il costruttore del '
      + 'limitatore (massa e tiro della fune all’intervento)',
    riferimento: 'UNI EN 81-20:2020, 5.6.2.2 (limitatore di velocità)', fonte: 'scelta del software', stato: 'scelta',
  },
  {
    id: 'tavole.elaborati', titolo: 'Elaborati collegati sul foglio 1',
    valore: 'sopra il cartiglio: «QUOTE IN mm, DA VERIFICARE IN CANTIERE», il numero delle verifiche non superate della tabella e i record da cui la '
      + 'serie è disegnata con l’inizio del loro SHA-256 (il calcolo e il progetto del vano, o il rilievo del locale e il calcolo per una '
      + 'sostituzione); la relazione tecnica della sostituzione cita le tavole emesse con numero, revisione e SHA-256',
    riferimento: 'UNI 10411-1:2024, App. C (documenti della modifica)', fonte: 'scelta del software', stato: 'scelta',
  },
  {
    id: 'tavole.cad', titolo: 'File CAD della serie emessa',
    valore: 'DXF (AutoCAD 2007) e DWG (AutoCAD 2000) della serie emessa, ridisegnati dal suo record solo se i motori danno lo stesso disegno: tutti i '
      + 'fogli del PDF. Le viste in scala reale, impaginate come le impagina il loro foglio e con quanto il foglio vi disegna intorno (legende, lati '
      + 'delle fermate, segni delle sezioni, cartello del contrappeso, note delle guide, legenda dei simboli del locale), con titolo, sottotitolo, '
      + 'numero del foglio e scala; il calcestruzzo campito ANSI31 (linee a 45° a 1,6 mm sul foglio); il foglio 1 alla scala della prima vista con '
      + 'il cartiglio come blocco CARTIGLIO i cui attributi sono numero, revisioni, date, matricola, committente e ubicazione; sotto il foglio 1 il '
      + 'foglio delle verifiche del progetto (senza la striscia, le cui parole sono gli attributi del cartiglio); sotto la prima vista numero, '
      + 'revisione e SHA-256 della serie',
    riferimento: 'prassi dello scambio dei disegni (blocco del cartiglio con attributi)', fonte: 'scelta del software', stato: 'scelta',
  },
];
