import test from "node:test";
import assert from "node:assert/strict";
import { resolveAiConfig } from "@/lib/ai-config";

test("без нищо зададено → работи на правила", () => {
  const c = resolveAiConfig({}, {});
  assert.equal(c.configured, "rules");
  assert.equal(c.effective, "rules");
  assert.equal(c.source, "по подразбиране");
});

test("env включва Gemini, ако има ключ", () => {
  const c = resolveAiConfig({}, { CHAT_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
  assert.equal(c.effective, "gemini");
  assert.equal(c.source, ".env");
  assert.equal(c.geminiModel, "gemini-2.0-flash");
});

test("панелът (базата) има предимство пред .env", () => {
  const c = resolveAiConfig(
    { provider: "gemini", geminiKey: "from-db" },
    { CHAT_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "env-claude" },
  );
  assert.equal(c.configured, "gemini");
  assert.equal(c.effective, "gemini");
  assert.equal(c.geminiKey, "from-db");
  assert.equal(c.source, "панел");
});

test("избран доставчик без ключ → пада на правила (но помни избора)", () => {
  const c = resolveAiConfig({ provider: "gemini" }, {});
  assert.equal(c.configured, "gemini");
  assert.equal(c.effective, "rules");
});

test("моделите по подразбиране се прилагат, ако липсват", () => {
  const c = resolveAiConfig({ provider: "anthropic", anthropicKey: "x" }, {});
  assert.equal(c.effective, "anthropic");
  assert.equal(c.anthropicModel, "claude-opus-4-8");
});

test("невалиден доставчик се пренебрегва", () => {
  const c = resolveAiConfig({ provider: "openai" }, {});
  assert.equal(c.configured, "rules");
});
