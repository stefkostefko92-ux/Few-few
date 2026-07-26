// Хранилището на прикачените файлове — четене и запис по диска.
//
// Отделено от `tipi.ts` (чисти решения) и от маршрутите (HTTP), за да може
// правилата да се тестват без файлова система, а файловата система да се сменя
// без да се пипат правилата.
//
// КОРЕНЪТ Е ИЗВЪН РЕПОТО И ИЗВЪН ПУБЛИЧНАТА ПАПКА. Ако файловете стоят под
// `public/`, всеки качен документ става свободно достъпен на познат адрес — а
// тук се качват сертификати и протоколи с лични данни. Раздаването минава през
// маршрут, който проверява ролята и фирмата.

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Коренът на хранилището.
 *
 * По подразбиране е извън дървото на приложението. В контейнера е том, който
 * ВЛИЗА В БЕКЪПА: базата без файловете е половин архив, а протоколът от
 * проверката е доказателство.
 */
export function radiceArchivio(): string {
  return resolve(process.env.STORAGE_DIR ?? "/var/lib/erp-ascensori/allegati");
}

/**
 * Абсолютният път на файл — с изрична проверка, че остава ПОД корена.
 *
 * Пътищата се строят от наши стойности (виж `percorsoRelativo`), тоест
 * обхождане не би трябвало да е възможно. Проверката пак стои: цената ѝ е
 * нулева, а без нея една бъдеща промяна в строенето на пътя мълчаливо отваря
 * четене на произволен файл от сървъра.
 */
export function percorsoAssoluto(relativo: string): string {
  const radice = radiceArchivio();
  const completo = resolve(radice, relativo);
  if (completo !== radice && !completo.startsWith(radice + sep))
    throw new Error("percorso fuori dall'archivio");
  return completo;
}

export function impronta(dati: Uint8Array): string {
  return createHash("sha256").update(dati).digest("hex");
}

export async function salva(relativo: string, dati: Uint8Array): Promise<void> {
  const completo = percorsoAssoluto(relativo);
  await mkdir(dirname(completo), { recursive: true });
  // `wx`: отказва да презапише съществуващ файл. Пътят носи UUID, тоест сблъсък
  // не се очаква — а ако все пак стане, по-добре грешка, отколкото тихо
  // изгубено доказателство.
  await writeFile(completo, dati, { flag: "wx" });
}

export async function leggi(relativo: string): Promise<Buffer> {
  return readFile(percorsoAssoluto(relativo));
}

/**
 * Трие файла.
 *
 * Липсващият файл НЕ е грешка: редът в базата е истината за това какво е било
 * качено, а изтриването трябва да е идемпотентно, за да може да се повтори
 * след прекъснат опит.
 */
export async function elimina(relativo: string): Promise<void> {
  try {
    await unlink(percorsoAssoluto(relativo));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/** Готово ли е хранилището за писане — влиза в здравния маршрут. */
export async function archivioScrivibile(): Promise<{
  ok: boolean;
  motivo?: string;
}> {
  const radice = radiceArchivio();
  try {
    await mkdir(join(radice, ".prova"), { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}
