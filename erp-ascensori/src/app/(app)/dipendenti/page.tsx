"use client";

import EntityPage, { type EntityConfig } from "@/components/EntityPage";
import { dataIt } from "@/lib/format";
import { TIPO_DIPENDENTE, etichetta } from "@/lib/enum-labels";

const config: EntityConfig = {
  titolo: "Dipendenti",
  singolare: "dipendente",
  genere: "m",
  descrizione: "Personale interno: tecnici, amministrativi, commerciali, magazzinieri",
  api: "/api/dipendenti",
  cerca: "Cerca per nome, cognome, codice fiscale…",
  colonne: [
    {
      chiave: "cognome",
      label: "Nominativo",
      className: "font-medium",
      render: (r) => `${r.cognome} ${r.nome}`,
    },
    { chiave: "tipo", label: "Tipo", render: (r) => etichetta(TIPO_DIPENDENTE, String(r.tipo)) },
    {
      chiave: "specializzazioni",
      label: "Specializzazioni",
      render: (r) => ((r.specializzazioni as string[]) ?? []).join(", ") || "—",
    },
    { chiave: "patente", label: "Patente" },
    {
      chiave: "dataAssunzione",
      label: "Assunzione",
      render: (r) => dataIt(r.dataAssunzione as string | null),
    },
    { chiave: "attivo", label: "In forza", render: (r) => (r.attivo ? "Sì" : "No") },
  ],
  campi: [
    { name: "nome", label: "Nome", tipo: "text", richiesto: true },
    { name: "cognome", label: "Cognome", tipo: "text", richiesto: true },
    {
      name: "tipo",
      label: "Tipo",
      tipo: "select",
      predefinito: "TECNICO",
      opzioni: ["TECNICO", "AMMINISTRATIVO", "COMMERCIALE", "MAGAZZINIERE"].map((v) => ({
        value: v,
        label: v.charAt(0) + v.slice(1).toLowerCase(),
      })),
    },
    { name: "codiceFiscale", label: "Codice fiscale", tipo: "text" },
    { name: "dataAssunzione", label: "Data assunzione", tipo: "date" },
    {
      // Етикетът носи обяснението: полето е ново и без него хората пишат
      // брутната заплата на техника, не разхода за фирмата.
      name: "costoOrario",
      label: "Costo orario aziendale (€, IVA escl.)",
      tipo: "text",
    },
    { name: "patente", label: "Patente", tipo: "text" },
    {
      name: "specializzazioni",
      label: "Specializzazioni (separate da virgola)",
      tipo: "tags",
      colSpan2: true,
    },
    { name: "email", label: "Email", tipo: "email" },
    { name: "telefono", label: "Telefono", tipo: "text" },
    { name: "attivo", label: "In forza", tipo: "checkbox" },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
