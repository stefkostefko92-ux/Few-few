"use client";

import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";
import { dataIt } from "@/lib/format";

const TIPI = [
  { value: "CARTELLO_CANTIERE", label: "Cartello di cantiere" },
  { value: "VERBALE_CANTIERE", label: "Verbale di cantiere" },
  { value: "CERTIFICATO", label: "Certificato" },
  { value: "CONTRATTO", label: "Contratto" },
  { value: "ALTRO", label: "Altro" },
];

const config: EntityConfig = {
  titolo: "Documenti",
  descrizione: "Cartelli, verbali, certificati e contratti",
  api: "/api/documenti",
  cerca: "Cerca per titolo…",
  colonne: [
    { chiave: "titolo", label: "Titolo", className: "font-medium" },
    {
      chiave: "tipo",
      label: "Tipo",
      render: (r) => TIPI.find((t) => t.value === r.tipo)?.label ?? String(r.tipo),
    },
    {
      chiave: "utente",
      label: "Autore",
      render: (r) => {
        const u = r.utente as Riga | null;
        return u ? `${u.nome} ${u.cognome}` : "—";
      },
    },
    { chiave: "createdAt", label: "Creato", render: (r) => dataIt(r.createdAt as string) },
  ],
  campi: [
    { name: "tipo", label: "Tipo", tipo: "select", richiesto: true, predefinito: "ALTRO", opzioni: TIPI },
    { name: "titolo", label: "Titolo", tipo: "text", richiesto: true },
    { name: "fileUrl", label: "Percorso file allegato", tipo: "text" },
    { name: "contenuto", label: "Contenuto", tipo: "textarea", colSpan2: true },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
