import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";

export async function GET(req: Request) {
  return guard(async () => {
    await requireSession();
    const card = new URL(req.url).searchParams.get("card")?.trim();
    if (card) {
      const customer = await prisma.customer.findUnique({ where: { cardNumber: card } });
      if (!customer || !customer.active) throw jsonError(404, "Картата не е намерена.");
      return Response.json({ customer });
    }
    const customers = await prisma.customer.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return Response.json({ customers });
  });
}

const schema = z.object({
  cardNumber: z.string().min(3).max(32),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional(),
  discountPermille: z.number().int().min(0).max(500).default(0),
  creditLimitCents: z.number().int().min(0).max(10_000_00).default(0),
  marketingConsent: z.boolean().default(false),
});

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за клиент.");
    const { marketingConsent, ...rest } = parsed.data;
    const customer = await prisma.customer.create({
      data: {
        ...rest,
        marketingConsent,
        // документираме момента на съгласието (GDPR чл. 7 — доказуемост)
        consentAt: marketingConsent ? new Date() : null,
      },
    });
    // без име/телефон в дневника — минимизация (GDPR); номерът на картата е достатъчен
    await audit(s.userId, "CUSTOMER_CREATE", "Customer", customer.id, {
      cardNumber: customer.cardNumber,
      discountPermille: customer.discountPermille,
    });
    return Response.json({ customer }, { status: 201 });
  });
}
