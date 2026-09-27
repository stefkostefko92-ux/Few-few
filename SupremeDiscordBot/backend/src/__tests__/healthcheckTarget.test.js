// backend/src/__tests__/healthcheckTarget.test.js
// Health-check-овете на контейнерите сочат 127.0.0.1, НЕ localhost.
//
// ДЕФЕКТЪТ (сървър, 27.09.2026): в Alpine образа `localhost` се резолвира до
// ::1, а nginx на фронтенда слуша само на IPv4 (`listen 8080;`). `wget
// http://localhost:8080/` → „Connection refused“ → контейнерът „unhealthy“,
// докато сайтът работеше. Проверено на живо в контейнера: localhost FAIL,
// 127.0.0.1 OK. docker-compose.yml презаписва HEALTHCHECK от Dockerfile-а,
// затова се гледат и двете места.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FILES = ["frontend/Dockerfile", "backend/Dockerfile", "bot/Dockerfile", "docker-compose.yml"];

describe("health-check-овете сочат 127.0.0.1", () => {
  it.each(FILES)("%s: нито една проверка към localhost", (f) => {
    const lines = readFileSync(join(ROOT, f), "utf8").split("\n").filter((l) => !/^\s*#/.test(l));
    const checks = lines.filter((l) => /HEALTHCHECK|CMD wget|test:\s*\[/.test(l));
    expect(checks.length, `${f}: не намерих health-check`).toBeGreaterThan(0);
    expect(checks.filter((l) => /localhost/.test(l)), f).toEqual([]);
    expect(checks.some((l) => /127\.0\.0\.1/.test(l)), f).toBe(true);
  });
});
