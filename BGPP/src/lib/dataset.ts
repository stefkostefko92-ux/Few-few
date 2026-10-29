import "server-only";
import { ENTERPRISES } from "@/data/enterprises";
import { SECTORS, sector } from "@/data/sectors";
import { PRINCIPALS, principal } from "@/data/principals";
import { CASES } from "@/data/cases";
import { BIG_CONTRACTORS } from "@/data/procurement";
import { NATIONAL } from "@/data/national";
import { transparency } from "@/lib/aggregate";

// Плосък ред за CSV/таблици — по едно предприятие.
export function enterpriseRows() {
  return ENTERPRISES.map((e) => ({
    slug: e.slug,
    ime: e.name,
    kratko: e.shortName ?? "",
    pravna_forma: e.legalForm,
    eik: e.eik ?? "",
    darzhavno_uchastie_pct: e.stateShare,
    sektor: sector(e.sector).name,
    principal: principal(e.principal).name,
    sedalishte: e.hq ?? "",
    sait: e.website ?? "",
    indeks_prozrachnost: transparency(e).score,
    broy_sluchai: CASES.filter((c) => c.slug === e.slug).length,
  }));
}

// Пълен набор като JSON — за отворени данни.
export function fullDataset() {
  return {
    meta: {
      proekt: "БГ Държавни предприятия",
      opisanie:
        "Отворени данни за държавните предприятия в България: профили, сектори, принципали, концентрация на поръчки и документирани случаи.",
      litsenz: "CC BY 4.0 — посочвайте източника; проверявайте в първичните регистри.",
      broy_predpriyatiya: ENTERPRISES.length,
      godina_agregati: NATIONAL.year,
    },
    nacionalni_agregati: NATIONAL,
    sektori: SECTORS,
    principali: PRINCIPALS,
    predpriyatiya: ENTERPRISES,
    koncentraciya: BIG_CONTRACTORS,
    sluchai: CASES,
  };
}

// CSV сериализация на предприятията.
export function enterprisesCsv(): string {
  const rows = enterpriseRows();
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","));
  }
  return "﻿" + lines.join("\n"); // BOM за коректна кирилица в Excel
}
