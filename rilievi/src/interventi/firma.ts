import { z } from 'zod';

/**
 * Подписът с пръст на листа за интервенция: щрихите в поле 600 × 200 (public/js/firma.js) — масив от
 * щрихи, всеки е поредица x, y (цели числа в полето). Пази се така, не като картинка: проверява се по
 * числа, рисува се еднакво в страницата (SVG) и в PDF-а, и е малък.
 */
export const FIRMA_W = 600;
export const FIRMA_H = 200;
const MAX_STRICHI = 200;
const MAX_PUNTI = 6000;
/** Пратеният JSON на един подпис — таван преди разбора. */
export const MAX_FIRMA_JSON = 64 * 1024;

const coord = (max: number) => z.number().int().min(0).max(max);

const strokeSchema = z
  .array(z.number())
  .min(2)
  .refine((points) => points.length % 2 === 0, 'pairs')
  .refine((points) =>
    points.every((value, i) => coord(i % 2 === 0 ? FIRMA_W : FIRMA_H).safeParse(value).success),
  );

const firmaSchema = z
  .object({ s: z.array(strokeSchema).min(1).max(MAX_STRICHI) })
  .strict()
  .refine((firma) => firma.s.reduce((sum, stroke) => sum + stroke.length / 2, 0) <= MAX_PUNTI);

export type Firma = z.infer<typeof firmaSchema>;

/** Пратеното от формата (JSON низ): празно — без подпис; подправено или твърде голямо — грешка. */
export function firmaDalForm(raw: unknown): { ok: true; firma: Firma | null } | { ok: false } {
  if (raw === undefined || raw === '') return { ok: true, firma: null };
  if (typeof raw !== 'string' || raw.length > MAX_FIRMA_JSON) return { ok: false };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const parsed = firmaSchema.safeParse(json);
  return parsed.success ? { ok: true, firma: parsed.data } : { ok: false };
}

/** Записаното в базата — или подпис, или null (повреденото не се показва). */
export function firmaSalvata(json: unknown): Firma | null {
  const parsed = firmaSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Пътят на SVG за щрихите: „M x y L x y …“; точка (един щрих от една точка) — къса черта. */
export function pathFirma(firma: Firma): string {
  return firma.s
    .map((points) => {
      const parts = [`M${points[0]} ${points[1]}`];
      if (points.length === 2) parts.push(`l0.1 0`);
      for (let i = 2; i < points.length; i += 2) parts.push(`L${points[i]} ${points[i + 1]}`);
      return parts.join('');
    })
    .join('');
}
