// backend/src/lib/prisma.js
// Singleton PrismaClient — prevents too many connections in development
// (Next.js hot-reload pattern adapted for Node.js)
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
