// Файловете на документите на диска: DATA_DIR/documenti/<id на документа>/<id на снимката>(-mini).jpg и
// pdf/<номер>-rev<n>.pdf. Всички id-та са проверени UUID (schema.ts) → пътят не може да излезе от папката.
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const UUID = /^[0-9a-f-]{36}$/i;

export function archivio(dataDir: string) {
  const radice = join(dataDir, "documenti");
  const cartella = (docId: string) => {
    if (!UUID.test(docId)) throw new Error("id documento non valido");
    return join(radice, docId);
  };
  const percorsoFoto = (docId: string, fotoId: string, mini = false) => {
    if (!UUID.test(fotoId)) throw new Error("id foto non valido");
    return join(cartella(docId), `${fotoId}${mini ? "-mini" : ""}.jpg`);
  };
  const nomePdf = (numero: string, revisione: number) => `${numero.replace(/[^A-Za-z0-9-]/g, "")}-rev${revisione}.pdf`;
  const percorsoPdf = (docId: string, numero: string, revisione: number) => join(cartella(docId), "pdf", nomePdf(numero, revisione));

  /** Атомарен запис: временен файл в същата папка → rename. */
  async function scrivi(path: string, dati: Buffer): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, dati, { mode: 0o640 });
    await rename(tmp, path);
  }

  return {
    percorsoFoto,
    percorsoPdf,
    nomePdf,
    async salvaFoto(docId: string, fotoId: string, file: Buffer, mini: Buffer) {
      await scrivi(percorsoFoto(docId, fotoId), file);
      await scrivi(percorsoFoto(docId, fotoId, true), mini);
    },
    leggiFoto: (docId: string, fotoId: string, mini = false) => readFile(percorsoFoto(docId, fotoId, mini)),
    async eliminaFoto(docId: string, fotoId: string) {
      await rm(percorsoFoto(docId, fotoId), { force: true });
      await rm(percorsoFoto(docId, fotoId, true), { force: true });
    },
    async copiaFoto(daDoc: string, aDoc: string, daFoto: string, aFoto: string) {
      await mkdir(cartella(aDoc), { recursive: true });
      await copyFile(percorsoFoto(daDoc, daFoto), percorsoFoto(aDoc, aFoto));
      await copyFile(percorsoFoto(daDoc, daFoto, true), percorsoFoto(aDoc, aFoto, true));
    },
    salvaPdf: (docId: string, numero: string, revisione: number, pdf: Buffer) => scrivi(percorsoPdf(docId, numero, revisione), pdf),
    leggiPdf: (docId: string, numero: string, revisione: number) => readFile(percorsoPdf(docId, numero, revisione)),
    eliminaDocumento: (docId: string) => rm(cartella(docId), { recursive: true, force: true }),
  };
}

export type Archivio = ReturnType<typeof archivio>;
