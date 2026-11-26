// JSON API за офлайн приложението на документите (docs/documenti-spec.md D7–D17). Пълна сесия + право по
// ролята + CSRF (`x-csrf-token`) и Origin (controlloCsrf преди нас); всички отговори са `no-store`.
import express, { Router, type Response } from "express";
import { z } from "zod";
import type { AdminDeps } from "./deps.js";
import { annotaEliminazione, registra, registraAlPiuOgni } from "./deps.js";
import { auth, type Auth } from "../auth/sessione.js";
import { richiedeAccessoApi, richiedePermesso } from "../auth/guards.js";
import { livello, puo } from "../auth/ruoli.js";
import { DocumentoInSchema, FraseInSchema, ID } from "../documenti/schema.js";
import { FotoNonValida, MAX_BYTE } from "../documenti/foto.js";
import { TIPI_DOCUMENTO } from "../documenti/condiviso/tipi.js";

const TIPI_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Едновременни качвания на снимки (тяло в паметта + обработка): 4 × 15 MB е таванът при mem_limit 512m. */
const MAX_CARICAMENTI = 4;
let caricamenti = 0;
/** Редакцията на черновата влиза в регистъра най-много веднъж на час за човек и документ (D15). */
const FINESTRA_MODIFICHE = 60 * 60_000;
// Метаданните на снимката идват в заглавие (base64url JSON), не в адреса: надписите са свободен текст и не
// бива да влизат в access лога на Nginx. В адреса — само редът (число).
const MetaFoto = z
  .object({ didascalia: z.string().max(500).default(""), ubicazione: z.string().max(120).default(""), riferimento: z.string().max(80).default("") })
  .strict();
const OrdineFoto = z.coerce.number().int().min(0).max(100000).default(0);
function metaFoto(intestazione: string | undefined): z.infer<typeof MetaFoto> | null {
  if (!intestazione) return MetaFoto.parse({});
  try {
    const r = MetaFoto.safeParse(JSON.parse(Buffer.from(intestazione, "base64url").toString("utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
/** PATCH на фраза: само подадените полета (без default-и, които биха изтрили препоръката). */
const FrasePatch = z
  .object({ testo: z.string().min(3).max(1500), raccomandazione: z.string().max(1500), priorita: z.enum(["alta", "media", "bassa"]), attiva: z.boolean() })
  .partial()
  .strict();

const idValido = (v: unknown): string | null => {
  const r = ID.safeParse(v);
  return r.success ? r.data : null;
};

export function apiDocumenti(d: AdminDeps): Router {
  const r = Router();
  r.use(richiedeAccessoApi());
  r.use((_req, res, next) => {
    res.set("cache-control", "no-store");
    next();
  });
  r.use(express.json({ limit: "2mb" }));
  const a = (res: Response): Auth => auth(res)!;

  r.get("/sessione", (_req, res) => {
    const { utente, sessione } = a(res);
    const p = (x: Parameters<typeof puo>[1]) => puo(utente.ruolo, x);
    res.json({
      csrf: sessione.csrf,
      utente: { id: utente.id, nome: utente.nome, ruolo: utente.ruolo, qualifica: utente.qualifica },
      permessi: { leggi: p("documenti.leggi"), modifica: p("documenti.modifica"), emetti: p("documenti.emetti"), elimina: p("documenti.elimina"), frasi: p("frasi.gestisci") },
    });
  });

  r.use(["/documenti", "/catalogo", "/frasi"], richiedePermesso("documenti.leggi"));

  r.get("/catalogo", async (_req, res) => {
    const frasi = (await d.store.frasi.tutte()).filter((f) => f.attiva);
    res.json({ ...d.documenti.catalogo, frasi: frasi.map(({ id, voceId, tipo, testo, raccomandazione, priorita }) => ({ id, voceId, tipo, testo, raccomandazione, priorita })) });
  });

  r.post("/frasi", richiedePermesso("frasi.gestisci"), async (req, res) => {
    const p = FraseInSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ errore: "non_valido" });
    const f = await d.store.frasi.crea({ ...p.data, attiva: true, autoreId: a(res).utente.id });
    await registra(d, req, a(res).utente.id, "frase.creata", f.id);
    res.status(201).json(f);
  });

  r.patch("/frasi/:id", richiedePermesso("frasi.gestisci"), async (req, res) => {
    const p = FrasePatch.safeParse(req.body);
    const f = await d.store.frasi.perId(String(req.params.id));
    if (!p.success || !f) return res.status(p.success ? 404 : 400).json({ errore: "non_valido" });
    const patch = Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined));
    await d.store.frasi.aggiorna(f.id, patch);
    await registra(d, req, a(res).utente.id, "frase.aggiornata", f.id, { campi: Object.keys(patch) });
    res.status(204).end();
  });

  r.get("/documenti", async (req, res) => {
    // Устройствата: всички резюмета наведнъж (без странициране — документ не изпада при пренареждане).
    if (req.query.sintesi === "1") return res.json({ righe: await d.store.documenti.tutti() });
    const testo = typeof req.query.testo === "string" ? req.query.testo.slice(0, 100) : undefined;
    const pagina = Math.max(1, Math.min(1000, Number(req.query.pagina) || 1));
    res.json(await d.documenti.elenco(testo, pagina));
  });

  r.post("/documenti/da-richiesta/:richiestaId", richiedePermesso("documenti.modifica"), async (req, res) => {
    const tipo = z.enum(TIPI_DOCUMENTO).safeParse(req.body?.tipo);
    const rq = await d.store.richieste.perId(String(req.params.richiestaId));
    if (!tipo.success || !rq) return res.status(tipo.success ? 404 : 400).json({ errore: "non_valido" });
    const id = await d.documenti.daRichiesta(a(res).utente, tipo.data, rq);
    await registra(d, req, a(res).utente.id, "documento.creato", id, { daRichiesta: rq.id });
    res.status(201).json({ id });
  });

  r.get("/documenti/:id", async (req, res) => {
    const id = idValido(req.params.id);
    const doc = id ? await d.documenti.carica(id) : null;
    if (!doc) return res.status(id ? 404 : 400).json({ errore: "non_trovato" });
    res.json(doc);
  });

  r.put("/documenti/:id", richiedePermesso("documenti.modifica"), async (req, res) => {
    const id = idValido(req.params.id);
    const p = DocumentoInSchema.safeParse(req.body);
    if (!id || !p.success) return res.status(400).json({ errore: "non_valido", campi: p.success ? ["id"] : p.error.issues.map((i) => i.path.join(".")).slice(0, 20) });
    const prima = await d.store.documenti.perId(id);
    const e = await d.documenti.salva(a(res).utente, id, p.data);
    if (e.esito === "non_valido") return res.status(400).json({ errore: "non_valido", campi: e.campi });
    if (e.esito === "emesso") return res.status(423).json({ errore: "emesso" });
    if (e.esito === "eliminato") return res.status(410).json({ errore: "eliminato" });
    if (e.esito === "occupato") return res.status(409).json({ errore: "occupato" });
    if (e.esito === "conflitto") return res.status(409).json({ errore: "conflitto", server: e.doc });
    if (!prima) await registra(d, req, a(res).utente.id, "documento.creato", id, { tipo: p.data.tipo });
    else await registraAlPiuOgni(d, req, a(res).utente.id, "documento.modificato", id, FINESTRA_MODIFICHE, { versione: e.doc.versione });
    res.json(e.doc);
  });

  r.post(
    "/documenti/:id/foto/:fotoId",
    richiedePermesso("documenti.modifica"),
    (req, res, next) => (TIPI_FOTO.has(String(req.get("content-type")).split(";")[0]!.trim()) ? next() : res.status(415).json({ errore: "formato" })),
    // Таван на едновременните качвания, ПРЕДИ тялото да влезе в паметта (до 15 MB всяко): над него — 503 и
    // устройството опитва пак (Retry-After). Тялото на отказаната заявка се изчита без запазване (index.ts).
    (req, res, next) => {
      if (caricamenti >= MAX_CARICAMENTI) return res.status(503).set("retry-after", "10").json({ errore: "occupato" });
      caricamenti++;
      res.once("close", () => caricamenti--);
      next();
    },
    express.raw({ type: () => true, limit: MAX_BYTE }),
    async (req, res) => {
      const id = idValido(req.params.id);
      const fotoId = idValido(req.params.fotoId);
      const meta = metaFoto(req.get("x-foto-meta"));
      const ordine = OrdineFoto.safeParse(req.query.ordine);
      if (!id || !fotoId || !meta || !ordine.success || !Buffer.isBuffer(req.body)) return res.status(400).json({ errore: "non_valido" });
      try {
        const e = await d.documenti.caricaFoto(id, fotoId, req.body, { ...meta, ordine: ordine.data });
        if (e.esito === "non_trovato") return res.status(404).json({ errore: "non_trovato" });
        if (e.esito === "emesso") return res.status(423).json({ errore: "emesso" });
        if (e.esito === "occupato") return res.status(409).json({ errore: "occupato" });
        res.status(e.esito === "creata" ? 201 : 200).json(e.foto);
      } catch (err) {
        if (err instanceof FotoNonValida) return res.status(400).json({ errore: err.codice });
        throw err;
      }
    },
  );

  r.delete("/documenti/:id/foto/:fotoId", richiedePermesso("documenti.modifica"), async (req, res) => {
    const id = idValido(req.params.id);
    const fotoId = idValido(req.params.fotoId);
    if (!id || !fotoId) return res.status(400).json({ errore: "non_valido" });
    const e = await d.documenti.eliminaFoto(id, fotoId);
    if (e === "non_trovato") return res.status(404).json({ errore: e });
    if (e === "emesso") return res.status(423).json({ errore: e });
    if (e === "occupato") return res.status(409).json({ errore: e });
    await registra(d, req, a(res).utente.id, "foto.eliminata", id, { foto: fotoId });
    res.status(204).end();
  });

  r.post("/documenti/:id/emetti", richiedePermesso("documenti.emetti"), async (req, res) => {
    const id = idValido(req.params.id);
    const versione = z.number().int().min(1).safeParse(req.body?.versione);
    if (!id || !versione.success) return res.status(400).json({ errore: "non_valido" });
    const e = await d.documenti.emetti(a(res).utente, id, versione.data);
    if (e.esito === "non_trovato") return res.status(404).json({ errore: e.esito });
    if (e.esito === "emesso") return res.status(423).json({ errore: e.esito });
    if (e.esito === "occupato") return res.status(409).json({ errore: e.esito });
    if (e.esito === "conflitto") return res.status(409).json({ errore: e.esito, server: e.doc });
    if (e.esito === "incompleto") return res.status(422).json({ errore: e.esito, problemi: e.problemi });
    await registra(d, req, a(res).utente.id, "documento.emesso", id, { numero: e.doc.numero, revisione: e.doc.revisione });
    res.json(e.doc);
  });

  r.post("/documenti/:id/revisione", richiedePermesso("documenti.modifica"), async (req, res) => {
    const id = idValido(req.params.id);
    const r = id ? await d.documenti.nuovaRevisione(a(res).utente, id) : null;
    if (!r) return res.status(id ? 409 : 400).json({ errore: "non_emesso" });
    if (r.esistente) return res.status(200).json({ id: r.id });
    await registra(d, req, a(res).utente.id, "documento.revisione", r.id, { da: id });
    res.status(201).json({ id: r.id });
  });

  r.post("/documenti/:id/duplica", richiedePermesso("documenti.modifica"), async (req, res) => {
    const id = idValido(req.params.id);
    const nuovo = id ? await d.documenti.duplica(a(res).utente, id) : null;
    if (!nuovo) return res.status(id ? 404 : 400).json({ errore: "non_trovato" });
    await registra(d, req, a(res).utente.id, "documento.duplicato", nuovo, { da: id });
    res.status(201).json({ id: nuovo });
  });

  r.delete("/documenti/:id", richiedePermesso("documenti.modifica"), async (req, res) => {
    const id = idValido(req.params.id);
    const doc = id ? await d.store.documenti.perId(id) : null;
    if (!doc) return res.status(id ? 404 : 400).json({ errore: "non_trovato" });
    const u = a(res).utente;
    // Чернова: авторът или RESPONSABILE+; издаден: DIREZIONE+ (спецификация D15).
    const consentito = doc.stato === "EMESSO" ? puo(u.ruolo, "documenti.elimina") : doc.autoreId === u.id || livello(u.ruolo) <= livello("RESPONSABILE");
    if (!consentito) return res.status(403).json({ errore: "permesso" });
    if (!(await annotaEliminazione(d, "documento", doc.id))) return res.status(503).json({ errore: "registro_eliminazioni" });
    await d.documenti.elimina(doc.id);
    await registra(d, req, u.id, "documento.eliminato", doc.id, { stato: doc.stato, numero: doc.numero });
    res.status(204).end();
  });

  r.use((_req, res) => res.status(404).json({ errore: "non_trovato" }));
  return r;
}
