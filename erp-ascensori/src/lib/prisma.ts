// Единствен PrismaClient за процеса (dev hot-reload safe).
//
// `errorFormat: "minimal"` намалява количеството данни от заявката, което
// попада в съобщението на грешката (те съдържат аргументите, тоест лични
// данни). Пулът се задава ЯВНО в DATABASE_URL — по подразбиране зависи от броя
// ядра и се променя мълчаливо при смяна на машина:
//   ?connection_limit=10&pool_timeout=10&connect_timeout=5

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    errorFormat: "minimal",
    // никога `query` в продукция — параметрите са лични данни
    log:
      process.env.NODE_ENV === "production"
        ? ["warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
