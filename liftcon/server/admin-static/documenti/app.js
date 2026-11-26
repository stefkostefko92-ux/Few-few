// Офлайн приложението за документите (docs/documenti-spec.md D7–D9): сесия и каталог (с кеш за без връзка),
// маршрути #/ и #/d/<id>, състояние на мрежата, периодична синхронизация, изход с почистване на устройството.
import { h, toast } from "./ui.js";
import { db } from "./db.js";
import { api, impostaCsrf, online } from "./api.js";
import { sincronizza, suEvento, pianifica } from "./sync.js";
import { apriElenco } from "./elenco.js";
import { apriEditor } from "./editor.js";

const root = document.getElementById("app");
const rete = document.getElementById("rete");
const chi = document.getElementById("chi");
let chiudi = () => {};

const app = {
  sessione: null,
  catalogo: null,
  async vai(hash, forza = false) {
    if (location.hash !== hash) location.hash = hash;
    else if (forza) await instrada();
  },
};

async function carica(chiave, path) {
  if (online()) {
    const r = await api(path);
    if (r.stato === 200) {
      await db.salvaMeta(chiave, r.dati);
      return r.dati;
    }
    if (r.stato === 401) {
      location.href = "/admin/login?dopo=/admin/documenti/";
      return null;
    }
  }
  return db.meta(chiave);
}

async function instrada() {
  chiudi();
  const m = /^#\/d\/([0-9a-f-]{36})$/i.exec(location.hash);
  chiudi = m ? await apriEditor(root, m[1], app) : await apriElenco(root, app);
  window.scrollTo(0, 0);
}

function statoRete(testo) {
  rete.textContent = testo ?? (online() ? "" : "Senza connessione: le modifiche restano sul dispositivo.");
  rete.classList.toggle("offline", !online());
}

async function esci() {
  if (online()) await sincronizza();
  const n = await db.inSospeso();
  if (n && !confirm(`Ci sono ${n} modifiche o foto non ancora sincronizzate: uscendo andranno perse. Uscire comunque?`)) return;
  await db.cancellaTutto();
  if ("caches" in window) for (const k of await caches.keys()) if (k.startsWith("liftcon-doc-dati")) await caches.delete(k);
  const f = h("form", { method: "post", action: "/admin/logout", class: "nascosto" }, h("input", { type: "hidden", name: "_csrf", value: app.sessione?.csrf ?? "" }));
  document.body.append(f);
  f.submit();
}

async function avvio() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/admin/documenti/sw.js", { scope: "/admin/documenti/" }).catch(() => {});
  app.sessione = await carica("sessione", "/sessione");
  app.catalogo = await carica("catalogo", "/catalogo");
  if (!app.sessione || !app.catalogo) {
    root.replaceChildren(h("p.avviso.avviso-info", {}, "Per usare i documenti senza connessione, apra questa pagina una volta con la connessione attiva."));
    return;
  }
  impostaCsrf(app.sessione.csrf);
  chi.replaceChildren(`${app.sessione.utente.nome} · `, h("a", { href: "/admin" }, "Pannello"), " · ", h("button.link", { type: "button", on: { click: esci } }, "Esci"));
  window.addEventListener("hashchange", instrada);
  window.addEventListener("online", () => (statoRete(), pianifica(500)));
  window.addEventListener("offline", () => statoRete());
  suEvento((e) => {
    if (e.tipo === "inizio") statoRete("Sincronizzazione…");
    if (e.tipo === "fine") {
      statoRete();
      if (e.esito === "sessione") {
        rete.replaceChildren("Sessione scaduta: ", h("a", { href: "/admin/login?dopo=/admin/documenti/" }, "acceda di nuovo"), " per sincronizzare (i dati restano sul dispositivo).");
        rete.classList.add("offline");
      }
    }
  });
  setInterval(() => online() && void sincronizza(), 60_000);
  statoRete();
  await instrada();
  if (online()) void sincronizza();
}

avvio().catch(() => toast("Errore durante l'avvio dell'applicazione.", "errore"));
