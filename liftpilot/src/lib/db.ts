import 'server-only';
import { PrismaClient } from '@prisma/client';

// One client per process (hot reload in development would otherwise open a pool per reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
