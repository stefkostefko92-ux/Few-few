// Cloudflare Worker entry за React Router v7 SSR (по модела на `sigma`).
// Подава D1 binding-а към loader-ите през load context.

import { createRequestHandler } from "react-router";

export interface Env {
  DB: D1Database;
}

declare module "react-router" {
  // Прави context.cloudflare наличен и типизиран в loader-ите.
  interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;
