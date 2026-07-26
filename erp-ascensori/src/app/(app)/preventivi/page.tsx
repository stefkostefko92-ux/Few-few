"use client";

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { euro, dataIt } from "@/lib/format";

const config: EntityConfig = {
  titolo: "Preventivi",
  singolare: "preventivo",
  genere: "m",
  descrizione:
    "Offerte al cliente: i totali si ricalcolano automaticamente dalle voci",
  api: "/api/preventivi",
  moduloAi: "preventivi",
  cerca: "Cerca per numero, oggetto…",
  linkDettaglio: (r) => `/preventivi/${r.id}`,
  colonne: [
    { chiave: "numero", label: "Numero", className: "font-mono font-medium" },
    { chiave: "oggetto", label: "Oggetto" },
    {
      chiave: "stato",
      label: "Stato",
      render: (r) => <Badge valore={String(r.stato)} />,
    },
    {
      chiave: "amministratore",
      label: "Destinatario",
      render: (r) => {
        const a = r.amministratore as Riga | null;
        return a
          ? String(a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`)
          : "—";
      },
    },
    {
      chiave: "totaleLordo",
      label: "Totale",
      className: "text-right font-mono",
      render: (r) => euro(r.totaleLordo as string),
    },
    {
      chiave: "createdAt",
      label: "Data",
      render: (r) => dataIt(r.createdAt as string),
    },
  ],
  campi: [
    {
      name: "oggetto",
      label: "Oggetto",
      tipo: "text",
      richiesto: true,
      colSpan2: true,
    },
    {
      name: "descrizione",
      label: "Descrizione estesa",
      tipo: "textarea",
      colSpan2: true,
    },
    {
      name: "validitaGiorni",
      label: "Validità (giorni)",
      tipo: "number",
      predefinito: 30,
    },
    {
      name: "impiantoId",
      label: "Impianto",
      tipo: "select",
      opzioniApi: {
        url: "/api/impianti",
        etichetta: (r) => `${r.matricola} — ${r.marca} ${r.modello}`,
      },
    },
    {
      name: "amministratoreId",
      label: "Destinatario",
      tipo: "select",
      opzioniApi: {
        url: "/api/amministratori",
        etichetta: (r) =>
          String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
      },
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
