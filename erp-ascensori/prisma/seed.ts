// Идемпотентен seed: демо данни на италиански (upsert по уникален ключ).
//   npx prisma db push && npm run db:seed
// Демо вход: master@erp-ascensori.local / Ascensori!2026

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Идемпотентно създаване по НЕуникален критерий.
 *
 * `upsert` вече не става за тези модели: уникалността им е съставна
 * `[tenantId, numero]` (или `[tenantId, matricola]` и т.н.), а Prisma не приема
 * съставен уникален ключ в `where`, когато част от него е `null` — а точно
 * `null` е стойността при еднофирмената демо инсталация.
 */
async function creaSeMancante<T extends { id: string }>(
  delegato: {
    findFirst(a: { where: object }): Promise<T | null>;
    create(a: { data: object }): Promise<T>;
  },
  where: object,
  data: object,
): Promise<T> {
  return (
    (await delegato.findFirst({ where })) ?? (await delegato.create({ data }))
  );
}

const prisma = new PrismaClient();

const OGGI = new Date();
function fraGiorni(n: number): Date {
  return new Date(OGGI.getTime() + n * 86_400_000);
}

async function main() {
  // ── Потребители (по един на всяко от 7-те нива) ──────────────────────────
  const password = await bcrypt.hash("Ascensori!2026", 10);
  const utenti: [string, string, string, string][] = [
    ["master@erp-ascensori.local", "Marco", "Ferrari", "MASTER"],
    ["admin@erp-ascensori.local", "Anna", "Ricci", "ADMIN"],
    ["direzione@erp-ascensori.local", "Paolo", "Colombo", "DIREZIONE"],
    ["responsabile@erp-ascensori.local", "Laura", "Greco", "RESPONSABILE"],
    ["tecnico@erp-ascensori.local", "Giuseppe", "Esposito", "TECNICO"],
    ["operatore@erp-ascensori.local", "Sara", "Romano", "OPERATORE"],
    ["cliente@erp-ascensori.local", "Franco", "Marino", "CLIENTE"],
  ];
  for (const [email, nome, cognome, ruolo] of utenti) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password,
        nome,
        cognome,
        ruolo: ruolo as never,
      },
    });
  }
  const master = await prisma.user.findUniqueOrThrow({
    where: { email: "master@erp-ascensori.local" },
  });

  // ── Dati azienda (cedente/prestatore) ────────────────────────────────────
  // Без тях демото прави PDF, но не и електронна фактура — а именно XML-ът е
  // това, което прави фактурата издадена.
  await creaSeMancante(
    prisma.datiAzienda,
    { tenantId: null },
    {
      ragioneSociale: "Ascensori Demo S.r.l.",
      partitaIva: "12345678903",
      codiceFiscale: "12345678903",
      regimeFiscale: "RF01",
      indirizzo: "Via dell'Industria 7",
      cap: "20090",
      citta: "Segrate",
      provincia: "MI",
      telefono: "+39 02 9876543",
      email: "amministrazione@ascensoridemo.it",
      pec: "ascensoridemo@pec.it",
      iban: "IT60X0542811101000000123456",
      rea: "MI-1234567",
      capitaleSociale: "50.000,00 €",
      notePiePagina:
        "Pagamento a 30 giorni data fattura. Interessi di mora ex D.Lgs. 231/2002.",
    },
  );

  // ── Amministratori ───────────────────────────────────────────────────────
  const datiAmministratori = [
    {
      chiave: "studio-bianchi",
      tipo: "SOCIETA",
      nome: "Studio",
      ragioneSociale: "Studio Bianchi Amministrazioni S.r.l.",
      // Само цифри: SDI очаква `IdCodice` без представката за държава — тя е
      // отделен елемент (`IdPaese`).
      partitaIva: "01234567890",
      pec: "bianchi@pec.it",
      email: "info@studiobianchi.it",
      telefono: "+39 02 1234567",
      indirizzo: "Via Roma 12",
      citta: "Milano",
      cap: "20121",
      provincia: "MI",
      codiceSdi: "SUBM70N",
    },
    {
      chiave: "rossi-mario",
      tipo: "PERSONA_FISICA",
      nome: "Mario",
      cognome: "Rossi",
      codiceFiscale: "RSSMRA70A01F205X",
      email: "mario.rossi@example.it",
      telefono: "+39 333 1112223",
      indirizzo: "Corso Buenos Aires 45",
      citta: "Milano",
      cap: "20124",
      provincia: "MI",
      // Без свой код: документът стига през PEC-а.
      pec: "mario.rossi@pec.it",
    },
  ];
  const amministratori = [];
  for (const a of datiAmministratori) {
    const esistente = await prisma.amministratore.findFirst({
      where: { nome: a.nome, cognome: a.cognome ?? undefined },
    });
    amministratori.push(
      esistente ??
        (await prisma.amministratore.create({
          data: {
            tipo: a.tipo as never,
            nome: a.nome,
            cognome: a.cognome,
            ragioneSociale: a.ragioneSociale,
            partitaIva: a.partitaIva,
            codiceFiscale: a.codiceFiscale,
            pec: a.pec,
            email: a.email,
            telefono: a.telefono,
            indirizzo: a.indirizzo,
            citta: a.citta,
            cap: a.cap,
            provincia: a.provincia,
            codiceSdi: a.codiceSdi,
          },
        })),
    );
  }

  // ── Condomini ────────────────────────────────────────────────────────────
  const datiCondomini = [
    // Данъчният номер и адресът за е-фактурата са НА КОНДОМИНИУМА: той е
    // получателят, студиото само го представлява.
    {
      nome: "Condominio Torre Aurora",
      indirizzo: "Via Torino 8",
      citta: "Milano",
      cap: "20123",
      provincia: "MI",
      codiceFiscale: "97123456789",
      pec: "torreaurora@pec.it",
      unitaImmobiliari: 42,
      amministratoreId: amministratori[0].id,
    },
    {
      nome: "Residenza Parco Verde",
      indirizzo: "Viale dei Giardini 25",
      citta: "Monza",
      cap: "20900",
      provincia: "MB",
      codiceFiscale: "97987654321",
      unitaImmobiliari: 18,
      amministratoreId: amministratori[1].id,
    },
  ];
  const condomini = [];
  for (const c of datiCondomini) {
    const esistente = await prisma.condominio.findFirst({
      where: { nome: c.nome },
    });
    condomini.push(esistente ?? (await prisma.condominio.create({ data: c })));
  }

  // ── Impianti ─────────────────────────────────────────────────────────────
  const datiImpianti = [
    {
      matricola: "MI-2024-0158",
      marca: "Schindler",
      modello: "3300",
      anno: 2018,
      portata: 630,
      fermate: 8,
      stato: "ATTIVO",
      indirizzo: "Via Torino 8, Milano",
      piano: "Locale macchine in copertura",
      dataInstallazione: new Date("2018-05-14"),
      ultimaRevisione: fraGiorni(-320),
      prossimaRevisione: fraGiorni(45),
      condominioId: condomini[0].id,
      amministratoreId: amministratori[0].id,
    },
    {
      matricola: "MI-2024-0159",
      marca: "KONE",
      modello: "MonoSpace 500",
      anno: 2020,
      portata: 1000,
      fermate: 12,
      stato: "MANUTENZIONE",
      indirizzo: "Via Torino 8, Milano — scala B",
      condominioId: condomini[0].id,
      amministratoreId: amministratori[0].id,
      prossimaRevisione: fraGiorni(20),
    },
    {
      matricola: "MB-2023-0044",
      marca: "Otis",
      modello: "Gen2",
      anno: 2015,
      portata: 480,
      fermate: 5,
      stato: "ATTIVO",
      indirizzo: "Viale dei Giardini 25, Monza",
      condominioId: condomini[1].id,
      amministratoreId: amministratori[1].id,
      prossimaRevisione: fraGiorni(160),
    },
  ];
  const impianti = [];
  for (const i of datiImpianti) {
    impianti.push(
      await creaSeMancante(
        prisma.impianto,
        { matricola: i.matricola, tenantId: null },
        i,
      ),
    );
  }

  // ── Scadenze ─────────────────────────────────────────────────────────────
  for (const [idx, imp] of impianti.entries()) {
    const esistente = await prisma.scadenzaImpianto.findFirst({
      where: { impiantoId: imp.id, tipo: "revisione" },
    });
    if (!esistente) {
      await prisma.scadenzaImpianto.create({
        data: {
          impiantoId: imp.id,
          tipo: "revisione",
          dataScadenza: fraGiorni(25 + idx * 40),
        },
      });
    }
  }

  // ── Dipendenti ───────────────────────────────────────────────────────────
  const datiDipendenti = [
    {
      nome: "Giuseppe",
      cognome: "Esposito",
      tipo: "TECNICO",
      patente: "B",
      specializzazioni: ["Schindler", "KONE"],
      dataAssunzione: new Date("2019-03-01"),
    },
    {
      nome: "Luca",
      cognome: "Moretti",
      tipo: "TECNICO",
      patente: "B",
      specializzazioni: ["Otis"],
      dataAssunzione: new Date("2021-09-15"),
    },
    {
      nome: "Elena",
      cognome: "Gallo",
      tipo: "MAGAZZINIERE",
      specializzazioni: [],
      dataAssunzione: new Date("2020-01-10"),
    },
  ];
  const dipendenti = [];
  for (const d of datiDipendenti) {
    const esistente = await prisma.dipendente.findFirst({
      where: { nome: d.nome, cognome: d.cognome },
    });
    dipendenti.push(
      esistente ?? (await prisma.dipendente.create({ data: d as never })),
    );
  }

  // ── Assegnazione + Automezzo ─────────────────────────────────────────────
  const assegnazione = await prisma.assegnazioneTecnico.findFirst({
    where: { impiantoId: impianti[0].id, dipendenteId: dipendenti[0].id },
  });
  if (!assegnazione) {
    await prisma.assegnazioneTecnico.create({
      data: { impiantoId: impianti[0].id, dipendenteId: dipendenti[0].id },
    });
  }
  await creaSeMancante(
    prisma.automezzo,
    { targa: "GA123BC", tenantId: null },
    {
      targa: "GA123BC",
      marca: "Fiat",
      modello: "Doblò",
      chilometraggio: 84500,
      scadenzaRevisione: fraGiorni(30),
      scadenzaAssicurazione: fraGiorni(120),
      scadenzaTagliando: fraGiorni(10),
      stato: "rosso",
      conducenteId: dipendenti[0].id,
    },
  );

  // ── Cottimista + Squadra ─────────────────────────────────────────────────
  let cottimista = await prisma.cottimista.findFirst({
    where: { ragioneSociale: "Impianti Verticali S.n.c." },
  });
  cottimista ??= await prisma.cottimista.create({
    data: {
      ragioneSociale: "Impianti Verticali S.n.c.",
      tipo: "AZIENDA",
      partitaIva: "IT09876543210",
      telefono: "+39 02 7654321",
    },
  });
  const squadra = await prisma.squadra.findFirst({
    where: { nome: "Squadra Nord" },
  });
  if (!squadra) {
    await prisma.squadra.create({
      data: {
        nome: "Squadra Nord",
        cottimistiId: cottimista.id,
        capocantiere: "Antonio Leone",
        membri: ["Antonio Leone", "Davide Serra"],
      },
    });
  }

  // ── Magazzino ────────────────────────────────────────────────────────────
  const datiArticoli = [
    {
      codice: "FUNE-D10",
      nome: "Fune d'acciaio Ø10 mm (metro)",
      tipo: "COMPONENTI",
      categoria: "Funi",
      quantita: 120,
      sogliaMinima: 50,
      prezzoAcquisto: "4.20",
      prezzoVendita: "7.90",
    },
    {
      codice: "PULS-LED",
      nome: "Pulsante di piano LED",
      tipo: "COMPONENTI",
      categoria: "Pulsantiere",
      quantita: 8,
      sogliaMinima: 20,
      prezzoAcquisto: "12.50",
      prezzoVendita: "24.00",
    },
    {
      codice: "OLIO-H68",
      nome: "Olio idraulico ISO VG 68 (lt)",
      tipo: "COMPONENTI",
      categoria: "Idraulica",
      quantita: 45,
      sogliaMinima: 30,
      prezzoAcquisto: "6.80",
      prezzoVendita: "11.50",
    },
  ];
  for (const a of datiArticoli) {
    await creaSeMancante(
      prisma.articoloMagazzino,
      { codice: a.codice, tenantId: null },
      {
        ...a,
        descrizione: a.nome,
      },
    );
  }

  // ── Preventivo с voci ────────────────────────────────────────────────────
  const preventivo = await creaSeMancante(
    prisma.preventivo,
    { numero: "PRV-2026-0001", tenantId: null },
    {
      numero: "PRV-2026-0001",
      stato: "APPROVATO",
      oggetto: "Sostituzione funi di trazione impianto MI-2024-0158",
      impiantoId: impianti[0].id,
      amministratoreId: amministratori[0].id,
      utenteId: master.id,
      validitaGiorni: 30,
      totaleNetto: "1148.00",
      totaleIva: "252.56",
      totaleLordo: "1400.56",
    },
  );
  const vociEsistenti = await prisma.vocePreventivo.count({
    where: { preventivoId: preventivo.id },
  });
  if (vociEsistenti === 0) {
    await prisma.vocePreventivo.createMany({
      data: [
        {
          preventivoId: preventivo.id,
          descrizione: "Fune d'acciaio Ø10 mm",
          quantita: "60.00",
          prezzoUnitario: "7.90",
          aliquotaIva: "22.00",
          totale: "474.00",
          ordine: 0,
        },
        {
          preventivoId: preventivo.id,
          descrizione: "Manodopera specializzata (ore)",
          quantita: "12.00",
          prezzoUnitario: "48.00",
          aliquotaIva: "22.00",
          totale: "576.00",
          ordine: 1,
        },
        {
          preventivoId: preventivo.id,
          descrizione: "Smaltimento funi esauste",
          quantita: "1.00",
          prezzoUnitario: "98.00",
          aliquotaIva: "22.00",
          totale: "98.00",
          ordine: 2,
        },
      ],
    });
  }

  // ── Ordine di lavoro + storico ───────────────────────────────────────────
  const ordine = await creaSeMancante(
    prisma.ordineLavoro,
    { numero: "ODL-2026-0001", tenantId: null },
    {
      numero: "ODL-2026-0001",
      stato: "IN_LAVORO",
      priorita: "URGENTE",
      oggetto: "Sostituzione funi di trazione",
      descrizione:
        "Sostituzione completa delle funi come da preventivo approvato.",
      impiantoId: impianti[0].id,
      preventivoId: preventivo.id,
      tecnicoId: dipendenti[0].id,
      dataInizio: fraGiorni(-2),
    },
  );
  const storicoEsistente = await prisma.storicoStato.count({
    where: { ordineLavoroId: ordine.id },
  });
  if (storicoEsistente === 0) {
    await prisma.storicoStato.createMany({
      data: [
        {
          ordineLavoroId: ordine.id,
          statoNuovo: "BOZZA",
          utente: "Marco Ferrari",
        },
        {
          ordineLavoroId: ordine.id,
          statoPrecedente: "BOZZA",
          statoNuovo: "EMESSO",
          utente: "Marco Ferrari",
        },
        {
          ordineLavoroId: ordine.id,
          statoPrecedente: "EMESSO",
          statoNuovo: "CONFERMATO",
          utente: "Laura Greco",
        },
        {
          ordineLavoroId: ordine.id,
          statoPrecedente: "CONFERMATO",
          statoNuovo: "IN_LAVORO",
          utente: "Giuseppe Esposito",
          nota: "Inizio lavori in cantiere",
        },
      ],
    });
  }

  // ── Fattura + DDT ────────────────────────────────────────────────────────
  const fattura = await creaSeMancante(
    prisma.fattura,
    { numero: "FT-2026-0001", tenantId: null },
    {
      numero: "FT-2026-0001",
      tipo: "EMESSA",
      stato: "INVIATA",
      data: fraGiorni(-10),
      dataScadenza: fraGiorni(20),
      oggetto: "Acconto lavori sostituzione funi",
      // ПОЛУЧАТЕЛЯТ е кондоминиумът; администраторът остава за връзка.
      condominioId: condomini[0].id,
      amministratoreId: amministratori[0].id,
      ordineLavoroId: ordine.id,
      utenteId: master.id,
      // Кондоминиумът е заместник по данъка: удържа 4 % и внася вместо нас.
      ritenuta: true,
      ritenutaAliquota: "4.00",
      ritenutaTipo: "RT02",
      ritenutaCausale: "W",
      ritenutaImporto: "20.00",
      statoSdi: "CONSEGNATA",
      statoPagamento: "PARZIALE",
      totalePagato: "300.00",
      totaleNetto: "500.00",
      totaleIva: "110.00",
      totaleLordo: "610.00",
    },
  );
  // Частично постъпление — за да личи, че „платена" не е двоично състояние.
  if (
    (await prisma.pagamento.count({ where: { fatturaId: fattura.id } })) === 0
  ) {
    await prisma.pagamento.create({
      data: {
        fatturaId: fattura.id,
        data: fraGiorni(-2),
        importo: "300.00",
        modalita: "MP05",
        riferimento: "CRO 2026030412345",
      },
    });
  }
  if (
    (await prisma.notificaSdi.count({ where: { fatturaId: fattura.id } })) === 0
  ) {
    await prisma.notificaSdi.create({
      data: {
        fatturaId: fattura.id,
        tipo: "RC",
        dataOra: fraGiorni(-9),
        identificativoSdi: "1234567890",
        descrizione: "Ricevuta di consegna",
      },
    });
  }
  if (
    (await prisma.voceFattura.count({ where: { fatturaId: fattura.id } })) === 0
  ) {
    await prisma.voceFattura.create({
      data: {
        fatturaId: fattura.id,
        descrizione: "Acconto 40% su preventivo PRV-2026-0001",
        quantita: "1.00",
        prezzoUnitario: "500.00",
        aliquotaIva: "22.00",
        totale: "500.00",
        ordine: 0,
      },
    });
  }
  await creaSeMancante(
    prisma.ddt,
    { numero: "DDT-2026-0001", tenantId: null },
    {
      numero: "DDT-2026-0001",
      data: fraGiorni(-3),
      causale: "vendita",
      destinatario: "Condominio Torre Aurora",
      indirizzoConsegna: "Via Torino 8, Milano",
      ordineLavoroId: ordine.id,
    },
  );

  console.log(
    "Seed completato: демо данни на италиански заредени (idempotent).",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
