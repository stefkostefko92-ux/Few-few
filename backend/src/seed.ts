import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Evita duplicati: il seed gira solo su database vuoto
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log('⏭️  Database già popolato, seed saltato.');
    return;
  }

  // ── Users ──
  const password = await bcrypt.hash('admin2025', 10);
  const master = await prisma.user.upsert({
    where: { email: 'admin@erp-ascensori.it' },
    update: {},
    create: {
      email: 'admin@erp-ascensori.it',
      password,
      nome: 'Amministratore',
      cognome: 'Sistema',
      ruolo: 'MASTER',
    },
  });

  const tecnico = await prisma.user.upsert({
    where: { email: 'tecnico@erp-ascensori.it' },
    update: {},
    create: {
      email: 'tecnico@erp-ascensori.it',
      password: await bcrypt.hash('tecnico2025', 10),
      nome: 'Marco',
      cognome: 'Rossi',
      ruolo: 'TECNICO',
    },
  });

  // ── Amministratori ──
  const amm1 = await prisma.amministratore.create({
    data: {
      tipo: 'SOCIETA',
      nome: 'Giuseppe',
      cognome: 'Verdi',
      ragioneSociale: 'Verdi Gestioni Immobiliari SRL',
      email: 'info@verdigestioni.it',
      telefono: '+39 02 1234567',
      partitaIva: '12345678901',
      indirizzo: 'Via Roma 15',
      citta: 'Milano',
      cap: '20121',
    },
  });

  const amm2 = await prisma.amministratore.create({
    data: {
      tipo: 'PERSONA_FISICA',
      nome: 'Anna',
      cognome: 'Bianchi',
      email: 'anna.bianchi@pec.it',
      telefono: '+39 02 7654321',
      codiceFiscale: 'BNCNNA80A41F205A',
      indirizzo: 'Corso Buenos Aires 42',
      citta: 'Milano',
      cap: '20124',
    },
  });

  // ── Condomini ──
  const cond1 = await prisma.condominio.create({
    data: {
      nome: 'Condominio Residenza del Parco',
      indirizzo: 'Via Garibaldi 22',
      citta: 'Milano',
      cap: '20121',
      provincia: 'MI',
      unitaImmobiliari: 24,
      amministratoreId: amm1.id,
    },
  });

  const cond2 = await prisma.condominio.create({
    data: {
      nome: 'Palazzo Duomo Center',
      indirizzo: 'Piazza Duomo 3',
      citta: 'Milano',
      cap: '20122',
      provincia: 'MI',
      unitaImmobiliari: 16,
      amministratoreId: amm2.id,
    },
  });

  // ── Impianti ──
  const imp1 = await prisma.impianto.create({
    data: {
      matricola: 'MI-2024-001',
      marca: 'KONE',
      modello: 'MonoSpace 500',
      anno: 2020,
      portata: 630,
      fermate: 8,
      stato: 'ATTIVO',
      indirizzo: 'Via Garibaldi 22, Milano',
      prossimaRevisione: new Date('2025-04-15'),
      ultimaRevisione: new Date('2024-10-15'),
      condominioId: cond1.id,
      amministratoreId: amm1.id,
    },
  });

  const imp2 = await prisma.impianto.create({
    data: {
      matricola: 'MI-2024-002',
      marca: 'Otis',
      modello: 'Gen2 Comfort',
      anno: 2018,
      portata: 480,
      fermate: 6,
      stato: 'ATTIVO',
      indirizzo: 'Piazza Duomo 3, Milano',
      prossimaRevisione: new Date('2025-03-01'),
      ultimaRevisione: new Date('2024-09-01'),
      condominioId: cond2.id,
      amministratoreId: amm2.id,
    },
  });

  const imp3 = await prisma.impianto.create({
    data: {
      matricola: 'MI-2024-003',
      marca: 'Schindler',
      modello: '3300',
      anno: 2015,
      portata: 1000,
      fermate: 12,
      stato: 'MANUTENZIONE',
      indirizzo: 'Via Garibaldi 22, Milano',
      prossimaRevisione: new Date('2025-02-10'),
      condominioId: cond1.id,
      amministratoreId: amm1.id,
    },
  });

  // ── Dipendenti ──
  const dip1 = await prisma.dipendente.create({
    data: {
      nome: 'Marco',
      cognome: 'Rossi',
      tipo: 'TECNICO',
      email: 'marco.rossi@erp-ascensori.it',
      telefono: '+39 333 1111111',
      specializzazioni: ['KONE', 'Otis', 'Idraulici'],
      dataAssunzione: new Date('2020-03-01'),
      patente: 'B',
    },
  });

  const dip2 = await prisma.dipendente.create({
    data: {
      nome: 'Luca',
      cognome: 'Ferrari',
      tipo: 'TECNICO',
      email: 'luca.ferrari@erp-ascensori.it',
      telefono: '+39 333 2222222',
      specializzazioni: ['Schindler', 'ThyssenKrupp'],
      dataAssunzione: new Date('2021-06-15'),
      patente: 'B',
    },
  });

  const dip3 = await prisma.dipendente.create({
    data: {
      nome: 'Elena',
      cognome: 'Conti',
      tipo: 'AMMINISTRATIVO',
      email: 'elena.conti@erp-ascensori.it',
      telefono: '+39 333 3333333',
      specializzazioni: [],
      dataAssunzione: new Date('2019-01-10'),
    },
  });

  // ── Automezzi ──
  await prisma.automezzo.create({
    data: {
      targa: 'FG123AB',
      marca: 'Fiat',
      modello: 'Ducato',
      anno: 2022,
      chilometraggio: 45000,
      scadenzaRevisione: new Date('2025-06-30'),
      scadenzaAssicurazione: new Date('2025-12-31'),
      scadenzaTagliando: new Date('2025-04-15'),
      stato: 'verde',
      conducenteId: dip1.id,
    },
  });

  await prisma.automezzo.create({
    data: {
      targa: 'HJ456CD',
      marca: 'Iveco',
      modello: 'Daily',
      anno: 2021,
      chilometraggio: 68000,
      scadenzaRevisione: new Date('2025-03-15'),
      scadenzaAssicurazione: new Date('2025-08-20'),
      stato: 'giallo',
      conducenteId: dip2.id,
    },
  });

  // ── Cottimisti ──
  const cott1 = await prisma.cottimista.create({
    data: {
      ragioneSociale: 'Ascensori Rapidi SNC',
      tipo: 'AZIENDA',
      partitaIva: '98765432101',
      email: 'info@ascensorirapidi.it',
      telefono: '+39 02 9999999',
      indirizzo: 'Via Meccanica 10, Milano',
    },
  });

  await prisma.squadra.create({
    data: {
      nome: 'Squadra Alpha',
      cottimistiId: cott1.id,
      capocantiere: 'Giovanni Neri',
      membri: ['Giovanni Neri', 'Paolo Galli', 'Fabio Ricci'],
    },
  });

  // ── Magazzino Componenti ──
  await prisma.articoloMagazzino.createMany({
    data: [
      { codice: 'COMP-001', barcode: '8001234000001', nome: 'Fune portante 8mm', tipo: 'COMPONENTI', categoria: 'Funi', quantita: 50, sogliaMinima: 10, prezzoAcquisto: 12.50, prezzoVendita: 25.00, ubicazione: 'A1-01' },
      { codice: 'COMP-002', barcode: '8001234000002', nome: 'Pattino guida cabina', tipo: 'COMPONENTI', categoria: 'Guide', quantita: 30, sogliaMinima: 5, prezzoAcquisto: 45.00, prezzoVendita: 85.00, ubicazione: 'A1-02' },
      { codice: 'COMP-003', barcode: '8001234000003', nome: 'Pulsantiera cabina 8P', tipo: 'COMPONENTI', categoria: 'Elettronica', quantita: 8, sogliaMinima: 3, prezzoAcquisto: 180.00, prezzoVendita: 350.00, ubicazione: 'B2-01' },
      { codice: 'COMP-004', barcode: '8001234000004', nome: 'Motore asincrono 7.5kW', tipo: 'COMPONENTI', categoria: 'Motori', quantita: 2, sogliaMinima: 1, prezzoAcquisto: 1200.00, prezzoVendita: 2200.00, ubicazione: 'C1-01' },
      { codice: 'COMP-005', barcode: '8001234000005', nome: 'Operatore porte VVVF', tipo: 'COMPONENTI', categoria: 'Porte', quantita: 4, sogliaMinima: 2, prezzoAcquisto: 650.00, prezzoVendita: 1100.00, ubicazione: 'C2-01' },
      { codice: 'VEND-001', barcode: '8001234100001', nome: 'Kit manutenzione base', tipo: 'VENDITA', categoria: 'Kit', quantita: 15, sogliaMinima: 5, prezzoAcquisto: 85.00, prezzoVendita: 180.00, ubicazione: 'D1-01' },
      { codice: 'VEND-002', barcode: '8001234100002', nome: 'Olio idraulico 20L', tipo: 'VENDITA', categoria: 'Lubrificanti', quantita: 20, sogliaMinima: 8, prezzoAcquisto: 65.00, prezzoVendita: 120.00, ubicazione: 'D2-01' },
    ],
  });

  // ── Preventivi ──
  const prev1 = await prisma.preventivo.create({
    data: {
      numero: 'PRV-00001',
      oggetto: 'Manutenzione straordinaria ascensore KONE',
      descrizione: 'Sostituzione funi portanti e revisione impianto frenante',
      stato: 'APPROVATO',
      impiantoId: imp1.id,
      amministratoreId: amm1.id,
      utenteId: master.id,
      totaleNetto: 4500.00,
      totaleIva: 990.00,
      totaleLordo: 5490.00,
      voci: {
        create: [
          { descrizione: 'Fune portante 8mm x 40m', quantita: 4, prezzoUnitario: 500.00, aliquotaIva: 22, totale: 2000.00, ordine: 1 },
          { descrizione: 'Manodopera sostituzione funi', quantita: 16, prezzoUnitario: 65.00, aliquotaIva: 22, totale: 1040.00, ordine: 2 },
          { descrizione: 'Revisione freno di emergenza', quantita: 1, prezzoUnitario: 800.00, aliquotaIva: 22, totale: 800.00, ordine: 3 },
          { descrizione: 'Collaudo e certificazione', quantita: 1, prezzoUnitario: 660.00, aliquotaIva: 22, totale: 660.00, ordine: 4 },
        ],
      },
    },
  });

  // ── Ordini di Lavoro ──
  await prisma.ordineLavoro.create({
    data: {
      numero: 'OL-00001',
      oggetto: 'Manutenzione straordinaria KONE MonoSpace',
      descrizione: 'Intervento da preventivo PRV-00001',
      stato: 'IN_LAVORO',
      priorita: 'URGENTE',
      impiantoId: imp1.id,
      preventivoId: prev1.id,
      tecnicoId: dip1.id,
      cottimistiId: cott1.id,
      utenteId: master.id,
      dataInizio: new Date('2025-03-20'),
      storicoStati: {
        create: [
          { statoPrecedente: null, statoNuovo: 'BOZZA', utente: 'admin@erp-ascensori.it', createdAt: new Date('2025-03-18') },
          { statoPrecedente: 'BOZZA', statoNuovo: 'EMESSO', utente: 'admin@erp-ascensori.it', createdAt: new Date('2025-03-18') },
          { statoPrecedente: 'EMESSO', statoNuovo: 'CONFERMATO', utente: 'admin@erp-ascensori.it', createdAt: new Date('2025-03-19') },
          { statoPrecedente: 'CONFERMATO', statoNuovo: 'IN_LAVORO', utente: 'admin@erp-ascensori.it', createdAt: new Date('2025-03-20') },
        ],
      },
    },
  });

  await prisma.ordineLavoro.create({
    data: {
      numero: 'OL-00002',
      oggetto: 'Revisione periodica Otis Gen2',
      stato: 'CONFERMATO',
      priorita: 'ORDINARIA',
      impiantoId: imp2.id,
      tecnicoId: dip2.id,
      utenteId: master.id,
    },
  });

  await prisma.ordineLavoro.create({
    data: {
      numero: 'OL-00003',
      oggetto: 'Emergenza blocco Schindler 3300',
      stato: 'EMESSO',
      priorita: 'EMERGENZA',
      impiantoId: imp3.id,
      utenteId: master.id,
    },
  });

  console.log('✅ Seed completato!');
  console.log('   📧 Admin: admin@erp-ascensori.it / admin2025');
  console.log('   📧 Tecnico: tecnico@erp-ascensori.it / tecnico2025');
}

main()
  .catch((e) => {
    console.error('❌ Seed fallito:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
