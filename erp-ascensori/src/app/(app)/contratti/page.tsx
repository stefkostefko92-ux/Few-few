"use client";

// Договорите за поддръжка: от тях автоматизмът ражда периодичните посещения
// и фактурите за canone. Това е повтарящият се приход на фирмата.

import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { euro, dataIt } from "@/lib/format";
import { PERIODICITA_LABEL, type Periodicita } from "@/lib/contratti-logic";
import { STATI_CONTRATTO } from "@/lib/regole-contratti";

const opzioniPeriodicita = (Object.keys(PERIODICITA_LABEL) as Periodicita[]).map((v) => ({
  value: v,
  label: PERIODICITA_LABEL[v],
}));

const config: EntityConfig = {
  titolo: "Contratti di manutenzione",
  singolare: "contratto",
  genere: "m",
  descrizione:
    "Canone, impianti coperti e periodicità: le visite e le fatture vengono generate automaticamente",
  api: "/api/contratti",
  cerca: "Cerca per numero, oggetto…",
  linkDettaglio: (r) => `/contratti/${r.id}`,
  filtroStato: { campo: "stato", valori: STATI_CONTRATTO },
  colonne: [
    { chiave: "numero", label: "Numero", className: "font-mono font-medium" },
    { chiave: "oggetto", label: "Oggetto" },
    { chiave: "stato", label: "Stato", render: (r) => <Badge valore={String(r.stato)} /> },
    {
      chiave: "amministratore",
      label: "Cliente",
      render: (r) => {
        const a = r.amministratore as Riga | null;
        return a ? String(a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`) : "—";
      },
    },
    {
      chiave: "_count",
      label: "Impianti",
      className: "text-right font-mono",
      render: (r) => String((r._count as Riga | null)?.impianti ?? 0),
    },
    {
      chiave: "canone",
      label: "Canone",
      className: "text-right font-mono",
      render: (r) => euro(r.canone as string),
    },
    {
      chiave: "periodicitaFatturazione",
      label: "Fatturazione",
      render: (r) => PERIODICITA_LABEL[r.periodicitaFatturazione as Periodicita] ?? "—",
    },
    {
      chiave: "dataFine",
      label: "Scadenza",
      render: (r) => dataIt(r.dataFine as string),
    },
  ],
  campi: [
    { name: "oggetto", label: "Oggetto", tipo: "text", richiesto: true, colSpan2: true },
    { name: "dataInizio", label: "Data di inizio", tipo: "date", richiesto: true },
    { name: "dataFine", label: "Data di fine", tipo: "date", richiesto: true },
    { name: "canone", label: "Canone per periodo (€)", tipo: "decimal", richiesto: true },
    { name: "aliquotaIva", label: "Aliquota IVA (%)", tipo: "decimal", predefinito: "22" },
    {
      name: "periodicitaVisite",
      label: "Periodicità delle visite",
      tipo: "select",
      predefinito: "SEMESTRALE",
      opzioni: opzioniPeriodicita,
    },
    {
      name: "periodicitaFatturazione",
      label: "Periodicità di fatturazione",
      tipo: "select",
      predefinito: "TRIMESTRALE",
      opzioni: opzioniPeriodicita,
    },
    {
      name: "amministratoreId",
      label: "Cliente",
      tipo: "select",
      opzioniApi: {
        url: "/api/amministratori",
        etichetta: (r) => String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
      },
    },
    {
      name: "condominioId",
      label: "Condominio",
      tipo: "select",
      opzioniApi: {
        url: "/api/condomini",
        etichetta: (r) => `${r.nome} — ${r.citta}`,
      },
    },
    {
      name: "impianti",
      label: "Impianti coperti dal contratto",
      tipo: "multiselect",
      chiaveMulti: "impiantoId",
      inviaCome: "impiantiIds",
      colSpan2: true,
      opzioniApi: {
        url: "/api/impianti",
        etichetta: (r) => `${r.matricola} — ${r.marca} ${r.modello}`,
      },
    },
    { name: "rinnovoAutomatico", label: "Rinnovo tacito alla scadenza", tipo: "checkbox" },
    { name: "preavvisoMesi", label: "Preavviso di disdetta (mesi)", tipo: "number", predefinito: 3 },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
