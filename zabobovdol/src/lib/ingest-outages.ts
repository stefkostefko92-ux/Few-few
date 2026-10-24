import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyOnPublish, notifyTopic } from "@/lib/push";
import { sendMail } from "@/lib/mail";
import {
  ERM_ENDPOINT,
  ERM_EXTERNAL_PREFIX,
  ERM_HOST,
  ERM_MUNICIPALITY,
  MAX_RESPONSE_CHARS,
  MIN_INTERVAL_MS,
  STATUS_SETTING_KEY,
  buildOutageDrafts,
  draftsFormatProblem,
  formatOutageTime,
  nextStatus,
  outageNote,
  parseErmResponse,
  parseStatus,
  shouldAlert,
  sofiaWallNow,
  type IngestStatus,
} from "@/lib/ingest-outages-core";

// Автоматичен внос на прекъсванията на тока от ЕРМ Запад за община Бобов дол.
// Вика се САМО от защитения POST /api/ingest-outages (cron на сървъра) и само
// при ERM_INGEST_ENABLED=1. Чистата логика е в ingest-outages-core.ts.
//
// Правила:
//  • Тегли само от https://info.ermzapad.bg (твърдо зададен адрес, без
//    пренасочвания, с таван на размера и времето) — никакъв SSRF.
//  • Непознат отговор → нула записа, нищо не се трие; отбелязва се грешка.
//    Същото, ако някой запис е с непознат тип или място (смяна на формата).
//  • Запис по externalId (upsert): повторен внос не дублира. Скрит от админа
//    запис НЕ се публикува отново; ръчно редактирана бележка не се презаписва.
//  • Изчезнало от ЕРМ прекъсване, което вече е започнало = възстановено
//    захранване → краят става „сега“. Ако се появи пак, следващият внос
//    връща края от източника (самопоправя се).
//  • Известие веднъж за прекъсване (notifiedAt), едно на събитие.

const USER_AGENT = "ZaBobovDolBot/1.0 (+https://zabobovdol.carbonstealth.eu)";
const MAX_BYTES = MAX_RESPONSE_CHARS * 4;
const AUTO_NOTE_PREFIX = outageNote(1).slice(0, 40);

type Fetched = { ok: true; text: string } | { ok: false; error: string };

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) {
    const t = await res.text();
    return t.length > maxBytes ? null : t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

async function fetchErm(): Promise<Fetched> {
  const url = new URL(ERM_ENDPOINT);
  // Защита в дълбочина: адресът е константа, но проверяваме и хоста.
  if (url.protocol !== "https:" || url.hostname !== ERM_HOST) {
    return { ok: false, error: "Непозволен адрес на източника." };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json, text/plain, */*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        referer: "https://info.ermzapad.bg/webint/vok/avplan.php?PLAN=FYI",
      },
      body: new URLSearchParams({ action: "draw", gm_obstina: ERM_MUNICIPALITY }).toString(),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return { ok: false, error: "Твърде голям отговор." };
    const text = await readCapped(res, MAX_BYTES);
    if (text === null) return { ok: false, error: "Твърде голям отговор." };
    return { ok: true, text };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return {
      ok: false,
      error: name === "TimeoutError" || name === "AbortError" ? "Изтече времето за отговор." : "Грешка при връзката.",
    };
  }
}

async function loadStatus(): Promise<IngestStatus> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STATUS_SETTING_KEY } });
  return parseStatus(row?.value);
}

async function saveStatus(s: IngestStatus): Promise<void> {
  const value = JSON.stringify(s);
  await prisma.siteSetting.upsert({
    where: { key: STATUS_SETTING_KEY },
    create: { key: STATUS_SETTING_KEY, value },
    update: { value },
  });
}

async function alertAdmin(s: IngestStatus): Promise<void> {
  const to = process.env.ADMIN_EMAIL?.trim();
  if (!to) return;
  await sendMail({
    to,
    subject: "За Бобов дол: вносът на прекъсвания от ЕРМ Запад спря",
    text:
      `Последните ${s.failStreak} опита за внос от ЕРМ Запад завършиха с грешка.\n` +
      `Грешка: ${s.lastError ?? "—"}\n` +
      `Последен успешен внос: ${s.lastOkAt ?? "никога"}\n\n` +
      `Докато не се оправи, страницата /prekysvaniya показва „Информацията може да е остаряла“.\n` +
      `Какво да проверите: zabobovdol/docs/outages-ingest.md (раздел „Когато спре“).`,
  });
}

export type OutagesIngestResult = {
  ok: boolean;
  skipped?: "running" | "too_soon";
  error?: string;
  /** Записи (трафопостове), върнати от ЕРМ. */
  found: number;
  /** Прекъсвания в община Бобов дол след групиране. */
  matched: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Изчезнали от ЕРМ (възстановени) — краят е зададен „сега“. */
  closed: number;
  /** Колко известия са опитани (едно на събитие). */
  notifyAttempts: number;
  otherArea: number;
  unknownType: number;
};

const ZERO: OutagesIngestResult = {
  ok: false,
  found: 0,
  matched: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  closed: 0,
  notifyAttempts: 0,
  otherArea: 0,
  unknownType: 0,
};

let running = false;

export async function ingestErmOutages(now: Date = new Date()): Promise<OutagesIngestResult> {
  if (running) return { ...ZERO, skipped: "running" };
  running = true;
  try {
    return await run(now);
  } finally {
    running = false;
  }
}

type Candidate = { id: string; planned: boolean; startAt: Date | null; endAt: Date | null; area: string };

// Едно известие на събитие: ако едно спиране засяга няколко села, хората
// получават едно съобщение с всички места, а не пет поредни.
async function notifyOnce(cands: Candidate[]): Promise<number> {
  const groups = new Map<string, Candidate[]>();
  for (const c of cands) {
    const k = `${c.planned ? "p" : "u"}:${c.startAt?.toISOString() ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  let attempts = 0;
  for (const g of groups.values()) {
    attempts++;
    if (g.length === 1) {
      await notifyOnPublish("outage", g[0].id);
      continue;
    }
    try {
      const first = g[0];
      const names = g.map((c) => c.area).filter(Boolean);
      const where = names.length > 3 ? `${names.slice(0, 3).join(", ")} и още ${names.length - 3}` : names.join(", ");
      const when = first.startAt ? ` от ${formatOutageTime(first.startAt)}` : "";
      const r = await notifyTopic("outages", {
        title: `Спира токът${first.planned ? "" : " (авария)"}`,
        body: `${where}${when}`.slice(0, 180),
        url: "/prekysvaniya?s=push",
      });
      if (r.configured) {
        await prisma.outage.updateMany({
          where: { id: { in: g.map((c) => c.id) }, notifiedAt: null },
          data: { notifiedAt: new Date() },
        });
      }
    } catch {
      /* известието е второстепенно — записите вече са направени */
    }
  }
  return attempts;
}

async function run(now: Date): Promise<OutagesIngestResult> {
  const prev = await loadStatus();
  if (prev.lastAttemptAt && now.getTime() - Date.parse(prev.lastAttemptAt) < MIN_INTERVAL_MS) {
    return { ...ZERO, skipped: "too_soon" };
  }

  const fetched = await fetchErm();
  const parsed = fetched.ok ? parseErmResponse(fetched.text) : null;
  let error: string | null = null;
  if (!fetched.ok) error = fetched.error;
  else if (parsed?.kind === "rate_limited") error = "ЕРМ Запад ограничи заявките („tomuch“).";
  else if (parsed?.kind === "unrecognized") error = `Непознат формат на отговора (${parsed.reason}).`;

  // Грешка → нищо не се записва, нищо не се затваря; само състояние + тревога.
  const fail = async (
    msg: string,
    detail = "",
    extra: Partial<OutagesIngestResult> = {},
  ): Promise<OutagesIngestResult> => {
    const s = nextStatus(prev, { ok: false, error: msg }, now);
    await saveStatus(s);
    console.error(`[ingest-outages] ${msg} Поредни грешки: ${s.failStreak}. Нищо не е променено.${detail}`);
    if (shouldAlert(s)) await alertAdmin(s);
    return { ...ZERO, ...extra, error: msg };
  };

  if (error || !parsed || (parsed.kind !== "events" && parsed.kind !== "empty")) {
    // Кратко начало на отговора (публична страница на ЕРМ) — да се различи
    // блокиране от защитната им стена от смяна на формата.
    const head = fetched.ok ? ` Начало на отговора: ${JSON.stringify(fetched.text.trim().slice(0, 120))}` : "";
    return fail(error ?? "Непознат отговор.", head);
  }

  const records = parsed.kind === "events" ? parsed.records : [];
  const built = buildOutageDrafts(records);
  const { drafts, otherArea, unknownType } = built;
  // Непознат тип или място при заявка само за общината = смяна на формата при
  // ЕРМ. Без това „видени“ остава непълно и затварянето по-долу би обявило за
  // възстановени прекъсвания, които още текат (виж draftsFormatProblem).
  const formatProblem = draftsFormatProblem(records.length, built);
  if (formatProblem) {
    return fail(formatProblem, "", { found: records.length, otherArea, unknownType });
  }

  const nowWall = sofiaWallNow(now);
  const seen: string[] = [];
  const toNotify: Candidate[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const d of drafts) {
    seen.push(d.externalId);
    const existing = await prisma.outage.findUnique({
      where: { externalId: d.externalId },
      select: { id: true, endAt: true, note: true, published: true, notifiedAt: true, area: true, planned: true, startAt: true },
    });

    if (!existing) {
      if (d.endAt && d.endAt < nowWall) continue; // вече приключило — не го внасяме
      try {
        const row = await prisma.outage.create({
          data: {
            slug: d.slug,
            externalId: d.externalId,
            utility: d.utility,
            area: d.area,
            startAt: d.startAt,
            endAt: d.endAt,
            planned: d.planned,
            note: d.note,
            source: d.source,
            sourceUrl: d.sourceUrl,
            published: true,
          },
          select: { id: true },
        });
        created++;
        toNotify.push({ id: row.id, planned: d.planned, startAt: d.startAt, endAt: d.endAt, area: d.area });
      } catch (err) {
        // Напр. едновременен внос или зает slug — пропускаме, без да чупим останалите.
        console.error(`[ingest-outages] Неуспешен запис ${d.externalId}:`, err instanceof Error ? err.message : err);
      }
      continue;
    }

    const data: { endAt?: Date | null; note?: string } = {};
    if ((existing.endAt?.getTime() ?? null) !== (d.endAt?.getTime() ?? null)) data.endAt = d.endAt;
    // Бележката обновяваме само ако е автоматичната (админът може да е добавил улици).
    if ((existing.note === "" || existing.note.startsWith(AUTO_NOTE_PREFIX)) && existing.note !== d.note) {
      data.note = d.note;
    }
    if (Object.keys(data).length) {
      await prisma.outage.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      unchanged++;
    }
    // Публикуван, още неизвестен (напр. известията са включени по-късно) и неприключил.
    const endAt = data.endAt !== undefined ? data.endAt : existing.endAt;
    if (existing.published && !existing.notifiedAt && !(endAt && endAt < nowWall)) {
      toNotify.push({ id: existing.id, planned: existing.planned, startAt: existing.startAt, endAt, area: existing.area });
    }
  }

  // Започнали, неприключили, но вече ги няма в ЕРМ → захранването е възстановено.
  const vanished = await prisma.outage.findMany({
    where: {
      externalId: { startsWith: ERM_EXTERNAL_PREFIX, notIn: seen },
      startAt: { lte: nowWall },
      OR: [{ endAt: null }, { endAt: { gt: nowWall } }],
    },
    select: { id: true },
  });
  if (vanished.length) {
    await prisma.outage.updateMany({ where: { id: { in: vanished.map((v) => v.id) } }, data: { endAt: nowWall } });
  }

  const notifyAttempts = toNotify.length ? await notifyOnce(toNotify) : 0;

  const counts = { found: records.length, created, updated, closed: vanished.length };
  await saveStatus(nextStatus(prev, { ok: true, counts }, now));

  const result: OutagesIngestResult = {
    ok: true,
    found: records.length,
    matched: drafts.length,
    created,
    updated,
    unchanged,
    closed: vanished.length,
    notifyAttempts,
    otherArea,
    unknownType,
  };
  console.log(`[ingest-outages] ${JSON.stringify(result)}`);
  return result;
}
