// Личен комплект (Brand Kit) — копира само стиловия слой (StyleState) от един
// инструмент към друг през localStorage, за да е съгласуван видът (напр.
// визитка → CV/писмо). Чисто клиентско: localStorage → localStorage, никаква
// мрежа. Стойностите минават през Zod (StyleSchemaShape), затова чуждите/
// невалидните полета се отрязват, преди да влязат в текущото студио.

import { z } from "zod";
import { StyleSchemaShape, type StyleState } from "@/lib/style";

const StyleOnly = z.object(StyleSchemaShape).partial();

/**
 * Чете стиловия слой от проект в localStorage (напр. „mastilko-cards“) и
 * връща само валидните StyleState полета, или null ако липсва/е невалиден.
 */
export function readBrandKit(sourceKey: string): Partial<StyleState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sourceKey);
    if (!raw) return null;
    const parsed = StyleOnly.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const data = parsed.data as Partial<StyleState>;
    return Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
}
