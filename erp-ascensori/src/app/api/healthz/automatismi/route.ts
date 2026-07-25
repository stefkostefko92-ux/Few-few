// Dead-man switch за автоматизмите.
//
// Проверката идва от НЕЗАВИСИМ наблюдател, не от самия cron: ако cron-ът е
// спрян, той по дефиниция няма да се оплаче. Тук отговаряме по СИМПТОМ
// („сроковете не се актуализират"), не по причина („процесът липсва").
//
// 503 при липса на успешно пускане в последните 26 часа (24 ч каданс + резерв).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log, descriviErrore } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOGLIA_ORE = Number(process.env.AUTOMATISMI_SOGLIA_ORE ?? 26);

export async function GET() {
  try {
    const ultimo = await prisma.automatismoRun.findFirst({
      where: { nome: "scadenze", esito: "OK" },
      orderBy: { terminatoAt: "desc" },
      select: { terminatoAt: true },
    });

    const limite = new Date(Date.now() - SOGLIA_ORE * 3_600_000);
    const aggiornato = Boolean(ultimo?.terminatoAt && ultimo.terminatoAt > limite);

    return NextResponse.json(
      {
        aggiornato,
        ultimoSuccesso: ultimo?.terminatoAt ?? null,
        sogliaOre: SOGLIA_ORE,
      },
      { status: aggiornato ? 200 : 503 }
    );
  } catch (e) {
    log.error("healthz/automatismi fallito", descriviErrore(e));
    return NextResponse.json({ aggiornato: false }, { status: 503 });
  }
}
