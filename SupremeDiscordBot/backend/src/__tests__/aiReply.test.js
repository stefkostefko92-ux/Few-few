// backend/src/__tests__/aiReply.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

// Gemini се вика през глобалния fetch — mock-ваме него (без реален API ключ).
function mockGeminiResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

const fetchMock = vi.fn().mockResolvedValue(
  mockGeminiResponse("Thank you for reaching out! A staff member will assist you shortly.")
);
vi.stubGlobal("fetch", fetchMock);

const { generateAutoReply, aiRateLimitOk } = await import("../services/aiReply.js");

describe("generateAutoReply", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      mockGeminiResponse("Thank you for reaching out! A staff member will assist you shortly.")
    );
  });

  it("returns null when no API key is configured", async () => {
    const result = await generateAutoReply({
      userMessage: "I need help",
      serverName: "Test Server",
      customPrompt: null,
      customApiKey: null,
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a reply string when API key is provided", async () => {
    const result = await generateAutoReply({
      userMessage: "My order is missing",
      serverName: "Test Shop",
      customPrompt: null,
      customApiKey: "test-fake-key",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses custom prompt when provided (systemInstruction) and keeps the key out of the URL", async () => {
    await generateAutoReply({
      userMessage: "test",
      serverName: "My Server",
      customPrompt: "You are a pirate. Respond like one.",
      customApiKey: "test-fake-key",
    });

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toContain("You are a pirate");
    expect(body.systemInstruction.parts[0].text).toContain("My Server");
    // Ключът пътува в header, никога в URL (access логове/proxy-та).
    expect(url).not.toContain("test-fake-key");
    expect(init.headers["x-goog-api-key"]).toBe("test-fake-key");
  });

  it("returns null and does not throw on network error", async () => {
    fetchMock.mockRejectedValue(new Error("Rate limit exceeded"));

    const result = await generateAutoReply({
      userMessage: "help",
      serverName: "Server",
      customPrompt: null,
      customApiKey: "test-fake-key",
    });

    expect(result).toBeNull(); // never throws, returns null
  });

  it("returns null on non-OK API status (e.g. 429 exhausted free quota)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: "quota exceeded" } }),
    });

    const result = await generateAutoReply({
      userMessage: "help",
      serverName: "Server",
      customPrompt: null,
      customApiKey: "test-fake-key",
    });

    expect(result).toBeNull();
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
