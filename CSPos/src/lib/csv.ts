// CSV по RFC 4180 — изнесено от маршрута, за да е ТЕСТВАЕМО директно.
// (Първата версия живееше в route.ts и тестът я вадеше с `new Function` — не сработи, защото
// изворът е TypeScript. Кръпка в теста би скрила, че функцията просто не е на място.)

/** Едно поле: кавичките се удвояват, полето се обгражда при `,`, `"` или нов ред. */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Цял CSV документ с BOM — без него Excel отваря кирилицата като боклук (реален БГ проблем). */
export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
