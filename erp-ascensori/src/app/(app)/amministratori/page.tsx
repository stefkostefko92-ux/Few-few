"use client";

// Контрагентска и фискална страна: полетата влизат в XML фактурата.

import EntityPage, { type EntityConfig } from "@/components/EntityPage";
import { Badge } from "@/components/ui";

const config: EntityConfig = {
  titolo: "Amministratori",
  descrizione:
    "Controparte contrattuale e fiscale: dati incompleti bloccano la fattura elettronica",
  api: "/api/amministratori",
  cerca: "Cerca per nome, ragione sociale, email…",
  colonne: [
    {
      chiave: "nome",
      label: "Nominativo",
      className: "font-medium",
      render: (r) => String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
    },
    {
      chiave: "tipo",
      label: "Tipo",
      render: (r) => (
        <Badge valore={r.tipo === "SOCIETA" ? "SOCIETA" : "PERSONA_FISICA"} />
      ),
    },
    { chiave: "partitaIva", label: "P. IVA", className: "font-mono" },
    { chiave: "pec", label: "PEC" },
    { chiave: "telefono", label: "Telefono" },
    { chiave: "citta", label: "Città" },
  ],
  campi: [
    {
      name: "tipo",
      label: "Tipo",
      tipo: "select",
      predefinito: "PERSONA_FISICA",
      opzioni: [
        { value: "PERSONA_FISICA", label: "Persona fisica" },
        { value: "SOCIETA", label: "Società" },
      ],
    },
    { name: "nome", label: "Nome", tipo: "text", richiesto: true },
    { name: "cognome", label: "Cognome", tipo: "text" },
    { name: "ragioneSociale", label: "Ragione sociale", tipo: "text" },
    { name: "partitaIva", label: "Partita IVA", tipo: "text" },
    { name: "codiceFiscale", label: "Codice fiscale", tipo: "text" },
    { name: "pec", label: "PEC", tipo: "email" },
    { name: "email", label: "Email", tipo: "email" },
    { name: "telefono", label: "Telefono", tipo: "text" },
    { name: "indirizzo", label: "Indirizzo (sede legale)", tipo: "text" },
    { name: "citta", label: "Città", tipo: "text" },
    { name: "cap", label: "CAP", tipo: "text" },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
