import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { SITE } from "@/lib/site";

// IndexNow — отворен протокол (Bing, Yandex, Seznam, Naver и др.), който
// позволява да уведомим търсачките МОМЕНТАЛНО за нови/обновени страници.
// (Google не участва в IndexNow — за него се ползва Search Console.)

export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

// Връща ключа за IndexNow; създава и запазва такъв при първо извикване.
export async function getIndexNowKey(): Promise<string> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: SETTING_KEYS.indexnowKey },
    });
    if (row?.value) return row.value;
    const key = randomBytes(16).toString("hex"); // 32 шестнайсетични знака
    await setSetting(SETTING_KEYS.indexnowKey, key);
    return key;
  } catch {
    return "";
  }
}

// Събира публичните адреси от sitemap.xml на сайта.
async function collectUrls(): Promise<string[]> {
  try {
    const res = await fetch(`${SITE.url}/sitemap.xml`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [`${SITE.url}/`];
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    return urls.length ? urls.slice(0, 9000) : [`${SITE.url}/`];
  } catch {
    return [`${SITE.url}/`];
  }
}

export type IndexNowResult = {
  ok: boolean;
  submitted: number;
  status?: number;
  error?: string;
};

// Уведомява търсачките (през IndexNow) за всички страници на сайта.
export async function submitToIndexNow(): Promise<IndexNowResult> {
  const key = await getIndexNowKey();
  if (!key) return { ok: false, submitted: 0, error: "Липсва IndexNow ключ." };

  const host = new URL(SITE.url).host;
  const urlList = await collectUrls();
  const body = {
    host,
    key,
    keyLocation: `${SITE.url}${INDEXNOW_KEY_PATH}`,
    urlList,
  };

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    // IndexNow връща 200 (приет) или 202 (приет, обработва се).
    return {
      ok: res.status === 200 || res.status === 202,
      submitted: urlList.length,
      status: res.status,
      ...(res.ok ? {} : { error: `Търсачката върна код ${res.status}.` }),
    };
  } catch (e) {
    return {
      ok: false,
      submitted: urlList.length,
      error: e instanceof Error ? e.message : "Грешка при свързване.",
    };
  }
}
