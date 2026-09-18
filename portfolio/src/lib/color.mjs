// color.mjs — контраст по WCAG 2.x (1.4.3) и „четим“ вариант на цвят: темите на демотата задават акцент и
// приглушен текст по вкус на дизайна, а генераторът гарантира ≥4.5:1 спрямо фона/повърхностите, като леко
// затъмнява (светла тема) или изсветлява (тъмна тема) — само колкото е нужно. Нула зависимости.

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export const rgbToHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

export function luminance(rgb) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** Контраст между два цвята (hex), 1–21. */
export function contrast(a, b) {
  const l1 = luminance(hexToRgb(a)), l2 = luminance(hexToRgb(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const mix = (rgb, target, k) => rgb.map((v, i) => v + (target[i] - v) * k);

/**
 * Най-близкият до `color` цвят с контраст ≥ `min` спрямо ВСЕКИ от `backgrounds`.
 * mode "light" → смесва към черно; "dark" → към бяло. Стъпка 2%, най-много до чисто черно/бяло.
 */
export function readable(color, backgrounds, min = 4.5, mode = "light") {
  const target = mode === "dark" ? [255, 255, 255] : [0, 0, 0];
  const base = hexToRgb(color);
  for (let k = 0; k <= 1.0001; k += 0.02) {
    const c = rgbToHex(mix(base, target, k));
    if (backgrounds.every((b) => contrast(c, b) >= min)) return c;
  }
  return rgbToHex(target);
}

/** Текст върху акцент: подаденият, ако стига; иначе черно или бяло — което е по-контрастно. */
export function onColor(preferred, accent, min = 4.5) {
  if (contrast(preferred, accent) >= min) return preferred;
  return contrast("#ffffff", accent) >= contrast("#000000", accent) ? "#ffffff" : "#000000";
}
