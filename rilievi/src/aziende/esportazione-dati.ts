import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

/**
 * `dati.json` на износа, писан на диска раздел по раздел (одитът от 12 ноември 2026): преди целият файл се
 * сглобяваше в паметта с отстъп — фирма с хиляди подписани листа вдигаше портала над тавана му и го сваляше за
 * всички. Големите раздели идват ред по ред от базата (`aPagine`); в паметта стои най-много една страница редове.
 * Резултатът е същият JSON (един ред на запис — чете се и на ръка), размерът се връща за главата на архива.
 */

export type Sezione = unknown | AsyncIterable<unknown>;

const iterabile = (v: unknown): v is AsyncIterable<unknown> =>
  typeof v === 'object' && v !== null && Symbol.asyncIterator in v;

/** Пише `sezioni` като един JSON обект в `percorso`; връща размера в байтове. */
export async function scriviDati(
  percorso: string,
  sezioni: Record<string, Sezione>,
): Promise<number> {
  const out = createWriteStream(percorso, { encoding: 'utf8', mode: 0o600 });
  let bytes = 0;
  const scrivi = async (testo: string): Promise<void> => {
    bytes += Buffer.byteLength(testo);
    if (!out.write(testo)) await once(out, 'drain');
  };
  try {
    await scrivi('{');
    let prima = true;
    for (const [nome, valore] of Object.entries(sezioni)) {
      await scrivi(`${prima ? '' : ','}\n${JSON.stringify(nome)}: `);
      prima = false;
      if (!iterabile(valore)) {
        await scrivi(JSON.stringify(valore ?? null));
        continue;
      }
      await scrivi('[');
      let primaRiga = true;
      for await (const riga of valore) {
        await scrivi(`${primaRiga ? '' : ','}\n${JSON.stringify(riga)}`);
        primaRiga = false;
      }
      await scrivi(primaRiga ? ']' : '\n]');
    }
    await scrivi('\n}\n');
  } finally {
    out.end();
    await once(out, 'close');
  }
  return bytes;
}

/**
 * Таблица на страници: `leggi(dopo)` връща следващите редове след реда с това id (в постоянен ред); спира при
 * по-къса страница. Редът трябва да носи `id`.
 */
export async function* aPagine<T extends { id: string }>(
  leggi: (dopo: string | undefined) => Promise<T[]>,
  perPagina = 200,
): AsyncGenerator<T> {
  let dopo: string | undefined;
  for (;;) {
    const pagina = await leggi(dopo);
    yield* pagina;
    if (pagina.length < perPagina) return;
    dopo = pagina[pagina.length - 1]!.id;
  }
}
