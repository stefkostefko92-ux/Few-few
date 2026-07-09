import { prisma } from "@/lib/prisma";

// Чете ключ-стойност настройка от базата. Връща null при липса или грешка
// (напр. още няма таблици), за да не чупи рендера.
export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key } });
    return row?.value?.trim() || null;
  } catch {
    return null;
  }
}

// Facebook адрес — от базата или от променливата на средата.
export async function getFacebookUrl(): Promise<string | null> {
  const fromDb = await getSetting("facebookUrl");
  return fromDb || process.env.FACEBOOK_URL?.trim() || null;
}

// Кодове за потвърждаване на собствеността пред търсачки.
export async function getSeoVerification(): Promise<{
  google: string | null;
  bing: string | null;
}> {
  const [google, bing] = await Promise.all([
    getSetting("seoGoogle"),
    getSetting("seoBing"),
  ]);
  return {
    google: google || process.env.SEO_GOOGLE_VERIFICATION?.trim() || null,
    bing: bing || process.env.SEO_BING_VERIFICATION?.trim() || null,
  };
}
