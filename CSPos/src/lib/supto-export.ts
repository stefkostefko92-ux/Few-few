// Справките по Прил. № 29, т. 18 (18.1–18.9): дефиниции на колоните и чистите форматиращи
// функции. Заявките към базата са в supto-reports.ts.
//
// § 74 ПЗР (ДВ 42/2025): справката е във валутата, официална за периода; период, който обхваща
// и лева, и еврото, се прави на ДВЕ отделни справки. Тази каса води всичко в евро.

import { VAT_GROUPS, type VatGroupKey } from "./constants";

export type ColumnKind = "text" | "money" | "qty" | "int";
export interface Column {
  h: string;
  kind?: ColumnKind;
}

export interface SuptoTable {
  id: "18.1" | "18.2" | "18.3" | "18.4" | "18.5" | "18.6" | "18.7" | "18.8" | "18.9";
  title: string;
  columns: Column[];
  headers: string[];
}

const m = (h: string): Column => ({ h, kind: "money" });
const q = (h: string): Column => ({ h, kind: "qty" });
const t = (h: string): Column => ({ h });

const LINE_COLS: Column[] = [
  t("Код на стоката"),
  t("Наименование"),
  q("Количество"),
  m("Единична цена без отстъпка, без ДДС (EUR)"),
  m("Отстъпка (EUR)"),
  t("ДДС ставка"),
  m("ДДС (EUR)"),
  m("Обща сума (EUR)"),
];

const DEFS: Array<Omit<SuptoTable, "headers">> = [
  {
    id: "18.1",
    title: "Обобщени данни за продажбите",
    columns: [
      t("УНП"), t("Системен номер"), t("Код на обект"), t("Наименование на обект"),
      t("Дата на откриване"), t("Час на откриване"), t("Код на работно място"), t("Код на оператор"),
      m("Сума без ДДС (EUR)"), m("Отстъпка (EUR)"), m("ДДС (EUR)"), m("Дължима сума (EUR)"),
      t("Фактура №"), t("Фактура дата"), t("Дата на приключване"), t("Час на приключване"),
      t("Клиент код"), t("Клиент име"),
    ],
  },
  {
    id: "18.2",
    title: "Данни за плащанията по продажбите",
    columns: [
      t("УНП"), t("Системен номер"), t("Дата на откриване"), t("Дата на приключване"),
      m("Обща сума (EUR)"), t("Дата на плащане"), t("Код на оператор"),
      m("Платена сума без ДДС (EUR)"), m("ДДС (EUR)"), t("Вид на плащането"), t("ИН на ФУ"),
    ],
  },
  {
    id: "18.3",
    title: "Детайлни данни за продажбите",
    columns: [t("УНП"), t("Системен номер"), ...LINE_COLS, t("Начало на периода (т. 9.2)"), t("Край на периода (т. 9.2)")],
  },
  {
    id: "18.4",
    title: "Сторнирани продажби",
    columns: [
      t("УНП"), t("Системен номер"), ...LINE_COLS,
      t("Дата на приключване"), t("Час на приключване"), t("Дата на сторниране"), t("Час на сторниране"),
      t("ИН на ФУ (сторно)"), t("Код на оператор (сторно)"),
    ],
  },
  {
    id: "18.5",
    title: "Анулирани продажби",
    columns: [
      t("УНП"), t("Системен номер"), ...LINE_COLS,
      t("Дата на откриване"), t("Час на откриване"), t("Дата на анулиране"), t("Час на анулиране"),
      t("Код на оператор"),
    ],
  },
  {
    id: "18.6",
    title: "Обобщени данни за доставки",
    columns: [
      t("ID на запис"), t("Дата на доставка"), t("Час"), t("Код на оператор"),
      t("Доставчик код"), t("Доставчик име"), t("Фактура №"), t("Фактура дата"),
      m("Сума без отстъпка, без ДДС (EUR)"), m("Отстъпка (EUR)"), m("ДДС (EUR)"), m("Обща сума (EUR)"),
      t("Вид на плащането"),
    ],
  },
  {
    id: "18.7",
    title: "Детайлни данни за доставки",
    columns: [
      t("ID на запис"), t("Код на стоката"), t("Наименование"), q("Количество"),
      m("Единична цена без отстъпка (EUR)"), m("Отстъпка (EUR)"), m("ДДС (EUR)"), m("Обща сума (EUR)"),
    ],
  },
  {
    id: "18.8",
    title: "Движение на стоки за период",
    columns: [
      t("Код на стоката"), t("Наименование"),
      q("Количество в началото"), m("Стойност в началото (EUR)"),
      q("Дебитен оборот — количество"), m("Дебитен оборот — стойност (EUR)"),
      q("Кредитен оборот — количество"), m("Кредитен оборот — стойност (EUR)"),
      q("Количество в края"), m("Стойност в края (EUR)"),
    ],
  },
  {
    id: "18.9",
    title: "Номенклатури",
    columns: [
      t("Номенклатура"), t("Код"), t("Наименование"), t("Допълнително"),
      t("Дата на конфигуриране"), t("Дата на последна промяна"), t("Дата на деактивиране"),
    ],
  },
];

export const SUPTO_TABLES: SuptoTable[] = DEFS.map((d) => ({ ...d, headers: d.columns.map((c) => c.h) }));

export function suptoTable(id: string): SuptoTable | undefined {
  return SUPTO_TABLES.find((x) => x.id === id);
}

/** Евроценти → „123.45“ (точка: машинно четим CSV по RFC 4180; XLSX получава число). */
export function euro(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Хилядни → „1.250“. */
export function qty(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const a = Math.abs(milli);
  return `${sign}${Math.floor(a / 1000)}.${String(a % 1000).padStart(3, "0")}`;
}

export function netAndVat(totalCents: number, vatCents: number): { net: number; vat: number } {
  return { net: totalCents - vatCents, vat: vatCents };
}

/** Единична цена без ДДС от цена с ДДС (закръгляне до цент). */
export function netUnit(grossCents: number, ratePermille: number): number {
  return Math.round((grossCents * 1000) / (1000 + ratePermille));
}

export function vatLetter(group: string): string {
  return VAT_GROUPS[group as VatGroupKey]?.letter ?? group;
}

export function ratePercent(ratePermille: number): string {
  return `${ratePermille / 10}%`;
}

const DATE_FMT = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function bgDate(d: Date | null | undefined): string {
  return d ? DATE_FMT.format(d).replace(/\s*г\.?$/, "") : "";
}
export function bgTime(d: Date | null | undefined): string {
  return d ? TIME_FMT.format(d) : "";
}

/** § 74 ПЗР: период, пресичащ 01.01.2026 (лев → евро), се прави на две справки. */
export function periodCurrencyError(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const EURO_DAY = "2026-01-01";
  if (from < EURO_DAY && to >= EURO_DAY) {
    return "Периодът обхваща и лева, и еврото (01.01.2026). Направете две отделни справки — до 31.12.2025 и от 01.01.2026 (§ 74 ПЗР на Н-18).";
  }
  return null;
}

/** Разпределя ДДС между частите на плащането пропорционално; последната взема остатъка. */
export function splitVat(parts: number[], totalCents: number, vatCents: number): number[] {
  if (totalCents <= 0) return parts.map(() => 0);
  let left = vatCents;
  return parts.map((p, i) => {
    if (i === parts.length - 1) return left;
    const v = Math.round((vatCents * p) / totalCents);
    left -= v;
    return v;
  });
}
