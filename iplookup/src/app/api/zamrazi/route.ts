import { NextResponse } from "next/server";
import { z } from "zod";

import { appendAudit } from "@/lib/audit";
import { readCaseContext } from "@/lib/case-context";
import { freezeEvidence } from "@/lib/evidence";
import { parseIp } from "@/lib/ip";
import { lookup } from "@/lib/lookup";
import { isInvestigationMode } from "@/lib/mode";
import { can, DENIED_MESSAGE } from "@/lib/permissions";
import { geoIpStatus } from "@/lib/sources/geoip";

/**
 * Замразява справката за преписка.
 *
 * Справката се прави НАНОВО, а не се приема от клиента: артефакт, съставен от
 * данни, изпратени от браузъра, не доказва нищо — всеки може да прати каквото
 * поиска. Цената е още едно обръщане към източниците; ползата е, че замразеното
 * е това, което сървърът наистина е видял.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ ip: z.string().min(2).max(64) });

export async function POST(request: Request) {
  if (!isInvestigationMode()) {
    return NextResponse.json({ error: "Не е приложимо в този режим." }, { status: 404 });
  }

  const context = await readCaseContext();
  if (!context) {
    return NextResponse.json(
      { error: "Няма задена преписка. Замразяване без основание не се прави." },
      { status: 409 },
    );
  }

  if (!can(context.session.role, "freeze")) {
    return NextResponse.json({ error: DENIED_MESSAGE }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  const ip = parsed.success ? parseIp(parsed.data.ip) : null;
  if (!ip) return NextResponse.json({ error: "Невалиден адрес." }, { status: 400 });

  const report = await lookup(ip);
  const geo = geoIpStatus();

  const frozen = freezeEvidence({
    actor: context.session.sub,
    actorUnit: context.session.unit,
    justification: context.justification,
    query: ip.normalized,
    report,
    datasets: {
      // Версията на офлайн базата е част от възпроизводимостта: същият адрес
      // при друго издание може да даде друг град.
      geoip: geo.ready ? (geo.path ?? "неизвестен път") : "не е зареден",
    },
  });

  appendAudit({
    ts: new Date().toISOString(),
    actor: context.session.sub,
    actorUnit: context.session.unit,
    actorRole: context.session.role,
    action: "износ",
    justification: context.justification,
    query: ip.normalized,
    sources: [report.rdap, report.origin, report.ptr, report.provider, report.reputation, report.geoip]
      .filter((source) => source?.status === "ok")
      .map((source) => source!.source),
    evidence: frozen.hash,
  });

  return NextResponse.json({ hash: frozen.hash, path: frozen.path, frozenAt: frozen.artifact.frozenAt });
}
