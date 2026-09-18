// index.mjs — трите езика + „{n}" = броят демота (DEMOS.length), заместен при зареждане, за да не се
// пише числото на ръка в заглавия, тикер, HUD и статистики (при ново демо всичко се обновява само).
import { DEMOS } from "../demos/index.mjs";
import bg from "./bg.mjs";
import en from "./en.mjs";
import it from "./it.mjs";

const N = String(DEMOS.length);
const fill = (v) => (typeof v === "string" ? v.replace(/\{n\}/g, N) : Array.isArray(v) ? v.map(fill) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
export const I18N = { bg: fill(bg), en: fill(en), it: fill(it) };
