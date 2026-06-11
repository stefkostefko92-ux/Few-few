import { PrismaClient, Prisma } from "@prisma/client";

export * from "@prisma/client";

/**
 * Singleton Prisma client. In dev we stash it on globalThis so HMR / repeated
 * imports don't exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma };
