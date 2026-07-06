// Начални данни: потребители, категории, стоки на хранителен магазин,
// доставчици и клиентска карта. Идемпотентен — upsert по уникален ключ.
// Цените са в евроценти (България е в еврозоната от 01.01.2026).

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: "Хляб и тестени", color: "#f5a623", icon: "Bread", sort: 1 },
  { name: "Млечни продукти", color: "#38bdf8", icon: "Cheese", sort: 2 },
  { name: "Месо и колбаси", color: "#f43f5e", icon: "Hamburger", sort: 3 },
  { name: "Плодове и зеленчуци", color: "#22c55e", icon: "Carrot", sort: 4 },
  { name: "Напитки", color: "#a78bfa", icon: "PintGlass", sort: 5 },
  { name: "Захарни изделия", color: "#fb7185", icon: "Cookie", sort: 6 },
  { name: "Консерви и пакетирани", color: "#fbbf24", icon: "Package", sort: 7 },
  { name: "Битова химия", color: "#94a3b8", icon: "SprayBottle", sort: 8 },
  { name: "Цигари и алкохол", color: "#e11d48", icon: "Wine", sort: 9 },
  { name: "Други", color: "#64748b", icon: "Basket", sort: 10 },
];

type SeedProduct = {
  plu: number;
  name: string;
  category: string;
  unit: "PCS" | "KG";
  vatGroup: "A" | "B" | "C" | "D";
  priceCents: number; // EUR с ДДС
  costCents: number;
  stockMilli: number;
  minStockMilli?: number;
  favorite?: boolean;
  barcodes?: string[];
};

const PRODUCTS: SeedProduct[] = [
  // Хляб и тестени
  { plu: 101, name: "Хляб „Добруджа“ 650 г", category: "Хляб и тестени", unit: "PCS", vatGroup: "B", priceCents: 85, costCents: 55, stockMilli: 40000, minStockMilli: 10000, favorite: true, barcodes: ["3800101010101"] },
  { plu: 102, name: "Хляб пълнозърнест 500 г", category: "Хляб и тестени", unit: "PCS", vatGroup: "B", priceCents: 125, costCents: 80, stockMilli: 25000, favorite: true, barcodes: ["3800101010202"] },
  { plu: 103, name: "Баница със сирене 150 г", category: "Хляб и тестени", unit: "PCS", vatGroup: "B", priceCents: 110, costCents: 60, stockMilli: 15000, favorite: true },
  { plu: 104, name: "Козунак 400 г", category: "Хляб и тестени", unit: "PCS", vatGroup: "B", priceCents: 245, costCents: 150, stockMilli: 10000 },
  { plu: 105, name: "Точени кори 400 г", category: "Хляб и тестени", unit: "PCS", vatGroup: "B", priceCents: 175, costCents: 110, stockMilli: 12000 },
  // Млечни
  { plu: 201, name: "Кисело мляко 3,6% 400 г", category: "Млечни продукти", unit: "PCS", vatGroup: "B", priceCents: 75, costCents: 48, stockMilli: 60000, minStockMilli: 20000, favorite: true, barcodes: ["3800102020101"] },
  { plu: 202, name: "Прясно мляко 3% 1 л", category: "Млечни продукти", unit: "PCS", vatGroup: "B", priceCents: 145, costCents: 98, stockMilli: 45000, favorite: true, barcodes: ["3800102020202"] },
  { plu: 203, name: "Сирене краве (насипно)", category: "Млечни продукти", unit: "KG", vatGroup: "B", priceCents: 745, costCents: 520, stockMilli: 18000, favorite: true },
  { plu: 204, name: "Кашкавал „Витоша“ (насипен)", category: "Млечни продукти", unit: "KG", vatGroup: "B", priceCents: 1095, costCents: 780, stockMilli: 12000, favorite: true },
  { plu: 205, name: "Масло 125 г", category: "Млечни продукти", unit: "PCS", vatGroup: "B", priceCents: 215, costCents: 145, stockMilli: 20000, barcodes: ["3800102020505"] },
  { plu: 206, name: "Извара 250 г", category: "Млечни продукти", unit: "PCS", vatGroup: "B", priceCents: 165, costCents: 105, stockMilli: 10000 },
  // Месо и колбаси
  { plu: 301, name: "Пилешко филе (охладено)", category: "Месо и колбаси", unit: "KG", vatGroup: "B", priceCents: 655, costCents: 480, stockMilli: 15000, favorite: true },
  { plu: 302, name: "Свинска кайма 60/40", category: "Месо и колбаси", unit: "KG", vatGroup: "B", priceCents: 545, costCents: 400, stockMilli: 20000, favorite: true },
  { plu: 303, name: "Луканка „Панагюрска“ (насипна)", category: "Месо и колбаси", unit: "KG", vatGroup: "B", priceCents: 1345, costCents: 950, stockMilli: 8000 },
  { plu: 304, name: "Кренвирши пилешки 350 г", category: "Месо и колбаси", unit: "PCS", vatGroup: "B", priceCents: 265, costCents: 175, stockMilli: 18000, barcodes: ["3800103030404"] },
  { plu: 305, name: "Наденица „Македонска“ (насипна)", category: "Месо и колбаси", unit: "KG", vatGroup: "B", priceCents: 685, costCents: 470, stockMilli: 9000 },
  // Плодове и зеленчуци (тегловни — с везна)
  { plu: 401, name: "Домати розови", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 245, costCents: 150, stockMilli: 30000, favorite: true },
  { plu: 402, name: "Краставици", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 195, costCents: 120, stockMilli: 25000, favorite: true },
  { plu: 403, name: "Картофи", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 95, costCents: 55, stockMilli: 80000, favorite: true },
  { plu: 404, name: "Ябълки „Златна превъзходна“", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 165, costCents: 95, stockMilli: 40000, favorite: true },
  { plu: 405, name: "Банани", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 175, costCents: 115, stockMilli: 35000, favorite: true },
  { plu: 406, name: "Лимони", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 295, costCents: 190, stockMilli: 12000 },
  { plu: 407, name: "Лук кромид", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 115, costCents: 60, stockMilli: 30000 },
  { plu: 408, name: "Чушки червени", category: "Плодове и зеленчуци", unit: "KG", vatGroup: "B", priceCents: 325, costCents: 210, stockMilli: 15000 },
  // Напитки
  { plu: 501, name: "Минерална вода 1,5 л", category: "Напитки", unit: "PCS", vatGroup: "B", priceCents: 65, costCents: 38, stockMilli: 90000, favorite: true, barcodes: ["3800105050101"] },
  { plu: 502, name: "Газирана напитка кола 2 л", category: "Напитки", unit: "PCS", vatGroup: "B", priceCents: 185, costCents: 125, stockMilli: 50000, barcodes: ["5449000000439"] },
  { plu: 503, name: "Натурален сок портокал 1 л", category: "Напитки", unit: "PCS", vatGroup: "B", priceCents: 235, costCents: 155, stockMilli: 20000 },
  { plu: 504, name: "Айрян 500 мл", category: "Напитки", unit: "PCS", vatGroup: "B", priceCents: 85, costCents: 52, stockMilli: 25000 },
  { plu: 505, name: "Кафе мляно 200 г", category: "Напитки", unit: "PCS", vatGroup: "B", priceCents: 385, costCents: 265, stockMilli: 15000, barcodes: ["3800105050505"] },
  // Захарни
  { plu: 601, name: "Шоколад млечен 90 г", category: "Захарни изделия", unit: "PCS", vatGroup: "B", priceCents: 165, costCents: 105, stockMilli: 30000, barcodes: ["3800106060101"] },
  { plu: 602, name: "Бисквити „Закуска“ 330 г", category: "Захарни изделия", unit: "PCS", vatGroup: "B", priceCents: 145, costCents: 92, stockMilli: 25000 },
  { plu: 603, name: "Вафла „Боровец“ 55 г", category: "Захарни изделия", unit: "PCS", vatGroup: "B", priceCents: 45, costCents: 26, stockMilli: 60000, favorite: true },
  { plu: 604, name: "Локум розов 250 г", category: "Захарни изделия", unit: "PCS", vatGroup: "B", priceCents: 185, costCents: 115, stockMilli: 10000 },
  // Консерви и пакетирани
  { plu: 701, name: "Ориз 1 кг", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 245, costCents: 165, stockMilli: 25000 },
  { plu: 702, name: "Брашно тип 500 — 1 кг", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 135, costCents: 85, stockMilli: 30000 },
  { plu: 703, name: "Олио слънчогледово 1 л", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 295, costCents: 210, stockMilli: 35000, favorite: true, barcodes: ["3800107070303"] },
  { plu: 704, name: "Захар 1 кг", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 155, costCents: 105, stockMilli: 30000 },
  { plu: 705, name: "Лютеница „Домашна“ 550 г", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 425, costCents: 290, stockMilli: 15000 },
  { plu: 706, name: "Боб зрял 1 кг", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 385, costCents: 255, stockMilli: 12000 },
  { plu: 707, name: "Макарони 400 г", category: "Консерви и пакетирани", unit: "PCS", vatGroup: "B", priceCents: 95, costCents: 58, stockMilli: 28000 },
  // Битова химия
  { plu: 801, name: "Препарат за съдове 500 мл", category: "Битова химия", unit: "PCS", vatGroup: "B", priceCents: 225, costCents: 145, stockMilli: 18000 },
  { plu: 802, name: "Тоалетна хартия 8 бр.", category: "Битова химия", unit: "PCS", vatGroup: "B", priceCents: 385, costCents: 260, stockMilli: 20000 },
  { plu: 803, name: "Прах за пране 2 кг", category: "Битова химия", unit: "PCS", vatGroup: "B", priceCents: 645, costCents: 445, stockMilli: 10000 },
  // Цигари и алкохол
  { plu: 901, name: "Бира светла 2 л PET", category: "Цигари и алкохол", unit: "PCS", vatGroup: "B", priceCents: 265, costCents: 185, stockMilli: 40000 },
  { plu: 902, name: "Вино червено 750 мл", category: "Цигари и алкохол", unit: "PCS", vatGroup: "B", priceCents: 545, costCents: 360, stockMilli: 15000 },
  { plu: 903, name: "Ракия гроздова 700 мл", category: "Цигари и алкохол", unit: "PCS", vatGroup: "B", priceCents: 985, costCents: 690, stockMilli: 10000 },
  // Други (вкл. пример за група Г — 9% и група А)
  { plu: 951, name: "Бебешка храна пюре 190 г", category: "Други", unit: "PCS", vatGroup: "D", priceCents: 175, costCents: 115, stockMilli: 12000, barcodes: ["3800109090101"] },
  { plu: 952, name: "Пелени бебешки 40 бр.", category: "Други", unit: "PCS", vatGroup: "D", priceCents: 1245, costCents: 880, stockMilli: 8000 },
  { plu: 953, name: "Вестник (освободена доставка)", category: "Други", unit: "PCS", vatGroup: "A", priceCents: 150, costCents: 105, stockMilli: 20000 },
  { plu: 954, name: "Торбичка за пазаруване", category: "Други", unit: "PCS", vatGroup: "B", priceCents: 10, costCents: 3, stockMilli: 500000, favorite: true },
  // Служебни артикули за „свободна продажба“ (ръчна цена) — по една за ДДС група
  { plu: 990, name: "Свободна продажба — Б (20%)", category: "Други", unit: "PCS", vatGroup: "B", priceCents: 0, costCents: 0, stockMilli: 0 },
  { plu: 991, name: "Свободна продажба — А (0%)", category: "Други", unit: "PCS", vatGroup: "A", priceCents: 0, costCents: 0, stockMilli: 0 },
  { plu: 992, name: "Свободна продажба — Г (9%)", category: "Други", unit: "PCS", vatGroup: "D", priceCents: 0, costCents: 0, stockMilli: 0 },
];

async function main() {
  // Потребители: ПИН по подразбиране — СМЕНЕТЕ ГИ след първия вход!
  const users = [
    { name: "Админ", operatorCode: 1, pin: "9999", role: "ADMIN" },
    { name: "Мария Управител", operatorCode: 2, pin: "5555", role: "MANAGER" },
    { name: "Иван Касиер", operatorCode: 3, pin: "1111", role: "CASHIER" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { operatorCode: u.operatorCode },
      create: {
        name: u.name,
        operatorCode: u.operatorCode,
        pinHash: await bcrypt.hash(u.pin, 10),
        role: u.role,
      },
      update: { name: u.name, role: u.role },
    });
  }

  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      create: c,
      update: { color: c.color, icon: c.icon, sort: c.sort },
    });
  }
  const cats = await prisma.category.findMany();
  const catId = (name: string) => {
    const c = cats.find((x) => x.name === name);
    if (!c) throw new Error(`Липсва категория: ${name}`);
    return c.id;
  };

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { plu: p.plu },
      create: {
        plu: p.plu,
        name: p.name,
        categoryId: catId(p.category),
        unit: p.unit,
        vatGroup: p.vatGroup,
        priceCents: p.priceCents,
        costCents: p.costCents,
        stockMilli: p.stockMilli,
        minStockMilli: p.minStockMilli ?? 5000,
        favorite: p.favorite ?? false,
      },
      update: {
        name: p.name,
        categoryId: catId(p.category),
        unit: p.unit,
        vatGroup: p.vatGroup,
        priceCents: p.priceCents,
        favorite: p.favorite ?? false,
      },
    });
    for (const code of p.barcodes ?? []) {
      await prisma.barcode.upsert({
        where: { code },
        create: { code, productId: product.id },
        update: { productId: product.id },
      });
    }
  }

  const suppliers = [
    { name: "Хлебозавод „Средец“ ЕООД", eik: "121000001", phone: "02 900 0001" },
    { name: "Млечни продукти „Родопи“ АД", eik: "121000002", phone: "02 900 0002" },
    { name: "Месокомбинат „Тракия“ ООД", eik: "121000003", phone: "02 900 0003" },
    { name: "Плод-зеленчук борса „Слатина“", eik: "121000004", phone: "02 900 0004" },
    { name: "Дистрибутор напитки „Извор“ ЕООД", eik: "121000005", phone: "02 900 0005" },
  ];
  for (const s of suppliers) {
    const existing = await prisma.supplier.findFirst({ where: { eik: s.eik } });
    if (existing) {
      await prisma.supplier.update({ where: { id: existing.id }, data: s });
    } else {
      await prisma.supplier.create({ data: s });
    }
  }

  await prisma.customer.upsert({
    where: { cardNumber: "1000001" },
    create: {
      cardNumber: "1000001",
      name: "Демо Клиент",
      discountPermille: 30, // 3%
    },
    update: {},
  });

  // Демо промоции (идемпотентно — създават се само ако липсват по име)
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 864e5);
  const dairy = cats.find((c) => c.name === "Млечни продукти");
  const bananas = await prisma.product.findUnique({ where: { plu: 405 } });
  const waffles = await prisma.product.findUnique({ where: { plu: 603 } });
  const demoPromos: Array<Record<string, unknown>> = [];
  if (dairy) demoPromos.push({ name: "−15% на всички млечни", categoryId: dairy.id, kind: "PERCENT", percent: 150 });
  if (bananas) demoPromos.push({ name: "Банани промо цена 1,49 €", productId: bananas.id, kind: "PRICE", priceCents: 149 });
  if (waffles) demoPromos.push({ name: "Вафли „Боровец“ 3 за 2", productId: waffles.id, kind: "MXN", buyQty: 3, payQty: 2 });
  for (const pr of demoPromos) {
    const exists = await prisma.promotion.findFirst({ where: { name: pr.name as string } });
    if (!exists) {
      await prisma.promotion.create({
        data: { ...pr, startDate: today, endDate: in30 } as never,
      });
    }
  }

  console.log("Сийдът приключи: 3 потребители, 10 категории, "
    + `${PRODUCTS.length} стоки, ${suppliers.length} доставчици, ${demoPromos.length} промоции.`);
  console.log("ПИН кодове (сменете ги!): Админ 9999, Управител 5555, Касиер 1111");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
