"use client";

// Импианти — сърцето на системата.

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";
import { Badge } from "@/components/ui";
import { dataIt } from "@/lib/format";
import { STATO_LABEL } from "@/lib/enum-labels";
import {
  TIPI_IMPIANTO,
  REGIMI_IMPIANTO,
  TIPO_IMPIANTO_LABEL,
  REGIME_IMPIANTO_LABEL,
} from "@/lib/normativa/impianti";

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
  // Нормативните полета (матрикула на Общината, съобщението по чл. 12, вид,
  // режим, органът за проверките) са ТУК: без тях детайлът показваше
  // предупреждения, които нямаше откъде да се махнат, досието печаташе „—", а
  // попълненото от ИИ се губеше при записа.
  campi: [
    {
      name: "matricola",
      label: "Matricola interna",
      tipo: "text",
      richiesto: true,
    },
    {
      name: "matricolaComune",
      label: "Matricola comunale",
      tipo: "text",
      aiuto:
        "Numero assegnato dal Comune (art. 12 D.P.R. 162/1999), riportato in cabina.",
    },
    { name: "comune", label: "Comune", tipo: "text" },
    {
      name: "dataComunicazione",
      label: "Comunicazione al Comune",
      tipo: "date",
      aiuto: "Data della comunicazione di messa in esercizio (art. 12).",
    },
    {
      name: "tipo",
      label: "Tipo di impianto",
      tipo: "select",
      predefinito: "ASCENSORE",
      opzioni: TIPI_IMPIANTO.map((v) => ({
        value: v,
        label: TIPO_IMPIANTO_LABEL[v],
      })),
    },
    {
      name: "regime",
      label: "Regime normativo",
      tipo: "select",
      opzioni: REGIMI_IMPIANTO.map((v) => ({
        value: v,
        label: REGIME_IMPIANTO_LABEL[v],
      })),
    },
    { name: "marca", label: "Marca", tipo: "text", richiesto: true },
    { name: "modello", label: "Modello", tipo: "text", richiesto: true },
    {
      name: "stato",
      label: "Stato",
      tipo: "select",
      predefinito: "ATTIVO",
      // „Fermo amministrativo" се вижда (иначе спряна уредба излиза с празно
      // поле), но не се налага оттук — само от отрицателна проверка (сървърът).
      opzioni: [
        "ATTIVO",
        "FERMO",
        "MANUTENZIONE",
        "FUORI_SERVIZIO",
        "DISMESSO",
        "FERMO_AMMINISTRATIVO",
      ].map((v) => ({ value: v, label: STATO_LABEL[v] ?? v })),
    },
    { name: "anno", label: "Anno di costruzione", tipo: "number" },
    { name: "portata", label: "Portata (kg)", tipo: "number" },
    { name: "persone", label: "Persone (capienza)", tipo: "number" },
    { name: "velocita", label: "Velocità (m/s)", tipo: "decimal" },
    { name: "fermate", label: "Fermate", tipo: "number" },
    { name: "piano", label: "Locale macchine / quadro", tipo: "text" },
    { name: "indirizzo", label: "Indirizzo", tipo: "text", colSpan2: true },
    { name: "dataInstallazione", label: "Data installazione", tipo: "date" },
    {
      name: "organismoNotificato",
      label: "Organismo per le verifiche periodiche",
      tipo: "text",
    },
    {
      name: "manutentoreDal",
      label: "Manutenzione affidata dal",
      tipo: "date",
    },
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
