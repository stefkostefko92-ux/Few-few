// Демо стенд: отказ на промени по сигурността на общите демо акаунти.
// Правилото е в `demo.ts` (чисто); тук е само четенето на имейла.

import { prisma } from "@/lib/prisma";
import { ErroreHttp } from "@/lib/auth";
import { accountBloccatoDemo, MESSAGGIO_DEMO } from "@/lib/demo";

/** 403, ако акаунтът е демо акаунт и стендът е в демо режим. */
export async function vietaSeAccountDemo(utenteId: string): Promise<void> {
  if (process.env.DEMO !== "1") return;
  const u = await prisma.user.findUnique({
    where: { id: utenteId },
    select: { email: true },
  });
  if (accountBloccatoDemo(u?.email)) throw new ErroreHttp(403, MESSAGGIO_DEMO);
}
