// Тестове за matchResult — резултат от гледна точка на „Миньор“.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchResult, OUTCOME_LABEL, OUTCOME_SHORT, type MatchLike } from "../match";

function match(over: Partial<MatchLike> = {}): MatchLike {
  return {
    id: "m1",
    opponent: "Съперник",
    isHome: true,
    kickoff: new Date("2026-03-01T15:00:00Z"),
    status: "FINISHED",
    homeGoals: 0,
    awayGoals: 0,
    ...over,
  };
}

describe("matchResult", () => {
  test("победа като домакин", () => {
    assert.deepEqual(matchResult(match({ isHome: true, homeGoals: 3, awayGoals: 1 })), {
      ours: 3,
      theirs: 1,
      outcome: "WIN",
    });
  });

  test("загуба като домакин", () => {
    assert.deepEqual(matchResult(match({ isHome: true, homeGoals: 0, awayGoals: 2 })), {
      ours: 0,
      theirs: 2,
      outcome: "LOSS",
    });
  });

  test("победа като гост — головете се обръщат", () => {
    assert.deepEqual(matchResult(match({ isHome: false, homeGoals: 1, awayGoals: 2 })), {
      ours: 2,
      theirs: 1,
      outcome: "WIN",
    });
  });

  test("загуба като гост", () => {
    assert.deepEqual(matchResult(match({ isHome: false, homeGoals: 4, awayGoals: 0 })), {
      ours: 0,
      theirs: 4,
      outcome: "LOSS",
    });
  });

  test("равенство, вкл. 0:0 (нулата не е „липсва“)", () => {
    assert.deepEqual(matchResult(match({ homeGoals: 0, awayGoals: 0 })), {
      ours: 0,
      theirs: 0,
      outcome: "DRAW",
    });
    assert.equal(matchResult(match({ isHome: false, homeGoals: 2, awayGoals: 2 })).outcome, "DRAW");
  });

  test("неприключил мач няма резултат, дори да има голове", () => {
    for (const status of ["SCHEDULED", "POSTPONED", "CANCELLED"] as const) {
      assert.deepEqual(matchResult(match({ status, homeGoals: 1, awayGoals: 0 })), {
        ours: null,
        theirs: null,
        outcome: null,
      });
    }
  });

  test("приключил мач без въведени голове → без резултат", () => {
    const empty = { ours: null, theirs: null, outcome: null };
    assert.deepEqual(matchResult(match({ homeGoals: null, awayGoals: 1 })), empty);
    assert.deepEqual(matchResult(match({ homeGoals: 1, awayGoals: null })), empty);
    assert.deepEqual(matchResult(match({ homeGoals: undefined, awayGoals: undefined })), empty);
  });
});

describe("етикети на изхода", () => {
  test("пълни и кратки етикети на български за трите изхода", () => {
    assert.deepEqual(OUTCOME_LABEL, { WIN: "Победа", DRAW: "Равенство", LOSS: "Загуба" });
    assert.deepEqual(OUTCOME_SHORT, { WIN: "П", DRAW: "Р", LOSS: "З" });
  });
});
