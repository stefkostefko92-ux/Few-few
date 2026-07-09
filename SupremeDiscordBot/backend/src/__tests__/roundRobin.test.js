// backend/src/__tests__/roundRobin.test.js
// Tests the round-robin index cycling logic in isolation
// (without real DB or Discord API calls)
import { describe, it, expect } from "vitest";

// Pure function to test: given members array and current index, returns next assignee and new index
function pickFromList(members, currentIndex) {
  if (!members.length) return { assigneeId: null, nextIndex: 0 };
  const index = currentIndex % members.length;
  return {
    assigneeId: members[index],
    nextIndex: (index + 1) % members.length,
  };
}

describe("round-robin cycling logic", () => {
  const members = ["user1", "user2", "user3"];

  it("picks first member at index 0", () => {
    expect(pickFromList(members, 0).assigneeId).toBe("user1");
  });

  it("advances index correctly", () => {
    expect(pickFromList(members, 0).nextIndex).toBe(1);
    expect(pickFromList(members, 1).nextIndex).toBe(2);
    expect(pickFromList(members, 2).nextIndex).toBe(0); // wraps around
  });

  it("wraps around when index exceeds members length", () => {
    expect(pickFromList(members, 5).assigneeId).toBe("user3"); // 5 % 3 = 2
    expect(pickFromList(members, 6).assigneeId).toBe("user1"); // 6 % 3 = 0
  });

  it("returns null assignee for empty members list", () => {
    const { assigneeId } = pickFromList([], 0);
    expect(assigneeId).toBeNull();
  });

  it("handles single member list", () => {
    const { assigneeId, nextIndex } = pickFromList(["only-user"], 0);
    expect(assigneeId).toBe("only-user");
    expect(nextIndex).toBe(0); // wraps to 0
  });

  it("cycles evenly across all members", () => {
    const results = [];
    let idx = 0;
    for (let i = 0; i < 9; i++) {
      const { assigneeId, nextIndex } = pickFromList(members, idx);
      results.push(assigneeId);
      idx = nextIndex;
    }
    // Each member should appear exactly 3 times in 9 picks
    expect(results.filter((r) => r === "user1")).toHaveLength(3);
    expect(results.filter((r) => r === "user2")).toHaveLength(3);
    expect(results.filter((r) => r === "user3")).toHaveLength(3);
  });
});
