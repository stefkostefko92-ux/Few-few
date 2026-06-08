import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

// A complete, valid production environment (stub validator explicitly allowed).
const prod = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db:5432/kagura",
  JWT_SECRET: "a-sufficiently-long-secret-value",
  IAP_RECEIPT_SECRET: "real-receipt-secret",
  IAP_WEBHOOK_SECRET: "real-webhook-secret",
  ALLOW_STUB_RECEIPTS: "true",
} as NodeJS.ProcessEnv;

describe("loadConfig fail-fast (§11.3)", () => {
  it("accepts a complete production config", () => {
    expect(() => loadConfig(prod)).not.toThrow();
  });

  it("refuses to boot in production without DATABASE_URL (no silent in-memory store)", () => {
    const { DATABASE_URL, ...rest } = prod;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL is required/);
  });

  it("refuses a public default secret in production", () => {
    expect(() => loadConfig({ ...prod, JWT_SECRET: "dev-insecure-secret-change-me-0000" })).toThrow(/public dev default/);
  });

  it("refuses a too-short JWT secret in production", () => {
    expect(() => loadConfig({ ...prod, JWT_SECRET: "short" })).toThrow(/at least 16 characters/);
  });

  it("refuses ENABLE_DEV_RECEIPTS in production", () => {
    expect(() => loadConfig({ ...prod, ENABLE_DEV_RECEIPTS: "true" })).toThrow(/ENABLE_DEV_RECEIPTS/);
  });

  it("refuses the sandbox IAP validator in production unless explicitly allowed", () => {
    const { ALLOW_STUB_RECEIPTS, ...rest } = prod;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/no real IAP validator/);
  });

  it("accepts a real RevenueCat provider in production without ALLOW_STUB_RECEIPTS", () => {
    const { ALLOW_STUB_RECEIPTS, ...rest } = prod;
    const cfg = loadConfig({ ...rest, IAP_PROVIDER: "revenuecat", REVENUECAT_API_KEY: "rc-live-key" });
    expect(cfg.iapProvider).toBe("revenuecat");
  });

  it("refuses RevenueCat in production without an API key", () => {
    expect(() => loadConfig({ ...prod, IAP_PROVIDER: "revenuecat" })).toThrow(/REVENUECAT_API_KEY is required/);
  });

  it("rejects an unknown IAP_PROVIDER", () => {
    expect(() => loadConfig({ ...prod, IAP_PROVIDER: "applepay" })).toThrow(/IAP_PROVIDER must be/);
  });

  it("allows zero-config dev defaults outside production", () => {
    const cfg = loadConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(cfg.isProd).toBe(false);
    expect(cfg.jwtSecret.length).toBeGreaterThan(0);
  });
});
