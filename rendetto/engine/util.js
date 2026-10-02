// Small numeric and vector helpers shared by the engine. World axes: x → right, y → up, z → front; mm.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const r1 = (v) => Math.round(v * 10) / 10;
export const IDX = { x: 0, y: 1, z: 2 };
export const AX = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const neg = (dir) => (dir[0] === '+' ? '-' : '+') + dir[1];
export const axisOf = (dir) => dir[1];

// Cross product of two signed axis directions ('+x' × '+y' = '+z').
export function crossDir(a, b) {
  const u = AX[a];
  const v = AX[b];
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const i = c.findIndex((x) => x !== 0);
  if (i < 0) throw new Error(`parallel axes ${a} × ${b}`);
  return `${c[i] > 0 ? '+' : '-'}${'xyz'[i]}`;
}

// Canonical JSON (sorted keys) — the input of the snapshot hash.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// Bulgarian count phrase: plural(1, 'врата', 'врати') → '1 врата', plural(3, …) → '3 врати'.
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Bulgarian-friendly number for drawings: 12.5 → "12,5", 12 → "12".
export const dimTxt = (v) => {
  const x = r1(v);
  return Number.isInteger(x) ? String(x) : String(x).replace('.', ',');
};

const TRANSLIT = {
  'а': 'A', 'б': 'B', 'в': 'V', 'г': 'G', 'д': 'D', 'е': 'E', 'ж': 'ZH', 'з': 'Z', 'и': 'I', 'й': 'Y', 'к': 'K', 'л': 'L', 'м': 'M', 'н': 'N',
  'о': 'O', 'п': 'P', 'р': 'R', 'с': 'S', 'т': 'T', 'у': 'U', 'ф': 'F', 'х': 'H', 'ц': 'TS', 'ч': 'CH', 'ш': 'SH', 'щ': 'SHT', 'ъ': 'A', 'ь': 'Y',
  'ю': 'YU', 'я': 'YA',
};

// Machine comments must stay ASCII.
export function asciiName(name) {
  return String(name)
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch.toUpperCase())
    .join('')
    .replace(/[^A-Z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
