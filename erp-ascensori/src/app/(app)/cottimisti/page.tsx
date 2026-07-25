"use client";

import EntityPage, { type EntityConfig } from "@/components/EntityPage";
import { TIPO_COTTIMISTA, etichetta } from "@/lib/enum-labels";

const config: EntityConfig = {
  titolo: "Cottimisti",
  descrizione: "Ditte esterne abilitate all'assegnazione dei lavori",
  api: "/api/cottimisti",
  cerca: "Cerca per ragione sociale, P. IVA…",
  colonne: [
    { chiave: "ragioneSociale", label: "Ragione sociale", className: "font-medium" },
    {
      chiave: "tipo",
      label: "Tipo",
      render: (r) => etichetta(TIPO_COTTIMISTA, String(r.tipo)),
    },
    { chiave: "partitaIva", label: "P. IVA", className: "font-mono" },
    { chiave: "telefono", label: "Telefono" },
    { chiave: "email", label: "Email" },
    { chiave: "attivo", label: "Abilitato", render: (r) => (r.attivo ? "Sì" : "No") },
  ],
  campi: [
    { name: "ragioneSociale", label: "Ragione sociale", tipo: "text", richiesto: true },
    {
      name: "tipo",
      label: "Tipo",
      tipo: "select",
      predefinito: "DITTA_INDIVIDUALE",
      opzioni: [
        { value: "DITTA_INDIVIDUALE", label: "Ditta individuale" },
        { value: "COOPERATIVA", label: "Cooperativa" },
        { value: "AZIENDA", label: "Azienda" },
      ],
    },
    { name: "partitaIva", label: "Partita IVA", tipo: "text" },
    { name: "email", label: "Email", tipo: "email" },
    { name: "telefono", label: "Telefono", tipo: "text" },
    { name: "indirizzo", label: "Indirizzo", tipo: "text" },
    { name: "attivo", label: "Abilitato a nuovi lavori", tipo: "checkbox" },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
