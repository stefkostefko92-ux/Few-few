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
// При неуспех проверява ЗАЩО — най-честата причина за 403 е, че търсачката не
// може да прочете/потвърди ключовия файл на keyLocation (грешен домейн в
// NEXT_PUBLIC_SITE_URL, сайтът не е публично достъпен по HTTPS, или прокси
// връща друго съдържание). Добавяме и отговора на търсачката за яснота.
async function diagnoseFailure(
  res: Response,
  key: string,
  keyLocation: string,
): Promise<string> {
  let respBody = "";
  try {
    respBody = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    /* без тяло */
  }

  let fileNote = "";
  try {
    const f = await fetch(keyLocation, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!f.ok) {
      fileNote =
        ` Ключовият файл (${keyLocation}) върна код ${f.status} — трябва да е` +
        ` публично достъпен и да връща само ключа.`;
    } else {
      const txt = (await f.text()).trim();
      fileNote =
        txt === key
          ? ` Ключовият файл е достъпен и съвпада.`
          : ` Ключовият файл не съвпада с ключа — вероятно NEXT_PUBLIC_SITE_URL` +
            ` сочи към друг адрес от реалния домейн на сайта.`;
    }
  } catch {
    fileNote =
      ` Ключовият файл (${keyLocation}) е недостъпен — провери, че сайтът работи` +
      ` публично по HTTPS и че NEXT_PUBLIC_SITE_URL сочи към реалния домейн.`;
  }

  const base =
    res.status === 403
      ? "Търсачката отхвърли ключа (403)."
      : `Търсачката върна код ${res.status}.`;
  return `${base}${fileNote}${respBody ? ` Отговор: ${respBody}` : ""}`;
}

export async function submitToIndexNow(): Promise<IndexNowResult> {
  const key = await getIndexNowKey();
  if (!key) return { ok: false, submitted: 0, error: "Липсва IndexNow ключ." };

  const host = new URL(SITE.url).host;
  const keyLocation = `${SITE.url}${INDEXNOW_KEY_PATH}`;
  const urlList = await collectUrls();
  const body = { host, key, keyLocation, urlList };

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Някои IndexNow крайни точки (вкл. Bing) връщат 403 на заявки без
        // User-Agent. Node fetch не слага по подразбиране — задаваме изрично.
        "user-agent": `${host} IndexNow client (+${SITE.url})`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    // IndexNow връща 200 (приет) или 202 (приет, обработва се).
    if (res.status === 200 || res.status === 202) {
      return { ok: true, submitted: urlList.length, status: res.status };
    }
    return {
      ok: false,
      submitted: urlList.length,
      status: res.status,
      error: await diagnoseFailure(res, key, keyLocation),
    };
  } catch (e) {
    return {
      ok: false,
      submitted: urlList.length,
      error: e instanceof Error ? e.message : "Грешка при свързване.",
    };
  }
}
