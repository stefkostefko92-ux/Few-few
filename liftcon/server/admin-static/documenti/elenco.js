// Списъкът: локалните документи (със състоянието на синхронизация) + тези от сървъра; нов документ офлайн.
import { h, toast, uuid } from "./ui.js";
import { db } from "./db.js";
import { salvaLocale, sincronizza, suEvento } from "./sync.js";
import { NOMI_TIPO } from "./etichette.js";
import { nuovoDocumento } from "../lib/nuovo.js";
import { dataIt } from "../lib/formato.js";

const etichettaStato = (r) => {
  const s = r.doc ?? r.sintesi;
  if (r.conflitto) return ["Conflitto", "chip-conflitto"];
  if (s?.stato === "EMESSO") return [`Emesso ${s.numero}${s.revisione ? ` · Rev. ${s.revisione}` : ""}`, "chip-emesso"];
  if (r.sporco) return ["Da sincronizzare", "chip-sporco"];
  if (r.solaSintesi) return ["Sul server", "chip-server"];
  return ["Bozza", "chip-ok"];
};

export async function apriElenco(root, app) {
  const cerca = h("input", { type: "search", placeholder: "Cerca per titolo, committente, comune, numero…", "aria-label": "Cerca documenti", maxlength: 100 });
  const lista = h("ul.elenco.doc-elenco");
  const disegna = async () => {
    const q = cerca.value.trim().toLowerCase();
    const tutti = (await db.documenti())
      .filter((r) => r.doc || r.sintesi)
      .sort((a, b) => (b.modificato ?? Date.parse(b.sintesi?.aggiornatoIl ?? 0)) - (a.modificato ?? Date.parse(a.sintesi?.aggiornatoIl ?? 0)));
    lista.replaceChildren();
    for (const r of tutti) {
      const d = r.doc;
      const titolo = d?.intestazione.titolo || r.sintesi?.titolo || NOMI_TIPO[(d ?? r.sintesi).tipo];
      const sotto = d ? [d.intestazione.committente.nome, d.intestazione.impianto.comune, d.intestazione.data && dataIt(d.intestazione.data)].filter(Boolean).join(" · ") : "";
      if (q && !`${titolo} ${sotto} ${(d ?? r.sintesi).numero ?? ""}`.toLowerCase().includes(q)) continue;
      const [st, cls] = etichettaStato(r);
      lista.append(h("li", {}, h("a.doc-voce", { href: `#/d/${r.id}` }, h("span.doc-tit", {}, titolo), h("span.nota", {}, NOMI_TIPO[(d ?? r.sintesi).tipo], sotto ? ` · ${sotto}` : ""), h(`span.chip.${cls}`, {}, st))));
    }
    if (!lista.children.length) lista.append(h("li.nota", {}, q ? "Nessun documento trovato." : "Nessun documento: ne crei uno nuovo."));
  };
  cerca.addEventListener("input", disegna);

  const nuovo = app.sessione.permessi.modifica
    ? h(
        "div.nuovo",
        {},
        ...Object.entries(NOMI_TIPO).map(([tipo, nome]) =>
          h("button.btn", { type: "button", on: { click: async () => {
            const d = nuovoDocumento(tipo, uuid());
            d.autore = { nome: app.sessione.utente.nome, qualifica: app.sessione.utente.qualifica };
            await salvaLocale(d);
            app.vai(`#/d/${d.id}`);
          } } }, nome),
        ),
      )
    : null;

  root.replaceChildren(
    h("h1", {}, "Documenti"),
    nuovo ? h("section.scheda", {}, h("h2", {}, "Nuovo documento"), h("p.nota", {}, "Funziona anche senza connessione: il documento resta sul dispositivo e si sincronizza appena possibile."), nuovo) : null,
    h("div.filtri", {}, cerca, h("button.btn.btn-sec", { type: "button", on: { click: async () => {
      const e = await sincronizza();
      toast(e === "ok" ? "Sincronizzato." : e === "sessione" ? "Sessione scaduta: acceda di nuovo." : "Sincronizzazione non riuscita.", e === "ok" ? "ok" : "errore");
      disegna();
    } } }, "Sincronizza ora")),
    lista,
  );
  await disegna();
  // След всяка синхронизация (и автоматичната) списъкът се обновява — нови документи от другите устройства.
  return suEvento((e) => e.tipo === "fine" && void disegna());
}
