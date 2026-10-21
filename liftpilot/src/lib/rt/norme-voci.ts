// The entries of the registry of the relazione tecnica di modifica (VOCI_RT): how the sections, the expected documents,
// the structures and the regime are decided — written from the tables themselves (sezioni.ts, documenti.ts,
// regimi.ts), so the engineer's checklist says what the code does — and every check of the RT's own (componenti/*.ts)
// with the numbers of KR and of the shaft's registries it uses. Italian texts for the engineer, clause numbers and values
// only; registered in scripts/lista-verifica.ts (npm run lista, then python3 scripts/lista-verifica-xlsx.py). Pure.
import { letto } from '@/calc/norme-fonti';
import { KV_VERT } from '@/shaft/norme-vert';
import { NORMA_SIGLA } from '../lift/collaudo';
import type { Norma10411 } from '../lift/modifica';
import { KL } from '../lift/norme';
import { DOCUMENTI } from './documenti';
import { KR, OBBLIGHI_RT, type VoceRt } from './norme';
import { ANNO_CE, ANNO_PRIMO_ATTO, REGIMI } from './regimi';
import { CASI_TESTO, SEZIONI, SEZIONI_PER_CASO, elenco, nomeParte } from './sezioni';
import type { Parte } from '../lift/collaudo';
import type { CasoVariazione } from '../lift/obblighi-variazioni';

const it = (x: number): string => String(x).replace('.', ',');
const it1 = (x: number): string => x.toFixed(1).replace('.', ',');
const pct = (x: number): string => it(Math.round(x * 1000) / 10);
const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020', U1 = 'UNI 10411-1:2024', U11 = 'UNI 10411-11:2024';
const NORME: readonly Norma10411[] = ['10411-1', '10411-11'];
/** The norm expert's answers of round 49 (private notes; clause numbers and values only). */
const ESPERTO = 'risposte dell’esperto di norme del 2026-10-21';

/** «quadro di manovra (11.1), portata o T* oltre il prospetto 1 (6.11)» — the parts and cases of a section under a part. */
function regolaText(key: (typeof SEZIONI)[number]['key'], n: Norma10411): string {
  const r = SEZIONI_PER_CASO[key];
  const parti = (Object.entries(r.parti[n]) as [Parte, readonly string[]][]).map(([p, t]) => `${nomeParte(p)} (${elenco(t)})`);
  const casi = (Object.entries(r.casi[n]) as [CasoVariazione, readonly string[]][]).map(([c, t]) => `${CASI_TESTO[n][c] ?? c} (${elenco(t)})`);
  const all = [...parti, ...casi];
  return all.length ? all.join(', ') : 'nessuna parte né caso';
}
const PERCORSO = { entrambi: '', locale: ' (sul percorso del locale sempre; sul progetto del vano con il locale disegnato sopra il vano)', vano: ' (solo sul progetto del vano)' };

const sezioniValore = SEZIONI.map(({ key, titolo }) => `«${titolo}»${PERCORSO[SEZIONI_PER_CASO[key].percorso]}: `
  + NORME.map((n) => `con la ${NORMA_SIGLA[n]} ${regolaText(key, n)}`).join('; ')).join('. ');

const documentiValore = DOCUMENTI.map((d) => `${d.titolo}: ${d.quando} (${d.clausola['10411-1']}; ${d.clausola['10411-11']})`).join('; ');

const regimiValore = REGIMI.map((r) => `${r.sigla}, ${r.norma === '10411-1' ? 'UNI 10411-1' : 'UNI 10411-11'}: ${r.anni
  ? `derivato con l’impianto installato dal ${r.anni[0]} al ${r.anni[1]}`
  : r.ce ? 'con la marcatura CE del calcolo' : 'mai derivato dall’anno'}${r.nota ? ` (${r.nota})` : ''}`).join('; ')
  + `; installato prima del ${ANNO_PRIMO_ATTO} o nel ${ANNO_CE} (la marcatura CE dal ${KL.ceFrom.split('-').reverse().join('/')}): nessuna derivazione, lo `
  + 'sceglie il tecnico; il DM 1635/1979 non è offerto (ascensori a vite, a cremagliera e idraulici)';

const omegaText = KR.omega520.map(([lim, a, e, b], i) => `${it(a)}·λ^${it(e)}${b ? ` + ${it(b)}` : ''} ${i ? `fino a ${lim}` : `fino a λ ${lim}`}`).join(', ');

const obbligoText = (p: 'rails' | 'buffers' | 'cw' | 'sling'): string => NORME.flatMap((n) => {
  const x = OBBLIGHI_RT[n][p];
  return x ? [`con la ${NORMA_SIGLA[n]}: ${x.testo} (${x.rif})`] : [];
}).join('; ');

const G = KV_VERT;
const TITOLI_OBBLIGHI = { rails: 'Guide nuove o sostituite', buffers: 'Ammortizzatori nuovi o sostituiti', cw: 'Contrappeso nuovo o modificato', sling: 'Arcata nuova (UNI 10411-11)' } as const;

export const VOCI_RT: readonly VoceRt[] = [
  {
    id: 'relazione.sezioni', gruppo: 'relazione', titolo: 'Sezioni della relazione per le parti e i casi della modifica',
    valore: `una sezione entra quando una sua parte è sostituita o modificata, quando un suo caso è tra quelli che i documenti danno al calcolo, o quando il tecnico la aggiunge con un motivo; quelle portate dalla regola non si tolgono. ${sezioniValore}`,
    riferimento: `${U1} e ${U11}, i punti indicati per ciascuna parte e ciascun caso`,
    fonte: `lettura del software dei punti per parte e per caso del registro (${letto(U1, 'pp. 6–21')}; ${letto(U11, 'pp. 7–14')}); ${ESPERTO}`, stato: 'derivazione',
    nota: 'i casi che portano solo punti (corsa oltre 8 m o accorciata, velocità entro i limiti, variazioni smentite dai documenti) li stampano in «Adeguamenti e '
      + 'adempimenti»; con la UNI 10411-11 le lettere dei punti 15 e 16 sono quelle del testo e, dove il testo non nomina il componente, la sezione cita '
      + 'l’intervallo del caso (6.1–6.13); le regole di decisione di modelli di terzi non sono usate',
  },
  {
    id: 'relazione.documenti', gruppo: 'relazione', titolo: 'Documenti attesi della relazione',
    valore: `${documentiValore}. Un documento è allegato quando il tecnico ne sceglie il file, o quando un solo documento atteso aperto ha il tipo e il componente `
      + 'di un file della relazione; altrimenti «da allegare ⚠», senza bloccare l’emissione; gli ammortizzatori a molla non chiedono un file: il loro calcolo è la sezione',
    riferimento: `${U1}, appendice C; ${U11}, appendice A`, fonte: `${letto(U1, 'pp. 27–32')}; ${letto(U11, 'pp. 17–21')}`, stato: 'derivazione',
    nota: 'quale file è quale documento è una scelta del software (tipo e componente) o del tecnico; per i componenti di aziende con qualità totale vale anche '
      + 'il documento analogo al certificato d’esame del tipo',
  },
  {
    id: 'relazione.strutture', gruppo: 'relazione', titolo: 'Strutture dell’edificio',
    valore: 'con la UNI 10411-1 la dichiarazione del proprietario sull’idoneità delle strutture è richiesta con la portata o T* oltre il prospetto 1 (6.3); con la '
      + 'macchina nuova, le apparecchiature del locale spostate o aggiunte o la disposizione cambiata il tecnico dice se le forze sulle strutture aumentano o '
      + 'si spostano in modo sfavorevole (5, 9.1, App. C (14)): sì, la dichiarazione è richiesta; no, la relazione stampa la sua dichiarazione; con il '
      + 'contrappeso oltre il prospetto 2 il tecnico dice se la dichiarazione è pertinente (App. C (6)); con la UNI 10411-11 una variazione dei carichi oltre il '
      + `${pct(KL.loadStruct11)} %, anche sommata alle modifiche precedenti, la richiede e fino a lì il punto 5 non si applica (6.2). Senza una di queste strade la `
      + 'relazione dice che nessun caso richiama il punto 5: mai una dichiarazione di «nessuna variazione significativa»',
    riferimento: `${U1}, 5, 6.3, 9.1, App. C (5), (6) e (14); ${U11}, 5 e 6.2`, fonte: `${letto(U1, 'pp. 6, 7, 9, 27 e 30')}; ${letto(U11, 'pp. 7–8')}; ${ESPERTO}`,
    stato: 'confermato', nota: 'se una macchina nuova aumenti o sposti le forze sulle strutture lo giudica il tecnico: la relazione gli chiede la risposta',
  },
  {
    id: 'relazione.spazi', gruppo: 'relazione', titolo: 'Testata e fossa con la velocità o la corsa cambiate',
    valore: 'con la velocità aumentata o cambiata e con la corsa allungata gli spazi liberi in testata e in fossa seguono la UNI EN 81-20 5.2.5.7 e 5.2.5.8 '
      + 'per intero: nella sezione «Vano, fossa e testata» anche la traversa dell’arcata sotto il soffitto (5.2.5.7.2), il posto in piedi sul tetto '
      + '(5.2.5.7.1 e 5.2.5.7.3) e la posizione degli ammortizzatori rispetto al rifugio in fossa (5.2.5.8.1) sono verifiche richieste dalla modifica',
    riferimento: `${U1}, 15.11 e 16 j); ${U11}, 15 e) e 16 i); ${T20}, 5.2.5.7 e 5.2.5.8`, fonte: `${letto(U1, 'pp. 15–16')}; ${letto(U11, 'pp. 12–13')}`,
    stato: 'confermato',
    nota: 'la tabella dell’ambito dell’esame (relazione di calcolo, progetto dell’ascensore) porta queste tre verifiche con meno parti: allinearla sposta le '
      + 'versioni dei motori, decisione del titolare',
  },
  {
    id: 'impianto.regime', gruppo: 'impianto', titolo: 'Legge di approvazione dell’impianto',
    valore: `${regimiValore}. Il regime derivato è stampato «derivato dall’anno, da confermare ⚠»; l’emissione chiede un regime scelto, o derivato e `
      + 'confermato sul libretto, ammesso dalla parte della UNI 10411 del calcolo',
    riferimento: `${U1}, 1, 15.17 e 18; ${U11}, 1; DPR 162/1999, art. 19`, fonte: `${letto(U1, 'pp. 5, 15 e 17')}; ${letto(U11, 'p. 5')}; ${ESPERTO}`,
    stato: 'scelta', nota: 'gli anni sono una stima del software: la data di un atto non è quella da cui gli impianti dovevano seguirlo; gli atti e il loro '
      + 'campo sono letti, il DPR 268/1994 era nominato per gli ascensori elettrici nello scopo delle edizioni della UNI 10411-1 fino a quella del 2008',
  },
  {
    id: 'quadro.tensioni', gruppo: 'quadro', titolo: 'Tensioni del quadro nuovo e dei contatti delle serrature',
    valore: `con il quadro nuovo i circuiti di comando e di sicurezza non oltre ${KR.ctrlVoltageMax} V (valore medio in corrente continua, efficace in alternata); `
      + 'tenendo la parte elettrica esistente perché compatibile e con i conduttori contrassegnati, i contatti delle serrature di piano esistenti accessibili al '
      + `dito di prova non oltre ${KR.lockContactAc} V in corrente alternata o ${KR.lockContactDc} V in continua`,
    riferimento: `${T20}, 5.10.1.3.2; ${U1}, 11.1.2`, fonte: `${letto(T20, 'p. 115')}; ${letto(U1, 'p. 10')}`, stato: 'confermato',
    costanti: ['ctrlVoltageMax', 'lockContactAc', 'lockContactDc'], verifiche: ['rt_ctrl_voltage', 'rt_lock_voltage'],
    rifVerifica: { rt_ctrl_voltage: `${T20}, 5.10.1.3.2`, rt_lock_voltage: `${U1}, 11.1.2` },
    nota: 'le tensioni sono dati del quadro con la loro fonte; senza il dato la verifica stampa «Dati mancanti ⚠» e un punto da verificare in sito; '
      + 'i contatti delle serrature solo con la UNI 10411-1 (con la UNI 10411-11 il punto 11.1.2 elenca le deroghe, non questa regola)',
  },
  {
    id: 'cabina.superficie.esistente', gruppo: 'cabina', titolo: 'Cabina che resta con la portata cambiata',
    valore: 'la superficie utile documentata della cabina che resta si confronta con la massima del prospetto 6 per la nuova portata (voce vano.cabina.superficie): '
      + 'con la portata aumentata il limite cresce; con la portata ridotta la cabina esistente può superarlo e la relazione lo segnala come attenzione, mai '
      + 'come esito negativo',
    riferimento: `${T20}, 5.4.2.1 (prospetto 6; lettura del software: la UNI 10411 non la chiede per la cabina che resta)`,
    fonte: `${ESPERTO}: la UNI 10411-1 non chiede questa verifica per la cabina che resta`, stato: 'scelta', verifiche: ['rt_area_kept'],
    nota: 'entro il limite la riga è un’informazione, mai «Soddisfatta»: la norma non la chiede',
  },
  {
    id: 'guide.rm', gruppo: 'guide', titolo: 'Guide esistenti: acciaio e allungamento',
    valore: `acciaio con Rm tra ${KR.railRmMin} e ${KR.railRmMax} N/mm² (fuori la verifica non si fa: il metodo omega non lo copre); Rm ${KR.railRmMax}: ω = ${omegaText}; `
      + `tra ${KR.railRmMin} e ${KR.railRmMax} ω si interpola linearmente tra quello di ${KR.railRmMin} (voce vano.guide.verifica) e quello di ${KR.railRmMax}; Rm non dato: `
      + `${KR.railRmMin}, il più basso (scelta del software); allungamento A5 da 8 a 12 %: St = ${it(KR.railStRun812)} in servizio normale e ${it1(KR.railStGear812)} `
      + `all’intervento del paracadute (oltre 12 %: ${it(G.railStRun)} e ${it(G.railStGear)}); sotto 8 % il materiale non è ammesso`,
    riferimento: `${T50}, 5.10.3; ${T20}, 5.7.4.5 (prospetto 15)`, fonte: `${letto(T50, 'p. 37')}; ${letto(T20, 'pp. 96–97')}`, stato: 'confermato',
    costanti: ['railRmMin', 'railRmMax', 'omega520', 'railStRun812', 'railStGear812'],
    nota: 'λ sotto 20: ω di λ 20 come per l’acciaio Rm 370; λ oltre 250 non verificabile; l’allungamento non dato è preso oltre 12 % e stampato come ipotesi',
  },
  {
    id: 'guide.sospensione', gruppo: 'guide', titolo: 'Punto di sospensione della cabina nelle forze sulle guide',
    valore: 'in marcia e al carico al piano le forze sulle guide si calcolano rispetto al punto di sospensione (xS, yS): non dato, sull’asse delle guide '
      + '(con il centro della cabina sullo stesso asse, scelta del software stampata come ipotesi); con l’arcata a zaino il centro della cabina e il punto di sospensione vanno '
      + 'inseriti; all’intervento del paracadute il punto di sospensione non entra',
    riferimento: `${T20}, 5.7.2.3.1; ${T50}, appendice C`, fonte: `${letto(T20, 'p. 94')}; ${letto(T50, 'pp. 77–78')}`, stato: 'scelta',
  },
  {
    id: 'guide.fp', gruppo: 'guide', titolo: 'Spinta delle staffe sulle guide (Fp)',
    valore: `la spinta delle staffe per l’assestamento dell’edificio è trascurata con la corsa fino a ${KR.fpTravelMax} m; oltre, la verifica è un’attenzione e Fp va dato dal progettista`,
    riferimento: `${T20}, 5.7.2.3.5`, fonte: letto(T20, 'pp. 94–95'), stato: 'confermato', costanti: ['fpTravelMax'],
  },
  {
    id: 'guide.pattini', gruppo: 'guide', titolo: 'Flessione della suola con pattini a strisciamento',
    valore: `con pattini a rulli la flessione della suola si verifica (σF = ${it(G.railFlange)}·Fx/c², voce vano.guide.verifica); con pattini a strisciamento `
      + 'la formula chiede le misure della guarnizione del pattino, che il software non ha: la riga stampa «non calcolata» e un punto da verificare',
    riferimento: `${T50}, 5.10.5`, fonte: letto(T50, 'p. 38'), stato: 'scelta',
  },
  {
    id: 'guide.contrappeso.marcia', gruppo: 'guide', titolo: 'Guide del contrappeso in marcia',
    valore: `forze sulle guide con k2 = ${it(G.k2Running)} e la massa del contrappeso spostata dal centro del ${pct(G.cwEccWidth)} % della larghezza e del `
      + `${pct(G.cwEccDepth)} % della profondità; σm e σm + Fv/A non oltre Rm/St con St in servizio normale; freccia non oltre ${KR.cwRailDeflNoGear} mm senza `
      + `paracadute del contrappeso, ${G.railDeflection} mm con il paracadute (all’intervento: voce vano.guide.contrappeso)`,
    riferimento: `${T20}, 5.7.2.3.3, 5.7.4.5 e 5.7.4.6; ${T50}, 5.10`, fonte: letto(T20, 'pp. 94–97'), stato: 'confermato',
    costanti: ['cwRailDeflNoGear'], verifiche: ['rt_cw_run'],
  },
  {
    id: 'ammortizzatori.molla', gruppo: 'ammortizzatori', titolo: 'Ammortizzatori a molla: forza a corsa completa',
    valore: `la forza a corsa completa (dato del costruttore) tra ${it(KR.springStaticMin)} e ${KR.springStaticMax} volte il peso che grava su ciascun ammortizzatore `
      + '— (P + Q)/n per la cabina, Mcw/n per il contrappeso —, estremi compresi',
    riferimento: `${T20}, 5.8.2.1.1.2`, fonte: letto(T20, 'p. 98'), stato: 'confermato', costanti: ['springStaticMin', 'springStaticMax'], verifiche: ['rt_buf_spring'],
    nota: 'la norma dice «tra» senza dire degli estremi: compresi, scelta del software da confermare; senza la forza la verifica stampa «Dati mancanti ⚠» e '
      + 'un punto da verificare con la scheda del costruttore',
  },
  {
    id: 'ammortizzatori.velocita', gruppo: 'ammortizzatori', titolo: 'Ammortizzatori in poliuretano e idraulici: velocità d’urto',
    valore: `${it(KR.bufImpactRatio)} volte la velocità nominale dopo la modifica non oltre la velocità d’urto massima del certificato d’esame del tipo`,
    riferimento: `${T20}, 5.8.2.1.2.1 e 5.8.2.2.3; ${T50}, 5.5.4`, fonte: `${letto(T20, 'pp. 98–99')}; ${letto(T50, 'p. 24')}`, stato: 'confermato',
    costanti: ['bufImpactRatio'], verifiche: ['rt_buf_speed'],
  },
  {
    id: 'ammortizzatori.massa', gruppo: 'ammortizzatori', titolo: 'Ammortizzatori in poliuretano e idraulici: masse del certificato',
    valore: 'la massa su ciascun ammortizzatore entro il campo minimo–massimo del certificato d’esame del tipo: cabina a pieno carico (P + Q)/n e cabina vuota '
      + 'P/n, contrappeso Mcw/n',
    riferimento: `${T50}, 5.5.4; ${T20}, 5.8.2.1.2.1 e 5.8.2.2.3`, fonte: `${letto(T50, 'p. 24')}; ${letto(T20, 'pp. 98–99')}; ${ESPERTO}`, stato: 'scelta',
    verifiche: ['rt_buf_mass'],
    nota: 'il certificato dà la massa minima e la massima; che vi rientri anche la cabina vuota è una lettura del software (la cabina vuota può urtare '
      + 'l’ammortizzatore), non scritta nella norma',
  },
  {
    id: 'limitatore.taratura', gruppo: 'limitatore', titolo: 'Velocità d’intervento di targa del limitatore',
    valore: `almeno ${it(G.govTripMin)} volte la velocità nominale e sotto il limite del paracadute: ${G.govTripInstant.toFixed(2).replace('.', ',')} m/s con presa `
      + `istantanea, ${G.govTripRoller} m/s istantanea a rullo, ${it(G.govTripProgressive)} m/s progressiva fino a ${G.govTripProgressiveV} m/s di velocità nominale, `
      + `${it(G.govTripK)}·v + ${it(G.govTripC)}/v oltre (voce vano.limitatore.scatto)`,
    riferimento: `${T20}, 5.6.2.2.1.1 a) e 5.6.2.2.1.8 d)`, fonte: letto(T20, 'pp. 82 e 84'), stato: 'confermato', verifiche: ['rt_gov_trip'],
    nota: 'con la velocità ridotta (UNI 10411-1, 15.17) e con il limitatore nuovo (18) vale anche il limite della norma in vigore all’installazione: voce '
      + 'limitatore.origine',
  },
  {
    id: 'limitatore.origine', gruppo: 'limitatore', titolo: 'Limite d’intervento della norma in vigore all’installazione',
    valore: `con la UNI 10411-1, velocità ridotta oltre il ${pct(KL.speedDec1)} % (15.17) o limitatore nuovo (18): la velocità d’intervento di targa non oltre il limite della `
      + 'norma in vigore alla data di installazione, sempre dato del tecnico con la sua fonte (gli impianti senza marcatura CE seguivano, in '
      + 'successione, il D.Lgt. 600/1945, il DPR 1497/1963 e il DM 587/1987: il valore va letto sul testo dell’atto)',
    riferimento: `${U1}, 15.17 e 18`, fonte: `${letto(U1, 'pp. 15 e 17')}; ${ESPERTO}`, stato: 'confermato', verifiche: ['rt_gov_origin'],
    nota: 'il software non conosce i limiti di questi atti e non li prende da altre norme: senza il valore e la sua fonte la verifica stampa «Dati mancanti ⚠»',
  },
  {
    id: 'limitatore.forza', gruppo: 'limitatore', titolo: 'Forza del limitatore sulla fune all’intervento',
    valore: `la forza di trazione nella fune all’intervento (dal certificato del limitatore) almeno la maggiore tra ${KR.govForceGear} volte la forza che fa `
      + `prendere il paracadute (dato del paracadute) e ${KR.govForceMin} N`,
    riferimento: `${T20}, 5.6.2.2.1.1 d)`, fonte: letto(T20, 'p. 82'), stato: 'confermato', costanti: ['govForceGear', 'govForceMin'], verifiche: ['rt_gov_force'],
  },
  {
    id: 'limitatore.fune.sicurezza', gruppo: 'limitatore', titolo: 'Fune del limitatore: carico di rottura',
    valore: `il carico minimo di rottura della fune del limitatore almeno ${KR.govRopeSf} volte la forza di trazione all’intervento`,
    riferimento: `${T20}, 5.6.2.2.1.3 b)`, fonte: letto(T20, 'pp. 82–83'), stato: 'confermato', costanti: ['govRopeSf'], verifiche: ['rt_gov_rope_sf'],
    nota: 'con la corsa allungata (UNI 10411-1, 16 i)) la fune nuova si verifica secondo la UNI EN 81-1:1987 9.9.6 o la UNI EN 81-20 5.6.2.2.1.3: il software '
      + 'applica la seconda; il diametro minimo della fune della UNI EN 81-1 non è nella UNI EN 81-20:2020 e non si verifica',
  },
  {
    id: 'porte.fuoco', gruppo: 'porte', titolo: 'Porte di piano nuove: resistenza al fuoco',
    valore: 'dove la porta esistente ha una classe di resistenza al fuoco, quella nuova non inferiore: minuti non inferiori e, se l’esistente è EI, anche la '
      + 'nuova EI; con più minuti ma senza la I dell’esistente, o con la I in più ma meno minuti, il confronto non è deciso: attenzione e punto da verificare',
    riferimento: `${U1}, 19.2`, fonte: `${letto(U1, 'p. 17')}; ${ESPERTO}`, stato: 'scelta', verifiche: ['rt_door_fire'],
    nota: 'l’ordine fra le classi E ed EI è una lettura del software (la UNI EN 81-58 non è tra i testi letti); vale anche la classe chiesta dal certificato '
      + 'di prevenzione incendi dell’edificio',
  },
  {
    id: 'porte.altezza', gruppo: 'porte', titolo: 'Porte di piano nuove: altezza',
    valore: `alte almeno ${G.entranceH} mm (soddisfatta); più basse solo se le aperture dell’edificio non lo consentono, condizione che dichiara il tecnico `
      + `(attenzione e punto da verificare), mai meno della porta esistente; sotto ${KR.doorHeightEn8121} mm vale anche la UNI EN 81-21 5.12: alte quanto `
      + `l’edificio consente e non meno di ${KR.doorHeightMin8121} mm, con le segnalazioni in cabina e al piano e gli spigoli dell’architrave inclinati di non `
      + `più di ${KR.doorLintelAngle}° fino a ${G.entranceH} mm o rivestiti; sotto la porta esistente o sotto ${KR.doorHeightMin8121} mm non soddisfatta`,
    riferimento: `${U1}, 19.1; ${T20}, 5.3.2.1; UNI EN 81-21:2022, 5.12`, fonte: `${letto(U1, 'p. 17')}; ${letto('UNI EN 81-21:2022', 'p. 24')}`, stato: 'confermato',
    costanti: ['doorHeightEn8121', 'doorHeightMin8121', 'doorLintelAngle'], verifiche: ['rt_door_height'],
    nota: 'con la UNI 10411-11 (19.1) la UNI EN 81-21 5.12 vale dove i luoghi non consentono la 5.3.2.1: il software applica la stessa regola',
  },
  ...(['rails', 'buffers', 'cw', 'sling'] as const).map((p): VoceRt => ({
    id: `obblighi.rt.${p}`, gruppo: 'obblighi', titolo: TITOLI_OBBLIGHI[p], valore: obbligoText(p),
    riferimento: NORME.flatMap((n) => OBBLIGHI_RT[n][p]?.rif ?? []).join('; '), fonte: `lettura del software dei punti citati (${ESPERTO})`, stato: 'da_verificare',
    nota: 'la UNI 10411 non ha un punto per questa parte sostituita da sola: la relazione la valuta con il punto 4 (-11: 4.3) e con i punti dei casi',
  })),
];
