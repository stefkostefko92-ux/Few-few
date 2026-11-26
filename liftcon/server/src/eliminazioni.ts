// Списъкът на изтриванията — извън бекъпите (docs/documenti-spec.md D16а, решение L6-B). Ред JSON на изтриване:
// вид, id (и документът на снимката), час — без лични данни. Записва се ПРЕДИ изтриването; при всеки старт се
// прилага пак, за да не върне възстановен бекъп изтрит документ, снимка или заявка.
import { access, open, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Store } from "./store/types.js";
import type { Archivio } from "./documenti/archivio.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RICHIESTA = /^[A-Za-z0-9_-]{1,64}$/;

const Il = z.string().max(40);
const Voce = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("documento"), id: z.string().regex(UUID), il: Il }).strict(),
  z.object({ tipo: z.literal("foto"), id: z.string().regex(UUID), doc: z.string().regex(UUID), il: Il }).strict(),
  z.object({ tipo: z.literal("richiesta"), id: z.string().regex(ID_RICHIESTA), il: Il }).strict(),
]);
export type VoceEliminazione = z.infer<typeof Voce>;
/** Какво се изтрива (без часа — него слага списъкът). */
export type Eliminazione = { tipo: "documento" | "richiesta"; id: string } | { tipo: "foto"; id: string; doc: string };
export type EsitoRiapplica = { documenti: number; richieste: number; foto: number; scartate: number };

/** Събитията в регистъра, които доказват, че е имало изтривания (за изгубен списък при старт). */
const AZIONI_ELIMINAZIONE = ["documento.eliminato", "richiesta.eliminata", "foto.eliminata"];

export interface RegistroEliminazioni {
  /** Добавя ред, записан на диска (fsync); хвърля при невалиден id или неуспешен запис (тогава изтриването спира). */
  annota(e: Eliminazione): Promise<void>;
  /** Валидните редове и броят на прескочените (невалидни). Липсващ файл = празен списък. */
  leggi(): Promise<{ voci: VoceEliminazione[]; scartate: number }>;
  /** Папката съществува и може да се чете и пише — иначе приложението не тръгва (fail closed). */
  verifica(): Promise<void>;
  esiste(): Promise<boolean>;
  /** Празен файл (600), ако липсва; съществуващ не се пипа. */
  crea(): Promise<void>;
}

export function registroEliminazioni(dir: string, now: () => number = Date.now): RegistroEliminazioni {
  const file = join(dir, "eliminazioni.jsonl");
  return {
    async annota(e) {
      const voce = Voce.parse({ ...e, il: new Date(now()).toISOString() });
      // Нов ред и преди записа: прекъснат предишен запис (диск пълен, срив) не слепва този ред с него.
      const fh = await open(file, "a", 0o600);
      try {
        await fh.write(`\n${JSON.stringify(voce)}\n`);
        await fh.sync();
      } finally {
        await fh.close();
      }
    },
    async leggi() {
      let testo: string;
      try {
        testo = await readFile(file, "utf8");
      } catch (err) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") return { voci: [], scartate: 0 };
        throw err;
      }
      const voci: VoceEliminazione[] = [];
      let scartate = 0;
      for (const riga of testo.split("\n")) {
        if (!riga.trim()) continue;
        const v = Voce.safeParse(analizza(riga));
        if (v.success) voci.push(v.data);
        else scartate++;
      }
      return { voci, scartate };
    },
    async verifica() {
      await access(dir, constants.R_OK | constants.W_OK);
    },
    async esiste() {
      try {
        await access(file);
        return true;
      } catch {
        return false;
      }
    },
    async crea() {
      await (await open(file, "a", 0o600)).close();
    },
  };
}

function analizza(riga: string): unknown {
  try {
    return JSON.parse(riga);
  } catch {
    return null;
  }
}

/**
 * Прилага списъка пак (при старт, преди приложението да приема заявки). Идемпотентно: вече изтритото се
 * прескача; файловете на документа се трият и когато редът му липсва в базата (по-стар дъмп, по-нова снимка
 * на файловете), а надгробният запис остава, за да не го създаде устройство отново.
 */
export async function riapplicaEliminazioni(d: DipendenzeEliminazioni): Promise<EsitoRiapplica> {
  const { voci, scartate } = await d.registro.leggi();
  const viste = new Set<string>();
  let documenti = 0;
  let richieste = 0;
  let foto = 0;
  for (const v of voci) {
    const chiave = `${v.tipo}:${v.id}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    if (v.tipo === "documento") {
      const presente = (await d.store.documenti.perId(v.id)) !== null;
      if (presente || !(await d.store.documenti.eliminato(v.id))) await d.store.documenti.elimina(v.id);
      await d.archivio.eliminaDocumento(v.id);
      if (presente) documenti++;
    } else if (v.tipo === "foto") {
      const f = await d.store.foto.perId(v.id);
      if (f && f.documentoId === v.doc) {
        await d.store.foto.elimina(v.id);
        foto++;
      }
      await d.archivio.eliminaFoto(v.doc, v.id);
    } else if (await d.store.richieste.perId(v.id)) {
      await d.store.richieste.elimina(v.id);
      richieste++;
    }
  }
  return { documenti, richieste, foto, scartate };
}

type DipendenzeEliminazioni = { store: Store; archivio: Archivio; registro: RegistroEliminazioni };

/**
 * При старт, преди приложението да приема заявки: папката (R/W) → файлът → повторното прилагане. Липсващ файл при
 * база, която помни изтривания (надгробни записи, събития), значи изгубен списък — тогава НЕ тръгваме: изтритото
 * след последния бекъп би се върнало тихо. Без следи (първи старт) файлът се създава празен.
 */
export async function avviaEliminazioni(d: DipendenzeEliminazioni): Promise<EsitoRiapplica> {
  await d.registro.verifica();
  if (!(await d.registro.esiste())) {
    const tracce = (await d.store.documenti.contaEliminati()) + (await d.store.eventi.conta(AZIONI_ELIMINAZIONE));
    if (tracce > 0) {
      throw new Error(
        `списъкът eliminazioni.jsonl липсва, а базата помни изтривания (${tracce}) — приложението не тръгва, за да не върне изтрито. Върнете файла от копието; ако е изгубен и приемате риска — liftcon/DEPLOY.md, „Ако нещо се обърка“.`,
      );
    }
    await d.registro.crea();
  }
  return riapplicaEliminazioni(d);
}
