// Офлайн приложението за документите (docs/documenti-spec.md D7–D9): сесия и каталог (с кеш за без връзка),
// маршрути #/ и #/d/<id>, състояние на мрежата, периодична синхронизация, изход с почистване на устройството.
import { h, toast } from "./ui.js";
import { db } from "./db.js";
import { api, impostaCsrf, online } from "./api.js";
import { sincronizza, suEvento, pianifica } from "./sync.js";
import { apriElenco } from "./elenco.js";
import { apriEditor } from "./editor.js";
import { salvaLocale } from "./sync.js";
import { nuovoDocumento } from "../lib/nuovo.js";
import { uuid } from "./ui.js";
import "./installa.js"; // улавя beforeinstallprompt още при зареждането

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
      // CSRF токенът не се пази на устройството (за офлайн стигат името и правата).
      const { csrf: _csrf, ...daSalvare } = r.dati;
      await db.salvaMeta(chiave, daSalvare);
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
  // Пряк път от иконата на приложението (manifest „shortcuts“): нов документ от даден вид.
  const nuovo = /^#\/nuovo\/(SOPRALLUOGO|CONTROLLO_QUALITA|ESAME_DOCUMENTALE|VERBALE)$/.exec(location.hash);
  if (nuovo && app.sessione.permessi.modifica) {
    const d = nuovoDocumento(nuovo[1], uuid());
    d.autore = { nome: app.sessione.utente.nome, qualifica: app.sessione.utente.qualifica };
    await salvaLocale(d);
    location.replace(`#/d/${d.id}`);
    return;
  }
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
  if ("serviceWorker" in navigator) {
    const avevaController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" }).catch(() => {});
    // Нова версия след деплой: новият service worker поема страницата → предлагаме презареждане (данните са на устройството).
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!avevaController) return;
      rete.replaceChildren("È disponibile una nuova versione dell'app. ", h("button.link", { type: "button", on: { click: () => location.reload() } }, "Aggiorna"));
    });
  }
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
