import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { ALTEZZA, LARGHEZZA } from '../schizzi/costanti.js';
import { foglioDa, type Foglio } from '../schizzi/model.js';

/**
 * Анотациите върху снимка (собственикът, 12 ноември 2026 — точка C5): елементите на скицника (линии, стрелки,
 * надписи, коти, кръгове…), нарисувани в редактора на цял екран над снимката. Листът е 1400 × 1000 като на
 * скицника; снимката стои в него цяла и в средата (`rettangoloFoto`), затова същите числа дават наслагването в
 * печата, в PDF-а (прозорецът е снимката) и в плочката на галерията (прозорецът е изрязаното 4:3 в средата).
 * Проверката е тази на листа на скицника (`foglioDa` — zod, таваните на броя, тежестта и размера).
 */

export interface Rettangolo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Къде стои снимката на листа: цяла, в средата — както я показва редакторът. */
export function rettangoloFoto(larghezza: number, altezza: number): Rettangolo {
  if (!(larghezza > 0 && altezza > 0)) return { x: 0, y: 0, w: LARGHEZZA, h: ALTEZZA };
  // Умножение преди деление: точните случаи (снимка 1400 × 1000, 2000 × 1000) остават точни.
  if (larghezza * ALTEZZA >= altezza * LARGHEZZA) {
    const h = (LARGHEZZA * altezza) / larghezza;
    return { x: 0, y: (ALTEZZA - h) / 2, w: LARGHEZZA, h };
  }
  const w = (ALTEZZA * larghezza) / altezza;
  return { x: (LARGHEZZA - w) / 2, y: 0, w, h: ALTEZZA };
}

/** Частта от снимката, която показва плочка с пропорция `aspetto` (изрязано в средата, `cover`). */
export function finestraRiquadro(foto: Rettangolo, aspetto: number): Rettangolo {
  if (foto.w / foto.h > aspetto) {
    const w = foto.h * aspetto;
    return { x: foto.x + (foto.w - w) / 2, y: foto.y, w, h: foto.h };
  }
  const h = foto.w / aspetto;
  return { x: foto.x, y: foto.y + (foto.h - h) / 2, w: foto.w, h };
}

/** Записаното (или пратеното) като лист; празен лист или неверен — null (без анотации). */
export function annotazioniDa(value: unknown): Foglio | null {
  if (value === null || value === undefined) return null;
  const foglio = foglioDa(value);
  return foglio && foglio.e.length > 0 ? foglio : null;
}

/** Пропорцията на плочката в галерията (allegati.css — `aspect-ratio: 4 / 3`). */
export const ASPETTO_RIQUADRO = 4 / 3;

/** Прозорецът на наслагването като `viewBox`: печатът и PDF-ът — снимката, плочката — изрязаното 4:3. */
export function viewBoxAnnotazioni(
  a: { larghezza: number | null; altezza: number | null },
  riquadro: boolean,
): string {
  const foto = rettangoloFoto(a.larghezza ?? 0, a.altezza ?? 0);
  const r = riquadro ? finestraRiquadro(foto, ASPETTO_RIQUADRO) : foto;
  return [r.x, r.y, r.w, r.h].map((n) => Number(n.toFixed(3))).join(' ');
}

/**
 * Записва анотациите на снимка от картата (null — маха ги); false — няма такава готова снимка. Версията на
 * картата не се мести (снимките са отделно от формата ѝ). Одитът — само броят на елементите.
 */
export async function salvaAnnotazioni(options: {
  actorId: string;
  aziendaId: string;
  schedaId: string;
  allegatoId: string;
  foglio: Foglio | null;
}): Promise<boolean> {
  const { actorId, aziendaId, schedaId, allegatoId, foglio } = options;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.allegato.updateMany({
      where: { id: allegatoId, schedaId, tipo: 'FOTO', stato: 'PRONTO' },
      data: {
        annotazioni: foglio ? (foglio as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
      },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'ALLEGATO_ANNOTAZIONI',
        aziendaId,
        targetType: 'scheda',
        targetId: schedaId,
        meta: { elementi: foglio ? foglio.e.length : 0 },
      },
      tx,
    );
    return true;
  });
}
