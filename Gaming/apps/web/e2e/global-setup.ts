import { request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(here, ".auth");

/** Register a fresh user via the API (through the web origin so the auth cookie
 *  is stored for the SPA origin) and persist its storage state. */
async function registerAndSave(baseURL: string, role: string): Promise<void> {
  const ctx = await request.newContext({ baseURL });
  const stamp = Date.now().toString().slice(-7);
  const res = await ctx.post("/api/auth/register", {
    data: {
      email: `e2e-${role}-${stamp}@e2e.test`,
      password: "Passw0rd!23",
      displayName: `${role}${stamp}`,
      acceptedTerms: true,
    },
  });
  if (!res.ok()) throw new Error(`register ${role} failed: ${res.status()} ${await res.text()}`);
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await ctx.storageState({ path: path.join(AUTH_DIR, `${role}.json`) });
  await ctx.dispose();
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = (config.projects[0]?.use.baseURL as string) ?? "http://localhost:4502";
  await registerAndSave(baseURL, "host");
  await registerAndSave(baseURL, "guest");
}
