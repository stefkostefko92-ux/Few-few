import 'server-only';
import { PrismaClient, type Prisma } from '@prisma/client';

// One client per process (hot reload in development would otherwise open a pool per reload). Project.kind (the module
// of an installation before round 45) is gone (round 47, migration 22_drop_project_kind): no global omit — the one of
// rounds 45–46 still wrote its default on every INSERT, a client of those rounds cannot create an installation now.
const make = () => new PrismaClient({ log: ['error'] });
type Client = ReturnType<typeof make>;
const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma: Client = globalForPrisma.prisma ?? make();
/** The client or a transaction of it: what a read that runs in both takes. */
export type Db = Client | Prisma.TransactionClient;
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
