import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("health", () => {
  const app = createApp();

  it("GET /health returns 200 ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("unknown route returns 404 envelope", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
