import type { SchedaFull } from '../schede/service.js';
import { config } from '../config.js';
import { renderModulo } from './pdf.js';
import { campoCheApre, sceltoNellaScheda, SLOTS, type ModuloSlot } from './registry.js';
import { storedValori } from './valori.js';
import { nomeModulo } from './moduli.js';

/**
 * PDF-ът на модул на картата — за свалянето (routes/ordini.ts) и за поръчката до доставчика (invio.ts).
 * Записаната карта пази само видимото: „Sì“ (или отметката, която отваря модула) значи видимо поле;
 * слотът с предимство го затваря; непопълнен модул — null.
 */
export async function moduloDellaScheda(
  scheda: SchedaFull,
  slot: ModuloSlot,
): Promise<{ pdf: Buffer; nome: string; titolo: string } | null> {
  const valueOf = (key: string): unknown => scheda[key as keyof typeof scheda];
  if (
    campoCheApre(slot, valueOf) === undefined ||
    (slot.cede && scheda[slot.cede] === true) ||
    !sceltoNellaScheda(slot, valueOf)
  ) {
    return null;
  }
  const valori = storedValori(slot.modulo, scheda[slot.column]);
  if (!valori) return null;
  const pdf = Buffer.from(await renderModulo(slot.modulo, valori, config().PDF_FONT_DIR));
  const id = scheda.numeroImpianto ?? scheda.matricola ?? scheda.id.slice(-8);
  const nome = `${slot.path}-${id}-${scheda.data.toISOString().slice(0, 10)}.pdf`.replace(
    /[^A-Za-z0-9._-]/g,
    '',
  );
  return { pdf, nome, titolo: nomeModulo(slot.modulo) };
}

export const slotDiPath = (path: unknown): ModuloSlot | undefined =>
  typeof path === 'string' ? SLOTS.find((s) => s.path === path) : undefined;

/** Модулите, които картата има (отворени и попълнени) — за „Invia al fornitore“. */
export function moduliDellaScheda(scheda: SchedaFull): Array<{ path: string; titolo: string }> {
  const valueOf = (key: string): unknown => scheda[key as keyof typeof scheda];
  const visti = new Set<string>();
  const out: Array<{ path: string; titolo: string }> = [];
  for (const slot of SLOTS) {
    if (visti.has(slot.path)) continue;
    if (
      campoCheApre(slot, valueOf) === undefined ||
      (slot.cede && scheda[slot.cede] === true) ||
      !sceltoNellaScheda(slot, valueOf) ||
      !storedValori(slot.modulo, scheda[slot.column])
    )
      continue;
    visti.add(slot.path);
    out.push({ path: slot.path, titolo: nomeModulo(slot.modulo) });
  }
  return out;
}
