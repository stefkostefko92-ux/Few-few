import { test } from "node:test";
import assert from "node:assert/strict";
import { isEventName, track, trackingOptedOut } from "../events";

test("isEventName: само затвореният списък", () => {
  assert.ok(isEventName("share_click"));
  assert.ok(!isEventName("bogus"));
  assert.ok(!isEventName(5));
});

test("trackingOptedOut: GPC или Do Not Track = отказ", () => {
  assert.equal(trackingOptedOut({ globalPrivacyControl: true }), true);
  assert.equal(trackingOptedOut({ doNotTrack: "1" }), true);
  assert.equal(trackingOptedOut({ doNotTrack: "yes" }), true); // стар Firefox
  assert.equal(trackingOptedOut({ msDoNotTrack: "1" }), true); // стар IE/Edge
  assert.equal(trackingOptedOut({}, { doNotTrack: "1" }), true); // стар Safari
  assert.equal(trackingOptedOut({ globalPrivacyControl: false, doNotTrack: "0" }), false);
  assert.equal(trackingOptedOut({ doNotTrack: null }), false);
  assert.equal(trackingOptedOut({ globalPrivacyControl: "true" }), false); // само истинско true
  assert.equal(trackingOptedOut(null, null), false);
});

// Подменя window/navigator/fetch за един тест и ги връща после.
function withBrowser(nav: Record<string, unknown>, fn: (calls: string[]) => void) {
  const g = globalThis as Record<string, unknown>;
  const saved = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
  };
  const calls: string[] = [];
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/izmami", search: "?s=share" } },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        ...nav,
        sendBeacon: (url: string) => {
          calls.push(`beacon ${url}`);
          return true;
        },
      },
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        calls.push(`fetch ${url}`);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });
    fn(calls);
  } finally {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete g[k];
    }
  }
}

test("track: без отказ — праща (sendBeacon към /api/e)", () => {
  withBrowser({}, (calls) => {
    track("share_click");
    assert.deepEqual(calls, ["beacon /api/e"]);
  });
});

test("track: при Global Privacy Control НЕ праща нищо", () => {
  withBrowser({ globalPrivacyControl: true }, (calls) => {
    track("share_click");
    assert.deepEqual(calls, []);
  });
});

test("track: при Do Not Track = \"1\" НЕ праща нищо", () => {
  withBrowser({ doNotTrack: "1" }, (calls) => {
    track("tel_click");
    assert.deepEqual(calls, []);
  });
});

test("track: на сървъра (без window) — нищо и не хвърля", () => {
  assert.doesNotThrow(() => track("share_click"));
});
