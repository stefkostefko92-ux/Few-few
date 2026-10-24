import { PrismaClient } from '@prisma/client';

/** Един клиент на процес. Сайтът само чете; работникът трие по сроковете (retention.ts). */
export const prisma = new PrismaClient();
