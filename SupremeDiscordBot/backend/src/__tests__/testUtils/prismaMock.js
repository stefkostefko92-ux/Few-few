// backend/src/__tests__/testUtils/prismaMock.js
// Shared Prisma mock factory for money-critical route tests. Never talks to a
// real DB — every model method is a vi.fn() the test configures explicitly
// (mockResolvedValue / mockResolvedValueOnce) and asserts on
// (toHaveBeenCalledWith). $transaction supports BOTH the callback form
// (`prisma.$transaction(async (tx) => ...)`) — invoking the callback with the
// SAME mock object as `tx`, so assertions on `prisma.server.update` also catch
// writes made through `tx.server.update` — and the array form.
import { vi } from "vitest";

const MODEL_METHODS = [
  "findUnique", "findFirst", "findMany", "create", "update", "updateMany",
  "delete", "deleteMany", "upsert", "count", "aggregate",
];

function makeModel() {
  const model = {};
  for (const method of MODEL_METHODS) model[method] = vi.fn();
  return model;
}

/** Fresh, isolated Prisma mock — call once per test file (or per test, for
 * full isolation) and reset with vi.clearAllMocks()/vi.resetAllMocks() in
 * beforeEach. Unknown models are created lazily via Proxy, so a new route
 * touching a model this file doesn't pre-list still works out of the box. */
export function createPrismaMock() {
  const models = {};

  const base = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (arg) => {
      if (typeof arg === "function") {
        return arg(proxy);
      }
      // Array form: caller already built an array of prisma promises.
      return Promise.all(arg);
    }),
  };

  const proxy = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== "string") return undefined;
      if (!models[prop]) models[prop] = makeModel();
      return models[prop];
    },
  });

  return proxy;
}
