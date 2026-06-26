// backend/src/__tests__/aiReply.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock the Anthropic SDK import so tests don't require a real API key
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Thank you for reaching out! A staff member will assist you shortly." }],
      }),
    },
  })),
}));

const { generateAutoReply, aiRateLimitOk } = await import("../services/aiReply.js");

describe("generateAutoReply", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns null when no API key is configured", async () => {
    const result = await generateAutoReply({
      userMessage: "I need help",
      serverName: "Test Server",
      customPrompt: null,
      customApiKey: null,
    });
    expect(result).toBeNull();
  });

  it("returns a reply string when API key is provided", async () => {
    const result = await generateAutoReply({
      userMessage: "My order is missing",
      serverName: "Test Shop",
      customPrompt: null,
      customApiKey: "sk-ant-test-fake-key",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses custom prompt when provided", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Custom response" }],
    });
    Anthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    await generateAutoReply({
      userMessage: "test",
      serverName: "My Server",
      customPrompt: "You are a pirate. Respond like one.",
      customApiKey: "sk-ant-fake",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain("You are a pirate");
  });

  it("returns null and does not throw on API error", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
      },
    }));

    const result = await generateAutoReply({
      userMessage: "help",
      serverName: "Server",
      customPrompt: null,
      customApiKey: "sk-ant-fake",
    });

    expect(result).toBeNull(); // never throws, returns null
  });
});

describe("aiRateLimitOk", () => {
  it("allows calls under the hourly quota and blocks above it", () => {
    const serverId = `test-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      expect(aiRateLimitOk(serverId)).toBe(true);
    }
    expect(aiRateLimitOk(serverId)).toBe(false);
  });
});
