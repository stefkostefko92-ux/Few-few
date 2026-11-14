// Статус на фискалното устройство и терминала + X/Z отчети при поискване.

import { z } from "zod";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { checkFiscal } from "@/lib/fiscal/link";
import { getTerminalDriver } from "@/lib/terminal";

// т. 8: екранът за продажби пита тук при старт — проверка на живо (ИН + час на ФУ)
export async function GET() {
  return guard(async () => {
    await requireSession();
    const terminal = await getTerminalDriver();
    const [check, terminalStatus] = await Promise.all([
      checkFiscal(),
      terminal ? terminal.status().catch(() => ({ ok: false, driver: terminal.id, detail: "няма връзка" })) : Promise.resolve(null),
    ]);
    return Response.json({
      fiscal: { ok: check.ok, detail: check.link.detail, deviceSerial: check.link.serial, offsetMs: check.link.offsetMs },
      terminal: terminalStatus,
    });
  });
}

const schema = z.object({ action: z.enum(["xreport", "zreport"]) });

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("MANAGER");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидно действие.");

    const fiscal = await getFiscalDriver();
    const r = parsed.data.action === "xreport" ? await fiscal.xReport() : await fiscal.zReport();
    if (!r.ok) throw jsonError(502, r.error ?? "ФУ отказа отчета.");
    await audit(s.userId, parsed.data.action.toUpperCase(), "Fiscal", r.receiptNumber);
    return Response.json({ result: r });
  });
}
