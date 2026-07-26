"use client";

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { euro, dataIt } from "@/lib/format";
import { TIPO_FATTURA, etichetta } from "@/lib/enum-labels";
import {
  MODALITA_PAGAMENTO,
  CONDIZIONI_PAGAMENTO,
} from "@/lib/fiscale/pagamenti";

const config: EntityConfig = {
  titolo: "Fatture",
  singolare: "fattura",
  genere: "f",
  descrizione:
    "Ciclo attivo (emesse) e passivo (ricevute), con dati strutturati per la fatturazione elettronica",
  api: "/api/fatture",
  cerca: "Cerca per numero, oggetto…",
  linkDettaglio: (r) => `/fatture/${r.id}`,
  colonne: [
    { chiave: "numero", label: "Numero", className: "font-mono font-medium" },
    {
      chiave: "tipo",
      label: "Tipo",
      render: (r) => etichetta(TIPO_FATTURA, String(r.tipo)),
    },
    {
      chiave: "stato",
      label: "Stato",
      render: (r) => <Badge valore={String(r.stato)} />,
    },
    {
      chiave: "statoSdi",
      label: "SdI",
      render: (r) => <Badge valore={String(r.statoSdi)} />,
    },
    {
      chiave: "statoPagamento",
      label: "Incasso",
      render: (r) => <Badge valore={String(r.statoPagamento)} />,
    },
    {
      chiave: "condominio",
      label: "Destinatario",
      // Получателят, не поръчителят: фактурата за работа по кондоминиум се
      // издава на КОНДОМИНИУМА. Иначе всички редове показват две-три студиа и
      // колоната не различава клиентите.
      render: (r) => {
        const c = r.condominio as Riga | null;
        if (c) return String(c.nome);
        const a = r.amministratore as Riga | null;
        return a
          ? String(a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`)
          : "—";
      },
    },
    { chiave: "data", label: "Data", render: (r) => dataIt(r.data as string) },
    {
      chiave: "dataScadenza",
      label: "Scadenza",
      render: (r) => dataIt(r.dataScadenza as string | null),
    },
    {
      chiave: "totaleLordo",
      label: "Totale",
      className: "text-right font-mono",
      render: (r) => euro(r.totaleLordo as string),
    },
  ],
  campi: [
    {
      name: "tipo",
      label: "Tipo",
      tipo: "select",
      predefinito: "EMESSA",
      opzioni: [
        { value: "EMESSA", label: "Emessa (ciclo attivo)" },
        { value: "RICEVUTA", label: "Ricevuta (ciclo passivo)" },
      ],
    },
    { name: "data", label: "Data di emissione", tipo: "date" },
    { name: "dataScadenza", label: "Termine di pagamento", tipo: "date" },
    { name: "oggetto", label: "Oggetto", tipo: "text", colSpan2: true },
    {
      name: "condominioId",
      label: "Destinatario (condominio)",
      tipo: "select",
      aiuto:
        "Il condominio è il soggetto fiscale a cui è intestata la fattura. L'amministratore lo rappresenta soltanto. Selezionandolo si attiva la ritenuta d'acconto del 4 % (art. 25-ter D.P.R. 600/1973).",
      opzioniApi: { url: "/api/condomini", etichetta: (r) => String(r.nome) },
    },
    {
      name: "amministratoreId",
      label: "Amministratore / altra controparte",
      tipo: "select",
      aiuto: "Da usare quando il destinatario non è un condominio.",
      opzioniApi: {
        url: "/api/amministratori",
        etichetta: (r) =>
          String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
      },
    },
    {
      name: "ordineLavoroId",
      label: "Ordine di lavoro fatturato",
      tipo: "select",
      opzioniApi: {
        url: "/api/ordini",
        etichetta: (r) => `${r.numero} — ${r.oggetto}`,
      },
    },
    {
      name: "modalitaPagamento",
      label: "Modalità di pagamento",
      tipo: "select",
      predefinito: "MP05",
      opzioni: Object.entries(MODALITA_PAGAMENTO).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      name: "condizioniPagamento",
      label: "Condizioni di pagamento",
      tipo: "select",
      predefinito: "TP02",
      opzioni: Object.entries(CONDIZIONI_PAGAMENTO).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      name: "splitPayment",
      label: "Scissione dei pagamenti (art. 17-ter)",
      tipo: "checkbox",
      aiuto:
        "Solo verso la pubblica amministrazione: l'IVA è versata dall'ente, non da noi.",
    },
    {
      name: "cig",
      label: "CIG",
      tipo: "text",
      aiuto: "Appalti pubblici (legge 136/2010): 10 caratteri.",
    },
    { name: "cup", label: "CUP", tipo: "text", aiuto: "15 caratteri." },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
