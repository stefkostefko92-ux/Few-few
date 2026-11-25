import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { intQuery } from "./http.js";
import { errorHandler } from "./middleware/error.js";

describe("intQuery — числови query параметри", () => {
  it("нечислово, празно или липсващо → стойността по подразбиране (беше NaN → 500)", () => {
    expect(intQuery("abc", 50, 1, 100)).toBe(50);
    expect(intQuery("", 50, 1, 100)).toBe(50);
    expect(intQuery(undefined, 14, 1, 90)).toBe(14);
    expect(intQuery(["5", "6"], 14, 1, 90)).toBe(14);
  });

  it("реже до границите и до цяло число", () => {
    expect(intQuery("0", 50, 1, 100)).toBe(1);
    expect(intQuery("1000", 50, 1, 100)).toBe(100);
    expect(intQuery("7.9", 14, 1, 90)).toBe(7);
  });
});

describe("errorHandler — Prisma P2025", () => {
  it("липсващ запис при update/delete е 404 not_found, не 500", () => {
    let status = 0;
    let body: unknown;
    const res = {
      status(s: number) {
        status = s;
        return this;
      },
      json(b: unknown) {
        body = b;
        return this;
      },
    } as unknown as Response;
    const err = Object.assign(new Error("Record to update not found."), {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
    });
    errorHandler(err, {} as Request, res, () => undefined);
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: "not_found", message: "Resource not found" } });
  });
});
