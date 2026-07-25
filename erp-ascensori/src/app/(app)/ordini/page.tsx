"use client";

import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { dataIt } from "@/lib/format";

const config: EntityConfig = {
  titolo: "Ordini di lavoro",
  descrizione: "Il lavoro da eseguire: lo stato segue solo le transizioni ammesse",
  api: "/api/ordini",
  cerca: "Cerca per numero, oggetto…",
  linkDettaglio: (r) => `/ordini/${r.id}`,
  colonne: [
    { chiave: "numero", label: "Numero", className: "font-mono font-medium" },
    { chiave: "oggetto", label: "Oggetto" },
    { chiave: "stato", label: "Stato", render: (r) => <Badge valore={String(r.stato)} /> },
    {
      chiave: "priorita",
      label: "Priorità",
      render: (r) => <Badge valore={String(r.priorita)} />,
    },
    {
      chiave: "impianto",
      label: "Impianto",
      render: (r) => String((r.impianto as Riga | null)?.matricola ?? "—"),
    },
    {
      chiave: "tecnico",
      label: "Tecnico",
      render: (r) => {
        const t = r.tecnico as Riga | null;
        return t ? `${t.cognome} ${t.nome}` : "—";
      },
    },
    { chiave: "createdAt", label: "Creato", render: (r) => dataIt(r.createdAt as string) },
  ],
  campi: [
    { name: "oggetto", label: "Oggetto", tipo: "text", richiesto: true, colSpan2: true },
    {
      name: "priorita",
      label: "Priorità",
      tipo: "select",
      predefinito: "ORDINARIA",
      opzioni: [
        { value: "ORDINARIA", label: "Ordinaria" },
        { value: "URGENTE", label: "Urgente" },
        { value: "EMERGENZA", label: "Emergenza" },
      ],
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
      name: "preventivoId",
      label: "Preventivo di origine",
      tipo: "select",
      opzioniApi: { url: "/api/preventivi", etichetta: (r) => `${r.numero} — ${r.oggetto}` },
    },
    {
      name: "tecnicoId",
      label: "Tecnico incaricato",
      tipo: "select",
      opzioniApi: { url: "/api/dipendenti", etichetta: (r) => `${r.cognome} ${r.nome}` },
    },
    {
      name: "cottimistiId",
      label: "Ditta esterna",
      tipo: "select",
      opzioniApi: { url: "/api/cottimisti", etichetta: (r) => String(r.ragioneSociale) },
    },
    {
      name: "squadraId",
      label: "Squadra",
      tipo: "select",
      opzioniApi: { url: "/api/squadre", etichetta: (r) => String(r.nome) },
    },
    { name: "descrizione", label: "Dettaglio dei lavori", tipo: "textarea", colSpan2: true },
    { name: "noteInterne", label: "Note interne (mai stampate)", tipo: "textarea", colSpan2: true },
    { name: "noteCommittente", label: "Note del committente", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
