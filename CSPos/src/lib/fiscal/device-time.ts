// Час и ИН на ФУ от отговора на устройството (Прил. № 29, т. 5 и т. 8).
//
// Драйверите говорят различни протоколи: ZFPLab (Tremol) връща XML с атрибути, Datecs връща
// рамка с полета, разделени с табулация, мостът ErpNet.FP — JSON с ISO час. Затова разчитането
// е толерантно към обвивката, но строго към стойността: невалиден час (31.02, 24:10) не се
// „поправя“ — връща се null и касата не приема, че часът е сверен.

const ISO = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;
const DMY = /(?<!\d)(\d{2})[-./](\d{2})[-./](\d{2}|\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?!\d)/;

const pad = (n: number) => String(n).padStart(2, "0");

function valid(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return false;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= days;
}

/** Час на ФУ като местно ISO без зона („2026-11-14T08:15:42“) или null. */
export function parseDeviceDateTime(raw: string): string | null {
  if (!raw) return null;
  let y: number, mo: number, d: number, h: number, mi: number, s: number;
  const iso = ISO.exec(raw);
  if (iso) {
    [y, mo, d, h, mi, s] = [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6] ?? "0"].map(Number) as [
      number, number, number, number, number, number,
    ];
  } else {
    const m = DMY.exec(raw);
    if (!m) return null;
    const yy = Number(m[3]);
    [d, mo, y, h, mi, s] = [Number(m[1]), Number(m[2]), m[3]!.length === 2 ? 2000 + yy : yy, Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  }
  if (!valid(y, mo, d, h, mi, s)) return null;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/** ИН на ФУ по Н-18: две главни латински букви (производител) и шест цифри. */
export function findDeviceSerial(raw: string): string | null {
  const m = /(?<![A-Za-z0-9])([A-Z]{2}\d{6})(?![A-Za-z0-9])/.exec(raw ?? "");
  return m ? m[1]! : null;
}
