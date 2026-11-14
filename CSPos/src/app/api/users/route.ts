// Оператори (Прил. № 29, т. 6, т. 15 „а“, т. 19): уникален код, поне две имена, роля с
// период на активност, одиторски профил (само четене). Всяка промяна влиза в дневника с
// описание „преди → след“; смяната на ролята затваря стария период и отваря нов.

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole, requireRead } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasTwoNames } from "@/lib/operators";

const SELECT = {
  id: true,
  name: true,
  operatorCode: true,
  role: true,
  readOnly: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  deactivatedAt: true,
  roleGrants: { orderBy: { validFrom: "asc" as const } },
};

export async function GET() {
  return guard(async () => {
    await requireRead("ADMIN");
    const users = await prisma.user.findMany({ select: SELECT, orderBy: { operatorCode: "asc" } });
    return Response.json({ users });
  });
}

const name = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .refine(hasTwoNames, "Въведете поне две имена (собствено и фамилия).");

const createSchema = z.object({
  name,
  operatorCode: z.number().int().min(1).max(9999),
  pin: z.string().regex(/^\d{4,8}$/),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
  readOnly: z.boolean().default(false),
});

function firstIssue(e: z.ZodError, fallback: string): string {
  return e.issues.find((i) => i.message && !i.message.startsWith("Invalid") && !i.message.startsWith("String"))?.message ?? fallback;
}

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("ADMIN");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, firstIssue(parsed.error, "Невалидни данни (ПИН: 4–8 цифри)."));
    const { pin, ...data } = parsed.data;
    const taken = await prisma.user.findUnique({ where: { operatorCode: data.operatorCode } });
    if (taken) throw jsonError(409, `Код ${data.operatorCode} вече е зает — кодът на оператора е уникален.`);

    const user = await prisma.$transaction(async (tx) => {
      // ПИН-ът е зададен от администратора → операторът го сменя при първия си вход (КП-П.2)
      const u = await tx.user.create({ data: { ...data, pinHash: await bcrypt.hash(pin, 10), mustChangePin: true } });
      await tx.userRoleGrant.create({
        data: { userId: u.id, role: data.role, readOnly: data.readOnly, grantedById: s.userId },
      });
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, select: SELECT });
    });
    await audit(s.userId, "USER_CREATE", "User", user.id, {
      name: user.name,
      operatorCode: user.operatorCode,
      role: user.role,
      readOnly: user.readOnly,
    });
    return Response.json({ user }, { status: 201 });
  });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: name.optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  readOnly: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  return guard(async () => {
    const s = await requireRole("ADMIN");
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, firstIssue(parsed.error, "Невалидни данни."));
    const { id, pin, ...data } = parsed.data;
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw jsonError(404, "Операторът не е намерен.");
    if (id === s.userId && (data.active === false || data.readOnly === true || (data.role && data.role !== "ADMIN"))) {
      throw jsonError(409, "Не можете да отнемете собствените си администраторски права.");
    }
    // собственият ПИН — само през смяната със стария ПИН и политиката (КП-П.3)
    if (pin && id === s.userId) {
      throw jsonError(409, "Собствения си ПИН сменете от „Смяна на ПИН“ — със стария ПИН.");
    }

    const now = new Date();
    const roleChanged =
      (data.role !== undefined && data.role !== before.role) ||
      (data.readOnly !== undefined && data.readOnly !== before.readOnly);
    const deactivated = data.active === false && before.active;
    const reactivated = data.active === true && !before.active;

    const user = await prisma.$transaction(async (tx) => {
      if (roleChanged || deactivated) {
        await tx.userRoleGrant.updateMany({ where: { userId: id, validTo: null }, data: { validTo: now } });
      }
      if ((roleChanged && (data.active ?? before.active)) || reactivated) {
        await tx.userRoleGrant.create({
          data: {
            userId: id,
            role: data.role ?? before.role,
            readOnly: data.readOnly ?? before.readOnly,
            validFrom: now,
            grantedById: s.userId,
          },
        });
      }
      return tx.user.update({
        where: { id },
        data: {
          ...data,
          ...(deactivated && { deactivatedAt: now }),
          ...(reactivated && { deactivatedAt: null }),
          // чужд ПИН, зададен от администратора, се сменя от оператора при следващия вход
          ...(pin ? { pinHash: await bcrypt.hash(pin, 10), mustChangePin: true } : {}),
        },
        select: SELECT,
      });
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of ["name", "role", "readOnly", "active"] as const) {
      if (data[k] !== undefined && data[k] !== before[k]) changes[k] = { from: before[k], to: data[k] };
    }
    await audit(s.userId, "USER_UPDATE", "User", id, { operatorCode: before.operatorCode, changes, pinChanged: Boolean(pin) });
    return Response.json({ user });
  });
}
