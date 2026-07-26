"use client";

import EntityPage, {
  type EntityConfig,
  type Riga,
} from "@/components/EntityPage";

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
      chiave: "codiceFiscale",
      label: "Codice fiscale",
      className: "font-mono",
      // Без него фактурата не може да бъде издадена на кондоминиума — затова
      // липсата се вижда от списъка, не се открива при експорта.
      render: (r) =>
        r.codiceFiscale ? (
          String(r.codiceFiscale)
        ) : (
          <span className="text-warning-text">manca</span>
        ),
    },
    {
      chiave: "amministratore.nome",
      label: "Amministratore",
      render: (r) => {
        const a = r.amministratore as Riga | null;
        return a
          ? String(a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`)
          : "—";
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
    {
      name: "codiceFiscale",
      label: "Codice fiscale",
      tipo: "text",
      aiuto:
        "Il condominio è un soggetto fiscale autonomo: la fattura è intestata a lui, non allo studio dell'amministratore. Senza codice fiscale non è emettibile.",
    },
    {
      name: "codiceSdi",
      label: "Codice destinatario",
      tipo: "text",
      aiuto:
        "7 caratteri. Se manca, si usa 0000000: la fattura è valida ma resta nel cassetto fiscale del condominio.",
    },
    {
      name: "pec",
      label: "PEC",
      tipo: "email",
      aiuto: "Recapito alternativo al codice destinatario.",
    },
    {
      name: "sostitutoImposta",
      label: "Sostituto d'imposta (ritenuta 4 %)",
      tipo: "checkbox",
      predefinito: true,
      aiuto:
        "Il condominio trattiene il 4 % sui corrispettivi d'appalto e lo versa all'erario (art. 25-ter D.P.R. 600/1973). Togliere il segno solo per i condomìni privi di codice fiscale.",
    },
    { name: "unitaImmobiliari", label: "Unità immobiliari", tipo: "number" },
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
