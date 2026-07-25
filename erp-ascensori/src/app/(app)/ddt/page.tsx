"use client";

import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";
import { dataIt } from "@/lib/format";

const config: EntityConfig = {
  titolo: "Documenti di trasporto",
  singolare: "documento di trasporto",
  genere: "m",
  descrizione:
    "Documenti di trasporto con i dati previsti dal D.P.R. 472/1996, collegabili a ordini e movimenti",
  api: "/api/ddt",
  cerca: "Cerca per numero, destinatario…",
  linkDettaglio: (r) => `/ddt/${r.id}`,
  colonne: [
    { chiave: "numero", label: "Numero", className: "font-mono font-medium" },
    { chiave: "data", label: "Data", render: (r) => dataIt(r.data as string) },
    { chiave: "causale", label: "Causale" },
    { chiave: "destinatario", label: "Destinatario" },
    { chiave: "vettore", label: "Vettore", render: (r) => String(r.vettore ?? "mittente") },
    {
      chiave: "ordineLavoro",
      label: "Ordine",
      render: (r) => String((r.ordineLavoro as Riga | null)?.numero ?? "—"),
    },
    {
      chiave: "_count.righe",
      label: "Righe",
      render: (r) => String((r._count as Riga | null)?.righe ?? 0),
    },
  ],
  campi: [
    { name: "data", label: "Data del trasporto", tipo: "date" },
    {
      name: "causale",
      label: "Causale",
      tipo: "select",
      opzioni: [
        { value: "vendita", label: "Vendita" },
        { value: "conto visione", label: "Conto visione" },
        { value: "reso", label: "Reso" },
      ],
    },
    { name: "destinatario", label: "Destinatario", tipo: "text" },
    { name: "indirizzoConsegna", label: "Indirizzo di consegna", tipo: "text" },
    { name: "vettore", label: "Vettore (vuoto = mittente)", tipo: "text" },
    {
      name: "ordineLavoroId",
      label: "Ordine di lavoro",
      tipo: "select",
      opzioniApi: { url: "/api/ordini", etichetta: (r) => `${r.numero} — ${r.oggetto}` },
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
