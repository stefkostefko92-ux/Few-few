// backend/src/__tests__/formValidation.test.js
// Tests form/application business logic as pure functions
import { describe, it, expect } from "vitest";

// Simulates question ordering logic
function sortQuestions(questions) {
  return [...questions].sort((a, b) => a.order - b.order);
}

// Simulates branching logic from formSession.js
function getNextIndex(questions, currentIndex, answer) {
  const question = questions[currentIndex];
  const branches = (question.branches && typeof question.branches === "object")
    ? question.branches : {};
  const nextQuestionId = answer ? branches[answer] : null;

  if (nextQuestionId) {
    const branchIndex = questions.findIndex((q) => q.id === nextQuestionId);
    if (branchIndex !== -1) return branchIndex;
  }
  return currentIndex + 1;
}

// Simulates reviewChannelId normalisation
function normaliseChannelId(value) {
  return value === "" ? null : value || null;
}

describe("Form question ordering", () => {
  it("sorts questions by order field", () => {
    const questions = [
      { id: "q3", order: 3, label: "Third" },
      { id: "q1", order: 1, label: "First" },
      { id: "q2", order: 2, label: "Second" },
    ];
    const sorted = sortQuestions(questions);
    expect(sorted[0].id).toBe("q1");
    expect(sorted[1].id).toBe("q2");
    expect(sorted[2].id).toBe("q3");
  });

  it("does not mutate the original array", () => {
    const questions = [{ id: "q2", order: 2 }, { id: "q1", order: 1 }];
    const sorted = sortQuestions(questions);
    expect(questions[0].id).toBe("q2"); // original unchanged
  });
});

describe("Form branching logic", () => {
  const questions = [
    { id: "q1", order: 1, branches: { "Yes": "q3" } },
    { id: "q2", order: 2, branches: {} },
    { id: "q3", order: 3, branches: {} },
  ];

  it("follows branch when answer matches", () => {
    const next = getNextIndex(questions, 0, "Yes");
    expect(next).toBe(2); // jumps to q3 (index 2)
  });

  it("goes to next sequential question when no branch matches", () => {
    const next = getNextIndex(questions, 0, "No");
    expect(next).toBe(1); // sequential next
  });

  it("handles null/undefined branches gracefully", () => {
    const qs = [{ id: "q1", order: 1, branches: null }];
    expect(() => getNextIndex(qs, 0, "anything")).not.toThrow();
    expect(getNextIndex(qs, 0, "anything")).toBe(1);
  });
});

describe("Form field normalisation", () => {
  it("normalises empty string to null", () => {
    expect(normaliseChannelId("")).toBeNull();
  });

  it("keeps valid channel ID", () => {
    expect(normaliseChannelId("1234567890")).toBe("1234567890");
  });

  it("normalises undefined to null", () => {
    expect(normaliseChannelId(undefined)).toBeNull();
  });
});
