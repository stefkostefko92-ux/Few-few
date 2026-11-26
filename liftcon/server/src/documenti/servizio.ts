// Логиката на документите (docs/documenti-spec.md): записване с версии (409 при конфликт), снимки
// (идемпотентно по id), издаване с номер и PDF, ревизия, дубликат, изтриване. Правата се проверяват в маршрутите.
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { Store, Utente } from "../store/types.js";
import type { DocumentoRiga, FotoRiga } from "../store/documenti-types.js";
import type { Archivio } from "./archivio.js";
import type { Catalogo } from "./condiviso/catalogo/index.js";
import type { DocumentoCompleto, Foto, Intestazione, TipoDocumento } from "./condiviso/tipi.js";
import { componi } from "./condiviso/componi.js";
import { completezza } from "./condiviso/completezza.js";
import { datiVuoti, nuovoDocumento } from "./condiviso/nuovo.js";
import { PREFISSI } from "./condiviso/testi.js";
import { DATI_PER_TIPO, DocumentoInSchema } from "./schema.js";
import { elaboraFoto } from "./foto.js";
import { generaPdf } from "./pdf/index.js";
import type { z } from "zod";

export type DocumentoIn = z.infer<typeof DocumentoInSchema>;

export type EsitoSalva =
  | { esito: "ok"; doc: DocumentoCompleto }
  | { esito: "conflitto"; doc: DocumentoCompleto }
  | { esito: "emesso" }
  | { esito: "eliminato" }
  | { esito: "occupato" }
  | { esito: "non_valido"; campi: string[] };

const fotoMeta = (f: FotoRiga): Foto => ({ id: f.id, ordine: f.ordine, didascalia: f.didascalia, ubicazione: f.ubicazione, riferimento: f.riferimento, larghezza: f.larghezza, altezza: f.altezza });

/** Подменя id-тата на снимките във всички масиви `foto` на данните (за новата ревизия с копирани снимки). */
function rimappaFoto(v: unknown, mappa: Map<string, string> | null): unknown {
  if (Array.isArray(v)) return v.map((x) => rimappaFoto(x, mappa));
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        k === "foto" && Array.isArray(x) ? (mappa ? x.map((id) => mappa.get(String(id))).filter(Boolean) : []) : rimappaFoto(x, mappa),
      ]),
    );
  }
  return v;
}

export function servizioDocumenti(o: { store: Store; archivio: Archivio; catalogo: Catalogo; now: () => number }) {
  const { store, archivio } = o;
  // Едно api (docker-compose) → ключалките в паметта стигат: издаването на документ и качването/триенето на
  // снимките му не се застъпват (иначе: номер без документ, снимка извън издадения PDF).
  const inEmissione = new Set<string>();
  const fotoInCorso = new Map<string, number>();
  const occupato = (id: string) => inEmissione.has(id);

  function completo(r: DocumentoRiga, foto: FotoRiga[]): DocumentoCompleto {
    return {
      id: r.id,
      tipo: r.tipo,
      stato: r.stato,
      numero: r.numero,
      revisione: r.revisione,
      versione: r.versione,
      intestazione: r.intestazione as Intestazione,
      dati: r.dati as DocumentoCompleto["dati"],
      foto: foto.map(fotoMeta),
      autore: { nome: r.autoreNome, qualifica: r.autoreQualifica },
      emessoIl: r.emessoIl ? r.emessoIl.toISOString() : null,
    };
  }

  async function carica(id: string): Promise<DocumentoCompleto | null> {
    const r = await store.documenti.perId(id);
    return r ? completo(r, await store.foto.perDocumento(id)) : null;
  }

  async function nuovo(u: Utente, tipo: TipoDocumento, intestazione: Intestazione, dati: unknown, extra: Partial<DocumentoRiga> = {}): Promise<DocumentoRiga> {
    return store.documenti.crea({
      id: randomUUID(),
      tipo,
      stato: "BOZZA",
      numero: null,
      revisione: 0,
      revisioneDi: null,
      versione: 1,
      titolo: intestazione.titolo,
      intestazione,
      dati,
      richiestaId: null,
      autoreId: u.id,
      autoreNome: u.nome,
      autoreQualifica: u.qualifica,
      emessoIl: null,
      pdfSha256: null,
      ...extra,
    });
  }

  return {
    catalogo: o.catalogo,
    carica,

    async elenco(testo: string | undefined, pagina: number) {
      return store.documenti.elenco({ testo, limite: 50, offset: (pagina - 1) * 50 });
    },

    /** Създаване (versione 0) или запис на чернова с проверка на версията. */
    async salva(u: Utente, id: string, input: DocumentoIn): Promise<EsitoSalva> {
      // По време на издаване записът би вдигнал версията и номерът би се изгубил → устройството опитва пак.
      if (occupato(id)) return { esito: "occupato" };
      const dati = DATI_PER_TIPO[input.tipo].safeParse(input.dati);
      if (!dati.success) return { esito: "non_valido", campi: dati.error.issues.map((i) => i.path.join(".")).slice(0, 20) };
      const esistente = await store.documenti.perId(id);
      if (!esistente) {
        if (await store.documenti.eliminato(id)) return { esito: "eliminato" };
        if (input.versione !== 0) return { esito: "conflitto", doc: nuovoDocumento(input.tipo, id) };
        const richiestaId = input.richiestaId && (await store.richieste.perId(input.richiestaId)) ? input.richiestaId : null;
        await store.documenti.crea({
          id, tipo: input.tipo, stato: "BOZZA", numero: null, revisione: 0, revisioneDi: null, versione: 1, titolo: input.intestazione.titolo,
          intestazione: input.intestazione, dati: dati.data, richiestaId, autoreId: u.id, autoreNome: u.nome,
          autoreQualifica: u.qualifica, emessoIl: null, pdfSha256: null,
        });
      } else {
        if (esistente.tipo !== input.tipo) return { esito: "non_valido", campi: ["tipo"] };
        if (esistente.stato !== "BOZZA") return { esito: "emesso" };
        const r = await store.documenti.aggiorna(id, input.versione, { titolo: input.intestazione.titolo, intestazione: input.intestazione, dati: dati.data });
        if (!r) {
          const ora = await carica(id);
          return ora?.stato === "EMESSO" ? { esito: "emesso" } : { esito: "conflitto", doc: ora! };
        }
      }
      // Само метаданните на вече качените снимки на този документ; триенето е отделна заявка.
      const proprie = new Set((await store.foto.perDocumento(id)).map((f) => f.id));
      for (const f of input.foto) {
        if (proprie.has(f.id)) await store.foto.aggiorna(f.id, { ordine: f.ordine, didascalia: f.didascalia, ubicazione: f.ubicazione, riferimento: f.riferimento });
      }
      return { esito: "ok", doc: (await carica(id))! };
    },

    /** Снимка: идемпотентно по id (повторно качване връща същата). Не и докато документът се издава. */
    async caricaFoto(docId: string, fotoId: string, corpo: Buffer, meta: { ordine: number; didascalia: string; ubicazione: string; riferimento: string }) {
      if (occupato(docId)) return { esito: "occupato" as const };
      fotoInCorso.set(docId, (fotoInCorso.get(docId) ?? 0) + 1); // синхронно, преди първия await
      try {
        const doc = await store.documenti.perId(docId);
        if (!doc) return { esito: "non_trovato" as const };
        const esistente = await store.foto.perId(fotoId);
        if (esistente) return esistente.documentoId === docId ? { esito: "esistente" as const, foto: fotoMeta(esistente) } : { esito: "non_trovato" as const };
        if (doc.stato !== "BOZZA") return { esito: "emesso" as const };
        const e = await elaboraFoto(corpo);
        await archivio.salvaFoto(docId, fotoId, e.file, e.mini);
        try {
          const f = await store.foto.crea({ id: fotoId, documentoId: docId, ...meta, larghezza: e.larghezza, altezza: e.altezza, byte: e.file.length, sha256: e.sha256 });
          return { esito: "creata" as const, foto: fotoMeta(f) };
        } catch (err) {
          // Паралелно качване със същия id: вторият запис отпада, файлът е същият.
          const f = await store.foto.perId(fotoId);
          if (f && f.documentoId === docId) return { esito: "esistente" as const, foto: fotoMeta(f) };
          throw err;
        }
      } finally {
        const n = (fotoInCorso.get(docId) ?? 1) - 1;
        if (n > 0) fotoInCorso.set(docId, n);
        else fotoInCorso.delete(docId);
      }
    },

    async eliminaFoto(docId: string, fotoId: string): Promise<"ok" | "non_trovato" | "emesso" | "occupato"> {
      if (occupato(docId)) return "occupato";
      fotoInCorso.set(docId, (fotoInCorso.get(docId) ?? 0) + 1); // като при качването: издаването чака
      try {
        const [doc, f] = await Promise.all([store.documenti.perId(docId), store.foto.perId(fotoId)]);
        if (!doc || !f || f.documentoId !== docId) return "non_trovato";
        if (doc.stato !== "BOZZA") return "emesso";
        await store.foto.elimina(fotoId);
        await archivio.eliminaFoto(docId, fotoId);
        return "ok";
      } finally {
        const n = (fotoInCorso.get(docId) ?? 1) - 1;
        if (n > 0) fotoInCorso.set(docId, n);
        else fotoInCorso.delete(docId);
      }
    },

    async pdf(d: DocumentoCompleto): Promise<Buffer> {
      if (d.stato === "EMESSO" && d.numero) return archivio.leggiPdf(d.id, d.numero, d.revisione);
      return generaPdf(d, componi(d, o.catalogo), { leggiMini: (f) => archivio.leggiFoto(d.id, f, true).catch(() => null) });
    },

    /** Издаване: пълнота → номер (същият за ревизиите) → PDF на диска → заключване. */
    async emetti(u: Utente, id: string, versione: number) {
      // Ключалката се взима синхронно, преди първия await: второ „Emetti“ (двойно докосване, друго устройство)
      // получава 409, без да изразходва номер.
      if (occupato(id) || (fotoInCorso.get(id) ?? 0) > 0) return { esito: "occupato" as const };
      inEmissione.add(id);
      try {
        return await emettiSenzaLock(u, id, versione);
      } finally {
        inEmissione.delete(id);
      }
    },

    nuovaRevisione,
    duplica,
    daRichiesta,
    elimina,
    leggiFoto,
  };

  async function emettiSenzaLock(u: Utente, id: string, versione: number) {
    const d = await carica(id);
    if (!d) return { esito: "non_trovato" as const };
    if (d.stato !== "BOZZA") return { esito: "emesso" as const };
    if (d.versione !== versione) return { esito: "conflitto" as const, doc: d };
    const problemi = completezza(d);
    if (problemi.length) return { esito: "incompleto" as const, problemi };
    let numero: string | null = null;
    const prima = (await store.documenti.perId(id))?.revisioneDi;
    if (prima) numero = (await store.documenti.perId(prima))?.numero ?? null;
    if (!numero) {
      const anno = new Date(o.now()).getUTCFullYear();
      numero = `${PREFISSI[d.tipo]}-${anno}-${String(await store.documenti.prossimoNumero(PREFISSI[d.tipo], anno)).padStart(3, "0")}`;
    }
    const emessoIl = new Date(o.now());
    const autore = { nome: u.nome, qualifica: u.qualifica };
    const definitivo: DocumentoCompleto = { ...d, stato: "EMESSO", numero, emessoIl: emessoIl.toISOString(), autore };
    const pdf = await generaPdf(definitivo, componi(definitivo, o.catalogo), { leggiMini: (f) => archivio.leggiFoto(id, f, true).catch(() => null) });
    await archivio.salvaPdf(id, numero, d.revisione, pdf);
    const r = await store.documenti.emetti(id, versione, { numero, emessoIl, pdfSha256: createHash("sha256").update(pdf).digest("hex"), autoreNome: u.nome, autoreQualifica: u.qualifica });
    if (!r) return { esito: "conflitto" as const, doc: (await carica(id))! };
    return { esito: "ok" as const, doc: (await carica(id))! };
  }

  /**
   * Нова ревизия: тръгва от последната издадена във веригата; ако вече има чернова — връща нея (без втора
   * Rev. n+1, която после не може да се издаде). Данните и снимките (копирани) са на последната издадена.
   */
  async function nuovaRevisione(u: Utente, id: string): Promise<{ id: string; esistente: boolean } | null> {
    let d = await store.documenti.perId(id);
    if (!d || d.stato !== "EMESSO") return null;
    for (let passi = 0; passi < 100; passi++) {
      const figli = await store.documenti.figli(d.id);
      const bozza = figli.find((f) => f.stato === "BOZZA");
      if (bozza) return { id: bozza.id, esistente: true };
      const successiva = figli.find((f) => f.stato === "EMESSO");
      if (!successiva) break;
      d = (await store.documenti.perId(successiva.id))!;
    }
    const base = d;
    const foto = await store.foto.perDocumento(base.id);
    const mappa = new Map(foto.map((f) => [f.id, randomUUID()]));
    let r: DocumentoRiga;
    try {
      r = await nuovo(u, base.tipo, base.intestazione as Intestazione, rimappaFoto(base.dati, mappa), { revisione: base.revisione + 1, revisioneDi: base.id, richiestaId: base.richiestaId });
    } catch (err) {
      // Паралелна заявка вече е създала черновата (@@unique([revisioneDi])) → връщаме нея.
      const bozza = (await store.documenti.figli(base.id)).find((f) => f.stato === "BOZZA");
      if (bozza) return { id: bozza.id, esistente: true };
      throw err;
    }
    for (const f of foto) {
      const nuovoId = mappa.get(f.id)!;
      await archivio.copiaFoto(base.id, r.id, f.id, nuovoId);
      await store.foto.crea({ ...f, id: nuovoId, documentoId: r.id });
    }
    return { id: r.id, esistente: false };
  }

  /** Дубликат за друга уредба в същата сграда: заглавната част без матрикула, празни данни, без снимки. */
  async function duplica(u: Utente, id: string): Promise<string | null> {
    const d = await store.documenti.perId(id);
    if (!d) return null;
    const i = structuredClone(d.intestazione as Intestazione);
    i.impianto.matricola = "";
    i.impianto.note = "";
    return (await nuovo(u, d.tipo, i, datiVuoti(d.tipo), { richiestaId: d.richiestaId })).id;
  }

  /** Нов документ от заявка от формата: възложителят и общината се попълват сами (D2). */
  async function daRichiesta(u: Utente, tipo: TipoDocumento, r: { id: string; nome: string; email: string; telefono: string; ruolo: string; comune: string }): Promise<string> {
    const base = nuovoDocumento(tipo, "");
    const i = base.intestazione;
    i.committente = { ...i.committente, nome: r.nome, email: r.email, telefono: r.telefono, qualita: r.ruolo };
    i.impianto.comune = r.comune;
    return (await nuovo(u, tipo, i, base.dati, { richiestaId: r.id })).id;
  }

  /** Изтриване (GDPR): документът, снимките и PDF-ите; остава надгробен запис само с id. */
  async function elimina(id: string): Promise<void> {
    await store.documenti.elimina(id);
    await archivio.eliminaDocumento(id);
  }

  async function leggiFoto(docId: string, fotoId: string, mini: boolean): Promise<Buffer | null> {
    const f = await store.foto.perId(fotoId);
    if (!f || f.documentoId !== docId) return null;
    return archivio.leggiFoto(docId, fotoId, mini).catch(() => null);
  }
}

export type ServizioDocumenti = ReturnType<typeof servizioDocumenti>;
