// backend/src/__tests__/archive.test.js
import { describe, it, expect } from "vitest";
import { generateHtmlTranscript } from "../utils/archive.js";

const baseTicket = {
  id: "test-ticket-1",
  createdAt: new Date("2024-01-15T10:00:00Z"),
  closedAt: new Date("2024-01-15T11:00:00Z"),
  closeReason: "Issue resolved",
  creator: { username: "TestUser" },
  assignee: { username: "SupportAgent" },
  messages: [],
  application: null,
};

describe("generateHtmlTranscript", () => {
  it("returns valid HTML string", () => {
    const html = generateHtmlTranscript(baseTicket);
    expect(typeof html).toBe("string");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes ticket ID in title", () => {
    const html = generateHtmlTranscript(baseTicket);
    expect(html).toContain("test-ticket-1");
  });

  it("includes creator username", () => {
    const html = generateHtmlTranscript(baseTicket);
    expect(html).toContain("TestUser");
  });

  it("shows 'No messages recorded' when messages is empty", () => {
    const html = generateHtmlTranscript(baseTicket);
    expect(html).toContain("No messages recorded");
  });

  it("includes message content when messages exist", () => {
    const ticket = {
      ...baseTicket,
      messages: [{
        id: "msg1",
        authorTag: "TestUser#0",
        authorId: "123",
        content: "Hello, I need help with my order.",
        attachments: [],
        createdAt: new Date("2024-01-15T10:05:00Z"),
      }],
    };
    const html = generateHtmlTranscript(ticket);
    expect(html).toContain("Hello, I need help with my order.");
    expect(html).toContain("TestUser#0");
  });

  it("escapes XSS in message content", () => {
    const ticket = {
      ...baseTicket,
      messages: [{
        id: "msg2",
        authorTag: "Attacker",
        authorId: "999",
        content: '<script>alert("xss")</script>',
        attachments: [],
        createdAt: new Date(),
      }],
    };
    const html = generateHtmlTranscript(ticket);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = {
      id: "min-1",
      createdAt: new Date(),
      closedAt: null,
      closeReason: null,
      creator: null,
      assignee: null,
      messages: [],
      application: null,
    };
    expect(() => generateHtmlTranscript(minimal)).not.toThrow();
  });
});
