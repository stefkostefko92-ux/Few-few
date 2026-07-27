// Readiness: „да пускаме ли трафик". Проверява база, схема и ключове.
//
// На непознат връща само булево — коя точно проверка е паднала е информация,
// която не му дължим. Подробности само с валиден HEALTH_TOKEN.
// Резултатът се кешира 5 s, за да не чука probe-ът базата на всеки 10 s.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rlsAttiva } from "@/lib/rls";
import { archivioScrivibile } from "@/lib/allegati/archivio";
import { log, descriviErrore } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Esito {
  pronto: boolean;
  db: boolean;
  schema: boolean;
  chiavi: boolean;
  /** Втората линия на изолацията. Не спира трафика, но операторът трябва да я
   *  ВИЖДА: суперпотребителска роля прави политиките украса, без нищо в лога. */
  rls: boolean;
  rlsMotivo?: string;
  /** Хранилището на прикачените файлове — записваемо ли е.
   *
   *  НЕ ВЛИЗА В `pronto`, И ТОВА Е ОБМИСЛЕНО. Пълен диск в три през нощта би
   *  свалил ЦЕЛИЯ гестионал — включително фактурирането, което няма нищо общо
   *  с прикачените файлове — и при `restart: unless-stopped` би влязъл в цикъл
   *  на рестарти, който не поправя нищо. Затова тук трафикът остава.
   *
   *  Но непримонтираният том ТРЯБВА да вали деплоя, иначе autodeploy рапортува
   *  успех, а качените сертификати изчезват при следващото пресъздаване на
   *  контейнера. Затова има ВТОРО поле — `rilascio` — и здравната проверка на
   *  освобождаването гледа НЕГО. Разликата е: „пускай ли трафик" и „минава ли
   *  това издание" не са един и същ въпрос. */
  archivio: boolean;
  archivioMotivo?: string;
  /** Всичко от `pronto` ПЛЮС нещата, които ново издание няма право да чупи:
   *  хранилището и активната RLS. Гейт на деплоя, не на трафика. */
  rilascio: boolean;
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
    rls: false,
    archivio: false,
    rilascio: false,
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    esito.db = true;
    // схемата налична? (заместител на проверка за приложени миграции)
    await prisma.user.findFirst({ select: { id: true } });
    esito.schema = true;
    const r = await rlsAttiva();
    esito.rls = r.attiva;
    if (r.motivo) esito.rlsMotivo = r.motivo;
  } catch (e) {
    log.warn("readyz: controllo fallito", descriviErrore(e));
  }
  const a = await archivioScrivibile();
  esito.archivio = a.ok;
  if (a.motivo) esito.archivioMotivo = a.motivo;
  if (!esito.archivio)
    log.warn(
      `readyz: archivio allegati non scrivibile — ${esito.archivioMotivo ?? "?"}`,
    );
  if (!esito.rls)
    log.warn(`readyz: RLS non attiva — ${esito.rlsMotivo ?? "motivo ignoto"}`);
  // ТРАФИК: базата, схемата и ключовете. Всичко останало е влошаване, което
  // приложението преживява — а readiness, който пада при влошаване, изключва
  // работеща система.
  esito.pronto = esito.db && esito.schema && esito.chiavi;
  // ИЗДАНИЕ: и хранилището, и втората линия на изолацията. Тук отказът е
  // евтин (връщане назад на релийза), а пропускът — скъп: непримонтиран том
  // значи изчезващи документи, а суперпотребителска роля прави RLS украса.
  esito.rilascio = esito.pronto && esito.archivio && esito.rls;
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
