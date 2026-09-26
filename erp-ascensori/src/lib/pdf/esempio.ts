// Примерните документи за прегледа на шаблона. Чисто, измислени данни.
//
// Прегледът показва шаблона върху ИСТИНСКИТЕ данни на фирмата (наименование,
// лого, IBAN) и ИЗМИСЛЕН получател и редове: иначе администраторът трябва да
// издаде документ, за да види как ще изглежда, а номерът се изразходва.

import type { DocumentoPdf, Azienda } from "@/lib/pdf/documento";
import type { DatiLibretto } from "@/lib/pdf/libretto";
import type { ModelloDocumenti, TipoDocumento } from "@/lib/pdf/modello";

const DATA = new Date(Date.UTC(2026, 8, 15));

const DESTINATARIO = {
  denominazione: "Condominio Via Roma 12 (esempio)",
  indirizzo: "Via Roma 12",
  cap: "20121",
  citta: "Milano",
  provincia: "MI",
  codiceFiscale: "97000000000",
};

const RIGHE_PREZZI = [
  {
    descrizione: "Manutenzione ordinaria semestrale dell'impianto",
    quantita: "1",
    prezzoUnitario: "450.00",
    aliquotaIva: "22",
    totale: "450.00",
  },
  {
    descrizione: "Sostituzione pulsantiera di piano",
    quantita: "2",
    prezzoUnitario: "35.00",
    aliquotaIva: "22",
    totale: "70.00",
  },
];

const TOTALI = {
  riepilogo: [{ aliquota: "22", imponibile: "520.00", imposta: "114.40" }],
  totaleNetto: "520.00",
  totaleIva: "114.40",
  totaleLordo: "634.40",
};

export function documentoEsempio(
  chiave: Exclude<TipoDocumento, "libretto">,
  azienda: Azienda,
  modello: ModelloDocumenti,
): DocumentoPdf {
  const base = {
    chiave,
    numero: "ESEMPIO-001",
    data: DATA,
    azienda,
    modello,
  };
  switch (chiave) {
    case "preventivo":
      return {
        ...base,
        tipo: "Preventivo",
        oggetto: "Adeguamento dell'impianto (esempio)",
        destinatario: DESTINATARIO,
        righe: RIGHE_PREZZI,
        conPrezzi: true,
        ...TOTALI,
        dettagli: [{ label: "Validità", valore: "30 giorni" }],
      };
    case "fattura":
      return {
        ...base,
        tipo: "Documento contabile",
        oggetto: "Manutenzione del secondo semestre (esempio)",
        destinatario: DESTINATARIO,
        righe: RIGHE_PREZZI,
        conPrezzi: true,
        ...TOTALI,
        dettagli: [{ label: "Scadenza", valore: "2026-10-15" }],
        avvertenza:
          "Documento generato dal gestionale a uso interno e per il cliente. NON costituisce fattura elettronica: la trasmissione al Sistema di Interscambio va effettuata tramite il proprio intermediario.",
      };
    case "ddt":
      return {
        ...base,
        tipo: "Documento di trasporto",
        destinatario: {
          denominazione: DESTINATARIO.denominazione,
          indirizzo: "Via Roma 12, 20121 Milano",
        },
        righe: [
          {
            descrizione: "Pulsantiera di piano",
            quantita: "2",
            um: "pz",
            peso: "1.5",
          },
          {
            descrizione: "Fune di trazione 10 mm",
            quantita: "40",
            um: "m",
            peso: "12",
          },
        ],
        conPrezzi: false,
        dettagli: [
          { label: "Causale del trasporto", valore: "Riparazione" },
          { label: "Trasporto a cura di", valore: "mittente" },
          { label: "Inizio del trasporto", valore: "15/09/2026, 08:30" },
        ],
        avvertenza:
          "Verificare che i dati del cedente e del cessionario siano completi: sono richiesti dall'art. 1, comma 3, D.P.R. 472/1996.",
      };
    case "rapportino":
      return {
        ...base,
        tipo: "Rapportino di intervento",
        oggetto: "Porta di piano che non si chiude (esempio)",
        corpo:
          "Regolato il contatto della porta al piano 3 e verificato il funzionamento su tutte le fermate.",
        righe: [{ descrizione: "Contatto porta di piano", quantita: "1" }],
        conPrezzi: false,
        dettagli: [
          { label: "Ordine di lavoro", valore: "ODL-ESEMPIO" },
          { label: "Tecnico", valore: "Mario Rossi" },
          { label: "Ore di lavoro", valore: "1.5" },
          { label: "Esito", valore: "Risolto" },
        ],
        avvertenza:
          "Rapportino non ancora firmato dal cliente: non costituisce accettazione dell'intervento.",
      };
  }
}

export function librettoEsempio(
  azienda: Azienda,
  modello: ModelloDocumenti,
): DatiLibretto {
  return {
    azienda,
    modello,
    impianto: {
      matricola: "ESEMPIO-001",
      matricolaComune: "MI-000000",
      comune: "Milano",
      dataComunicazione: DATA,
      tipo: "ASCENSORE",
      regime: "DIRETTIVA_95_16",
      marca: "Esempio",
      modello: "Modello 1",
      anno: 2010,
      portata: 480,
      persone: 6,
      velocita: "1.0",
      fermate: 6,
      stato: "ATTIVO",
      indirizzo: "Via Roma 12, Milano",
      piano: "Sottotetto",
      dataInstallazione: DATA,
      organismoNotificato: "Organismo di esempio",
      manutentoreDal: DATA,
      prossimaRevisione: DATA,
      condominio: {
        nome: DESTINATARIO.denominazione,
        codiceFiscale: DESTINATARIO.codiceFiscale,
        indirizzo: "Via Roma 12, Milano",
      },
      amministratore: { denominazione: "Studio di esempio", telefono: null },
    },
    verifiche: [
      {
        data: DATA,
        tipo: "PERIODICA",
        esito: "POSITIVO",
        organismo: "Organismo di esempio",
        numeroVerbale: "V-0001",
        prescrizioni: null,
      },
    ],
    interventi: [
      {
        numero: "RAP-ESEMPIO",
        dataOra: DATA,
        tipoIntervento: "MANUTENZIONE_ORDINARIA",
        descrizione: "Manutenzione ordinaria semestrale.",
        esito: "RISOLTO",
        tecnico: "Mario Rossi",
        firmatoAt: DATA,
        controlli: {},
      },
    ],
    problemi: [],
    generatoIl: DATA,
  };
}
