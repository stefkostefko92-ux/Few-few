// Настройки: четене за всяка роля (одиторът вижда конфигурацията — т. 19), запис само от
// администратор. Режимът СУПТО е еднопосочен (т. 10) и не допуска демо драйвери (т. 20).
// Тайните (API ключ на терминала) никога не излизат към екрана — показва се маска.

import { z } from "zod";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { FISCAL_DRIVERS } from "@/lib/fiscal";
import { TERMINAL_DRIVERS } from "@/lib/terminal";
import { suptoConfigError } from "@/lib/fiscal/readiness";

const MASK = "••••••••";
function maskKey(k: string): string {
  return k ? `${MASK}${k.slice(-4)}` : "";
}

export async function GET() {
  return guard(async () => {
    await requireSession();
    const [store, fiscal, terminal, display, vatRates, barcodeMasks, workplace, pos] = await Promise.all([
      getSetting("store"),
      getSetting("fiscal"),
      getSetting("terminal"),
      getSetting("display"),
      getSetting("vatRates"),
      getSetting("barcodeMasks"),
      getSetting("workplace"),
      getSetting("pos"),
    ]);
    return Response.json({
      store,
      fiscal,
      terminal: { ...terminal, apiKey: maskKey(terminal.apiKey) },
      display,
      vatRates,
      barcodeMasks,
      workplace,
      pos,
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
      code: z.string().trim().min(1).max(10).default("1"),
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
  workplace: z
    .object({ code: z.string().trim().min(1).max(10), name: z.string().trim().min(1).max(60) })
    .optional(),
  pos: z.object({ maxCashierDiscountPermille: z.number().int().min(0).max(999) }).optional(),
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
    const [curFiscal, curTerminal] = await Promise.all([getSetting("fiscal"), getSetting("terminal")]);

    // маскираният ключ от екрана означава „без промяна“
    if (body.terminal && (body.terminal.apiKey === "" || body.terminal.apiKey.startsWith(MASK))) {
      body.terminal.apiKey = body.terminal.apiKey === "" ? "" : curTerminal.apiKey;
    }

    let enablingSupto = false;
    let fiscalValue = body.fiscal ? { ...body.fiscal, suptoSince: curFiscal.suptoSince ?? null } : undefined;
    if (fiscalValue) {
      if (curFiscal.suptoMode && !fiscalValue.suptoMode) {
        throw jsonError(409, "Режимът СУПТО не може да бъде изключен, след като е включен (Прил. № 29, т. 10).");
      }
      enablingSupto = fiscalValue.suptoMode && !curFiscal.suptoMode;
      if (enablingSupto) fiscalValue = { ...fiscalValue, suptoSince: new Date().toISOString() };
    }
    const effFiscal = fiscalValue ?? curFiscal;
    const effTerminal = body.terminal ?? curTerminal;
    const configError = suptoConfigError(effFiscal, effTerminal);
    if (configError) throw jsonError(409, configError);

    const values = { ...body, ...(fiscalValue && { fiscal: fiscalValue }) };
    for (const key of ["store", "fiscal", "terminal", "display", "vatRates", "barcodeMasks", "workplace", "pos"] as const) {
      const value = values[key];
      if (value !== undefined) {
        const before = await getSetting(key);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await setSetting(key, value as any);
        const redact = (v: unknown) =>
          key === "terminal" && v && typeof v === "object" ? { ...(v as object), apiKey: "[скрит]" } : v;
        await audit(s.userId, "SETTINGS_CHANGE", "Setting", key, { before: redact(before), after: redact(value) });
      }
    }
    if (enablingSupto) {
      await audit(s.userId, "SUPTO_ENABLED", "Setting", "fiscal", { driver: effFiscal.driver, terminal: effTerminal.driver });
    }
    return Response.json({ ok: true });
  });
}
