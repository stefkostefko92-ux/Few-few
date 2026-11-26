// Малки помощници за текста: дати по италиански, списъци, „Foto n“.

/** „2026-11-26“ → „26/11/2026“ (без часови зони: датата е календарна). */
export function dataIt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** „a, b e c“. */
export function elencaIt(voci: string[]): string {
  const v = voci.filter(Boolean);
  if (v.length <= 1) return v[0] ?? "";
  return `${v.slice(0, -1).join(", ")} e ${v[v.length - 1]}`;
}

/** Номерата на снимките → „Foto 2“, „Foto 2, 5“ или „“. */
export function rifFoto(ids: string[], numeri: Map<string, number>): string {
  const n = ids.map((id) => numeri.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  return n.length ? `Foto ${n.join(", ")}` : "";
}

export const conPunto = (s: string): string => {
  const t = s.trim();
  return !t || /[.!?:;]$/.test(t) ? t : `${t}.`;
};
