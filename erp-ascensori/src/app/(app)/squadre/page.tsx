"use client";

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";

const config: EntityConfig = {
  titolo: "Squadre",
  singolare: "squadra",
  genere: "f",
  descrizione: "Squadre operative delle ditte esterne",
  api: "/api/squadre",
  cerca: "Cerca per nome, capocantiere…",
  colonne: [
    { chiave: "nome", label: "Nome", className: "font-medium" },
    {
      chiave: "cottimista",
      label: "Ditta",
      render: (r) =>
        String((r.cottimista as Riga | null)?.ragioneSociale ?? "—"),
    },
    { chiave: "capocantiere", label: "Capocantiere" },
    {
      chiave: "membri",
      label: "Membri",
      render: (r) => ((r.membri as string[]) ?? []).join(", ") || "—",
    },
    {
      chiave: "attiva",
      label: "Disponibile",
      render: (r) => (r.attiva ? "Sì" : "No"),
    },
  ],
  campi: [
    { name: "nome", label: "Nome squadra", tipo: "text", richiesto: true },
    {
      name: "cottimistiId",
      label: "Ditta di appartenenza",
      tipo: "select",
      richiesto: true,
      opzioniApi: {
        url: "/api/cottimisti",
        etichetta: (r) => String(r.ragioneSociale),
      },
    },
    { name: "capocantiere", label: "Capocantiere", tipo: "text" },
    {
      name: "membri",
      label: "Membri (separati da virgola)",
      tipo: "tags",
      colSpan2: true,
    },
    {
      name: "attiva",
      label: "Disponibile per nuove assegnazioni",
      tipo: "checkbox",
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
