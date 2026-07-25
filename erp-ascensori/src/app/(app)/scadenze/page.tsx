"use client";

// Законови срокове по импианти + бутон за ръчно пускане на автоматизма.

import { useState } from "react";
import EntityPage, { type EntityConfig, type Riga } from "@/components/EntityPage";
import { dataIt } from "@/lib/format";
import { TIPO_SCADENZA, etichetta } from "@/lib/enum-labels";

function FlagNotifica({ attivo, label }: { attivo: boolean; label: string }) {
  return (
    <span
      title={`Avviso a ${label} giorni ${attivo ? "inviato" : "non inviato"}`}
      className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${
        attivo ? "bg-success-subtle text-success-text" : "bg-surface-3 text-text-3"
      }`}
    >
      {label}
    </span>
  );
}

function BottoneControllo() {
  const [esito, setEsito] = useState<string | null>(null);
  async function esegui() {
    setEsito("…");
    const res = await fetch("/api/scadenze/check", { method: "POST" });
    const d = await res.json();
    setEsito(
      res.ok
        ? `Avvisi generati: ${d.notificheScadenze} · automezzi aggiornati: ${d.automezziAggiornati} · preventivi scaduti: ${d.preventiviScaduti} · fatture scadute: ${d.fattureScadute}`
        : (d.error ?? "Errore")
    );
  }
  return (
    <div className="flex items-center gap-2">
      {esito && <span className="text-xs text-text-3">{esito}</span>}
      <button className="btn-secondary" onClick={() => void esegui()}>
        Esegui controllo scadenze
      </button>
    </div>
  );
}

const config: EntityConfig = {
  titolo: "Scadenze di legge",
  descrizione: "Revisioni, certificazioni e manutenzioni con avvisi a 90 / 60 / 30 giorni",
  api: "/api/scadenze",
  extraAzioni: <BottoneControllo />,
  colonne: [
    {
      chiave: "impianto.matricola",
      label: "Impianto",
      className: "font-mono font-medium",
      render: (r) => String((r.impianto as Riga | null)?.matricola ?? "—"),
    },
    { chiave: "tipo", label: "Tipo", render: (r) => etichetta(TIPO_SCADENZA, String(r.tipo)) },
    {
      chiave: "dataScadenza",
      label: "Scadenza",
      render: (r) => dataIt(r.dataScadenza as string),
    },
    {
      chiave: "notifiche",
      label: "Avvisi inviati",
      render: (r) => (
        <span className="flex gap-1">
          <FlagNotifica attivo={Boolean(r.notificato90)} label="90" />
          <FlagNotifica attivo={Boolean(r.notificato60)} label="60" />
          <FlagNotifica attivo={Boolean(r.notificato30)} label="30" />
        </span>
      ),
    },
    {
      chiave: "completata",
      label: "Completata",
      render: (r) => (r.completata ? "Sì" : "No"),
    },
  ],
  campi: [
    {
      name: "impiantoId",
      label: "Impianto",
      tipo: "select",
      richiesto: true,
      opzioniApi: {
        url: "/api/impianti",
        etichetta: (r) => `${r.matricola} — ${r.marca} ${r.modello}`,
      },
    },
    {
      name: "tipo",
      label: "Tipo",
      tipo: "select",
      richiesto: true,
      predefinito: "revisione",
      opzioni: [
        { value: "revisione", label: "Revisione" },
        { value: "certificazione", label: "Certificazione" },
        { value: "manutenzione", label: "Manutenzione" },
      ],
    },
    { name: "dataScadenza", label: "Data di scadenza", tipo: "date", richiesto: true },
    { name: "completata", label: "Scadenza adempiuta", tipo: "checkbox", predefinito: false },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
