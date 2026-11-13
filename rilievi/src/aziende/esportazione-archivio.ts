import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import type { FileGenerato } from './esportazione-documenti.js';
import { fineTar, intestazioneTar, riempimentoTar } from './tar.js';

/**
 * Тялото на архива на фирмата (.tar, поток): `dati.json` от диска (esportazione-dati.ts), логото, готовите
 * снимки и клипове от тома и генерираните документи — един по един, нищо цяло в паметта освен текущия файл.
 */

export interface FileNelTar {
  nome: string;
  percorso: string;
}

export async function* contenuto(
  base: string,
  dati: { percorso: string; bytes: number },
  logo: { data: Buffer; nome: string } | null,
  files: readonly FileNelTar[],
  generati: readonly FileGenerato[],
): AsyncGenerator<Buffer> {
  try {
    yield* corpo(base, dati, logo, files, generati);
  } finally {
    // И при прекъснато сваляне: `dati.json` на диска не остава.
    await rm(dati.percorso, { force: true }).catch(() => undefined);
  }
}

async function* corpo(
  base: string,
  dati: { percorso: string; bytes: number },
  logo: { data: Buffer; nome: string } | null,
  files: readonly FileNelTar[],
  generati: readonly FileGenerato[],
): AsyncGenerator<Buffer> {
  const now = new Date();
  yield intestazioneTar(`${base}/dati.json`, dati.bytes, now);
  for await (const chunk of createReadStream(dati.percorso)) yield chunk as Buffer;
  yield riempimentoTar(dati.bytes);
  if (logo) {
    yield intestazioneTar(`${base}/${logo.nome}`, logo.data.length, now);
    yield logo.data;
    yield riempimentoTar(logo.data.length);
  }
  for (const file of files) {
    // Файл, който междувременно е изтрит, просто липсва — в dati.json остава описанието му.
    const info = await stat(file.percorso).catch(() => null);
    if (!info?.isFile()) continue;
    yield intestazioneTar(`${base}/${file.nome}`, info.size, info.mtime);
    let sent = 0;
    for await (const chunk of createReadStream(file.percorso, { end: info.size - 1 })) {
      const part = chunk as Buffer;
      sent += part.length;
      yield part;
    }
    // Размерът е в главата: по-къс файл се допълва, за да не се развали архивът след него.
    if (sent < info.size) yield Buffer.alloc(info.size - sent);
    yield riempimentoTar(info.size);
  }
  // PDF/A-тата и версиите — един по един: размерът е в главата, затова файлът е цял, преди да тръгне.
  for (const file of generati) {
    const dati = await file.genera();
    if (!dati) continue;
    yield intestazioneTar(`${base}/${file.nome}`, dati.length, now);
    yield dati;
    yield riempimentoTar(dati.length);
  }
  yield fineTar();
}

/** Частите на `dati.json`, прочетени от базата (без тайни — formato.ts). */
