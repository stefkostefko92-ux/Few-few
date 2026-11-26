// Синхронизация (спецификация D8): черновите → PUT с версията, на която се основават (409 = конфликт, човекът
// избира); снимките → POST идемпотентно по id; триенията от опашката; накрая — списъкът от сървъра.
import { api, online } from "./api.js";
import { db } from "./db.js";

const ascoltatori = new Set();
export const suEvento = (fn) => (ascoltatori.add(fn), () => ascoltatori.delete(fn));
const emetti = (e) => ascoltatori.forEach((fn) => fn(e));

const corpo = (doc, base) => ({
  tipo: doc.tipo,
  versione: base,
  intestazione: doc.intestazione,
  dati: doc.dati,
  foto: doc.foto.map(({ id, ordine, didascalia, ubicazione, riferimento }) => ({ id, ordine, didascalia, ubicazione, riferimento })),
  richiestaId: doc.richiestaId ?? null,
});

/** Записва локалното работно копие (всяка редакция): маркира го за синхронизация. */
export async function salvaLocale(doc) {
  const rec = (await db.documento(doc.id)) ?? { id: doc.id, base: 0, rev: 0 };
  await db.salvaDocumento({ ...rec, doc, sporco: true, rev: (rec.rev ?? 0) + 1, modificato: Date.now(), solaSintesi: false });
  pianifica();
}

let timer;
let inCorso = null;
export function pianifica(ms = 2500) {
  clearTimeout(timer);
  timer = setTimeout(() => void sincronizza(), ms);
}

async function inviaDocumento(rec) {
  const r = await api(`/documenti/${rec.id}`, { method: "PUT", json: corpo(rec.doc, rec.base) });
  const ora = await db.documento(rec.id);
  if (r.stato === 200) {
    // Локалното копие остава (то е изпратеното, с още некачените снимки) — обновяват се само полетата на сървъра.
    const s = r.dati;
    const doc = { ...ora.doc, versione: s.versione, stato: s.stato, numero: s.numero, revisione: s.revisione, autore: s.autore, emessoIl: s.emessoIl };
    await db.salvaDocumento({ ...ora, base: s.versione, sporco: ora.rev !== rec.rev, doc, conflitto: null, errore: null });
    return "ok";
  }
  if (r.stato === 409) return db.salvaDocumento({ ...ora, conflitto: r.dati.server }).then(() => "conflitto");
  if (r.stato === 423) return aggiornaDaServer(rec.id).then(() => "emesso");
  if (r.stato === 400) return db.salvaDocumento({ ...ora, errore: `Dati non validi: ${(r.dati?.campi ?? []).join(", ")}` }).then(() => "errore");
  return r.stato === 401 ? "sessione" : "rete";
}

async function inviaFoto(f, docRec) {
  const meta = docRec.doc.foto.find((x) => x.id === f.id) ?? { ordine: 0, didascalia: "", ubicazione: "", riferimento: "" };
  const q = new URLSearchParams({ ordine: String(meta.ordine), didascalia: meta.didascalia, ubicazione: meta.ubicazione, riferimento: meta.riferimento });
  const r = await api(`/documenti/${f.docId}/foto/${f.id}?${q}`, { method: "POST", body: f.blob, tipo: "image/jpeg" });
  if (r.stato === 200 || r.stato === 201) {
    await db.salvaFoto({ ...f, blob: null, caricata: true });
    return "ok";
  }
  if (r.stato === 400 || r.stato === 413 || r.stato === 423) await db.salvaFoto({ ...f, errore: r.stato === 423 ? "documento emesso" : "immagine non accettata" });
  return r.stato === 401 ? "sessione" : "altro";
}

/** Сваля пълния документ от сървъра и заменя локалното копие (когато няма локални промени). */
export async function aggiornaDaServer(id) {
  const r = await api(`/documenti/${id}`);
  if (r.stato !== 200) return null;
  const ora = await db.documento(id);
  // Снимките, които още чакат качване, остават в списъка (иначе губят надписа и мястото си).
  const inSospeso = new Set((await db.fotoDi(id)).filter((f) => !f.caricata).map((f) => f.id));
  const locali = (ora?.doc?.foto ?? []).filter((f) => inSospeso.has(f.id) && !r.dati.foto.some((x) => x.id === f.id));
  const doc = { ...r.dati, foto: [...r.dati.foto, ...locali], richiestaId: ora?.doc?.richiestaId ?? null };
  await db.salvaDocumento({ ...(ora ?? {}), id, doc, base: r.dati.versione, sporco: false, rev: ora?.rev ?? 0, solaSintesi: false, conflitto: null, errore: null });
  return doc;
}

export async function sincronizza() {
  if (!online()) return emetti({ tipo: "offline" });
  if (inCorso) return inCorso;
  inCorso = (async () => {
    emetti({ tipo: "inizio" });
    let esito = "ok";
    try {
      for (const rec of await db.documenti()) {
        if (!rec.sporco || rec.conflitto || !rec.doc) continue;
        const e = await inviaDocumento(rec);
        if (e === "sessione" || e === "rete") return (esito = e);
      }
      for (const f of await db.tutteFoto()) {
        if (f.caricata || f.errore) continue;
        const rec = await db.documento(f.docId);
        if (!rec || rec.base < 1) continue; // документът още не е на сървъра
        if ((await inviaFoto(f, rec)) === "sessione") return (esito = "sessione");
      }
      for (const op of await db.coda()) {
        const r = await api(`/documenti/${op.docId}/foto/${op.fotoId}`, { method: "DELETE" });
        if (r.stato === 204 || r.stato === 404) await db.togliDaCoda(op.id);
        else if (r.stato === 401) return (esito = "sessione");
      }
      await scaricaElenco();
    } finally {
      inCorso = null;
      emetti({ tipo: "fine", esito });
    }
    return esito;
  })();
  return inCorso;
}

/** Списъкът от сървъра: нови документи → само резюме; по-нова версия без локални промени → сваля се. */
async function scaricaElenco() {
  const righe = [];
  for (let p = 1; p <= 10; p++) {
    const r = await api(`/documenti?pagina=${p}`);
    if (r.stato !== 200) return;
    righe.push(...r.dati.righe);
    if (r.dati.righe.length < 50) break;
  }
  const locali = new Map((await db.documenti()).map((x) => [x.id, x]));
  for (const s of righe) {
    const l = locali.get(s.id);
    if (!l || l.solaSintesi) await db.salvaDocumento({ ...(l ?? { id: s.id, base: 0, rev: 0 }), sintesi: s, solaSintesi: true, sporco: false });
    else if (!l.sporco && s.versione > l.base) await aggiornaDaServer(s.id);
    else await db.salvaDocumento({ ...l, sintesi: s });
  }
  const sulServer = new Set(righe.map((s) => s.id));
  for (const l of locali.values()) {
    if (sulServer.has(l.id) || l.base < 1) continue;
    // Изтрит на сървъра: без локални промени → махаме го; с промени → пак е чернова за създаване.
    if (l.sporco) await db.salvaDocumento({ ...l, base: 0 });
    else await db.eliminaDocumento(l.id);
  }
}

/** Конфликт: „mantieni la mia“ — записваме върху версията на сървъра; „usa quella del server“ — заменяме. */
export async function risolviConflitto(id, scelta) {
  const rec = await db.documento(id);
  if (!rec?.conflitto) return;
  if (scelta === "mia") await db.salvaDocumento({ ...rec, base: rec.conflitto.versione, conflitto: null, sporco: true });
  else await db.salvaDocumento({ ...rec, doc: rec.conflitto, base: rec.conflitto.versione, conflitto: null, sporco: false });
  pianifica(200);
}
