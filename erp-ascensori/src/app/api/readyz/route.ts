// Readiness: „да пускаме ли трафик". Проверява база, схема и ключове.
//
// На непознат връща само булево — коя точно проверка е паднала е информация,
// която не му дължим. Подробности само с валиден HEALTH_TOKEN.
// Резултатът се кешира 5 s, за да не чука probe-ът базата на всеки 10 s.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { log, descriviErrore } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Esito {
  pronto: boolean;
  db: boolean;
  schema: boolean;
  chiavi: boolean;
}

let cache: { esito: Esito; scadenza: number } | null = null;
const TTL_MS = 5_000;

function chiaviValide(): boolean {
  const s = process.env.SESSION_SECRET;
  const a = process.env.AUDIT_HMAC_KEY;
  return Boolean(s && s.length >= 32 && a && a.length >= 32 && s !== a);
}

async function controlla(): Promise<Esito> {
  const esito: Esito = {
    pronto: false,
    db: false,
    schema: false,
    chiavi: chiaviValide(),
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    esito.db = true;
    // схемата налична? (заместител на проверка за приложени миграции)
    await prisma.user.findFirst({ select: { id: true } });
    esito.schema = true;
  } catch (e) {
    log.warn("readyz: controllo fallito", descriviErrore(e));
  }
  esito.pronto = esito.db && esito.schema && esito.chiavi;
  return esito;
}

function autorizzato(req: Request): boolean {
  const atteso = process.env.HEALTH_TOKEN;
  if (!atteso) return false;
  const dato = req.headers.get("x-health-token") ?? "";
  const a = Buffer.from(atteso);
  const b = Buffer.from(dato);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const ora = Date.now();
  if (!cache || cache.scadenza < ora) {
    cache = { esito: await controlla(), scadenza: ora + TTL_MS };
  }
  const { esito } = cache;
  const corpo = autorizzato(req) ? esito : { pronto: esito.pronto };
  return NextResponse.json(corpo, { status: esito.pronto ? 200 : 503 });
}
