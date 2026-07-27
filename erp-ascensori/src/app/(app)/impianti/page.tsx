"use client";

// Импианти — сърцето на системата.

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { dataIt } from "@/lib/format";

const config: EntityConfig = {
  titolo: "Impianti",
  singolare: "impianto",
  genere: "m",
  descrizione:
    "Ascensori e piattaforme elevatrici in gestione, con scadenze di verifica e avvisi automatici",
  api: "/api/impianti",
  moduloAi: "impianti",
  cerca: "Cerca per matricola, marca, indirizzo…",
  linkDettaglio: (r) => `/impianti/${r.id}`,
  colonne: [
    {
      chiave: "matricola",
      label: "Matricola",
      className: "font-mono font-medium",
    },
    {
      chiave: "marca",
      label: "Marca / Modello",
      render: (r) => `${r.marca} ${r.modello}`,
    },
    {
      chiave: "stato",
      label: "Stato",
      render: (r) => <Badge valore={String(r.stato)} />,
    },
    { chiave: "indirizzo", label: "Indirizzo" },
    {
      chiave: "condominio.nome",
      label: "Condominio",
      render: (r) => String((r.condominio as Riga | null)?.nome ?? "—"),
    },
    {
      chiave: "prossimaRevisione",
      label: "Prossima revisione",
      render: (r) => dataIt(r.prossimaRevisione as string | null),
    },
  ],
  campi: [
    { name: "matricola", label: "Matricola", tipo: "text", richiesto: true },
    { name: "marca", label: "Marca", tipo: "text", richiesto: true },
    { name: "modello", label: "Modello", tipo: "text", richiesto: true },
    {
      name: "stato",
      label: "Stato",
      tipo: "select",
      predefinito: "ATTIVO",
      opzioni: [
        "ATTIVO",
        "FERMO",
        "MANUTENZIONE",
        "FUORI_SERVIZIO",
        "DISMESSO",
      ].map((v) => ({
        value: v,
        label: v.replaceAll("_", " "),
      })),
    },
    { name: "anno", label: "Anno di costruzione", tipo: "number" },
    { name: "portata", label: "Portata (kg)", tipo: "number" },
    { name: "fermate", label: "Fermate", tipo: "number" },
    { name: "piano", label: "Locale macchine / quadro", tipo: "text" },
    { name: "indirizzo", label: "Indirizzo", tipo: "text", colSpan2: true },
    { name: "dataInstallazione", label: "Data installazione", tipo: "date" },
    { name: "ultimaRevisione", label: "Ultima revisione", tipo: "date" },
    { name: "prossimaRevisione", label: "Prossima revisione", tipo: "date" },
    {
      name: "condominioId",
      label: "Condominio",
      tipo: "select",
      opzioniApi: { url: "/api/condomini", etichetta: (r) => String(r.nome) },
    },
    {
      name: "amministratoreId",
      label: "Amministratore",
      tipo: "select",
      opzioniApi: {
        url: "/api/amministratori",
        etichetta: (r) =>
          String(r.ragioneSociale ?? `${r.nome} ${r.cognome ?? ""}`),
      },
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
