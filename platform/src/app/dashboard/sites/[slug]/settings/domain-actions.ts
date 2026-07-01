"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  isValidSubdomain,
  isValidDomain,
  RESERVED_SUBDOMAINS,
  PLATFORM_APEX,
} from "@/lib/domains";

export type DomainResult = { ok?: string; error?: string };

// Задава/сменя наш поддомейн (<sub>.PLATFORM_APEX). Уникален, не запазен.
export async function setSubdomainAction(
  slug: string,
  raw: string,
): Promise<DomainResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const sub = raw.trim().toLowerCase();
  if (sub === "") {
    await prisma.site.update({ where: { id: found.site.id }, data: { subdomain: null } });
    revalidatePath(`/dashboard/sites/${slug}/settings`);
    return { ok: "Поддоменът е премахнат." };
  }
  if (!isValidSubdomain(sub)) {
    return { error: "Само малки латински букви, цифри и тире (1–32 знака)." };
  }
  if (RESERVED_SUBDOMAINS.has(sub)) return { error: "Този поддомейн е запазен." };

  const taken = await prisma.site.findFirst({
    where: { subdomain: sub, NOT: { id: found.site.id } },
    select: { id: true },
  });
  if (taken) return { error: "Този поддомейн вече е зает." };

  await prisma.site.update({ where: { id: found.site.id }, data: { subdomain: sub } });
  await logAudit(user, {
    action: "UPDATE",
    entity: "Site",
    entityId: found.site.id,
    summary: `Поддомейн ${sub}.${PLATFORM_APEX} за „${found.site.name}"`,
  });
  revalidatePath(`/dashboard/sites/${slug}/settings`);
  return { ok: `Поддоменът е зададен: ${sub}.${PLATFORM_APEX}` };
}

// Задава собствен домейн (непотвърден) + генерира токен за TXT верификация.
export async function setCustomDomainAction(
  slug: string,
  raw: string,
): Promise<DomainResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain === "") {
    await prisma.site.update({
      where: { id: found.site.id },
      data: { customDomain: null, domainVerified: false, domainToken: null },
    });
    revalidatePath(`/dashboard/sites/${slug}/settings`);
    return { ok: "Собственият домейн е премахнат." };
  }
  if (!isValidDomain(domain)) return { error: "Невалиден домейн (напр. example.com)." };

  const taken = await prisma.site.findFirst({
    where: { customDomain: domain, NOT: { id: found.site.id } },
    select: { id: true },
  });
  if (taken) return { error: "Този домейн вече е свързан с друг сайт." };

  const token = randomBytes(16).toString("hex");
  await prisma.site.update({
    where: { id: found.site.id },
    data: { customDomain: domain, domainVerified: false, domainToken: token },
  });
  revalidatePath(`/dashboard/sites/${slug}/settings`);
  return { ok: "Домейнът е добавен. Настройте DNS и натиснете „Провери“." };
}

// Проверява собствения домейн: TXT запис carbonstealth-verify=<token>.
export async function verifyDomainAction(slug: string): Promise<DomainResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };

  const site = await prisma.site.findUnique({
    where: { id: found.site.id },
    select: { customDomain: true, domainToken: true },
  });
  if (!site?.customDomain || !site.domainToken) {
    return { error: "Първо добавете собствен домейн." };
  }

  const expected = `carbonstealth-verify=${site.domainToken}`;
  try {
    // Проверяваме TXT на самия домейн и на _carbonstealth.<домейн>.
    const targets = [site.customDomain, `_carbonstealth.${site.customDomain}`];
    let matched = false;
    for (const t of targets) {
      try {
        const records = await resolveTxt(t);
        if (records.flat().some((r) => r.trim() === expected)) {
          matched = true;
          break;
        }
      } catch {
        /* този запис липсва — пробваме следващия */
      }
    }
    if (!matched) {
      return { error: "TXT записът още не се вижда. DNS може да се обнови до час." };
    }
  } catch {
    return { error: "Проверката на DNS не успя. Опитайте по-късно." };
  }

  await prisma.site.update({
    where: { id: found.site.id },
    data: { domainVerified: true },
  });
  await logAudit(user, {
    action: "UPDATE",
    entity: "Site",
    entityId: found.site.id,
    summary: `Потвърден домейн ${site.customDomain} за „${found.site.name}"`,
  });
  revalidatePath(`/dashboard/sites/${slug}/settings`);
  return { ok: "Домейнът е потвърден! Сайтът вече се обслужва на него." };
}

// Премиум (маха водния знак „Carbon Stealth"). Само собственик на платформата;
// по-нататък ще се управлява през билинг (Stripe).
export async function setPremiumAction(
  slug: string,
  premium: boolean,
): Promise<DomainResult> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Само собственик може да променя премиум." };
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  await prisma.site.update({ where: { id: found.site.id }, data: { premium } });
  await logAudit(user, {
    action: "UPDATE",
    entity: "Site",
    entityId: found.site.id,
    summary: `${premium ? "Включен" : "Изключен"} премиум за „${found.site.name}"`,
  });
  revalidatePath(`/dashboard/sites/${slug}/settings`);
  return { ok: premium ? "Премиум е включен (без воден знак)." : "Премиум е изключен." };
}

// Публикува/спира сайта (нужно е, за да се обслужва на домейн/поддомейн).
export async function setPublishedAction(
  slug: string,
  published: boolean,
): Promise<DomainResult> {
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) return { error: "Нямате достъп." };
  await prisma.site.update({ where: { id: found.site.id }, data: { published } });
  revalidatePath(`/dashboard/sites/${slug}/settings`);
  return { ok: published ? "Сайтът е публикуван." : "Сайтът е спрян." };
}
