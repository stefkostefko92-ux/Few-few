// JSON API за офлайн приложението на документите (docs/documenti-spec.md D7–D17). Пълна сесия + право по
// ролята + CSRF (`x-csrf-token`) и Origin (controlloCsrf преди нас); всички отговори са `no-store`.
import express, { Router, type Response } from "express";
import { z } from "zod";
import type { AdminDeps } from "./deps.js";
import { registra } from "./deps.js";
import { auth, type Auth } from "../auth/sessione.js";
import { richiedeAccessoApi, richiedePermesso } from "../auth/guards.js";
import { livello, puo } from "../auth/ruoli.js";
import { DocumentoInSchema, FraseInSchema, ID } from "../documenti/schema.js";
import { FotoNonValida, MAX_BYTE } from "../documenti/foto.js";
import { TIPI_DOCUMENTO } from "../documenti/condiviso/tipi.js";

const TIPI_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const MetaFoto = z.object({
  ordine: z.coerce.number().int().min(0).max(100000).default(0),
  didascalia: z.string().max(500).default(""),
  ubicazione: z.string().max(120).default(""),
  riferimento: z.string().max(80).default(""),
});

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
    const p = FraseInSchema.partial().extend({ attiva: z.boolean().optional() }).safeParse(req.body);
    const f = await d.store.frasi.perId(String(req.params.id));
    if (!p.success || !f) return res.status(p.success ? 404 : 400).json({ errore: "non_valido" });
    const { testo, raccomandazione, priorita, attiva } = p.data;
    await d.store.frasi.aggiorna(f.id, { ...(testo !== undefined ? { testo } : {}), ...(raccomandazione !== undefined ? { raccomandazione } : {}), ...(priorita ? { priorita } : {}), ...(attiva !== undefined ? { attiva } : {}) });
    res.status(204).end();
  });

  r.get("/documenti", async (req, res) => {
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
    if (e.esito === "conflitto") return res.status(409).json({ errore: "conflitto", server: e.doc });
    if (!prima) await registra(d, req, a(res).utente.id, "documento.creato", id, { tipo: p.data.tipo });
    res.json(e.doc);
  });

  r.post(
    "/documenti/:id/foto/:fotoId",
    richiedePermesso("documenti.modifica"),
    (req, res, next) => (TIPI_FOTO.has(String(req.get("content-type")).split(";")[0]!.trim()) ? next() : res.status(415).json({ errore: "formato" })),
    express.raw({ type: () => true, limit: MAX_BYTE }),
    async (req, res) => {
      const id = idValido(req.params.id);
      const fotoId = idValido(req.params.fotoId);
      const meta = MetaFoto.safeParse(req.query);
      if (!id || !fotoId || !meta.success || !Buffer.isBuffer(req.body)) return res.status(400).json({ errore: "non_valido" });
      try {
        const e = await d.documenti.caricaFoto(id, fotoId, req.body, meta.data);
        if (e.esito === "non_trovato") return res.status(404).json({ errore: "non_trovato" });
        if (e.esito === "emesso") return res.status(423).json({ errore: "emesso" });
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
    res.status(204).end();
  });

  r.post("/documenti/:id/emetti", richiedePermesso("documenti.emetti"), async (req, res) => {
    const id = idValido(req.params.id);
    const versione = z.number().int().min(1).safeParse(req.body?.versione);
    if (!id || !versione.success) return res.status(400).json({ errore: "non_valido" });
    const e = await d.documenti.emetti(a(res).utente, id, versione.data);
    if (e.esito === "non_trovato") return res.status(404).json({ errore: e.esito });
    if (e.esito === "emesso") return res.status(423).json({ errore: e.esito });
    if (e.esito === "conflitto") return res.status(409).json({ errore: e.esito, server: e.doc });
    if (e.esito === "incompleto") return res.status(422).json({ errore: e.esito, problemi: e.problemi });
    await registra(d, req, a(res).utente.id, "documento.emesso", id, { numero: e.doc.numero, revisione: e.doc.revisione });
    res.json(e.doc);
  });

  r.post("/documenti/:id/revisione", richiedePermesso("documenti.modifica"), async (req, res) => {
    const id = idValido(req.params.id);
    const nuovo = id ? await d.documenti.nuovaRevisione(a(res).utente, id) : null;
    if (!nuovo) return res.status(id ? 409 : 400).json({ errore: "non_emesso" });
    await registra(d, req, a(res).utente.id, "documento.revisione", nuovo, { da: id });
    res.status(201).json({ id: nuovo });
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
    await d.documenti.elimina(doc.id);
    await registra(d, req, u.id, "documento.eliminato", doc.id, { stato: doc.stato, numero: doc.numero });
    res.status(204).end();
  });

  r.use((_req, res) => res.status(404).json({ errore: "non_trovato" }));
  return r;
}
