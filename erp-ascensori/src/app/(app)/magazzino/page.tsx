"use client";

// Артикули на склада: giacenza-та се движи само чрез движения (не се редактира).

import EntityPage, { type EntityConfig } from "@/components/EntityPage";
import { IcoAttenzione } from "@/components/icone";
import { euro } from "@/lib/format";
import { TIPO_MAGAZZINO, etichetta } from "@/lib/enum-labels";

const config: EntityConfig = {
  titolo: "Articoli di magazzino",
  singolare: "articolo",
  genere: "m",
  descrizione:
    "Componenti tecnici e articoli in vendita: la giacenza si muove solo con i movimenti",
  api: "/api/articoli",
  cerca: "Cerca per codice, nome, barcode…",
  colonne: [
    { chiave: "codice", label: "Codice", className: "font-mono font-medium" },
    { chiave: "nome", label: "Nome" },
    {
      chiave: "tipo",
      label: "Tipo",
      render: (r) => etichetta(TIPO_MAGAZZINO, String(r.tipo)),
    },
    { chiave: "categoria", label: "Categoria" },
    {
      chiave: "quantita",
      label: "Giacenza",
      className: "text-right font-mono",
      render: (r) => {
        const sotto = Number(r.quantita) < Number(r.sogliaMinima);
        return (
          // Иконата е в СОБСТВЕН слот с фиксирана ширина: залепена за числото тя
          // разваля дясното подравняване и цифрите престават да се четат в колона.
          // Текстът за екранни четци е задължителен — цвят + глиф не са сигнал.
          <span className="inline-flex items-center justify-end gap-1">
            <span className="flex w-3.5 justify-center">
              {sotto && <IcoAttenzione />}
            </span>
            <span className={sotto ? "font-semibold text-danger-text" : ""}>
              {String(r.quantita)}
            </span>
            {sotto && <span className="sr-only">sotto scorta</span>}
          </span>
        );
      },
    },
    {
      chiave: "sogliaMinima",
      label: "Soglia",
      className: "text-right font-mono",
    },
    {
      chiave: "prezzoVendita",
      label: "Prezzo",
      className: "text-right font-mono",
      render: (r) => euro(r.prezzoVendita as string | null),
    },
  ],
  campi: [
    { name: "codice", label: "Codice interno", tipo: "text", richiesto: true },
    { name: "barcode", label: "Barcode", tipo: "text" },
    { name: "nome", label: "Nome", tipo: "text", richiesto: true },
    {
      name: "tipo",
      label: "Tipo",
      tipo: "select",
      predefinito: "COMPONENTI",
      opzioni: [
        { value: "COMPONENTI", label: "Componenti" },
        { value: "VENDITA", label: "Vendita" },
      ],
    },
    { name: "categoria", label: "Categoria", tipo: "text" },
    { name: "ubicazione", label: "Ubicazione a scaffale", tipo: "text" },
    { name: "sogliaMinima", label: "Soglia minima (riordino)", tipo: "number" },
    { name: "prezzoAcquisto", label: "Prezzo acquisto (€)", tipo: "decimal" },
    { name: "prezzoVendita", label: "Prezzo vendita (€)", tipo: "decimal" },
    {
      name: "aliquotaIva",
      label: "Aliquota IVA (%)",
      tipo: "decimal",
      predefinito: "22",
    },
    {
      name: "descrizione",
      label: "Descrizione tecnica",
      tipo: "textarea",
      colSpan2: true,
    },
    { name: "note", label: "Note", tipo: "textarea", colSpan2: true },
  ],
};

export default function Pagina() {
  return <EntityPage config={config} />;
}
