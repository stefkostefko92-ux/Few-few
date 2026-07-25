// Помощници за втория фактор, които пипат базата.
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Проверява резервен код и го ИЗРАЗХОДВА.
 *
 * Еднократността е цялата разлика между резервен код и втора парола: без нея
 * записан на хартия код върши работа завинаги.
 */
export async function consumaCodiceRecupero(utenteId: string, fornito: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: utenteId },
    select: { codiciRecupero: true },
  });
  if (!u?.codiciRecupero.length) return false;

  const pulito = fornito.trim().toUpperCase();
  for (const hash of u.codiciRecupero) {
    if (!(await bcrypt.compare(pulito, hash))) continue;
    // Условен запис: два едновременни опита със същия код не могат да минат
    // и двата, защото вторият вече не намира хеша в списъка.
    const { count } = await prisma.user.updateMany({
      where: { id: utenteId, codiciRecupero: { has: hash } },
      data: { codiciRecupero: u.codiciRecupero.filter((h) => h !== hash) },
    });
    return count > 0;
  }
  return false;
}

/** Хешира резервните кодове преди запис — в базата не влизат в чист вид. */
export async function hashCodiciRecupero(codici: string[]): Promise<string[]> {
  return Promise.all(codici.map((c) => bcrypt.hash(c, 10)));
}
