"use client";

import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { euro, dataIt } from "@/lib/format";
import { TIPO_FATTURA, etichetta } from "@/lib/enum-labels";

const config: EntityConfig = {
  titolo: "Fatture",
  descrizione: "Ciclo attivo (emesse) e passivo (ricevute); i dati generano PDF e XML SdI",
  api: "/api/fatture",
  cerca: "Cerca per numero, oggetto…",
  linkDettaglio: (r) => `/fatture/${r.id}`,
  colonne: [
    { chiave: "numero", label: "Numero", className: "font-mono font-medium" },
    { chiave: "tipo", label: "Tipo", render: (r) => etichetta(TIPO_FATTURA, String(r.tipo)) },
    { chiave: "stato", label: "Stato", render: (r) => <Badge valore={String(r.stato)} /> },
    {
      chiave: "amministratore",
      label: "Controparte",
      render: (r) => {
        const a = r.amministratore as Riga | null;
        return a ? String(a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`) : "—";
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
      name: "amministratoreId",
      label: "Controparte",
      tipo: "select",
      opzioniApi: {
        url: "/api/amministratori",
        etichetta: (r) => String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
      },
    },
    {
      name: "ordineLavoroId",
      label: "Ordine di lavoro fatturato",
      tipo: "select",
      opzioniApi: { url: "/api/ordini", etichetta: (r) => `${r.numero} — ${r.oggetto}` },
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
