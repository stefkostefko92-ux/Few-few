// The points of the relazione tecnica di modifica (RT plan §4.5): the obligations of the standard for the parts replaced
// and the cases of the change — the canonical list of obblighi.ts (obblighiParti), each placed in the section whose
// part it is, the cases and what belongs to no section in «Adeguamenti e adempimenti», with the RT's own obligations
// for rails, buffers, counterweight and (-11) sling (norme.ts OBBLIGHI_RT) — and the points to verify on site that the
// component checks leave to the engineer: the RT's own (our words, clause numbers and the values of the registries
// only), those of UNI EN 81-20 the registry of the acceptance test already writes (norme-collaudo.ts), and the data a
// check misses. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { NORMA_SIGLA, type Parte } from '../../lift/collaudo';
import type { Norma10411 } from '../../lift/modifica';
import { NORME_INFO } from '../../lift/norme-collaudo';
import { OBBLIGHI_PARTI, obblighiParti } from '../../lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '../../lift/obblighi-variazioni';
import type { PuntoInSito } from '../../lift/punti';
import { KR, OBBLIGHI_RT } from '../norme';
import type { PuntoRt, RtCheck, SezioneKey, SezioneRt } from '../types';
import type { RtCtx } from './comune';

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';
/** The norm expert's answers of round 49 (clause numbers and values only). */
const ESPERTO = 'risposte dell’esperto di norme del 2026-10-21';
const rt = (rif: string, testo: string): PuntoInSito => ({ rif, testo, stato: 'confermato', fonte: ESPERTO });
/** A point of UNI EN 81-20 the registry of the acceptance test writes, by its clause. */
const en81 = (rif: string): PuntoInSito => {
  const p = NORME_INFO.en81.punti.find((x) => x.rif.startsWith(rif));
  if (!p) throw new Error(`punto ${rif} non trovato nel registro del collaudo`);
  return p;
};

/** The RT's own points to verify on site. */
export const SITO_RT = {
  materialiCabina: en81(`${T20}, 5.4.4`),
  porteMotorizzate: en81(`${T20}, 5.3.6.2.2.1 a)`),
  contattiLimitatore: rt(`${T20}, 5.6.2.2.1.6`, 'contatti del limitatore: arresto elettrico prima della velocità d’intervento, contatto che non si ripristina da '
    + 'solo, contatto per la fune rotta o allungata'),
  // under -1 the kept gear needs a type certificate for the new T*, the rated speed and the existing rails (6.6), a new one
  // takes its actuation and the governor to UNI EN 81-20 5.6.2 (6.7); under -11 both are checks for the new loads
  paracaduteCet: (n: Norma10411): PuntoInSito => (n === '10411-1'
    ? rt(`${NORMA_SIGLA[n]}, 6.6`, 'paracadute che resta: certificato d’esame del tipo valido per il nuovo T*, per la velocità nominale e per le guide esistenti')
    : rt(`${NORMA_SIGLA[n]}, 6.6`, 'paracadute di cabina e, se c’è, quello del contrappeso verificati per i nuovi carichi')),
  limitatoreCet: (n: Norma10411): PuntoInSito => (n === '10411-1'
    ? rt(`${NORMA_SIGLA[n]}, 6.7`, 'paracadute sostituito con il limitatore che resta: paracadute, suo comando e limitatore secondo la UNI EN 81-20 '
      + '5.6.2, il limitatore esistente con un certificato per la velocità nominale')
    : rt(`${NORMA_SIGLA[n]}, 6.7`, 'paracadute sostituito: il suo sistema di azionamento e il limitatore verificati per i nuovi carichi')),
  // T* or the counterweight decreased (6.1): the progressive gear, if there is one; with a gear of another type nothing
  paracaduteCalo: (n: Norma10411): PuntoInSito => rt(`${NORMA_SIGLA[n]}, 6.1`, `T* o contrappeso diminuiti: se il paracadute di cabina è a presa progressiva, ${
    n === '10411-1' ? 'secondo la UNI EN 81-20 5.6.2' : 'verificato per i nuovi carichi'}, con la massa P + Q nuova entro il campo del suo certificato d’esame del tipo`),
  paracaduteCaloAltro: (n: Norma10411): PuntoInSito => rt(`${NORMA_SIGLA[n]}, 6.1`, 'T* o contrappeso diminuiti con un paracadute di cabina non a presa '
    + 'progressiva: la 6.1 non chiede la verifica del paracadute'),
  fondoFossa: rt(`${T20}, 5.2.1.8.4–5.2.1.8.6`, `fondo della fossa sotto gli ammortizzatori: resistenza ai carichi con la nuova massa, ${KV_VERT.bufferFactor} volte il peso `
    + 'della cabina con la portata e quello del contrappeso (voce vano.carichi.fossa)'),
  ritornoIdraulici: rt(`${T20}, 5.8.2.2.4`, 'ammortizzatori idraulici: il ritorno alla posizione estesa è sorvegliato da un contatto'),
  porteBasse: rt('UNI EN 81-21:2022, 5.12', `porta di piano nuova più bassa di ${KR.doorHeightEn8121} mm: alta quanto i vincoli dell’edificio consentono e `
    + `non meno di ${KR.doorHeightMin8121} mm; sotto ${KV_VERT.entranceH} mm segnalazioni o avvertimenti in cabina e al piano, spigoli dell’architrave `
    + `inclinati di non più di 30° sull’orizzontale fino a ${KV_VERT.entranceH} mm o rivestiti di materiale che attutisce gli urti, il meccanismo della porta `
    + 'coperto fino all’altezza della porta di cabina'),
  // a new door lower than UNI EN 81-20 asks only where the building's openings do not allow it (19.1): the engineer says so
  porteVincoli: (n: Norma10411): PuntoInSito => rt(`${NORMA_SIGLA[n]}, 19.1`, `porta di piano nuova più bassa di ${KV_VERT.entranceH} mm: ammessa solo se le `
    + 'aperture dell’edificio non consentono l’altezza della UNI EN 81-20 5.3.2.1, condizione che dichiara il tecnico; mai più bassa della porta esistente'),
  spintaStaffe: rt(`${T20}, 5.7.2.3.5`, `corsa oltre ${KR.fpTravelMax} m: la spinta delle staffe sulle guide (Fp) va data dal progettista e aggiunta alla verifica`),
  pattiniStrisciamento: rt(`${T50}, 5.10.5`, 'pattini a strisciamento: flessione della suola della guida da verificare con le misure della guarnizione del pattino'),
  corsaGuidataCw: rt(`${T20}, 5.2.5.6.2`, 'contrappeso: con la cabina e il contrappeso nelle posizioni più alte le guide guidano ancora il contrappeso'),
  difesaCw: rt(`${T20}, 5.2.5.5.1`, 'contrappeso: difesa del suo percorso in fossa'),
} as const;

/** The fields the checks can miss, as the points name them (any other: its path). */
export const CAMPI: Readonly<Record<string, string>> = {
  'calcolo.carichi': 'portata, massa della cabina e del contrappeso del calcolo',
  'calcolo.velocita': 'velocità nominale del calcolo',
  'anagrafica.prima.superficie': 'superficie utile documentata della cabina',
  'impianto.safetyGear': 'tipo del paracadute di cabina (dati dell’impianto)',
  'impianto.carBracketPitch': 'passo delle staffe delle guide di cabina (dati dell’impianto)',
  'impianto.cwBracketPitch': 'passo delle staffe delle guide del contrappeso (dati dell’impianto)',
  'impianto.liftUse': 'destinazione dell’ascensore (dati dell’impianto)',
  'componenti.quadro.tensioneComando': 'tensione dei circuiti di comando e di sicurezza del quadro',
  'componenti.quadro.correnteComando': 'tipo di corrente dei circuiti di comando',
  'componenti.quadro.tensioneContattiSerrature': 'tensione dei contatti delle serrature di piano',
  'componenti.quadro.correnteContatti': 'tipo di corrente dei contatti delle serrature',
  'componenti.quadro.impiantoElettrico': 'parte elettrica rifatta, o compatibile e con i conduttori contrassegnati',
  'componenti.cabina.superficie': 'superficie utile della cabina nuova',
  'componenti.limitatore.vScatto': 'velocità d’intervento di targa del limitatore',
  'componenti.limitatore.limiteOrigine': 'limite d’intervento della norma in vigore all’installazione',
  'componenti.limitatore.forzaTiro': 'forza di trazione del limitatore sulla fune',
  'componenti.limitatore.forzaParacadute': 'forza che fa prendere il paracadute',
  'componenti.limitatore.fune': 'carico di rottura della fune del limitatore',
  'componenti.limitatore.modello': 'modello del limitatore, o diametri della puleggia e della fune',
  'componenti.porte.piano.fuocoEsistente': 'classe di resistenza al fuoco della porta di piano esistente',
  'componenti.porte.piano.fuocoNuova': 'classe di resistenza al fuoco della porta di piano nuova',
  'componenti.porte.piano.altezzaEsistente': 'altezza della porta di piano esistente',
  'componenti.porte.piano.altezzaNuova': 'altezza della porta di piano nuova',
};
/** The fields of the rails' and buffers' blocks, by their last key. */
const VOCI_CAMPO: Readonly<Record<string, string>> = {
  profilo: 'profilo', arcata: 'tipo di arcata', A: 'larghezza interna della cabina', B: 'profondità interna della cabina', h: 'distanza tra i pattini',
  accessi: 'accessi della cabina', colonna: 'lunghezza della colonna di guide', xC: 'posizione del centro della cabina', yC: 'posizione del centro della cabina',
  xS: 'punto di sospensione', yS: 'punto di sospensione', larghezza: 'larghezza del contrappeso tra le guide', profondita: 'profondità del contrappeso',
  tipo: 'tipo', numero: 'numero', corsa: 'corsa', altezza: 'altezza', forzaCorsaCompleta: 'forza a corsa completa', certificato: 'dati del certificato d’esame del tipo',
};
const DI: Readonly<Record<string, string>> = { guideCabina: 'guide di cabina', guideContrappeso: 'guide del contrappeso', cabina: 'della cabina', contrappeso: 'del contrappeso' };
/** A field in words: the registry above, a rail's or a buffer's by its key («forza a corsa completa — ammortizzatori del contrappeso»). */
function campo(c: string): string {
  if (CAMPI[c]) return CAMPI[c];
  const k = c.split('.'), last = k[k.length - 1], custom = k.includes('custom');
  if (k[0] !== 'componenti' || !VOCI_CAMPO[last] && !custom) return c;
  const what = custom ? `misura ${last} del profilo inserito a mano` : VOCI_CAMPO[last];
  return k[1] === 'ammortizzatori' ? `${what} — ammortizzatori ${DI[k[2]] ?? ''}`.trim() : `${what} — ${DI[k[1]] ?? k[1]}`;
}

/** The points to verify on site for the data the checks miss: one per check, with its clause (the same point once). */
export function puntiMancanti(checks: readonly RtCheck[]): PuntoRt[] {
  const out: PuntoRt[] = [];
  for (const c of checks.filter((k) => k.mancanti?.length)) {
    const testo = `dati da rilevare in sito o dai documenti per la verifica: ${(c.mancanti ?? []).map(campo).join('; ')}`;
    if (!out.some((p) => p.sezione === c.sezione && p.punto.rif === c.ref && p.punto.testo === testo)) out.push({ sezione: c.sezione, tipo: 'sito', punto: { rif: c.ref, testo, stato: 'confermato' } });
  }
  return out;
}

/** The speed increased under UNI 10411-1 (15.1–15.15): the relazione di calcolo lists the governor of 15.13 among what the
 *  software does not compute; the RT computes it in its section (rt_gov_trip, rt_gov_force, rt_gov_rope_sf, v_govdd), so
 *  its text says so — the shared text stays the calculation's. */
const SPEED_UP_1 = OBBLIGHI_VARIAZIONI['10411-1'].speedUp;
export const LIMITATORE_NON_CALCOLATO = ', limitatore secondo la 5.6.2.2.1 (15.13)';
export function testoRt(punto: PuntoInSito): PuntoInSito {
  if (!SPEED_UP_1 || punto.rif !== SPEED_UP_1.rif || punto.testo !== SPEED_UP_1.testo) return punto;
  return { ...punto, testo: `${punto.testo.replace(LIMITATORE_NON_CALCOLATO, '')}; calcolati nella sezione del limitatore secondo la 5.6.2.2.1 (15.13): `
    + 'velocità d’intervento, forza sulla fune e carico di rottura della fune; i contatti da verificare in sito' };
}

/** The obligations of the parts replaced and of the cases (obblighi.ts, in its order), each in the first section the part
 *  brings, the rest in «Adeguamenti e adempimenti»; then the RT's own for rails, buffers, counterweight and sling. */
export function puntiObblighi(x: Pick<RtCtx, 'norma' | 'base' | 'parti'>, sezioni: readonly SezioneRt[]): PuntoRt[] {
  const n = x.norma, parteDi = new Map<string, Parte>();
  for (const [p, v] of Object.entries(OBBLIGHI_PARTI[n]) as [Parte, PuntoInSito][]) parteDi.set(v.rif, p);
  const sezioneDi = (p: Parte): SezioneKey | 'adeguamenti' => sezioni.find((s) => s.motivi.some((m) => m.tipo === 'parte' && m.chiave === p))?.key ?? 'adeguamenti';
  const out: PuntoRt[] = obblighiParti(x.base.collaudo, x.base.values).map(testoRt).map((punto) => {
    const p = parteDi.get(punto.rif);
    return { sezione: p ? sezioneDi(p) : 'adeguamenti', tipo: 'obbligo', punto };
  });
  for (const p of ['rails', 'buffers', 'cw', 'sling'] as const) {
    const punto = OBBLIGHI_RT[n][p];
    if (punto && x.parti.includes(p)) out.push({ sezione: sezioneDi(p), tipo: 'obbligo', punto });
  }
  return out;
}

/** A point to verify on site in a section. */
export const sito = (sezione: SezioneKey, punto: PuntoInSito): PuntoRt => ({ sezione, tipo: 'sito', punto });
