import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

// public/sw.js се пуска във vm с фалшиви `self`, `caches` и `fetch`: проверява се
// какво реално влиза в Cache Storage. Страниците с търсене носят въведения текст
// в адреса (/tarsene?q=…) — той не бива да остава в кеша на устройството.

const ORIGIN = "https://zabobovdol.carbonstealth.eu";
const CODE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

type Listener = (e: unknown) => void;
type FakeReq = { method: string; url: string; mode: string };

function loadSw() {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Response>();
  const keyOf = (r: string | { url: string }) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
  const cache = {
    put: async (r: { url: string }, res: Response) => {
      store.set(keyOf(r), res);
    },
    match: async (r: string | { url: string }) => store.get(keyOf(r)),
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (r: { url: string }) => store.delete(r.url),
    add: async () => {},
  };
  const sandbox = {
    self: {
      addEventListener: (type: string, fn: Listener) => {
        listeners[type] = fn;
      },
      location: { origin: ORIGIN },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      registration: {},
    },
    caches: { open: async () => cache, keys: async () => ["zbd-v3"], delete: async () => true },
    fetch: async () => new Response("<!doctype html><p>ok</p>", { status: 200 }),
    URL,
    Response,
    Promise,
    console,
  };
  vm.runInNewContext(CODE, sandbox);
  return { listeners, store };
}

async function navigate(sw: ReturnType<typeof loadSw>, path: string): Promise<boolean> {
  let responded: Promise<unknown> | null = null;
  const request: FakeReq = { method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" };
  sw.listeners.fetch({
    request,
    respondWith: (p: Promise<unknown>) => {
      responded = p;
    },
  });
  if (responded) await responded;
  return responded !== null;
}

test("обикновена страница се кешира за офлайн", async () => {
  const sw = loadSw();
  assert.equal(await navigate(sw, "/uslugi"), true);
  assert.ok(sw.store.has(`${ORIGIN}/uslugi`));
});

test("търсенето (/tarsene?q=…) и /api НЕ влизат в кеша", async () => {
  const sw = loadSw();
  for (const p of [
    "/tarsene?q=%D0%B5%D0%B3%D0%BD%208001011234",
    "/tarsene",
    "/imen-den?ime=%D0%98%D0%B2%D0%B0%D0%BD",
    "/api/search?q=test",
    "/api",
  ]) {
    await navigate(sw, p);
  }
  assert.deepEqual([...sw.store.keys()], []);
});

test("при активиране се трият търсенията, записани от по-стар service worker", async () => {
  const sw = loadSw();
  sw.store.set(`${ORIGIN}/tarsene?q=0888123456`, new Response("x"));
  sw.store.set(`${ORIGIN}/imen-den?ime=x`, new Response("x"));
  sw.store.set(`${ORIGIN}/uslugi`, new Response("x"));
  let done: Promise<unknown> = Promise.resolve();
  sw.listeners.activate({
    waitUntil: (p: Promise<unknown>) => {
      done = p;
    },
  });
  await done;
  assert.deepEqual([...sw.store.keys()], [`${ORIGIN}/uslugi`]);
});
