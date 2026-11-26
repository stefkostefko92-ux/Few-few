// StoreDocumenti в паметта — за тестовете (същото поведение като Prisma: версии, атомарност, каскада).
import { randomUUID } from "node:crypto";
import type { DocumentoRiga, FotoRiga, FraseRiga, StoreDocumenti } from "./documenti-types.js";

export function documentiMemory(): StoreDocumenti {
  const doc = new Map<string, DocumentoRiga>();
  const foto = new Map<string, FotoRiga>();
  const frasi = new Map<string, FraseRiga>();
  const numeri = new Map<string, number>();
  const lapidi = new Set<string>();
  const sintesi = ({ intestazione: _i, dati: _d, ...r }: DocumentoRiga) => structuredClone(r);
  const copia = <T>(x: T): T => structuredClone(x);
  return {
    documenti: {
      async elenco({ testo, limite, offset }) {
        const t = testo?.toLowerCase();
        const righe = [...doc.values()]
          .filter((d) => !t || `${d.titolo} ${d.numero ?? ""} ${JSON.stringify(d.intestazione)}`.toLowerCase().includes(t))
          .sort((a, b) => b.aggiornatoIl.getTime() - a.aggiornatoIl.getTime());
        return { righe: righe.slice(offset, offset + limite).map(({ intestazione: _i, dati: _d, ...r }) => copia(r)), totale: righe.length };
      },
      async perId(id) {
        const d = doc.get(id);
        return d ? copia(d) : null;
      },
      async crea(r) {
        if (doc.has(r.id) || lapidi.has(r.id)) throw new Error("documento_esistente");
        if (r.revisioneDi && [...doc.values()].some((d) => d.revisioneDi === r.revisioneDi)) throw new Error("revisione_esistente"); // като @@unique
        const ora = new Date();
        const d = { ...copia(r), creatoIl: ora, aggiornatoIl: ora };
        doc.set(r.id, d);
        return copia(d);
      },
      async aggiorna(id, attesa, patch) {
        const d = doc.get(id);
        if (!d || d.stato !== "BOZZA" || d.versione !== attesa) return null;
        const n = { ...d, ...copia(patch), versione: d.versione + 1, aggiornatoIl: new Date(Math.max(Date.now(), d.aggiornatoIl.getTime() + 1)) };
        doc.set(id, n);
        return copia(n);
      },
      async emetti(id, attesa, e) {
        const d = doc.get(id);
        if (!d || d.stato !== "BOZZA" || d.versione !== attesa) return null;
        const n: DocumentoRiga = { ...d, ...e, stato: "EMESSO", versione: d.versione + 1, aggiornatoIl: new Date() };
        doc.set(id, n);
        return copia(n);
      },
      async elimina(id) {
        doc.delete(id);
        lapidi.add(id);
        for (const [k, f] of foto) if (f.documentoId === id) foto.delete(k);
      },
      async eliminato(id) {
        return lapidi.has(id);
      },
      async figli(id) {
        return [...doc.values()].filter((d) => d.revisioneDi === id).map(sintesi);
      },
      async tutti() {
        return [...doc.values()].slice(0, 10_000).map(sintesi);
      },
      async prossimoNumero(prefisso, anno) {
        const k = `${prefisso}-${anno}`;
        const n = (numeri.get(k) ?? 0) + 1;
        numeri.set(k, n);
        return n;
      },
    },
    foto: {
      async perDocumento(documentoId) {
        return [...foto.values()].filter((f) => f.documentoId === documentoId).sort((a, b) => a.ordine - b.ordine).map(copia);
      },
      async perId(id) {
        const f = foto.get(id);
        return f ? copia(f) : null;
      },
      async crea(r) {
        if (foto.has(r.id)) throw new Error("foto_esistente");
        const f = { ...copia(r), creataIl: new Date() };
        foto.set(r.id, f);
        return copia(f);
      },
      async aggiorna(id, patch) {
        const f = foto.get(id);
        if (f) foto.set(id, { ...f, ...patch });
      },
      async elimina(id) {
        foto.delete(id);
      },
    },
    frasi: {
      async tutte() {
        return [...frasi.values()].sort((a, b) => a.creataIl.getTime() - b.creataIl.getTime()).map(copia);
      },
      async perId(id) {
        const f = frasi.get(id);
        return f ? copia(f) : null;
      },
      async crea(r) {
        const ora = new Date();
        const f: FraseRiga = { ...r, id: randomUUID(), creataIl: ora, aggiornataIl: ora };
        frasi.set(f.id, f);
        return copia(f);
      },
      async aggiorna(id, patch) {
        const f = frasi.get(id);
        if (f) frasi.set(id, { ...f, ...patch, aggiornataIl: new Date() });
      },
    },
  };
}
