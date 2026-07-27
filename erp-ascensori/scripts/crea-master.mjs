// Създава ПЪРВИЯ MASTER акаунт при клиент.
//
//   docker compose run --rm app node scripts/crea-master.mjs
//
// Защо съществува отделно от `prisma/seed.ts`: сийдът зарежда демо данни със
// СЕДЕМ акаунта и публично известната парола от README-то. Пускането му при
// клиент е равносилно на предаване на системата с ключ под изтривалката.
//
// Plain ESM, само `@prisma/client` и `bcryptjs` — и двете са production
// зависимости, значи скриптът работи и без `tsx`, и в orязан образ.

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Парола, генерирана от криптографски източник; без двусмислени знаци. */
function generaPassword(lunghezza = 24) {
  const alfabeto =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*+-";
  const b = randomBytes(lunghezza);
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join("");
}

async function main() {
  const email = (process.env.MASTER_EMAIL ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("✖ Задай MASTER_EMAIL (валиден адрес). Пример:");
    console.error(
      "  MASTER_EMAIL=admin@azienda.it node scripts/crea-master.mjs",
    );
    process.exit(1);
  }

  const fornita = process.env.MASTER_PASSWORD;
  // 12 знака, не 10 (колкото иска API-то): това е акаунтът, който може всичко.
  if (fornita && fornita.length < 12) {
    console.error("✖ MASTER_PASSWORD трябва да е поне 12 знака.");
    process.exit(1);
  }
  const password = fornita ?? generaPassword();

  const nome = process.env.MASTER_NOME ?? "Amministratore";
  const cognome = process.env.MASTER_COGNOME ?? "Sistema";

  const esistente = await prisma.user.findUnique({ where: { email } });
  if (esistente) {
    // Идемпотентно: повторно пускане не пипа паролата на жив акаунт.
    console.log(
      `= Акаунтът ${email} вече съществува (роля ${esistente.ruolo}). Нищо не е променено.`,
    );
    return;
  }

  const creato = await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(password, 10),
      nome,
      cognome,
      ruolo: "MASTER",
      attivo: true,
      // Еднофирмена инсталация: tenantId остава null и филтърът работи както трябва.
      // При мулти-инсталация фирмите се създават ПОСЛЕ, от този акаунт.
      tenantId: null,
    },
    select: { id: true, email: true },
  });

  console.log("");
  console.log("✔ Създаден акаунт MASTER");
  console.log(`  e-mail:  ${creato.email}`);
  if (!fornita) {
    console.log(`  парола:  ${password}`);
    console.log("");
    console.log("  ↑ Показва се ЕДИН ПЪТ и не се пази никъде. Запиши я сега");
    console.log("    в мениджъра на пароли и я смени при първия вход.");
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("✖ Създаването се провали:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
