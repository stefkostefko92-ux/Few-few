import { z } from "zod";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { FISCAL_DRIVERS } from "@/lib/fiscal";
import { TERMINAL_DRIVERS } from "@/lib/terminal";

export async function GET() {
  return guard(async () => {
    await requireSession();
    const [store, fiscal, terminal, display, vatRates, barcodeMasks] = await Promise.all([
      getSetting("store"),
      getSetting("fiscal"),
      getSetting("terminal"),
      getSetting("display"),
      getSetting("vatRates"),
      getSetting("barcodeMasks"),
    ]);
    return Response.json({
      store,
      fiscal,
      terminal,
      display,
      vatRates,
      barcodeMasks,
      fiscalDrivers: FISCAL_DRIVERS,
      terminalDrivers: TERMINAL_DRIVERS,
    });
  });
}

const schema = z.object({
  store: z
    .object({
      name: z.string().min(1).max(160),
      eik: z.string().min(9).max(13),
      vatNumber: z.string().max(15),
      mol: z.string().max(120),
      storeName: z.string().min(1).max(160),
      address: z.string().min(1).max(200),
      city: z.string().min(1).max(80),
      phone: z.string().max(40),
      footerText: z.string().max(120),
    })
    .optional(),
  fiscal: z
    .object({
      driver: z.enum(["demo", "erpnet", "tremol", "datecs-lan"]),
      deviceSerial: z.string().min(1).max(16),
      fiscalMemoryNumber: z.string().min(1).max(16),
      host: z.string().min(1).max(100),
      port: z.number().int().min(1).max(65535),
      printerId: z.string().min(1).max(40),
      suptoMode: z.boolean(),
    })
    .optional(),
  terminal: z
    .object({
      driver: z.enum(["demo", "mypos-ecr", "sumup", "borica", "none"]),
      host: z.string().max(100),
      port: z.number().int().min(1).max(65535),
      apiKey: z.string().max(200),
      merchantCode: z.string().max(40),
      readerId: z.string().max(60),
    })
    .optional(),
  display: z
    .object({
      dualDisplay: z.boolean(),
      dualDisplayEnd: z.string().date(),
    })
    .optional(),
  vatRates: z
    .object({
      A: z.number().int().min(0).max(999),
      B: z.number().int().min(0).max(999),
      C: z.number().int().min(0).max(999),
      D: z.number().int().min(0).max(999),
    })
    .optional(),
  barcodeMasks: z
    .array(
      z.object({
        prefix: z.string().regex(/^2\d$/),
        kind: z.enum(["weight", "price"]),
        pluDigits: z.number().int().min(3).max(6),
        valueDigits: z.number().int().min(3).max(6),
        valueDecimals: z.number().int().min(0).max(3),
      })
    )
    .optional(),
});

export async function PUT(req: Request) {
  return guard(async () => {
    const s = await requireRole("ADMIN");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни настройки.");
    const body = parsed.data;

    for (const key of ["store", "fiscal", "terminal", "display", "vatRates", "barcodeMasks"] as const) {
      const value = body[key];
      if (value !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await setSetting(key, value as any);
        await audit(s.userId, "SETTINGS_CHANGE", "Setting", key, value);
      }
    }
    return Response.json({ ok: true });
  });
}
