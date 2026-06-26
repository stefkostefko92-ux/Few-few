// backend/src/__tests__/ticketValidation.test.js
// Tests the ticket status business rules as pure logic
import { describe, it, expect } from "vitest";

// Business rule: which statuses can be closed?
const CLOSEABLE_STATUSES = ["OPEN", "CLAIMED"];
const NON_CLOSEABLE_STATUSES = ["CLOSED", "ARCHIVED"];

function canClose(status) {
  return CLOSEABLE_STATUSES.includes(status);
}

// Business rule: max open tickets
function canCreateTicket(openCount, maxOpen) {
  return openCount < maxOpen;
}

// Business rule: hasArchive flag computation
function computeHasArchive(archiveHtml) {
  return !!archiveHtml;
}

describe("Ticket business rules", () => {
  it("allows closing OPEN tickets", () => {
    expect(canClose("OPEN")).toBe(true);
  });

  it("allows closing CLAIMED tickets", () => {
    expect(canClose("CLAIMED")).toBe(true);
  });

  it("rejects closing already CLOSED tickets", () => {
    expect(canClose("CLOSED")).toBe(false);
  });

  it("rejects closing ARCHIVED tickets", () => {
    expect(canClose("ARCHIVED")).toBe(false);
  });

  it("allows ticket creation when under limit", () => {
    expect(canCreateTicket(0, 1)).toBe(true);
    expect(canCreateTicket(1, 3)).toBe(true);
    expect(canCreateTicket(2, 3)).toBe(true);
  });

  it("blocks ticket creation at limit", () => {
    expect(canCreateTicket(1, 1)).toBe(false);
    expect(canCreateTicket(3, 3)).toBe(false);
  });

  it("hasArchive is true only when archiveHtml exists", () => {
    expect(computeHasArchive("<html>...</html>")).toBe(true);
    expect(computeHasArchive(null)).toBe(false);
    expect(computeHasArchive(undefined)).toBe(false);
    expect(computeHasArchive("")).toBe(false);
  });
});
