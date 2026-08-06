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

  it("shows an empty-state notice when messages is empty", () => {
    const html = generateHtmlTranscript(baseTicket);
    expect(html).toMatch(/No messages were recorded/i);
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

  // ─── Брандиране (регресии от визуалния одит, 06.08.2026) ────────────────
  describe("branding", () => {
    it("carries OUR brand, not Discord's default skin", () => {
      const html = generateHtmlTranscript(baseTicket);
      expect(html).toContain("Supreme Bot");
      expect(html).toContain("#8fe600");            // брандово зелено
      expect(html).not.toMatch(/#36393f|#2f3136|#5865f2/i); // Discord chrome
      expect(html).not.toContain("Whitney");        // шрифтът на Discord
    });

    it("stays self-contained — no external resource references", () => {
      const html = generateHtmlTranscript(baseTicket);
      // Свален на диска транскрипт не може да дърпа нищо по мрежата; линковете
      // към прикачени файлове са съдържание, не ресурси на документа.
      expect(html).not.toMatch(/<link[^>]+href=|<script[^>]+src=|url\(https?:/i);
      expect(html).not.toMatch(/<img[^>]+src="https?:/i);
    });

    it("hides our brand for a white-label bot — the customer pays for their own", () => {
      const wl = { ...baseTicket, server: { customBotName: "Acme Helpdesk", name: "Acme" } };
      const html = generateHtmlTranscript(wl);
      expect(html).toContain("Acme Helpdesk");
      expect(html).not.toContain("Supreme Bot");
    });

    it("honours an explicit whiteLabel override", () => {
      const html = generateHtmlTranscript(baseTicket, { whiteLabel: true, brandName: "Nova Support" });
      expect(html).toContain("Nova Support");
      expect(html).not.toContain("Supreme Bot");
    });

    it("ships a print stylesheet — transcripts get printed for records", () => {
      const html = generateHtmlTranscript(baseTicket);
      expect(html).toContain("@media print");
    });

    it("labels who spoke: the requester is Member, everyone else Staff", () => {
      const ticket = {
        ...baseTicket,
        creatorId: "user-1",
        messages: [
          { id: "m1", authorId: "user-1", authorTag: "Requester", content: "hi", attachments: [], createdAt: new Date() },
          { id: "m2", authorId: "staff-9", authorTag: "Agent", content: "hello", attachments: [], createdAt: new Date() },
        ],
      };
      const html = generateHtmlTranscript(ticket);
      expect(html).toContain(">Member<");
      expect(html).toContain(">Staff<");
    });
  });
});
