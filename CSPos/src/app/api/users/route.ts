import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  return guard(async () => {
    await requireRole("ADMIN");
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        operatorCode: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { operatorCode: "asc" },
    });
    return Response.json({ users });
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  operatorCode: z.number().int().min(1).max(9999),
  pin: z.string().regex(/^\d{4,8}$/),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("ADMIN");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни (ПИН: 4–8 цифри).");
    const { pin, ...data } = parsed.data;

    const user = await prisma.user.create({
      data: { ...data, pinHash: await bcrypt.hash(pin, 10) },
      select: { id: true, name: true, operatorCode: true, role: true, active: true },
    });
    await audit(s.userId, "USER_CREATE", "User", user.id, {
      name: user.name,
      operatorCode: user.operatorCode,
      role: user.role,
    });
    return Response.json({ user }, { status: 201 });
  });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  return guard(async () => {
    const s = await requireRole("ADMIN");
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни.");
    const { id, pin, ...data } = parsed.data;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(pin ? { pinHash: await bcrypt.hash(pin, 10) } : {}),
      },
      select: { id: true, name: true, operatorCode: true, role: true, active: true },
    });
    await audit(s.userId, "USER_UPDATE", "User", id, {
      ...data,
      pinChanged: Boolean(pin),
    });
    return Response.json({ user });
  });
}
