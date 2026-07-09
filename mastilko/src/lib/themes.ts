// Топлите цветови теми на Мастилко — споделени от етикетите и визитките.

export interface WarmTheme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  accent: string;
}

export const THEMES: WarmTheme[] = [
  { id: "med", name: "Мед", bg: "#F9EBCF", fg: "#6B4A12", accent: "#DE9A32" },
  { id: "tera", name: "Теракота", bg: "#F7DFD3", fg: "#7C3A22", accent: "#C25E3F" },
  { id: "krem", name: "Крем", bg: "#FFFDF7", fg: "#3A2E28", accent: "#C25E3F" },
  { id: "gora", name: "Гора", bg: "#E6EBDC", fg: "#3C4A2A", accent: "#6F7D5C" },
  { id: "mastilo", name: "Мастило", bg: "#3A2E28", fg: "#FAF4E8", accent: "#E08963" },
  { id: "nebe", name: "Небе", bg: "#E3EBF0", fg: "#2C4356", accent: "#5B7E99" },
];

export function themeById(id: string): WarmTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
