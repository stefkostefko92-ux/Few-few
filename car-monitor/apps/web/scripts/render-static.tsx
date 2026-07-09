// Dev помощник: рендира реалните route компоненти със SSR върху реална SQLite
// база (схема + seed + rollups) и записва статичен HTML за заснемане.
import { createStaticHandler, createStaticRouter, StaticRouterProvider, Outlet, NavLink, Form } from "react-router";
import { renderToString } from "react-dom/server";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createElement as h } from "react";
import { resolve } from "node:path";

import * as home from "../app/routes/home.tsx";
import * as vehicles from "../app/routes/vehicles.tsx";
import * as vehicle from "../app/routes/vehicle.tsx";
import * as seller from "../app/routes/seller.tsx";
import * as model from "../app/routes/model.tsx";
import * as search from "../app/routes/search.tsx";

// Пътищата се извеждат от cwd (стартира се от apps/web през `pnpm preview:static`).
const WEB = process.cwd();
const DB_DIR = resolve(WEB, "../../packages/db");
const OUT = process.env.OUT_DIR ?? resolve(WEB, ".preview");
const css = readFileSync(`${WEB}/app/app.css`, "utf8");

// --- Реална SQLite база ---------------------------------------------------
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(`${DB_DIR}/migrations/0000_init.sql`, "utf8"));
sqlite.exec(readFileSync(`${DB_DIR}/seed.sql`, "utf8"));
sqlite.exec(readFileSync(`${DB_DIR}/rollups.sql`, "utf8"));

// Демо: повече точки за графиката на цените (иначе seed има само 1 месец).
for (const [period, price, n] of [
  ["2025-09", 11200, 18],
  ["2025-12", 10600, 24],
  ["2026-03", 10100, 31],
  ["2026-06", 9500, 27],
] as Array<[string, number, number]>) {
  sqlite
    .prepare("INSERT OR REPLACE INTO price_history (model_key, period, median_price_eur, listings, avg_mileage_km) VALUES (?,?,?,?,?)")
    .run("vw|golf", period, price, n, 165000);
}

// D1-съвместим адаптер върху node:sqlite.
function d1(db: DatabaseSync) {
  return {
    prepare(q: string) {
      const st = db.prepare(q);
      let params: unknown[] = [];
      const api = {
        bind(...a: unknown[]) {
          params = a;
          return api;
        },
        async all() {
          return { results: st.all(...(params as [])) };
        },
        async first() {
          return st.get(...(params as [])) ?? null;
        },
      };
      return api;
    },
  };
}
const env = { cloudflare: { env: { DB: d1(sqlite) }, ctx: {} } };

// --- Chrome (хедър) — без framework-only Meta/Links/Scripts ----------------
function Chrome() {
  return h(
    "div",
    null,
    h(
      "header",
      { className: "site" },
      h(
        "div",
        { className: "container" },
        h(NavLink, { to: "/", className: "brand" }, "Car Monitor"),
        h(NavLink, { to: "/vehicles" }, "Автомобили"),
        h(
          Form,
          { method: "get", action: "/search", className: "search", style: { marginLeft: "auto", minWidth: 280 } },
          h("input", { name: "q", placeholder: "VIN, рег. №, марка/модел, продавач…" }),
        ),
      ),
    ),
    h("main", { className: "container" }, h(Outlet, null)),
  );
}

const routes = [
  {
    path: "/",
    Component: Chrome,
    children: [
      { index: true, loader: home.loader, Component: home.default },
      { path: "vehicles", loader: vehicles.loader, Component: vehicles.default },
      { path: "vehicles/:id", loader: vehicle.loader, Component: vehicle.default },
      { path: "sellers/:id", loader: seller.loader, Component: seller.default },
      { path: "models/:make/:model", loader: model.loader, Component: model.default },
      { path: "search", loader: search.loader, Component: search.default },
    ],
  },
];

async function render(url: string): Promise<string> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`http://localhost${url}`), { requestContext: env });
  if (context instanceof Response) throw new Error(`redirect ${url}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  const body = renderToString(h(StaticRouterProvider, { router, context } as never));
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

const pages: Array<[string, string]> = [
  ["home", "/"],
  ["vehicles", "/vehicles"],
  ["vehicle", "/vehicles/v_golf_01"],
  ["seller", "/sellers/s_auto_sofia"],
  ["model", "/models/VW/Golf"],
  ["search", "/search?q=golf"],
];

mkdirSync(OUT, { recursive: true });
for (const [name, url] of pages) {
  const html = await render(url);
  writeFileSync(`${OUT}/${name}.html`, html);
  console.log(`rendered ${name} (${html.length} bytes)`);
}
console.log("DONE");
