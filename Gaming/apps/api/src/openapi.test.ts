import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { accountRouter } from "./routes/account.js";
import { friendsRouter } from "./routes/friends.js";
import { notificationsRouter } from "./routes/notifications.js";
import { shopRouter } from "./routes/shop.js";
import { cosmeticsRouter } from "./routes/cosmetics.js";
import { progressionRouter } from "./routes/progression.js";
import { announcementsRouter } from "./routes/announcements.js";
import { adminRouter } from "./routes/admin.js";
import { adminCrudRouter } from "./routes/adminCrud.js";
import { metricsRouter } from "./routes/metrics.js";
import { stripeWebhookRouter } from "./webhooks/stripe.js";

/**
 * Държи `openapi.yaml` синхронен с кода: всеки регистриран Express маршрут трябва да е
 * документиран и обратно. Маршрутите се четат от router stack-а на реалното приложение
 * (без порт, без база — `createApp()` само сглобява middleware).
 *
 * YAML парсер няма като пряка зависимост на пакета, затова файлът се сканира по
 * отстъп — само ключовете на `paths` (2 интервала), методите (4) и блоковете им.
 * Затова документът се пише с блоков стил за `paths`/методите (виж openapi.yaml).
 */

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];

/**
 * Къде е монтиран всеки под-рутер в `app.ts`. Таблицата се САМОПРОВЕРЯВА срещу
 * matcher-а на реалния слой (виж `mountPrefixOk`), така че разминаване с `app.ts` пада.
 */
const MOUNTS = new Map<object, string>([
  [stripeWebhookRouter, ""],
  [healthRouter, ""],
  [authRouter, "/api/auth"],
  [accountRouter, "/api/account"],
  [friendsRouter, "/api/friends"],
  [notificationsRouter, "/api/notifications"],
  [shopRouter, "/api/shop"],
  [cosmeticsRouter, "/api/cosmetics"],
  [progressionRouter, "/api/progression"],
  [announcementsRouter, "/api/announcements"],
  [adminRouter, "/api/admin"],
  [metricsRouter, "/api/metrics"],
  // `adminRouter.use(adminCrudRouter)` — без собствен префикс.
  [adminCrudRouter, ""],
]);

/** Минималният контракт на Express 5 / router 2 слоя, който ползваме. */
interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
  slash?: boolean;
  matchers?: Array<(p: string) => false | { path: string }>;
}

function mountPrefixOk(layer: Layer, prefix: string): boolean {
  const matcher = layer.matchers?.[0];
  if (!matcher) return false;
  if (prefix === "") return layer.slash === true;
  const hit = matcher(`${prefix}/__probe__`);
  return hit !== false && hit.path === prefix && matcher("/__other__") === false;
}

const joinPath = (prefix: string, p: string): string => {
  const full = `${prefix}${p === "/" ? "" : p}`;
  return full === "" ? "/" : full;
};

/** `/x/:id` → `/x/{id}` (OpenAPI шаблон). */
const toOpenApiPath = (p: string): string => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

function collectRoutes(stack: Layer[], prefix: string, out: Set<string>, problems: string[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) {
            out.add(`${method.toUpperCase()} ${toOpenApiPath(joinPath(prefix, p))}`);
          }
        }
      }
      continue;
    }
    const sub = layer.handle?.stack;
    if (!sub) continue; // обикновен middleware
    const mount = MOUNTS.get(layer.handle as object);
    if (mount === undefined) {
      problems.push("Нов монтиран под-рутер, който не е в MOUNTS на openapi.test.ts");
      continue;
    }
    if (!mountPrefixOk(layer, mount)) {
      problems.push(`Префиксът „${mount}“ в MOUNTS не съвпада с монтирането в app.ts`);
      continue;
    }
    collectRoutes(sub, joinPath(prefix, mount) === "/" ? "" : joinPath(prefix, mount), out, problems);
  }
}

function registeredRoutes(): { routes: Set<string>; problems: string[] } {
  const app = createApp() as unknown as { router: { stack: Layer[] } };
  const routes = new Set<string>();
  const problems: string[] = [];
  collectRoutes(app.router.stack, "", routes, problems);
  return { routes, problems };
}

interface DocOperation {
  key: string; // "GET /path"
  block: string; // текстът на операцията
  pathItem: string; // текстът на целия path item (за path параметри)
}

function documentedOperations(): DocOperation[] {
  const file = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l === "paths:");
  expect(start, "openapi.yaml няма секция `paths:`").toBeGreaterThanOrEqual(0);

  const ops: DocOperation[] = [];
  let path: string | null = null;
  let pathStartIdx = -1;
  const pathItems: Array<{ path: string; from: number; to: number }> = [];
  const methodStarts: Array<{ path: string; method: string; from: number }> = [];

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\S/.test(l)) {
      end = i; // следващ top-level ключ (components:)
      break;
    }
    const pm = l.match(/^ {2}(\/\S*):\s*$/);
    if (pm) {
      if (path) pathItems.push({ path, from: pathStartIdx, to: i });
      path = pm[1]!;
      pathStartIdx = i;
      continue;
    }
    const mm = l.match(/^ {4}([a-z]+):\s*$/);
    if (mm && path && HTTP_METHODS.includes(mm[1]!)) {
      methodStarts.push({ path, method: mm[1]!, from: i });
    }
  }
  if (path) pathItems.push({ path, from: pathStartIdx, to: end });

  methodStarts.forEach((m, idx) => {
    const item = pathItems.find((p) => p.path === m.path)!;
    const next = methodStarts[idx + 1];
    const to = next && next.path === m.path ? next.from : item.to;
    ops.push({
      key: `${m.method.toUpperCase()} ${m.path}`,
      block: lines.slice(m.from, to).join("\n"),
      pathItem: lines.slice(item.from, item.to).join("\n"),
    });
  });
  return ops;
}

describe("openapi.yaml ↔ регистрирани маршрути", () => {
  const { routes, problems } = registeredRoutes();
  const ops = documentedOperations();
  const documented = new Set(ops.map((o) => o.key));

  it("карта на монтиранията е вярна и пълна", () => {
    expect(problems).toEqual([]);
    expect(routes.size).toBeGreaterThan(80); // защита срещу тих провал на обхода
  });

  it("всеки регистриран маршрут е документиран", () => {
    const missing = [...routes].filter((r) => !documented.has(r)).sort();
    expect(missing, "Липсват в openapi.yaml").toEqual([]);
  });

  it("всяка документирана операция съществува в кода", () => {
    const stale = [...documented].filter((d) => !routes.has(d)).sort();
    expect(stale, "В openapi.yaml, но не и в кода").toEqual([]);
  });

  it("няма дублирани ключове", () => {
    expect(ops.length).toBe(documented.size);
  });

  it("всяка операция има operationId (уникален), summary, security и responses", () => {
    const ids = new Set<string>();
    for (const op of ops) {
      const id = op.block.match(/^ {6}operationId:\s*(\S+)\s*$/m)?.[1];
      expect(id, `${op.key}: operationId`).toBeTruthy();
      expect(ids.has(id!), `${op.key}: повтарящ се operationId ${id}`).toBe(false);
      ids.add(id!);
      expect(op.block, `${op.key}: summary`).toMatch(/^ {6}summary:/m);
      expect(op.block, `${op.key}: responses`).toMatch(/^ {6}responses:/m);
      // Сигурността е изрична: или наследява глобалната (cookie), или `security:` е зададено.
      // Публичните маршрути са с `security: []`, затова не разчитаме на тишина по подразбиране.
      const isPublic = /^ {6}security:\s*\[\]\s*$/m.test(op.block);
      const hasSecurity = /^ {6}security:/m.test(op.block);
      if (!hasSecurity) expect(op.block, `${op.key}: сесийна операция без отговор 401`).toMatch(/"401"/);
      if (isPublic) expect(op.block, `${op.key}: публичен маршрут с x-required-roles`).not.toMatch(/x-required-roles/);
    }
  });

  it("всеки {param} от пътя е деклариран", () => {
    for (const op of ops) {
      const path = op.key.split(" ")[1]!;
      for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
        expect(op.pathItem, `${op.key}: параметър ${name}`).toMatch(
          new RegExp(`name:\\s*${name}\\s*,\\s*in:\\s*path`),
        );
      }
    }
  });

  it("персоналните маршрути са означени с x-required-roles и 403", () => {
    for (const op of ops) {
      const path = op.key.split(" ")[1]!;
      if (path.startsWith("/api/admin/") || path === "/api/metrics") {
        expect(op.block, `${op.key}: x-required-roles`).toMatch(/^ {6}x-required-roles:/m);
        expect(op.block, `${op.key}: 403`).toMatch(/"403"/);
      }
    }
  });

  it("вътрешните маршрути са означени с x-internal", () => {
    const internal = ["GET /metrics", "POST /webhooks/stripe", "POST /api/progression/internal/match"];
    for (const key of internal) {
      const op = ops.find((o) => o.key === key);
      expect(op, key).toBeDefined();
      expect(op!.block, `${key}: x-internal`).toMatch(/^ {6}x-internal:\s*true/m);
    }
  });

  it("уебхукът на Stripe е със подпис, а не със сесия", () => {
    const op = ops.find((o) => o.key === "POST /webhooks/stripe")!;
    expect(op.block).toMatch(/stripeSignature/);
  });
});
