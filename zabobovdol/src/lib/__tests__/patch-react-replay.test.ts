import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { patchReplaySource } from "../../../scripts/patch-react-replay.mjs";

// Кръпката за React #418 (виж scripts/patch-react-replay.mjs): вмъква редовете
// от React 19.3 в replaySuspendedUnitOfWork; идемпотентна; пада, ако мястото
// липсва.

const DECLS = `var hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = !1;
function popToNextHostParent(fiber) {}
`;

const PROD = `${DECLS}function replaySuspendedUnitOfWork(unitOfWork) {
  var next = unitOfWork;
  var current = next.alternate;
  switch (next.tag) {
    case 5:
      resetHooksOnUnwind(next);
    default:
      unwindInterruptedWork(current, next);
  }
}
function throwAndUnwindWorkLoop(root) {}
`;

const DEV = `${DECLS}    function replaySuspendedUnitOfWork(unitOfWork) {
      var next = runWithFiberInDEV(unitOfWork, replayBeginWork, unitOfWork);
    }
    function replayBeginWork(unitOfWork) {
      var current = unitOfWork.alternate;
      switch (unitOfWork.tag) {
        case 5:
          resetHooksOnUnwind(unitOfWork);
        default:
          unwindInterruptedWork(current, unitOfWork);
      }
      return current;
    }
    function throwAndUnwindWorkLoop(root) {}
`;

test("patchReplaySource: вмъква поправката след „case 5“ (production и development)", () => {
  for (const [src, v] of [
    [PROD, "next"],
    [DEV, "unitOfWork"],
  ] as const) {
    const r = patchReplaySource(src);
    assert.equal(r.status, "patched");
    assert.ok(r.src.includes(`resetHooksOnUnwind(${v});\n`));
    assert.ok(r.src.includes(`var fiber = ${v};`));
    assert.ok(r.src.includes("(nextHydratableInstance = fiber.stateNode)"));
    // Поправката е между „case 5“ и „default“.
    const i = r.src.indexOf("var fiber");
    assert.ok(i > r.src.indexOf("case 5:") && i < r.src.indexOf("default:"));
    // Идемпотентна.
    assert.deepEqual(patchReplaySource(r.src), { src: r.src, status: "already-patched" });
  }
});

test("patchReplaySource: React с поправката (≥ 19.3) не се пипа; липсващо място → грешка", () => {
  const upstream = PROD.replace(
    "resetHooksOnUnwind(next);\n",
    "resetHooksOnUnwind(next);\n      var fiber = next;\n      fiber === hydrationParentFiber && 0;\n",
  );
  assert.equal(patchReplaySource(upstream).status, "fixed-upstream");
  assert.throws(() => patchReplaySource(PROD.replace("case 5:", "case 6:")), /очаквах 1 място/);
  assert.equal(patchReplaySource("var x = 1;").status, "no-replay");
});

test("вграденият в Next React е кърпен или кърпим (иначе билдът пада)", () => {
  const file = join(process.cwd(), "node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js");
  if (!existsSync(file)) return;
  const { status } = patchReplaySource(readFileSync(file, "utf8"));
  assert.ok(["patched", "already-patched", "fixed-upstream"].includes(status), status);
});
