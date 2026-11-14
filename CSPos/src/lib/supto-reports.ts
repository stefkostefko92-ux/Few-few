// Справките по Прил. № 29, т. 18 от базата: филтри (период, ФУ, работно място, оператор),
// редове като низове по колоните от supto-export.ts. Обектът е един на инсталация — той е
// колона в справките и номенклатура в 18.9.

import { prisma } from "./db";
import { getSetting } from "./settings";
import { AUDIT_ACTIONS } from "./audit-actions";
import { PAYMENT_TYPES, ROLES, type RoleKey } from "./constants";
import { lineDiscountCents } from "./pricing";
import {
  bgDate,
  bgTime,
  euro,
  netUnit,
  qty,
  ratePercent,
  splitVat,
  suptoTable,
  type SuptoTable,
} from "./supto-export";

export interface ReportFilters {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  operatorCode: number | null;
  device: string | null;
  workplace: string | null;
}

type Row = string[];

function range(f: ReportFilters) {
  return { gte: new Date(`${f.from}T00:00:00`), lte: new Date(`${f.to}T23:59:59.999`) };
}

const op4 = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).padStart(4, "0"));

interface ItemLike {
  pluSnapshot: number;
  nameSnapshot: string;
  qtyMilli: number;
  unitPriceCents: number;
  vatRatePermille: number;
  vatCents: number;
  totalCents: number;
  priceLockedCents: number | null;
  product: { plu: number };
}

function lineCols(it: ItemLike): Row {
  const discount = lineDiscountCents({
    lockedCents: it.priceLockedCents,
    unitCents: it.unitPriceCents,
    qtyMilli: it.qtyMilli,
    totalCents: it.totalCents,
  });
  return [
    String(it.pluSnapshot || it.product.plu),
    it.nameSnapshot,
    qty(it.qtyMilli),
    euro(netUnit(it.unitPriceCents, it.vatRatePermille)),
    euro(discount),
    ratePercent(it.vatRatePermille),
    euro(it.vatCents),
    euro(it.totalCents),
  ];
}

const PAY_NAME: Record<string, string> = { ...PAYMENT_TYPES };

async function rows181(f: ReportFilters): Promise<Row[]> {
  const store = await getSetting("store");
  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      createdAt: range(f),
      ...(f.operatorCode !== null && { user: { operatorCode: f.operatorCode } }),
      ...(f.device && { fiscalDeviceSn: f.device }),
      ...(f.workplace && { workplaceCode: f.workplace }),
    },
    include: { user: true, customer: true, invoice: true, items: true },
    orderBy: { number: "asc" },
  });
  return sales.map((s) => {
    const vat = s.items.reduce((a, i) => a + i.vatCents, 0);
    // отстъпката = сбор от отстъпките по редове — същото определение като в 18.3
    const discount = s.items.reduce(
      (a, i) => a + lineDiscountCents({ lockedCents: i.priceLockedCents, unitCents: i.unitPriceCents, qtyMilli: i.qtyMilli, totalCents: i.totalCents }),
      0
    );
    const opened = s.openedAt ?? s.createdAt;
    return [
      s.unp,
      String(s.number),
      s.storeCode,
      store.storeName,
      bgDate(opened),
      bgTime(opened),
      s.workplaceCode,
      op4(s.user.operatorCode),
      euro(s.totalCents - vat),
      euro(discount),
      euro(vat),
      euro(s.totalCents),
      s.invoice ? String(s.invoice.number).padStart(10, "0") : "",
      s.invoice ? bgDate(s.invoice.createdAt) : "",
      bgDate(s.createdAt),
      bgTime(s.createdAt),
      s.customer?.cardNumber ?? "",
      s.customer ? (s.customer.anonymizedAt ? "(анонимизиран)" : s.customer.name) : "",
    ];
  });
}

async function rows182(f: ReportFilters): Promise<Row[]> {
  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      createdAt: range(f),
      ...(f.operatorCode !== null && { user: { operatorCode: f.operatorCode } }),
      ...(f.device && { fiscalDeviceSn: f.device }),
      ...(f.workplace && { workplaceCode: f.workplace }),
    },
    include: { user: true, items: { select: { vatCents: true } } },
    orderBy: { number: "asc" },
  });
  const out: Row[] = [];
  for (const s of sales) {
    const vat = s.items.reduce((a, i) => a + i.vatCents, 0);
    const parts: Array<[string, number]> = [];
    if (s.paymentType === "CREDIT") parts.push(["CREDIT", s.totalCents]);
    else {
      if (s.cashCents > 0) parts.push(["CASH", s.cashCents]);
      if (s.cardCents > 0) parts.push(["CARD", s.cardCents]);
    }
    const vats = splitVat(parts.map((p) => p[1]), s.totalCents, vat);
    parts.forEach(([type, amount], i) => {
      out.push([
        s.unp,
        String(s.number),
        bgDate(s.openedAt ?? s.createdAt),
        bgDate(s.createdAt),
        euro(s.totalCents),
        bgDate(s.createdAt),
        op4(s.user.operatorCode),
        euro(amount - vats[i]!),
        euro(vats[i]!),
        PAY_NAME[type] ?? type,
        s.fiscalDeviceSn ?? "",
      ]);
    });
  }
  return out;
}

async function rows183(f: ReportFilters): Promise<Row[]> {
  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      createdAt: range(f),
      ...(f.operatorCode !== null && { user: { operatorCode: f.operatorCode } }),
      ...(f.device && { fiscalDeviceSn: f.device }),
      ...(f.workplace && { workplaceCode: f.workplace }),
    },
    include: { items: { include: { product: { select: { plu: true } } } } },
    orderBy: { number: "asc" },
  });
  return sales.flatMap((s) => s.items.map((it) => [s.unp, String(s.number), ...lineCols(it), "", ""]));
}

async function rows184(f: ReportFilters): Promise<Row[]> {
  const stornos = await prisma.sale.findMany({
    where: {
      status: "STORNO",
      createdAt: range(f),
      ...(f.operatorCode !== null && { user: { operatorCode: f.operatorCode } }),
      ...(f.device && { fiscalDeviceSn: f.device }),
      ...(f.workplace && { workplaceCode: f.workplace }),
    },
    include: {
      user: true,
      stornoOf: true,
      items: { include: { product: { select: { plu: true } } } },
    },
    orderBy: { number: "asc" },
  });
  return stornos.flatMap((s) =>
    s.items.map((it) => [
      s.stornoOf?.unp ?? s.unp,
      String(s.stornoOf?.number ?? s.number),
      ...lineCols(it),
      bgDate(s.stornoOf?.createdAt),
      bgTime(s.stornoOf?.createdAt),
      bgDate(s.createdAt),
      bgTime(s.createdAt),
      s.fiscalDeviceSn ?? "",
      op4(s.user.operatorCode),
    ])
  );
}

async function rows185(f: ReportFilters): Promise<Row[]> {
  const items = await prisma.cancelledItem.findMany({
    where: {
      cancelledAt: range(f),
      ...(f.operatorCode !== null && { operatorCode: f.operatorCode }),
      ...((f.device || f.workplace) && {
        draft: { ...(f.device && { fiscalSerial: f.device }), ...(f.workplace && { workplaceCode: f.workplace }) },
      }),
    },
    include: { draft: { include: { sale: { select: { number: true } } } } },
    orderBy: { cancelledAt: "asc" },
  });
  return items.map((c) => [
    c.unp,
    c.draft.sale ? String(c.draft.sale.number) : "",
    String(c.plu),
    c.name,
    qty(c.qtyMilli),
    euro(netUnit(c.unitPriceCents, c.vatRatePermille)),
    euro(c.discountCents),
    ratePercent(c.vatRatePermille),
    euro(c.vatCents),
    euro(c.totalCents),
    bgDate(c.openedAt),
    bgTime(c.openedAt),
    bgDate(c.cancelledAt),
    bgTime(c.cancelledAt),
    op4(c.operatorCode),
  ]);
}

const DELIVERY_PAY: Record<string, string> = { CASH: "В брой", BANK: "По банков път", CARD: "С карта", DEFERRED: "Отложено" };

async function rows186(f: ReportFilters): Promise<Row[]> {
  const ds = await prisma.delivery.findMany({
    where: { createdAt: range(f), ...(f.operatorCode !== null && { user: { operatorCode: f.operatorCode } }) },
    include: { user: true, supplier: true },
    orderBy: { createdAt: "asc" },
  });
  return ds.map((d) => [
    d.id,
    bgDate(d.createdAt),
    bgTime(d.createdAt),
    op4(d.user.operatorCode),
    d.supplier.eik ?? d.supplier.id,
    d.supplier.name,
    d.docNumber,
    bgDate(d.docDate),
    euro(d.totalCostCents + d.discountCents),
    euro(d.discountCents),
    euro(d.vatCents),
    euro(d.totalCostCents + d.vatCents),
    DELIVERY_PAY[d.paymentType] ?? d.paymentType,
  ]);
}

async function rows187(f: ReportFilters): Promise<Row[]> {
  const items = await prisma.deliveryItem.findMany({
    where: {
      delivery: { createdAt: range(f), ...(f.operatorCode !== null && { user: { operatorCode: f.operatorCode } }) },
    },
    include: { product: { select: { plu: true, name: true } } },
    orderBy: { deliveryId: "asc" },
  });
  return items.map((i) => {
    const gross = Math.round((i.unitCostCents * i.qtyMilli) / 1000);
    return [
      i.deliveryId,
      String(i.product.plu),
      i.product.name,
      qty(i.qtyMilli),
      euro(i.unitCostCents),
      euro(i.discountCents),
      euro(i.vatCents),
      euro(gross - i.discountCents + i.vatCents),
    ];
  });
}

async function rows188(f: ReportFilters): Promise<Row[]> {
  const r = range(f);
  const [products, inPeriod, after] = await Promise.all([
    prisma.product.findMany({ orderBy: { plu: "asc" }, select: { id: true, plu: true, name: true, stockMilli: true, costCents: true } }),
    prisma.stockMovement.findMany({ where: { createdAt: r }, select: { productId: true, qtyMilliDelta: true } }),
    prisma.stockMovement.groupBy({ by: ["productId"], where: { createdAt: { gt: r.lte } }, _sum: { qtyMilliDelta: true } }),
  ]);
  const afterBy = new Map(after.map((a) => [a.productId, a._sum.qtyMilliDelta ?? 0]));
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const mv of inPeriod) {
    if (mv.qtyMilliDelta >= 0) debit.set(mv.productId, (debit.get(mv.productId) ?? 0) + mv.qtyMilliDelta);
    else credit.set(mv.productId, (credit.get(mv.productId) ?? 0) - mv.qtyMilliDelta);
  }
  const value = (milli: number, cost: number) => euro(Math.round((milli * cost) / 1000));
  return products
    .map((p) => {
      const end = p.stockMilli - (afterBy.get(p.id) ?? 0);
      const d = debit.get(p.id) ?? 0;
      const c = credit.get(p.id) ?? 0;
      const start = end - d + c;
      return { p, start, d, c, end };
    })
    .filter((x) => x.start !== 0 || x.d !== 0 || x.c !== 0 || x.end !== 0)
    .map(({ p, start, d, c, end }) => [
      String(p.plu),
      p.name,
      qty(start),
      value(start, p.costCents),
      qty(d),
      value(d, p.costCents),
      qty(c),
      value(c, p.costCents),
      qty(end),
      value(end, p.costCents),
    ]);
}

const ROLE_RIGHTS: Record<string, string> = {
  CASHIER: "Продажби, проверка на цена, смяна и служебни суми",
  MANAGER: "Касиер + номенклатури, промоции, склад, сторно, справки, дневник",
  ADMIN: "Управител + настройки, оператори, лиценз",
  AUDITOR: "Само четене: справки по т. 16–18, конфигурация, справочна част (т. 19)",
};

const RIGHTS: Array<[string, string, string]> = [
  ["SALE", "Продажби", "Откриване, анулиране и приключване на продажби"],
  ["STORNO", "Сторно", "Сторниране на приключени продажби (чл. 31 Н-18)"],
  ["SHIFT", "Смени и служебни суми", "Откриване и закриване на смяна, служебни суми, X/Z отчет"],
  ["NOMENCLATURE", "Номенклатури", "Стоки, категории, доставчици, клиенти, промоции"],
  ["STOCK", "Склад", "Доставки, ревизии, брак"],
  ["REPORTS", "Справки", "Справки по т. 18 и експорт"],
  ["JOURNAL", "Одиторски дневник", "Преглед и експорт по т. 15–16"],
  ["SETTINGS", "Настройки", "Фирма, обект, устройства, оператори, лиценз"],
  ["READ_ONLY", "Само четене", "Наслагва се върху ролята — всяко писане е отказано (т. 19)"],
];

async function rows189(): Promise<Row[]> {
  const [store, workplace, fiscal, link, products, suppliers, customers, users, firstActions, firstSetting] = await Promise.all([
    getSetting("store"),
    getSetting("workplace"),
    getSetting("fiscal"),
    getSetting("fiscalLink"),
    prisma.product.findMany({ orderBy: { plu: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { cardNumber: "asc" } }),
    prisma.user.findMany({ orderBy: { operatorCode: "asc" }, include: { roleGrants: { orderBy: { validFrom: "asc" } } } }),
    prisma.auditLog.groupBy({ by: ["action"], _min: { createdAt: true } }),
    prisma.setting.findFirst({ orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
  ]);
  const installed = bgDate(firstSetting?.updatedAt ?? null);
  const firstUse = new Map(firstActions.map((a) => [a.action, a._min.createdAt]));
  const out: Row[] = [];
  for (const p of products) {
    out.push(["Стоки/услуги", String(p.plu), p.name, "", bgDate(p.createdAt), bgDate(p.updatedAt), bgDate(p.deactivatedAt ?? (p.active ? null : p.updatedAt))]);
  }
  for (const s of suppliers) {
    out.push(["Доставчици", s.eik ?? "", s.name, s.vatNumber ?? "", bgDate(s.createdAt), bgDate(s.updatedAt), bgDate(s.deactivatedAt ?? (s.active ? null : s.updatedAt))]);
  }
  for (const c of customers) {
    out.push(["Клиенти", c.eik ?? c.cardNumber, c.anonymizedAt ? "(анонимизиран)" : c.name, c.eik ? `карта ${c.cardNumber}` : "", bgDate(c.createdAt), bgDate(c.updatedAt), bgDate(c.deactivatedAt ?? (c.active ? null : c.updatedAt))]);
  }
  for (const [code, name] of Object.entries(AUDIT_ACTIONS)) {
    out.push(["Видове операции", code, name, "", bgDate(firstUse.get(code) ?? null) || installed, "", ""]);
  }
  for (const [code, name] of Object.entries(PAYMENT_TYPES)) {
    out.push(["Видове плащания", code, name, "", installed, "", ""]);
  }
  out.push(["Търговски обекти", store.code, store.storeName, [store.city, store.address].filter(Boolean).join(", "), installed, "", ""]);
  out.push(["Работни места", workplace.code, workplace.name, `обект ${store.code}; ФУ ${link.serial || fiscal.deviceSerial}`, installed, "", ""]);
  for (const u of users) {
    const periods = u.roleGrants
      .map((g) => `${g.readOnly ? "Одитор" : ROLES[g.role as RoleKey] ?? g.role}: ${bgDate(g.validFrom)}–${g.validTo ? bgDate(g.validTo) : "…"}`)
      .join("; ");
    out.push(["Потребители (оператори)", op4(u.operatorCode), u.name, periods || (u.readOnly ? "Одитор" : ROLES[u.role as RoleKey] ?? u.role), bgDate(u.createdAt), bgDate(u.updatedAt), bgDate(u.deactivatedAt ?? (u.active ? null : u.updatedAt))]);
  }
  for (const [code, rights] of Object.entries(ROLE_RIGHTS)) {
    const name = code === "AUDITOR" ? "Одитор (само четене)" : ROLES[code as RoleKey];
    out.push(["Роли", code, name, rights, installed, "", ""]);
  }
  for (const [code, name, desc] of RIGHTS) {
    out.push(["Права", code, name, desc, installed, "", ""]);
  }
  return out;
}

export async function buildReport(id: string, f: ReportFilters): Promise<{ table: SuptoTable; rows: Row[] }> {
  const table = suptoTable(id);
  if (!table) throw new Error(`Непозната справка ${id}`);
  const rows =
    id === "18.1" ? await rows181(f)
    : id === "18.2" ? await rows182(f)
    : id === "18.3" ? await rows183(f)
    : id === "18.4" ? await rows184(f)
    : id === "18.5" ? await rows185(f)
    : id === "18.6" ? await rows186(f)
    : id === "18.7" ? await rows187(f)
    : id === "18.8" ? await rows188(f)
    : await rows189();
  return { table, rows };
}
