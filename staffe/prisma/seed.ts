import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { LocationKind, Material, Role, Uom } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { applyMovement, checkLowStock, reserve } from '../src/lib/stock';
import { nextDocumentNumber } from '../src/lib/sequence';

/**
 * Dati dimostrativi di Staffe — catalogo, magazzino, anagrafiche e utenti.
 *
 * REGOLE DI QUESTO SCRIPT
 *  · **Idempotente.** Le anagrafiche si scrivono con `upsert` sulla chiave
 *    univoca; i documenti (giacenze iniziali, ordini) si creano solo se non ce
 *    n'è già. Rilanciarlo non duplica nulla e non azzera niente.
 *  · **Le giacenze passano da `applyMovement`**, come nel resto del prodotto:
 *    scrivere `StockItem` a mano lascerebbe un magazzino pieno senza un solo
 *    movimento che lo spieghi, cioè esattamente il difetto che il registro esiste
 *    per impedire.
 *  · **Nessuna password predefinita nel codice.** L'amministratore arriva da
 *    `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`: se mancano, lo script si ferma.
 *    Per gli altri due utenti, se l'ambiente non le fornisce, si generano
 *    password casuali e si stampano UNA volta sul terminale.
 *  · La password non viene mai modificata su un utente che esiste già: il seed
 *    non deve poter riaprire un accesso chiuso apposta.
 *
 * Uso:  npm run db:seed
 */

// bcrypt con lo stesso costo di `src/lib/auth.ts`. Non si importa quel modulo
// perché è marcato `server-only` e qui gira Node puro, non Next.
const BCRYPT_ROUNDS = 12;
const PASSWORD_MIN = 12;

// ─────────────────────────── Ambiente ───────────────────────────

function richiesta(nome: string): string {
  const valore = process.env[nome];
  if (!valore || !valore.trim()) {
    throw new Error(
      `Variabile d'ambiente ${nome} mancante. Il seed non usa valori predefiniti per le credenziali: impostala in .env prima di eseguirlo.`,
    );
  }
  return valore.trim();
}

function passwordCasuale(): string {
  // 24 caratteri base64url: entropia abbondante, si può dettare al telefono.
  return randomBytes(18).toString('base64url');
}

// ─────────────────────────── Codici verificati ───────────────────────────

/** Cifra di controllo EAN-13: posizioni dispari ×1, pari ×3. */
function ean13(base12: string): string {
  if (!/^\d{12}$/.test(base12)) {
    throw new Error(`Base EAN-13 non valida: ${base12}`);
  }
  const somma = [...base12].reduce(
    (acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return base12 + String((10 - (somma % 10)) % 10);
}

/**
 * Partita IVA italiana: 11 cifre, l'ultima di controllo (algoritmo di Luhn
 * sulle prime dieci). I numeri qui sotto sono di esempio ma formalmente validi:
 * un dato dimostrativo malformato farebbe fallire i controlli veri.
 */
function partitaIva(base10: string): string {
  if (!/^\d{10}$/.test(base10)) {
    throw new Error(`Base partita IVA non valida: ${base10}`);
  }
  let somma = 0;
  [...base10].forEach((c, i) => {
    const d = Number(c);
    if (i % 2 === 0) {
      somma += d;
    } else {
      const doppio = d * 2;
      somma += doppio > 9 ? doppio - 9 : doppio;
    }
  });
  return base10 + String((10 - (somma % 10)) % 10);
}

/** Prefisso EAN italiano (800–839) + codice azienda dimostrativo. */
function barcodeProdotto(progressivo: number): string {
  return ean13(`8001234${String(progressivo).padStart(5, '0')}`);
}

// ─────────────────────────── Categorie ───────────────────────────

const CATEGORIE = [
  {
    code: 'STAFFE_GUIDA',
    name: 'Staffe per guide',
    description:
      'Attacchi delle guide di scorrimento della cabina alla struttura del vano.',
  },
  {
    code: 'STAFFE_PARETE',
    name: 'Staffe a parete',
    description: 'Fissaggio a muro, regolabile o telescopico, per vani irregolari.',
  },
  {
    code: 'STAFFE_LOCALE_MACCHINE',
    name: 'Staffe per locale macchine',
    description: 'Supporti per argano, limitatore di velocità e quadro di manovra.',
  },
  {
    code: 'STAFFE_CONTRAPPESO',
    name: 'Staffe per contrappeso',
    description: 'Attacchi delle guide del contrappeso e fermi dei blocchi.',
  },
  {
    code: 'SUPPORTI_CAVI',
    name: 'Supporti per cavi',
    description: 'Sostegni per cavo flessibile, catena di compensazione e canaline.',
  },
  {
    code: 'ACCESSORI_GUIDE',
    name: 'Accessori per guide',
    description: 'Giunti, distanziali, spessori e chiavette di registrazione.',
  },
  {
    code: 'PIASTRE_FISSAGGIO',
    name: 'Piastre di fissaggio',
    description: 'Piastre di ancoraggio e di ripartizione dei carichi.',
  },
  {
    code: 'ELEMENTI_FISSAGGIO',
    name: 'Elementi di fissaggio',
    description: 'Viteria, bulloneria, tasselli e barre filettate.',
  },
  {
    code: 'PEZZI_SPECIALI',
    name: 'Pezzi speciali',
    description: 'Lavorazioni su disegno del cliente e adattamenti a misura.',
  },
] as const;

// ─────────────────────────── Fornitori e clienti ───────────────────────────

const FORNITORI = [
  {
    code: 'FOR-001',
    name: 'Acciai Speciali Brescia S.p.A.',
    vatNumber: partitaIva('0345678901'),
    email: 'ordini@acciaibrescia.example',
    phone: '+39 030 1234567',
    contactName: 'Marco Bertoli',
    addressLine: 'Via dell’Industria 42',
    city: 'Brescia',
    postalCode: '25125',
    province: 'BS',
    paymentTerms: '60 gg d.f.f.m.',
    leadTimeDays: 21,
  },
  {
    code: 'FOR-002',
    name: 'Zincheria Padana S.r.l.',
    vatNumber: partitaIva('0298765432'),
    email: 'preventivi@zincheriapadana.example',
    phone: '+39 049 7654321',
    contactName: 'Elena Trevisan',
    addressLine: 'Strada Statale 11, km 7',
    city: 'Padova',
    postalCode: '35127',
    province: 'PD',
    paymentTerms: '30 gg d.f.f.m.',
    leadTimeDays: 10,
  },
  {
    code: 'FOR-003',
    name: 'Bulloneria Veneta S.n.c.',
    vatNumber: partitaIva('0412345678'),
    email: 'vendite@bulloneriaveneta.example',
    phone: '+39 0444 998877',
    contactName: 'Giulia Meneghin',
    addressLine: 'Via Postumia 15',
    city: 'Vicenza',
    postalCode: '36100',
    province: 'VI',
    paymentTerms: '30 gg fine mese',
    leadTimeDays: 5,
  },
  {
    code: 'FOR-004',
    name: 'Ferramenta Lombarda S.r.l.',
    vatNumber: partitaIva('0187654321'),
    email: 'ufficio@ferramentalombarda.example',
    phone: '+39 02 33445566',
    contactName: 'Paolo Riva',
    addressLine: 'Viale Certosa 210',
    city: 'Milano',
    postalCode: '20156',
    province: 'MI',
    paymentTerms: 'Bonifico 30 gg',
    leadTimeDays: 7,
  },
  {
    code: 'FOR-005',
    name: 'Carpenteria Metalli Torino S.r.l.',
    vatNumber: partitaIva('0523456789'),
    email: 'produzione@metallitorino.example',
    phone: '+39 011 5566778',
    contactName: 'Sara Gallo',
    addressLine: 'Corso Francia 330',
    city: 'Torino',
    postalCode: '10142',
    province: 'TO',
    paymentTerms: '45 gg d.f.',
    leadTimeDays: 15,
  },
] as const;

const CLIENTI = [
  {
    code: 'CLI-001',
    name: 'Ascensori Milano S.r.l.',
    vatNumber: partitaIva('0912345670'),
    sdiCode: 'M5UXCR1',
    pec: 'ascensorimilano@pec.example',
    email: 'acquisti@ascensorimilano.example',
    phone: '+39 02 22334455',
    contactName: 'Luca Ferrari',
    addressLine: 'Via Padova 88',
    city: 'Milano',
    postalCode: '20132',
    province: 'MI',
    paymentTerms: '30 gg d.f.f.m.',
    discountBp: 500,
  },
  {
    code: 'CLI-002',
    name: 'Elevatori Roma S.p.A.',
    vatNumber: partitaIva('1023456781'),
    sdiCode: 'KRRH6B9',
    pec: 'elevatoriroma@pec.example',
    email: 'ufficioacquisti@elevatoriroma.example',
    phone: '+39 06 66778899',
    contactName: 'Chiara Rossi',
    addressLine: 'Via Tuscolana 1120',
    city: 'Roma',
    postalCode: '00174',
    province: 'RM',
    paymentTerms: '60 gg d.f.f.m.',
    discountBp: 800,
  },
  {
    code: 'CLI-003',
    name: 'Sollevamenti Bergamo S.r.l.',
    vatNumber: partitaIva('1134567892'),
    sdiCode: 'USAL8PV',
    email: 'info@sollevamentibergamo.example',
    phone: '+39 035 445566',
    contactName: 'Andrea Locatelli',
    addressLine: 'Via Bergamo 12',
    city: 'Dalmine',
    postalCode: '24044',
    province: 'BG',
    paymentTerms: '30 gg d.f.',
    discountBp: 0,
  },
  {
    code: 'CLI-004',
    name: 'Impianti Verticali Torino S.r.l.',
    vatNumber: partitaIva('1245678903'),
    sdiCode: 'W7YVJK9',
    email: 'ordini@impiantiverticali.example',
    phone: '+39 011 223344',
    contactName: 'Federico Bosco',
    addressLine: 'Via Nizza 250',
    city: 'Torino',
    postalCode: '10126',
    province: 'TO',
    paymentTerms: 'Bonifico 30 gg',
    discountBp: 300,
  },
  {
    code: 'CLI-005',
    name: 'Manutenzioni Ascensori Napoli S.r.l.',
    vatNumber: partitaIva('1356789014'),
    sdiCode: 'RZ4TN8Q',
    email: 'magazzino@ascensorinapoli.example',
    phone: '+39 081 5566778',
    contactName: 'Vincenzo Esposito',
    addressLine: 'Via Marina 59',
    city: 'Napoli',
    postalCode: '80133',
    province: 'NA',
    paymentTerms: '30 gg d.f.f.m.',
    discountBp: 200,
  },
  {
    code: 'CLI-006',
    name: 'Lift Service Bologna S.r.l.',
    vatNumber: partitaIva('1467890125'),
    sdiCode: 'A4707H7',
    email: 'acquisti@liftservicebo.example',
    phone: '+39 051 998877',
    contactName: 'Martina Neri',
    addressLine: 'Via Emilia Levante 220',
    city: 'Bologna',
    postalCode: '40139',
    province: 'BO',
    paymentTerms: '45 gg d.f.',
    discountBp: 400,
  },
  {
    code: 'CLI-007',
    name: 'Ascensori Etna Catania S.r.l.',
    vatNumber: partitaIva('1578901236'),
    sdiCode: 'SUBM70N',
    email: 'info@ascensorietna.example',
    phone: '+39 095 334455',
    contactName: 'Salvatore Marino',
    addressLine: 'Viale Africa 31',
    city: 'Catania',
    postalCode: '95129',
    province: 'CT',
    paymentTerms: '30 gg d.f.',
    discountBp: 0,
  },
  {
    code: 'CLI-008',
    name: 'Ascensori Adriatica Ancona S.r.l.',
    vatNumber: partitaIva('1689012347'),
    sdiCode: 'XL13LG4',
    email: 'ordini@ascensoriadriatica.example',
    phone: '+39 071 887766',
    contactName: 'Davide Ricci',
    addressLine: 'Via Flaminia 210',
    city: 'Ancona',
    postalCode: '60126',
    province: 'AN',
    paymentTerms: '60 gg d.f.f.m.',
    discountBp: 600,
  },
] as const;

// ─────────────────────────── Catalogo ───────────────────────────

type SeedProdotto = {
  sku: string;
  name: string;
  description?: string;
  categoria: string;
  material?: Material;
  finish?: string;
  uom?: Uom;
  weightGrams: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  thicknessMm?: number;
  compatibility?: string;
  brand?: string;
  costCents: number;
  priceCents: number;
  fornitore: string;
  minStock: number;
  maxStock: number;
};

/**
 * Catalogo dimostrativo. I profili citati (T70, T82, T89, T127, T140) sono i
 * profili a T normalizzati delle guide di scorrimento per ascensori: è il modo
 * in cui il magazziniere cerca davvero il pezzo giusto.
 */
const PRODOTTI: SeedProdotto[] = [
  // ── Staffe per guide ─────────────────────────────────────────────
  {
    sku: 'SG-T89-2F',
    name: 'Staffa per guida T89 a due fori',
    description: 'Staffa di attacco per guida di cabina T89, foratura standard.',
    categoria: 'STAFFE_GUIDA',
    finish: 'Zincatura elettrolitica',
    weightGrams: 1450,
    lengthMm: 200,
    widthMm: 80,
    thicknessMm: 8,
    compatibility: 'Guide T89, T89/B',
    brand: 'Staffe',
    costCents: 480,
    priceCents: 1090,
    fornitore: 'FOR-001',
    minStock: 60,
    maxStock: 600,
  },
  {
    sku: 'SG-T89-RIN',
    name: 'Staffa rinforzata per guida T89',
    description: 'Versione con nervatura per vani con interpiano elevato.',
    categoria: 'STAFFE_GUIDA',
    finish: 'Zincatura a caldo',
    weightGrams: 2100,
    lengthMm: 240,
    widthMm: 90,
    thicknessMm: 10,
    compatibility: 'Guide T89',
    brand: 'Staffe',
    costCents: 720,
    priceCents: 1590,
    fornitore: 'FOR-001',
    minStock: 40,
    maxStock: 400,
  },
  {
    sku: 'SG-T127-2F',
    name: 'Staffa per guida T127 a due fori',
    categoria: 'STAFFE_GUIDA',
    finish: 'Zincatura elettrolitica',
    weightGrams: 2350,
    lengthMm: 260,
    widthMm: 100,
    thicknessMm: 10,
    compatibility: 'Guide T127, T127/B',
    brand: 'Staffe',
    costCents: 860,
    priceCents: 1890,
    fornitore: 'FOR-001',
    minStock: 40,
    maxStock: 400,
  },
  {
    sku: 'SG-T127-REG',
    name: 'Staffa regolabile per guida T127',
    description: 'Regolazione ±30 mm per recuperare fuori squadra del vano.',
    categoria: 'STAFFE_GUIDA',
    finish: 'Zincatura a caldo',
    weightGrams: 2800,
    lengthMm: 300,
    widthMm: 100,
    thicknessMm: 10,
    compatibility: 'Guide T127',
    brand: 'Staffe',
    costCents: 1240,
    priceCents: 2690,
    fornitore: 'FOR-005',
    minStock: 25,
    maxStock: 250,
  },
  {
    sku: 'SG-T140-PES',
    name: 'Staffa per guida T140 carichi pesanti',
    description: 'Per impianti da 1600 kg e oltre.',
    categoria: 'STAFFE_GUIDA',
    finish: 'Zincatura a caldo',
    weightGrams: 3600,
    lengthMm: 320,
    widthMm: 120,
    thicknessMm: 12,
    compatibility: 'Guide T140',
    brand: 'Staffe',
    costCents: 1780,
    priceCents: 3790,
    fornitore: 'FOR-005',
    minStock: 15,
    maxStock: 150,
  },
  {
    sku: 'SG-T82-INOX',
    name: 'Staffa per guida T82 in acciaio inox',
    description: 'Per ambienti umidi o salini (impianti costieri).',
    categoria: 'STAFFE_GUIDA',
    material: 'ACCIAIO_INOX',
    finish: 'AISI 304 satinato',
    weightGrams: 1380,
    lengthMm: 200,
    widthMm: 80,
    thicknessMm: 8,
    compatibility: 'Guide T82',
    brand: 'Staffe',
    costCents: 1980,
    priceCents: 4190,
    fornitore: 'FOR-005',
    minStock: 10,
    maxStock: 100,
  },
  {
    sku: 'SG-T70-DOP',
    name: 'Staffa doppia per guide T70',
    description: 'Attacco simultaneo di due guide affiancate.',
    categoria: 'STAFFE_GUIDA',
    finish: 'Zincatura elettrolitica',
    weightGrams: 2600,
    lengthMm: 380,
    widthMm: 90,
    thicknessMm: 8,
    compatibility: 'Guide T70, T78',
    brand: 'Staffe',
    costCents: 1120,
    priceCents: 2450,
    fornitore: 'FOR-001',
    minStock: 20,
    maxStock: 200,
  },

  // ── Staffe a parete ──────────────────────────────────────────────
  {
    sku: 'SP-REG-200',
    name: 'Staffa a parete regolabile 200 mm',
    categoria: 'STAFFE_PARETE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 1650,
    lengthMm: 200,
    widthMm: 70,
    thicknessMm: 8,
    compatibility: 'Guide T89, T127',
    brand: 'Staffe',
    costCents: 740,
    priceCents: 1650,
    fornitore: 'FOR-004',
    minStock: 50,
    maxStock: 500,
  },
  {
    sku: 'SP-SQ-150',
    name: 'Staffa a parete a squadra 150×150',
    categoria: 'STAFFE_PARETE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 980,
    lengthMm: 150,
    widthMm: 150,
    thicknessMm: 6,
    compatibility: 'Uso generale',
    brand: 'Staffe',
    costCents: 390,
    priceCents: 890,
    fornitore: 'FOR-004',
    minStock: 80,
    maxStock: 800,
  },
  {
    sku: 'SP-TEL-250',
    name: 'Staffa a parete telescopica 250-400 mm',
    description: 'Escursione continua, bloccaggio a due viti M12.',
    categoria: 'STAFFE_PARETE',
    finish: 'Zincatura a caldo',
    weightGrams: 3100,
    lengthMm: 400,
    widthMm: 90,
    thicknessMm: 10,
    compatibility: 'Guide T89, T127, T140',
    brand: 'Staffe',
    costCents: 1890,
    priceCents: 3990,
    fornitore: 'FOR-005',
    minStock: 15,
    maxStock: 150,
  },
  {
    sku: 'SP-MUR-300',
    name: 'Staffa a parete per muratura 300 mm',
    description: 'Con piastra allargata per murature in laterizio.',
    categoria: 'STAFFE_PARETE',
    finish: 'Zincatura a caldo',
    weightGrams: 2450,
    lengthMm: 300,
    widthMm: 120,
    thicknessMm: 8,
    compatibility: 'Guide T89',
    brand: 'Staffe',
    costCents: 1180,
    priceCents: 2490,
    fornitore: 'FOR-005',
    minStock: 20,
    maxStock: 200,
  },
  {
    sku: 'SP-ANG-120',
    name: 'Staffa angolare a parete 120 mm',
    categoria: 'STAFFE_PARETE',
    material: 'ACCIAIO_VERNICIATO',
    finish: 'Verniciatura RAL 9006',
    weightGrams: 760,
    lengthMm: 120,
    widthMm: 120,
    thicknessMm: 5,
    compatibility: 'Uso generale',
    brand: 'Staffe',
    costCents: 320,
    priceCents: 740,
    fornitore: 'FOR-004',
    minStock: 60,
    maxStock: 600,
  },

  // ── Staffe per locale macchine ───────────────────────────────────
  {
    sku: 'SLM-ARG-01',
    name: 'Staffa di supporto argano',
    description: 'Appoggio del gruppo argano sul telaio del locale macchine.',
    categoria: 'STAFFE_LOCALE_MACCHINE',
    finish: 'Zincatura a caldo',
    weightGrams: 6400,
    lengthMm: 420,
    widthMm: 200,
    thicknessMm: 15,
    compatibility: 'Argani a vite senza fine e gearless',
    brand: 'Staffe',
    costCents: 4280,
    priceCents: 8900,
    fornitore: 'FOR-005',
    minStock: 8,
    maxStock: 60,
  },
  {
    sku: 'SLM-LIM-01',
    name: 'Staffa per limitatore di velocità',
    categoria: 'STAFFE_LOCALE_MACCHINE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 2100,
    lengthMm: 260,
    widthMm: 160,
    thicknessMm: 8,
    compatibility: 'Limitatori a puleggia Ø200-Ø240',
    brand: 'Staffe',
    costCents: 1480,
    priceCents: 3190,
    fornitore: 'FOR-005',
    minStock: 10,
    maxStock: 80,
  },
  {
    sku: 'SLM-QDR-01',
    name: 'Staffa per quadro di manovra',
    categoria: 'STAFFE_LOCALE_MACCHINE',
    material: 'ACCIAIO_VERNICIATO',
    finish: 'Verniciatura RAL 7035',
    weightGrams: 1250,
    lengthMm: 300,
    widthMm: 100,
    thicknessMm: 5,
    compatibility: 'Quadri fino a 60 kg',
    brand: 'Staffe',
    costCents: 690,
    priceCents: 1590,
    fornitore: 'FOR-004',
    minStock: 15,
    maxStock: 120,
  },
  {
    sku: 'SLM-ANT-01',
    name: 'Staffa antivibrante per motore',
    description: 'Con tamponi in gomma antivibranti già montati.',
    categoria: 'STAFFE_LOCALE_MACCHINE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 1850,
    lengthMm: 220,
    widthMm: 140,
    thicknessMm: 10,
    compatibility: 'Motori con base 200×140',
    brand: 'Staffe',
    costCents: 2180,
    priceCents: 4590,
    fornitore: 'FOR-005',
    minStock: 8,
    maxStock: 60,
  },

  // ── Staffe per contrappeso ───────────────────────────────────────
  {
    sku: 'SCP-T70-01',
    name: 'Staffa per guida contrappeso T70',
    categoria: 'STAFFE_CONTRAPPESO',
    finish: 'Zincatura elettrolitica',
    weightGrams: 1150,
    lengthMm: 180,
    widthMm: 70,
    thicknessMm: 8,
    compatibility: 'Guide contrappeso T70',
    brand: 'Staffe',
    costCents: 420,
    priceCents: 980,
    fornitore: 'FOR-001',
    minStock: 50,
    maxStock: 500,
  },
  {
    sku: 'SCP-T82-DOP',
    name: 'Staffa doppia per guide contrappeso T82',
    categoria: 'STAFFE_CONTRAPPESO',
    finish: 'Zincatura a caldo',
    weightGrams: 2250,
    lengthMm: 340,
    widthMm: 80,
    thicknessMm: 8,
    compatibility: 'Guide contrappeso T82',
    brand: 'Staffe',
    costCents: 980,
    priceCents: 2090,
    fornitore: 'FOR-001',
    minStock: 25,
    maxStock: 250,
  },
  {
    sku: 'SCP-REG-01',
    name: 'Staffa regolabile per contrappeso',
    categoria: 'STAFFE_CONTRAPPESO',
    finish: 'Zincatura a caldo',
    weightGrams: 2650,
    lengthMm: 280,
    widthMm: 90,
    thicknessMm: 10,
    compatibility: 'Guide contrappeso T70, T82',
    brand: 'Staffe',
    costCents: 1320,
    priceCents: 2790,
    fornitore: 'FOR-005',
    minStock: 20,
    maxStock: 160,
  },
  {
    sku: 'SCP-FER-01',
    name: 'Fermo per blocchi di contrappeso',
    categoria: 'STAFFE_CONTRAPPESO',
    finish: 'Zincatura elettrolitica',
    weightGrams: 640,
    lengthMm: 160,
    widthMm: 60,
    thicknessMm: 6,
    compatibility: 'Telai contrappeso standard',
    brand: 'Staffe',
    costCents: 290,
    priceCents: 690,
    fornitore: 'FOR-003',
    minStock: 100,
    maxStock: 900,
  },

  // ── Supporti per cavi ────────────────────────────────────────────
  {
    sku: 'SCV-FLE-01',
    name: 'Supporto per cavo flessibile',
    description: 'Sostegno del cavo piatto di cabina a metà corsa.',
    categoria: 'SUPPORTI_CAVI',
    finish: 'Zincatura elettrolitica',
    weightGrams: 890,
    lengthMm: 220,
    widthMm: 60,
    thicknessMm: 5,
    compatibility: 'Cavi piatti fino a 24 poli',
    brand: 'Staffe',
    costCents: 540,
    priceCents: 1290,
    fornitore: 'FOR-004',
    minStock: 40,
    maxStock: 300,
  },
  {
    sku: 'SCV-POR-300',
    name: 'Staffa portacavi zincata 300 mm',
    categoria: 'SUPPORTI_CAVI',
    finish: 'Zincatura a caldo',
    weightGrams: 1120,
    lengthMm: 300,
    widthMm: 60,
    thicknessMm: 5,
    compatibility: 'Canaline fino a 200 mm',
    brand: 'Staffe',
    costCents: 610,
    priceCents: 1390,
    fornitore: 'FOR-004',
    minStock: 40,
    maxStock: 300,
  },
  {
    sku: 'SCV-MOR-M8',
    name: 'Morsetto fermacavo M8',
    categoria: 'SUPPORTI_CAVI',
    finish: 'Zincatura elettrolitica',
    weightGrams: 95,
    compatibility: 'Funi Ø8-Ø10',
    brand: 'Staffe',
    costCents: 120,
    priceCents: 320,
    fornitore: 'FOR-003',
    minStock: 200,
    maxStock: 2000,
  },
  {
    sku: 'SCV-CAT-01',
    name: 'Supporto per catena di compensazione',
    categoria: 'SUPPORTI_CAVI',
    finish: 'Zincatura a caldo',
    weightGrams: 1480,
    lengthMm: 240,
    widthMm: 80,
    thicknessMm: 8,
    compatibility: 'Catene di compensazione fino a 12 kg/m',
    brand: 'Staffe',
    costCents: 890,
    priceCents: 1990,
    fornitore: 'FOR-005',
    minStock: 15,
    maxStock: 120,
  },

  // ── Accessori per guide ──────────────────────────────────────────
  {
    sku: 'AG-GIU-T89',
    name: 'Giunto per guida T89',
    description: 'Piastra di giunzione con foratura per due tratti di guida.',
    categoria: 'ACCESSORI_GUIDE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 720,
    lengthMm: 180,
    widthMm: 70,
    thicknessMm: 6,
    compatibility: 'Guide T89',
    brand: 'Staffe',
    costCents: 340,
    priceCents: 790,
    fornitore: 'FOR-001',
    minStock: 120,
    maxStock: 1000,
  },
  {
    sku: 'AG-GIU-T127',
    name: 'Piastrina di giunzione T127',
    categoria: 'ACCESSORI_GUIDE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 980,
    lengthMm: 220,
    widthMm: 80,
    thicknessMm: 8,
    compatibility: 'Guide T127',
    brand: 'Staffe',
    costCents: 460,
    priceCents: 1050,
    fornitore: 'FOR-001',
    minStock: 80,
    maxStock: 700,
  },
  {
    sku: 'AG-DIS-10',
    name: 'Distanziale per guida 10 mm',
    categoria: 'ACCESSORI_GUIDE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 210,
    lengthMm: 90,
    widthMm: 70,
    thicknessMm: 10,
    compatibility: 'Guide T70, T82, T89',
    brand: 'Staffe',
    costCents: 95,
    priceCents: 240,
    fornitore: 'FOR-003',
    minStock: 300,
    maxStock: 3000,
  },
  {
    sku: 'AG-SPE-2',
    name: 'Spessore di registrazione 2 mm',
    categoria: 'ACCESSORI_GUIDE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 45,
    lengthMm: 90,
    widthMm: 70,
    thicknessMm: 2,
    compatibility: 'Guide T70, T82, T89, T127',
    brand: 'Staffe',
    costCents: 35,
    priceCents: 110,
    fornitore: 'FOR-003',
    minStock: 500,
    maxStock: 5000,
  },
  {
    sku: 'AG-CHI-01',
    name: 'Chiavetta di fissaggio guida',
    categoria: 'ACCESSORI_GUIDE',
    finish: 'Brunitura',
    weightGrams: 130,
    lengthMm: 80,
    widthMm: 20,
    thicknessMm: 10,
    compatibility: 'Attacchi a chiavetta T89, T127',
    brand: 'Staffe',
    costCents: 88,
    priceCents: 230,
    fornitore: 'FOR-003',
    minStock: 250,
    maxStock: 2500,
  },
  {
    sku: 'AG-CLI-01',
    name: 'Clip elastica di fissaggio guida',
    description: 'Fissaggio elastico che assorbe le dilatazioni della guida.',
    categoria: 'ACCESSORI_GUIDE',
    finish: 'Zincatura elettrolitica',
    weightGrams: 180,
    lengthMm: 100,
    widthMm: 40,
    thicknessMm: 6,
    compatibility: 'Guide T89, T127',
    brand: 'Staffe',
    costCents: 145,
    priceCents: 390,
    fornitore: 'FOR-003',
    minStock: 200,
    maxStock: 2000,
  },

  // ── Piastre di fissaggio ─────────────────────────────────────────
  {
    sku: 'PF-150-08',
    name: 'Piastra di fissaggio 150×150×8',
    categoria: 'PIASTRE_FISSAGGIO',
    finish: 'Zincatura a caldo',
    weightGrams: 1420,
    lengthMm: 150,
    widthMm: 150,
    thicknessMm: 8,
    compatibility: 'Uso generale',
    brand: 'Staffe',
    costCents: 520,
    priceCents: 1190,
    fornitore: 'FOR-005',
    minStock: 60,
    maxStock: 500,
  },
  {
    sku: 'PF-200-SOL',
    name: 'Piastra di ancoraggio a soletta 200×200',
    categoria: 'PIASTRE_FISSAGGIO',
    finish: 'Zincatura a caldo',
    weightGrams: 2560,
    lengthMm: 200,
    widthMm: 200,
    thicknessMm: 10,
    compatibility: 'Solette in cemento armato',
    brand: 'Staffe',
    costCents: 960,
    priceCents: 2090,
    fornitore: 'FOR-005',
    minStock: 30,
    maxStock: 250,
  },
  {
    sku: 'PF-300-UNI',
    name: 'Piastra forata universale 300×100',
    categoria: 'PIASTRE_FISSAGGIO',
    finish: 'Zincatura elettrolitica',
    weightGrams: 1780,
    lengthMm: 300,
    widthMm: 100,
    thicknessMm: 8,
    compatibility: 'Uso generale',
    brand: 'Staffe',
    costCents: 680,
    priceCents: 1490,
    fornitore: 'FOR-004',
    minStock: 40,
    maxStock: 400,
  },
  {
    sku: 'PF-RIP-250',
    name: 'Piastra di ripartizione carichi 250×250',
    description: 'Distribuisce il carico su murature deboli.',
    categoria: 'PIASTRE_FISSAGGIO',
    finish: 'Zincatura a caldo',
    weightGrams: 3900,
    lengthMm: 250,
    widthMm: 250,
    thicknessMm: 12,
    compatibility: 'Murature in laterizio forato',
    brand: 'Staffe',
    costCents: 1420,
    priceCents: 2990,
    fornitore: 'FOR-005',
    minStock: 20,
    maxStock: 160,
  },

  // ── Elementi di fissaggio ────────────────────────────────────────
  {
    sku: 'EF-VTE-M10X40',
    name: 'Vite TE M10×40 zincata',
    categoria: 'ELEMENTI_FISSAGGIO',
    finish: 'Zincatura bianca, classe 8.8',
    weightGrams: 42,
    lengthMm: 40,
    compatibility: 'Staffe con foratura M10',
    brand: 'Staffe',
    costCents: 18,
    priceCents: 55,
    fornitore: 'FOR-003',
    minStock: 1000,
    maxStock: 8000,
  },
  {
    sku: 'EF-DAD-M10',
    name: 'Dado autobloccante M10',
    categoria: 'ELEMENTI_FISSAGGIO',
    finish: 'Zincatura bianca, classe 8',
    weightGrams: 12,
    compatibility: 'Viteria M10',
    brand: 'Staffe',
    costCents: 9,
    priceCents: 28,
    fornitore: 'FOR-003',
    minStock: 1000,
    maxStock: 8000,
  },
  {
    sku: 'EF-RON-M10',
    name: 'Rondella piana M10',
    categoria: 'ELEMENTI_FISSAGGIO',
    finish: 'Zincatura bianca',
    weightGrams: 6,
    compatibility: 'Viteria M10',
    brand: 'Staffe',
    costCents: 4,
    priceCents: 15,
    fornitore: 'FOR-003',
    minStock: 1500,
    maxStock: 10000,
  },
  {
    sku: 'EF-TAS-M12X100',
    name: 'Tassello meccanico M12×100',
    description: 'Ancoraggio in calcestruzzo non fessurato.',
    categoria: 'ELEMENTI_FISSAGGIO',
    finish: 'Zincatura bianca',
    weightGrams: 130,
    lengthMm: 100,
    compatibility: 'Calcestruzzo C20/25 e superiore',
    brand: 'Staffe',
    costCents: 96,
    priceCents: 245,
    fornitore: 'FOR-003',
    minStock: 400,
    maxStock: 3000,
  },
  {
    sku: 'EF-BAR-M12-1M',
    name: 'Barra filettata M12 da 1 metro',
    categoria: 'ELEMENTI_FISSAGGIO',
    finish: 'Zincatura bianca, classe 4.8',
    uom: 'PZ',
    weightGrams: 880,
    lengthMm: 1000,
    compatibility: 'Fissaggi passanti',
    brand: 'Staffe',
    costCents: 210,
    priceCents: 520,
    fornitore: 'FOR-003',
    minStock: 100,
    maxStock: 800,
  },
  {
    sku: 'EF-BUL-M12X60-IX',
    name: 'Bullone TE M12×60 inox',
    categoria: 'ELEMENTI_FISSAGGIO',
    material: 'ACCIAIO_INOX',
    finish: 'AISI 316',
    weightGrams: 78,
    lengthMm: 60,
    compatibility: 'Staffe inox, ambienti salini',
    brand: 'Staffe',
    costCents: 88,
    priceCents: 240,
    fornitore: 'FOR-003',
    minStock: 300,
    maxStock: 2000,
  },

  // ── Pezzi speciali ───────────────────────────────────────────────
  {
    sku: 'PS-DIS-CLI',
    name: 'Staffa su disegno del cliente',
    description:
      'Lavorazione su disegno fornito dal cliente: allegare il disegno all’ordine.',
    categoria: 'PEZZI_SPECIALI',
    finish: 'Su specifica',
    weightGrams: 2000,
    compatibility: 'Su specifica',
    brand: 'Staffe',
    costCents: 3800,
    priceCents: 8900,
    fornitore: 'FOR-005',
    minStock: 0,
    maxStock: 20,
  },
  {
    sku: 'PS-VAN-RID',
    name: 'Staffa a misura per vano ridotto',
    description: 'Sagoma compatta per vani con luce inferiore a 100 mm.',
    categoria: 'PEZZI_SPECIALI',
    finish: 'Zincatura a caldo',
    weightGrams: 1700,
    lengthMm: 150,
    widthMm: 70,
    thicknessMm: 10,
    compatibility: 'Guide T89 in vani ridotti',
    brand: 'Staffe',
    costCents: 2450,
    priceCents: 5490,
    fornitore: 'FOR-005',
    minStock: 5,
    maxStock: 40,
  },
  {
    sku: 'PS-ADA-8912',
    name: 'Adattatore guida T89/T127',
    description: 'Permette di riusare le staffe esistenti in caso di sostituzione guide.',
    categoria: 'PEZZI_SPECIALI',
    finish: 'Zincatura a caldo',
    weightGrams: 1950,
    lengthMm: 220,
    widthMm: 100,
    thicknessMm: 12,
    compatibility: 'Guide T89 ↔ T127',
    brand: 'Staffe',
    costCents: 2180,
    priceCents: 4790,
    fornitore: 'FOR-005',
    minStock: 6,
    maxStock: 50,
  },
  {
    sku: 'PS-PAN-01',
    name: 'Staffa per ascensore panoramico',
    description: 'Profilo a vista, finitura curata per impianti panoramici.',
    categoria: 'PEZZI_SPECIALI',
    material: 'ACCIAIO_INOX',
    finish: 'AISI 304 lucidato a specchio',
    weightGrams: 2300,
    lengthMm: 240,
    widthMm: 90,
    thicknessMm: 10,
    compatibility: 'Guide T89, impianti panoramici',
    brand: 'Staffe',
    costCents: 4900,
    priceCents: 10900,
    fornitore: 'FOR-005',
    minStock: 4,
    maxStock: 30,
  },
];

// ─────────────────────────── Ubicazioni ───────────────────────────

const ZONE = ['A', 'B'] as const;
const CORSIE = ['01', '02', '03'] as const;
const SCAFFALI = ['S1', 'S2', 'S3', 'S4'] as const;
const RIPIANI = ['R1', 'R2', 'R3'] as const;
const VANI = ['V1', 'V2'] as const;

type SeedUbicazione = {
  code: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  kind: LocationKind;
  pickOrder: number;
  capacity?: number;
};

/**
 * Percorso a serpentina: nelle corsie dispari gli scaffali si percorrono al
 * contrario, così `pickOrder` descrive un giro solo del magazzino invece di
 * farlo attraversare avanti e indietro a ogni riga.
 */
function ubicazioniDemo(): SeedUbicazione[] {
  const out: SeedUbicazione[] = [
    {
      code: 'RIC-01',
      zone: 'RIC',
      aisle: '00',
      rack: 'S0',
      shelf: 'R0',
      bin: 'V1',
      kind: 'RICEVIMENTO',
      pickOrder: 0,
      capacity: 200,
    },
  ];
  let ordine = 100;
  ZONE.forEach((zona) => {
    CORSIE.forEach((corsia, iCorsia) => {
      const scaffali = iCorsia % 2 === 0 ? SCAFFALI : [...SCAFFALI].reverse();
      scaffali.forEach((scaffale) => {
        RIPIANI.forEach((ripiano) => {
          VANI.forEach((vano) => {
            out.push({
              code: `${zona}-${corsia}-${scaffale}-${ripiano}-${vano}`,
              zone: zona,
              aisle: corsia,
              rack: scaffale,
              shelf: ripiano,
              bin: vano,
              kind: 'STOCCAGGIO',
              pickOrder: (ordine += 10),
              capacity: 400,
            });
          });
        });
      });
    });
  });
  out.push({
    code: 'SPD-01',
    zone: 'SPD',
    aisle: '00',
    rack: 'S0',
    shelf: 'R0',
    bin: 'V1',
    kind: 'SPEDIZIONE',
    pickOrder: 99_000,
    capacity: 200,
  });
  return out;
}

// ─────────────────────────── Esecuzione ───────────────────────────

async function seedCategorie(): Promise<Map<string, string>> {
  const mappa = new Map<string, string>();
  for (const [i, c] of CATEGORIE.entries()) {
    const riga = await prisma.category.upsert({
      where: { code: c.code },
      create: { ...c, sortOrder: (i + 1) * 10 },
      update: { name: c.name, description: c.description, sortOrder: (i + 1) * 10 },
      select: { id: true },
    });
    mappa.set(c.code, riga.id);
  }
  return mappa;
}

async function seedFornitori(): Promise<Map<string, string>> {
  const mappa = new Map<string, string>();
  for (const f of FORNITORI) {
    const riga = await prisma.supplier.upsert({
      where: { code: f.code },
      create: { ...f },
      update: { ...f },
      select: { id: true },
    });
    mappa.set(f.code, riga.id);
  }
  return mappa;
}

async function seedClienti(): Promise<Map<string, string>> {
  const mappa = new Map<string, string>();
  for (const c of CLIENTI) {
    const riga = await prisma.customer.upsert({
      where: { code: c.code },
      create: { ...c },
      update: { ...c },
      select: { id: true },
    });
    mappa.set(c.code, riga.id);
  }
  return mappa;
}

async function seedUbicazioni(): Promise<Map<string, string>> {
  const mappa = new Map<string, string>();
  for (const u of ubicazioniDemo()) {
    const riga = await prisma.location.upsert({
      where: { code: u.code },
      create: u,
      update: { pickOrder: u.pickOrder, kind: u.kind, capacity: u.capacity },
      select: { id: true },
    });
    mappa.set(u.code, riga.id);
  }
  return mappa;
}

async function seedProdotti(
  categorie: Map<string, string>,
  fornitori: Map<string, string>,
  ubicazioni: Map<string, string>,
): Promise<Map<string, string>> {
  const mappa = new Map<string, string>();
  const codiciUbicazione = [...ubicazioni.keys()].filter((c) =>
    /^[AB]-/.test(c),
  );

  for (const [i, p] of PRODOTTI.entries()) {
    const categoryId = categorie.get(p.categoria);
    const supplierId = fornitori.get(p.fornitore);
    if (!categoryId) throw new Error(`Categoria sconosciuta: ${p.categoria}`);
    if (!supplierId) throw new Error(`Fornitore sconosciuto: ${p.fornitore}`);

    // Ubicazione preferita deterministica: due prodotti vicini non finiscono
    // nello stesso vano, e rilanciare il seed non li sposta.
    const defaultLocationId = ubicazioni.get(
      codiciUbicazione[(i * 7) % codiciUbicazione.length],
    );

    const dati = {
      sku: p.sku,
      barcode: barcodeProdotto(i + 1),
      name: p.name,
      description: p.description ?? null,
      categoryId,
      material: p.material ?? ('ACCIAIO_ZINCATO' as Material),
      finish: p.finish ?? null,
      uom: p.uom ?? ('PZ' as Uom),
      weightGrams: p.weightGrams,
      lengthMm: p.lengthMm ?? null,
      widthMm: p.widthMm ?? null,
      heightMm: p.heightMm ?? null,
      thicknessMm: p.thicknessMm ?? null,
      compatibility: p.compatibility ?? null,
      brand: p.brand ?? null,
      costCents: p.costCents,
      priceCents: p.priceCents,
      vatRateBp: 2200, // IVA ordinaria italiana
      supplierId,
      minStock: p.minStock,
      maxStock: p.maxStock,
      defaultLocationId: defaultLocationId ?? null,
      batchTracked: false,
      active: true,
    };

    const riga = await prisma.product.upsert({
      where: { sku: p.sku },
      create: dati,
      update: dati,
      select: { id: true },
    });
    mappa.set(p.sku, riga.id);
  }
  return mappa;
}

type UtentiSeed = { adminId: string; magazzinoId: string; venditeId: string };

async function seedUtenti(): Promise<UtentiSeed> {
  const adminEmail = richiesta('SEED_ADMIN_EMAIL').toLowerCase();
  const adminPassword = richiesta('SEED_ADMIN_PASSWORD');
  if (adminPassword.length < PASSWORD_MIN) {
    throw new Error(
      `SEED_ADMIN_PASSWORD troppo corta: servono almeno ${PASSWORD_MIN} caratteri.`,
    );
  }

  const definizioni: Array<{
    email: string;
    name: string;
    role: Role;
    password: string;
    generata: boolean;
  }> = [
    {
      email: adminEmail,
      name: 'Amministratore',
      role: 'AMMINISTRATORE',
      password: adminPassword,
      generata: false,
    },
    {
      email: (process.env.SEED_MAGAZZINO_EMAIL ?? 'magazzino@staffe.local').toLowerCase(),
      name: 'Giorgio Bianchi',
      role: 'MAGAZZINO',
      password: process.env.SEED_MAGAZZINO_PASSWORD ?? '',
      generata: !process.env.SEED_MAGAZZINO_PASSWORD,
    },
    {
      email: (process.env.SEED_VENDITE_EMAIL ?? 'vendite@staffe.local').toLowerCase(),
      name: 'Silvia Conti',
      role: 'VENDITE',
      password: process.env.SEED_VENDITE_PASSWORD ?? '',
      generata: !process.env.SEED_VENDITE_PASSWORD,
    },
  ];

  const id: Record<string, string> = {};
  for (const d of definizioni) {
    const esistente = await prisma.user.findUnique({
      where: { email: d.email },
      select: { id: true },
    });
    if (esistente) {
      // Utente già presente: si aggiornano nome e ruolo, MAI la password. Il
      // seed non deve poter riaprire un accesso chiuso di proposito.
      const riga = await prisma.user.update({
        where: { email: d.email },
        data: { name: d.name, role: d.role },
        select: { id: true },
      });
      id[d.role] = riga.id;
      continue;
    }

    const password = d.generata ? passwordCasuale() : d.password;
    if (password.length < PASSWORD_MIN) {
      throw new Error(
        `Password troppo corta per ${d.email}: servono almeno ${PASSWORD_MIN} caratteri.`,
      );
    }
    const riga = await prisma.user.create({
      data: {
        email: d.email,
        name: d.name,
        role: d.role,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      },
      select: { id: true },
    });
    id[d.role] = riga.id;
    if (d.generata) {
      // Unica occasione in cui questa password è leggibile: non finisce né nel
      // database né nel codice.
      console.log(`   password generata per ${d.email}: ${password}`);
    }
  }

  return {
    adminId: id.AMMINISTRATORE,
    magazzinoId: id.MAGAZZINO,
    venditeId: id.VENDITE,
  };
}

/**
 * Carico iniziale del magazzino: un RICEVIMENTO per ogni prodotto, così ogni
 * pezzo a scaffale ha un movimento che lo spiega. Si esegue una volta sola.
 */
async function seedGiacenzeIniziali(
  prodotti: Map<string, string>,
  ubicazioni: Map<string, string>,
  userId: string,
): Promise<number> {
  const gia = await prisma.stockMovement.count({ where: { refType: 'Seed' } });
  if (gia > 0) return 0;

  const codici = [...ubicazioni.keys()].filter((c) => /^[AB]-/.test(c));
  let creati = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const [i, p] of PRODOTTI.entries()) {
        const productId = prodotti.get(p.sku);
        if (!productId) continue;

        // Quantità deterministica: qualche articolo resta sotto scorta e uno su
        // dodici a zero, così le notifiche e i semafori hanno qualcosa da dire.
        const fattore = (i * 37) % 100;
        let quantita = Math.round(p.minStock * (1.5 + fattore / 50));
        if (i % 12 === 0) quantita = 0;
        else if (i % 7 === 0) quantita = Math.max(1, Math.floor(p.minStock * 0.6));

        if (quantita > 0) {
          // Due ubicazioni per gli articoli abbondanti: è la situazione reale
          // che il prelievo e l'inventario devono saper gestire.
          const primo = ubicazioni.get(codici[(i * 7) % codici.length]);
          const secondo = ubicazioni.get(codici[(i * 7 + 31) % codici.length]);
          const quote =
            quantita > 100 && primo && secondo && primo !== secondo
              ? [
                  { locationId: primo, qty: Math.ceil(quantita * 0.7) },
                  { locationId: secondo, qty: Math.floor(quantita * 0.3) },
                ]
              : [{ locationId: primo, qty: quantita }];

          for (const quota of quote) {
            if (!quota.locationId || quota.qty <= 0) continue;
            await applyMovement(tx, {
              productId,
              qty: quota.qty,
              type: 'RICEVIMENTO',
              toLocationId: quota.locationId,
              unitCostCents: p.costCents,
              reason: 'Carico iniziale di magazzino (dati dimostrativi)',
              refType: 'Seed',
              refId: 'giacenze-iniziali',
              userId,
            });
            creati += 1;
          }
        }
        // Anche a quantità zero: è proprio il caso in cui serve la notifica di
        // esaurito.
        await checkLowStock(tx, productId);
      }
    },
    { timeout: 120_000 },
  );

  return creati;
}

/**
 * Qualche documento aperto, perché le schermate non siano vuote.
 *
 * Solo stati che non presuppongono documenti che questo script non crea: niente
 * «ricevuto» senza ricevimento, niente «in prelievo» senza lista di prelievo.
 * Un dato dimostrativo incoerente insegna a diffidare dei numeri.
 */
async function seedOrdini(
  prodotti: Map<string, string>,
  fornitori: Map<string, string>,
  clienti: Map<string, string>,
  utenti: UtentiSeed,
): Promise<{ acquisti: number; vendite: number }> {
  const esistenti =
    (await prisma.purchaseOrder.count()) + (await prisma.salesOrder.count());
  if (esistenti > 0) return { acquisti: 0, vendite: 0 };

  const riga = (sku: string, qty: number) => {
    const p = PRODOTTI.find((x) => x.sku === sku);
    const productId = prodotti.get(sku);
    if (!p || !productId) throw new Error(`Prodotto sconosciuto: ${sku}`);
    return { productId, qty, costCents: p.costCents, priceCents: p.priceCents };
  };

  const oggi = new Date();
  const fra = (giorni: number) =>
    new Date(oggi.getTime() + giorni * 24 * 60 * 60 * 1000);

  const acquisti = [
    {
      supplier: 'FOR-001',
      status: 'BOZZA' as const,
      righe: [riga('SG-T89-2F', 200), riga('SG-T127-2F', 120)],
      notes: 'Reintegro scorte guide T89/T127.',
    },
    {
      supplier: 'FOR-003',
      status: 'ORDINATO' as const,
      righe: [
        riga('EF-VTE-M10X40', 2000),
        riga('EF-DAD-M10', 2000),
        riga('EF-RON-M10', 3000),
      ],
      notes: 'Bulloneria trimestrale.',
    },
    {
      supplier: 'FOR-005',
      status: 'ORDINATO' as const,
      righe: [riga('SLM-ARG-01', 10), riga('SP-TEL-250', 25)],
      notes: 'Commessa locale macchine — consegna concordata.',
    },
    {
      supplier: 'FOR-004',
      status: 'ANNULLATO' as const,
      righe: [riga('SP-SQ-150', 300)],
      notes: 'Annullato: prezzo non confermato dal fornitore.',
    },
  ];

  const vendite = [
    {
      customer: 'CLI-001',
      status: 'PREVENTIVO' as const,
      righe: [riga('SG-T89-2F', 60), riga('AG-GIU-T89', 30)],
      notes: 'Preventivo per ristrutturazione condominio via Padova.',
    },
    {
      customer: 'CLI-002',
      status: 'CONFERMATO' as const,
      righe: [riga('SP-REG-200', 24), riga('EF-TAS-M12X100', 96)],
      notes: 'Ordine confermato, merce impegnata.',
    },
    {
      customer: 'CLI-006',
      status: 'BOZZA' as const,
      righe: [riga('SCP-T70-01', 40)],
      notes: 'In attesa di misure definitive dal cantiere.',
    },
    {
      customer: 'CLI-008',
      status: 'ANNULLATO' as const,
      righe: [riga('PS-PAN-01', 6)],
      notes: 'Cliente ha rinviato l’impianto panoramico.',
    },
  ];

  await prisma.$transaction(
    async (tx) => {
      for (const o of acquisti) {
        const supplierId = fornitori.get(o.supplier);
        if (!supplierId) continue;
        const number = await nextDocumentNumber(tx, 'ordineAcquisto');
        await tx.purchaseOrder.create({
          data: {
            number,
            supplierId,
            status: o.status,
            orderedAt: o.status === 'BOZZA' ? null : oggi,
            expectedAt: o.status === 'ORDINATO' ? fra(14) : null,
            notes: o.notes,
            createdById: utenti.venditeId,
            lines: {
              create: o.righe.map((r) => ({
                productId: r.productId,
                qty: r.qty,
                unitCostCents: r.costCents,
                vatRateBp: 2200,
              })),
            },
          },
        });
      }

      for (const o of vendite) {
        const customerId = clienti.get(o.customer);
        if (!customerId) continue;
        const number = await nextDocumentNumber(tx, 'ordineVendita');
        await tx.salesOrder.create({
          data: {
            number,
            customerId,
            status: o.status,
            orderedAt: o.status === 'BOZZA' ? null : oggi,
            confirmedAt: o.status === 'CONFERMATO' ? oggi : null,
            notes: o.notes,
            createdById: utenti.venditeId,
            lines: {
              create: o.righe.map((r) => ({
                productId: r.productId,
                qty: r.qty,
                unitPriceCents: r.priceCents,
                vatRateBp: 2200,
              })),
            },
          },
        });

        // Un ordine confermato impegna la merce: senza impegno due ordini
        // venderebbero lo stesso pezzo e un cliente resterebbe scoperto.
        if (o.status === 'CONFERMATO') {
          for (const r of o.righe) {
            await reserve(tx, r.productId, r.qty);
          }
        }
      }
    },
    { timeout: 120_000 },
  );

  return { acquisti: acquisti.length, vendite: vendite.length };
}

async function main() {
  console.log('Seed di Staffe — dati dimostrativi in italiano.');

  const categorie = await seedCategorie();
  console.log(`✓ ${categorie.size} categorie`);

  const fornitori = await seedFornitori();
  console.log(`✓ ${fornitori.size} fornitori`);

  const clienti = await seedClienti();
  console.log(`✓ ${clienti.size} clienti`);

  const ubicazioni = await seedUbicazioni();
  console.log(`✓ ${ubicazioni.size} ubicazioni`);

  const prodotti = await seedProdotti(categorie, fornitori, ubicazioni);
  console.log(`✓ ${prodotti.size} prodotti`);

  const utenti = await seedUtenti();
  console.log('✓ 3 utenti (uno per ruolo)');

  const movimenti = await seedGiacenzeIniziali(prodotti, ubicazioni, utenti.adminId);
  console.log(
    movimenti > 0
      ? `✓ ${movimenti} movimenti di carico iniziale`
      : '· giacenze iniziali già presenti: nessun movimento aggiunto',
  );

  const ordini = await seedOrdini(prodotti, fornitori, clienti, utenti);
  console.log(
    ordini.acquisti + ordini.vendite > 0
      ? `✓ ${ordini.acquisti} ordini di acquisto, ${ordini.vendite} ordini di vendita`
      : '· ordini già presenti: nessun documento aggiunto',
  );

  console.log('Seed completato.');
}

main()
  .catch((err) => {
    console.error('Seed non riuscito:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
