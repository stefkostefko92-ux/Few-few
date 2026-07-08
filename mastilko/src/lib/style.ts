import { z } from "zod";
import { themeById, type WarmTheme } from "@/lib/themes";

// Споделен слой за персонализация — ползва се от ВСИЧКИ инструменти.
// Освен готовите теми: свои цветове (фон/текст/акцент) и избор на шрифт.

export const FONTS: Array<{ id: string; name: string; body: string; heading: string }> = [
  { id: "toplo", name: "Топъл (по подразбиране)", body: "var(--font-sans)", heading: "var(--font-display)" },
  { id: "seriozen", name: "Сериозен (серифен)", body: "var(--font-lora)", heading: "var(--font-lora)" },
  { id: "moderen", name: "Модерен (тесен)", body: "var(--font-sans)", heading: "var(--font-oswald)" },
  { id: "rakopisen", name: "Ръкописен", body: "var(--font-sans)", heading: "var(--font-caveat)" },
  { id: "prost", name: "Прост (безсерифен)", body: "var(--font-sans)", heading: "var(--font-sans)" },
];

export function fontById(id: string | undefined) {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

/** Полета за персонализация, вградени във всяко състояние на редактор. */
export interface StyleState {
  themeId: string;
  /** Свои цветове (когато са зададени, побеждават темата). */
  cbg?: string;
  cfg?: string;
  cacc?: string;
  /** Ползвай своите цветове вместо готовата тема. */
  customColors?: boolean;
  font?: string;
}

export const StyleSchemaShape = {
  themeId: z.string().max(20),
  cbg: z.string().max(20),
  cfg: z.string().max(20),
  cacc: z.string().max(20),
  customColors: z.boolean(),
  font: z.string().max(20),
};

const hex = /^#[0-9a-fA-F]{3,8}$/;

/** Ефективните цветове: свои (ако са включени и валидни) или темата. */
export function resolveTheme(s: StyleState): WarmTheme {
  const base = themeById(s.themeId);
  if (!s.customColors) return base;
  return {
    ...base,
    bg: s.cbg && hex.test(s.cbg) ? s.cbg : base.bg,
    fg: s.cfg && hex.test(s.cfg) ? s.cfg : base.fg,
    accent: s.cacc && hex.test(s.cacc) ? s.cacc : base.accent,
  };
}

/** CSS променливи за шрифта — подават се на SheetPreview (style). */
export function fontVars(s: StyleState): React.CSSProperties {
  const f = fontById(s.font);
  return {
    fontFamily: f.body,
    ["--font-display" as string]: f.heading,
  };
}
