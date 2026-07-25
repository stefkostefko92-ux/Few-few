"use client";

import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";

const config: EntityConfig = {
  titolo: "Condomìni",
  singolare: "condominio",
  genere: "m",
  descrizione: "Edifici serviti e relativi amministratori",
  api: "/api/condomini",
  cerca: "Cerca per nome, indirizzo, città…",
  colonne: [
    { chiave: "nome", label: "Nome", className: "font-medium" },
    { chiave: "indirizzo", label: "Indirizzo" },
    { chiave: "citta", label: "Città" },
    { chiave: "unitaImmobiliari", label: "Unità" },
    {
      chiave: "amministratore.nome",
      label: "Amministratore",
      render: (r) => {
        const a = r.amministratore as Riga | null;
        return a ? String(a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`) : "—";
      },
    },
    {
      chiave: "_count.impianti",
      label: "Impianti",
      render: (r) => String((r._count as Riga | null)?.impianti ?? 0),
    },
  ],
  campi: [
    { name: "nome", label: "Nome", tipo: "text", richiesto: true },
    { name: "indirizzo", label: "Indirizzo", tipo: "text", richiesto: true },
    { name: "citta", label: "Città", tipo: "text", richiesto: true },
    { name: "cap", label: "CAP", tipo: "text" },
    { name: "provincia", label: "Provincia", tipo: "text" },
    { name: "codiceFiscale", label: "Codice fiscale", tipo: "text" },
    { name: "unitaImmobiliari", label: "Unità immobiliari", tipo: "number" },
    {
      name: "amministratoreId",
      label: "Amministratore",
      tipo: "select",
      opzioniApi: {
        url: "/api/amministratori",
        etichetta: (r) => String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
      },
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
