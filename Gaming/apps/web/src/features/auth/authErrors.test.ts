import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { ApiError } from "../../lib/api";
import { bannedMessage, fieldErrorsFrom } from "./authErrors";

// Проста t(): връща ключа + интерполациите, за да проверим кои части влизат.
const t = ((key: string, vars?: Record<string, string>) =>
  vars ? `${key}(${Object.values(vars).join(",")})` : key) as unknown as TFunction;

describe("authErrors", () => {
  it("fieldErrorsFrom маха validation_error до локализирани грешки по поле", () => {
    const err = new ApiError(400, "validation_error", "Invalid input", {
      issues: { formErrors: [], fieldErrors: { password: ["Паролата трябва да е поне 8 символа"] } },
    });
    expect(fieldErrorsFrom(err, t)).toEqual({ password: "auth.errPassword" });
    expect(fieldErrorsFrom(new ApiError(401, "unauthorized", "x"), t)).toEqual({});
  });

  it("bannedMessage включва причина и срок, когато ги има", () => {
    const msg = bannedMessage(t, "bg", "спам", "2030-01-01T10:00:00.000Z");
    expect(msg).toContain("auth.errorBanned");
    expect(msg).toContain("auth.banReason(спам)");
    expect(msg).toContain("auth.banUntil(");
    expect(msg).toContain("auth.banAppeal");
    // OAuth: без причина и срок — само рамката и обжалването.
    expect(bannedMessage(t, "bg")).toBe("auth.errorBanned auth.banAppeal");
  });
});
