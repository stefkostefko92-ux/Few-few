import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { Site } from "@prisma/client";

// Конектор към свързаните сайтове. Договор с всеки сайт:
//  • Здраве:     GET  <url>                         (публично, без ключ)
//  • Съдържание (четене): GET  <apiBaseUrl>/api/platform/content   Authorization: Bearer <ключ>
//                 → { items: [{ id, kind, title, status?, url? }] }
//  • Съдържание (запис):  PUT  <apiBaseUrl>/api/platform/content/<id>  Bearer <ключ>
//                 body { title?, status? } → 2xx при успех (сайтът сам записва)
//  • Деплой:     POST <deployHookUrl | apiBaseUrl/api/platform/deploy>  Bearer <ключ>

const TIMEOUT_MS = 10_000;

async function withTimeout(input: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export type HealthResult = {
  ok: boolean;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
};

// Прави здравна проверка (GET на публичния адрес), записва резултата и
// обновява статуса на сайта. Възвращаемата стойност е и записаният HealthCheck.
export async function runHealthCheck(site: Site): Promise<HealthResult> {
  const started = performance.now();
  let result: HealthResult;
  try {
    const res = await withTimeout(site.url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "platform-monitor/1.0" },
    });
    const ms = Math.round(performance.now() - started);
    result = {
      ok: res.status < 400,
      statusCode: res.status,
      responseMs: ms,
      error: res.status >= 400 ? `HTTP ${res.status}` : null,
    };
  } catch (err) {
    result = {
      ok: false,
      statusCode: null,
      responseMs: null,
      error: err instanceof Error ? err.message : "Мрежова грешка",
    };
  }

  // Статус: DOWN при неуспех; DEGRADED при бавен отговор (>3s); иначе UP.
  const status = !result.ok
    ? "DOWN"
    : result.responseMs !== null && result.responseMs > 3000
      ? "DEGRADED"
      : "UP";

  await prisma.$transaction([
    prisma.healthCheck.create({
      data: {
        siteId: site.id,
        ok: result.ok,
        statusCode: result.statusCode,
        responseMs: result.responseMs,
        error: result.error,
      },
    }),
    prisma.site.update({
      where: { id: site.id },
      data: {
        status,
        lastCheckAt: new Date(),
        lastStatusCode: result.statusCode,
        lastResponseMs: result.responseMs,
      },
    }),
  ]);

  return result;
}

function siteKey(site: Site): string {
  if (!site.apiKeyEnc) {
    throw new Error("Сайтът няма зададен API ключ.");
  }
  return decryptSecret(site.apiKeyEnc);
}

type RemoteContentItem = {
  id: string;
  kind?: string;
  title?: string;
  status?: string;
  url?: string;
};

// Издърпва съдържанието от API-то на сайта и го кешира локално (само четене).
export async function syncSiteContent(site: Site): Promise<number> {
  if (!site.apiBaseUrl) throw new Error("Сайтът няма зададен API адрес.");
  const res = await withTimeout(
    `${site.apiBaseUrl.replace(/\/$/, "")}/api/platform/content`,
    { headers: { authorization: `Bearer ${siteKey(site)}` } },
  );
  if (!res.ok) throw new Error(`API върна HTTP ${res.status}.`);
  const data = (await res.json()) as { items?: RemoteContentItem[] };
  const items = Array.isArray(data.items) ? data.items : [];

  for (const it of items) {
    if (!it.id) continue;
    await prisma.contentItem.upsert({
      where: { siteId_externalId: { siteId: site.id, externalId: String(it.id) } },
      create: {
        siteId: site.id,
        externalId: String(it.id),
        kind: it.kind ?? "item",
        title: it.title ?? "(без заглавие)",
        status: it.status ?? null,
        url: it.url ?? null,
      },
      update: {
        kind: it.kind ?? "item",
        title: it.title ?? "(без заглавие)",
        status: it.status ?? null,
        url: it.url ?? null,
        syncedAt: new Date(),
      },
    });
  }
  return items.length;
}

export type ContentUpdate = { title?: string; status?: string };

// Записва промяна в елемент от съдържанието НА самия свързан сайт (PUT към
// неговото API). При 2xx обновява и локалното огледало. Хвърля при грешка.
export async function pushSiteContent(
  site: Site,
  externalId: string,
  fields: ContentUpdate,
): Promise<void> {
  if (!site.apiBaseUrl) throw new Error("Сайтът няма зададен API адрес.");
  const url = `${site.apiBaseUrl.replace(/\/$/, "")}/api/platform/content/${encodeURIComponent(externalId)}`;
  const res = await withTimeout(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${siteKey(site)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`API върна HTTP ${res.status}.`);

  // Локалното огледало се обновява само след потвърждение от сайта.
  await prisma.contentItem.updateMany({
    where: { siteId: site.id, externalId },
    data: {
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      syncedAt: new Date(),
    },
  });
}

// Задейства деплой на сайта. Връща true при приет (2xx) отговор.
export async function triggerDeploy(site: Site): Promise<boolean> {
  const target =
    site.deployHookUrl ??
    (site.apiBaseUrl
      ? `${site.apiBaseUrl.replace(/\/$/, "")}/api/platform/deploy`
      : null);
  if (!target) throw new Error("Сайтът няма зададен адрес за деплой.");
  const res = await withTimeout(target, {
    method: "POST",
    headers: { authorization: `Bearer ${siteKey(site)}` },
  });
  return res.ok;
}
