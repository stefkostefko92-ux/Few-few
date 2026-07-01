"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

export type RegisterState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Въведете име.").max(120),
  email: z.string().trim().toLowerCase().email("Невалиден имейл."),
  password: z.string().min(10, "Паролата трябва да е поне 10 знака.").max(200),
  // honeypot
  company: z.string().max(0).optional(),
});

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht",
  ъ: "a", ь: "y", ю: "yu", я: "ya",
};
function slugify(s: string): string {
  return s.toLowerCase().split("").map((c) => CYR[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  if (!rateLimit(`register:${ip}`, 5, 10 * 60_000)) {
    return { error: "Твърде много опити. Опитайте по-късно." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    company: formData.get("company") ?? undefined,
  });
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "company")) {
      return { error: "Възникна грешка." }; // honeypot
    }
    return { error: parsed.error.issues[0]?.message ?? "Проверете полетата." };
  }
  const { name, email, password } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { error: "Вече има акаунт с този имейл." };

  const passwordHash = await hashPassword(password);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

  // Уникален slug за стартовия сайт.
  const root = slugify(name) || "sait";
  let slug = `${root}-${randomBytes(2).toString("hex")}`;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "MEMBER",
        // Стартов сайт + мениджърско членство — за да строи веднага.
        memberships: {
          create: {
            role: "MANAGER",
            site: {
              create: {
                name: `Сайтът на ${name}`,
                slug,
                url: `${base}/site/${slug}`,
              },
            },
          },
        },
      },
    });
  } catch {
    // Малко вероятен сблъсък на slug/имейл — пробваме още веднъж с друг slug.
    slug = `${root}-${randomBytes(3).toString("hex")}`;
    try {
      user = await prisma.user.create({
        data: {
          email, name, passwordHash, role: "MEMBER",
          memberships: {
            create: {
              role: "MANAGER",
              site: { create: { name: `Сайтът на ${name}`, slug, url: `${base}/site/${slug}` } },
            },
          },
        },
      });
    } catch {
      return { error: "Регистрацията не успя. Опитайте отново." };
    }
  }

  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect("/dashboard");
}
