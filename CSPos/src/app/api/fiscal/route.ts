// Статус на фискалното устройство и терминала + X/Z отчети при поискване.

import { z } from "zod";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFiscalDriver } from "@/lib/fiscal";
import { getTerminalDriver } from "@/lib/terminal";

export async function GET() {
  return guard(async () => {
    await requireSession();
    const fiscal = await getFiscalDriver();
    const terminal = await getTerminalDriver();
    const [fiscalStatus, terminalStatus] = await Promise.all([
      fiscal.status(),
      terminal ? terminal.status() : Promise.resolve(null),
    ]);
    return Response.json({ fiscal: fiscalStatus, terminal: terminalStatus });
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
