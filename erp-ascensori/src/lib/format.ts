// Форматиране за италианския интерфейс (клиент + сървър).

export function euro(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export function dataIt(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function dataOraIt(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Брой + съществително в правилното число: `1 riga`, `3 righe`.
 *
 * ЗАЩО ФУНКЦИЯ, А НЕ ШАБЛОН НА МЯСТО. „1 righe verificate" в екрана на одита е
 * точно там, където човек трябва да повярва на числото; текст, който сам не си
 * връзва граматиката, подкопава доверието в него. Италианският има само две
 * форми, затова тук стига избор между две — без библиотека за плурализация.
 */
export function plurale(n: number, uno: string, molti: string): string {
  return `${n} ${n === 1 ? uno : molti}`;
}

/** от Date/ISO към стойност за <input type="date"> */
export function perInputData(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
