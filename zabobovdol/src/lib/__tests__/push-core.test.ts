import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayload,
  classifyPushError,
  isBase64Url,
  isPushEndpoint,
  isViberUrl,
  joinTopics,
  MAX_PAYLOAD_BYTES,
  nextAction,
  parseTopics,
  safeInternalPath,
  selectSubscribers,
} from "../push-core";

test("parseTopics: само известни теми, без повторения", () => {
  assert.deepEqual(parseTopics("outages, scams,x,outages"), ["outages", "scams"]);
  assert.deepEqual(parseTopics(""), []);
  assert.equal(joinTopics(["news", "bad", "news"]), "news");
});

test("selectSubscribers: точно съвпадение по тема", () => {
  const subs = [{ topics: "outages,scams" }, { topics: "news" }, { topics: "outagesX" }];
  assert.equal(selectSubscribers(subs, "outages").length, 1);
  assert.equal(selectSubscribers(subs, "pharmacy").length, 0);
});

test("classifyPushError и nextAction", () => {
  assert.equal(classifyPushError(410), "gone");
  assert.equal(classifyPushError(404), "gone");
  assert.equal(classifyPushError(500), "fail");
  assert.equal(classifyPushError(undefined), "fail");
  assert.deepEqual(nextAction("ok", 3), { kind: "ok" });
  assert.deepEqual(nextAction("gone", 0), { kind: "delete" });
  assert.deepEqual(nextAction("fail", 1), { kind: "fail", failCount: 2 });
  assert.deepEqual(nextAction("fail", 4), { kind: "delete" });
});

test("safeInternalPath: само вътрешни пътища", () => {
  assert.equal(safeInternalPath("/izmami?s=push"), "/izmami?s=push");
  assert.equal(safeInternalPath("//evil.com"), "/");
  assert.equal(safeInternalPath("https://evil.com"), "/");
  assert.equal(safeInternalPath("/\\evil.com"), "/");
  assert.equal(safeInternalPath(5), "/");
});

test("buildPayload: ≤ лимита и валиден JSON", () => {
  const p = JSON.parse(buildPayload({ title: "Т", body: "я".repeat(5000), url: "/x" }));
  assert.equal(p.url, "/x");
  assert.ok(Buffer.byteLength(JSON.stringify(p)) <= MAX_PAYLOAD_BYTES);
  assert.equal(JSON.parse(buildPayload({ title: "Т", body: "б", url: "http://a" })).url, "/");
});

test("валидатори", () => {
  assert.ok(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(!isPushEndpoint("http://x.com/a"));
  assert.ok(!isPushEndpoint("javascript:alert(1)"));
  assert.ok(isBase64Url("BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ"));
  assert.ok(!isBase64Url("a b+c/"));
  assert.ok(isViberUrl("https://invite.viber.com/?g2=abc"));
  assert.ok(!isViberUrl("https://evil.com/invite.viber.com/"));
});
