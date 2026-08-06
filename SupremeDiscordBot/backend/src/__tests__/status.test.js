// status.test.js — GET /api/status връща ВСИЧКИТЕ четири услуги.
//
// Реален инцидент: endpoint-ът пълнеше само database/bot/cache, а dashboard-ът
// чете `services.api.status`. Липсващият ключ се рендираше като „API — Unknown"
// до три зелени реда — изглежда като авария на собствения ни API, а всъщност е
// непопълнено поле. Тестът пази четворката пълна.
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const prismaMock = {
  $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
};
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("axios", () => ({ default: { get: vi.fn().mockRejectedValue(new Error("bot offline")) } }));

const statusRouter = (await import("../routes/status.js")).default;

function buildApp() {
  const app = express();
  app.use("/api/status", statusRouter);
  return app;
}

describe("GET /api/status", () => {
  it("винаги съобщава състоянието на самия API (не оставя дупка в таблото)", async () => {
    const res = await request(buildApp()).get("/api/status");
    expect(res.status).toBe(200);
    // Отговорът е доказателството, че API-то работи — затова е operational.
    expect(res.body.services?.api?.status).toBe("operational");
  });

  it("покрива и трите зависимости, за да няма „Unknown\" редове", async () => {
    const res = await request(buildApp()).get("/api/status");
    for (const svc of ["api", "database", "bot", "cache"]) {
      expect(res.body.services, `липсва услуга: ${svc}`).toHaveProperty(svc);
      expect(typeof res.body.services[svc].status).toBe("string");
    }
  });
});
