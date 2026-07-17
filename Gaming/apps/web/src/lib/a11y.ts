/**
 * Accessibility preferences persisted locally and reflected on <html> as data
 * attributes that CSS keys off (e.g. the four-colour deck in tokens.css).
 */
const FOUR_COLOR_KEY = "aso_four_color";

export function getFourColor(): boolean {
  try {
    return localStorage.getItem(FOUR_COLOR_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFourColor(on: boolean): void {
  try {
    localStorage.setItem(FOUR_COLOR_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  applyFourColor(on);
}

/** Reflect the preference onto <html data-four-color>; call once on boot. */
export function applyFourColor(on: boolean = getFourColor()): void {
  if (typeof document !== "undefined") document.documentElement.dataset.fourColor = on ? "true" : "false";
}
