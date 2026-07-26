"use client";

// Автопарк — цветният статус (verde/giallo/rosso) идва от най-близката дата.

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";
import { dataIt } from "@/lib/format";
import { STATO_AUTOMEZZO, etichetta } from "@/lib/enum-labels";

const config: EntityConfig = {
  titolo: "Automezzi",
  singolare: "automezzo",
  genere: "m",
  descrizione:
    "Flotta aziendale: revisione, assicurazione e tagliando sotto controllo",
  api: "/api/automezzi",
  cerca: "Cerca per targa, marca, modello…",
  colonne: [
    { chiave: "targa", label: "Targa", className: "font-mono font-medium" },
    {
      chiave: "marca",
      label: "Veicolo",
      render: (r) => `${r.marca} ${r.modello}`,
    },
    {
      chiave: "stato",
      label: "Stato",
      render: (r) => (
        <span
          className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${
            r.stato === "verde"
              ? "bg-success-subtle text-success-text"
              : r.stato === "giallo"
                ? "bg-warning-subtle text-warning-text"
                : "bg-danger-subtle text-danger-text"
          }`}
        >
          {etichetta(STATO_AUTOMEZZO, String(r.stato))}
        </span>
      ),
    },
    {
      chiave: "chilometraggio",
      label: "Km",
      className: "font-mono",
      render: (r) =>
        r.chilometraggio === null || r.chilometraggio === undefined
          ? "—"
          : Number(r.chilometraggio).toLocaleString("it-IT"),
    },
    {
      chiave: "scadenzaRevisione",
      label: "Revisione",
      render: (r) => dataIt(r.scadenzaRevisione as string | null),
    },
    {
      chiave: "scadenzaAssicurazione",
      label: "Assicurazione",
      render: (r) => dataIt(r.scadenzaAssicurazione as string | null),
    },
    {
      chiave: "conducente",
      label: "Conducente",
      render: (r) => {
        const c = r.conducente as Riga | null;
        return c ? `${c.cognome} ${c.nome}` : "—";
      },
    },
  ],
  campi: [
    { name: "targa", label: "Targa", tipo: "text", richiesto: true },
    { name: "marca", label: "Marca", tipo: "text", richiesto: true },
    { name: "modello", label: "Modello", tipo: "text", richiesto: true },
    { name: "chilometraggio", label: "Chilometraggio", tipo: "number" },
    { name: "scadenzaRevisione", label: "Scadenza revisione", tipo: "date" },
    {
      name: "scadenzaAssicurazione",
      label: "Scadenza assicurazione",
      tipo: "date",
    },
    { name: "scadenzaTagliando", label: "Scadenza tagliando", tipo: "date" },
    {
      name: "conducenteId",
      label: "Conducente (un veicolo per dipendente)",
      tipo: "select",
      opzioniApi: {
        url: "/api/dipendenti",
        etichetta: (r) => `${r.cognome} ${r.nome}`,
      },
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
