import { defineConfig } from "prisma/config";

// Prisma 7 config does not auto-load .env; Node 22 can load it natively.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file (e.g. CI with env vars already set) — fine.
}

/**
 * Prisma 7 config. The runtime connection is provided to PrismaClient via a
 * driver adapter (see src/data/prismaClient.ts); this config only tells the
 * Migrate CLI how to reach the database for `prisma db push` / `migrate`.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` only needs this to resolve (it doesn't connect); a
    // placeholder keeps codegen working in CI without a live database. Migrate
    // commands require a real DATABASE_URL.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:5432/placeholder",
  },
});
