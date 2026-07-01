import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || "";
  const name = process.env.OWNER_NAME || "Собственик";

  if (!email || !password) {
    throw new Error(
      "Задайте OWNER_EMAIL и OWNER_PASSWORD в .env преди db:seed.",
    );
  }
  if (password.length < 10 || /СМЕНИ|CHANGE|password|123456/i.test(password)) {
    throw new Error(
      "OWNER_PASSWORD е твърде слаба/примерна. Сложете силна парола (мин. 10 знака).",
    );
  }

  const passwordHash = await bcrypt.hash(password, 11);
  const owner = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "OWNER" },
    // При повторно сийдване не сменяме паролата, само гарантираме ролята.
    update: { role: "OWNER", active: true },
  });
  console.log(`✓ Собственик: ${owner.email}`);

  // Демонстрационен сайт (само за да не е празно табло при първо пускане).
  const demo = await prisma.site.upsert({
    where: { slug: "demo" },
    create: {
      slug: "demo",
      name: "Демонстрационен сайт",
      url: "https://example.com",
      notes: "Примерен запис — редактирайте или изтрийте от Администрация → Сайтове.",
    },
    update: {},
  });
  console.log(`✓ Демо сайт: ${demo.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
