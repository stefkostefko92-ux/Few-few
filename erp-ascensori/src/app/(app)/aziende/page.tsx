"use client";

// Мулти-фирмени инсталации: фирми-клиенти и лицензионни планове.

import EntityPage, { type EntityConfig } from "@/components/EntityPage";
import { dataIt } from "@/lib/format";

const config: EntityConfig = {
  titolo: "Aziende (multi-tenant)",
  descrizione: "Aziende clienti con piano di licenza: oltre la scadenza l'accesso è rifiutato (402)",
  api: "/api/tenants",
  cerca: "Cerca per slug, ragione sociale…",
  colonne: [
    { chiave: "slug", label: "Slug", className: "font-mono font-medium" },
    { chiave: "ragioneSociale", label: "Ragione sociale" },
    { chiave: "piano", label: "Piano" },
    { chiave: "email", label: "Email" },
    {
      chiave: "scadenzaAbbonamento",
      label: "Scadenza abbonamento",
      render: (r) => dataIt(r.scadenzaAbbonamento as string | null),
    },
    { chiave: "attivo", label: "Attiva", render: (r) => (r.attivo ? "Sì" : "No") },
  ],
  campi: [
    { name: "slug", label: "Slug (sottodominio)", tipo: "text", richiesto: true },
    { name: "ragioneSociale", label: "Ragione sociale", tipo: "text", richiesto: true },
    { name: "email", label: "Email amministrativa", tipo: "email", richiesto: true },
    {
      name: "piano",
      label: "Piano",
      tipo: "select",
      predefinito: "TRIAL",
      opzioni: ["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE"].map((v) => ({
        value: v,
        label: v,
      })),
    },
    { name: "scadenzaAbbonamento", label: "Scadenza abbonamento", tipo: "date" },
    { name: "attivo", label: "Accesso attivo", tipo: "checkbox" },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
