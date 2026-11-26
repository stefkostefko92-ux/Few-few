// Списъкът на изтриванията — извън бекъпите (docs/documenti-spec.md D16а, решение L6-B). Ред JSON на изтриване:
// вид, id, час — без лични данни. Записва се ПРЕДИ изтриването; при всеки старт се прилага пак, за да не върне
// възстановен бекъп изтрит документ или заявка.
import { access, appendFile, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Store } from "./store/types.js";
import type { Archivio } from "./documenti/archivio.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RICHIESTA = /^[A-Za-z0-9_-]{1,64}$/;

const Voce = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("documento"), id: z.string().regex(UUID), il: z.string().max(40) }).strict(),
  z.object({ tipo: z.literal("richiesta"), id: z.string().regex(ID_RICHIESTA), il: z.string().max(40) }).strict(),
]);
export type VoceEliminazione = z.infer<typeof Voce>;
export type TipoEliminazione = VoceEliminazione["tipo"];

export interface RegistroEliminazioni {
  /** Добавя ред; хвърля, ако id-то е невалидно или файлът не може да се запише (тогава изтриването спира). */
  annota(tipo: TipoEliminazione, id: string): Promise<void>;
  /** Валидните редове и броят на прескочените (невалидни). Липсващ файл = празен списък. */
  leggi(): Promise<{ voci: VoceEliminazione[]; scartate: number }>;
  /** Папката съществува и може да се чете и пише — иначе приложението не тръгва (fail closed). */
  verifica(): Promise<void>;
}

export function registroEliminazioni(dir: string, now: () => number = Date.now): RegistroEliminazioni {
  const file = join(dir, "eliminazioni.jsonl");
  return {
    async annota(tipo, id) {
      const voce = Voce.parse({ tipo, id, il: new Date(now()).toISOString() });
      await appendFile(file, `${JSON.stringify(voce)}\n`, { mode: 0o600 });
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
export async function riapplicaEliminazioni(d: { store: Store; archivio: Archivio; registro: RegistroEliminazioni }): Promise<{ documenti: number; richieste: number; scartate: number }> {
  const { voci, scartate } = await d.registro.leggi();
  const viste = new Set<string>();
  let documenti = 0;
  let richieste = 0;
  for (const v of voci) {
    const chiave = `${v.tipo}:${v.id}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    if (v.tipo === "documento") {
      const presente = (await d.store.documenti.perId(v.id)) !== null;
      if (presente || !(await d.store.documenti.eliminato(v.id))) await d.store.documenti.elimina(v.id);
      await d.archivio.eliminaDocumento(v.id);
      if (presente) documenti++;
    } else if (await d.store.richieste.perId(v.id)) {
      await d.store.richieste.elimina(v.id);
      richieste++;
    }
  }
  return { documenti, richieste, scartate };
}
