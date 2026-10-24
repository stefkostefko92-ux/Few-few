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

test("isPushEndpoint: само https към известните push услуги", () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc:APA91bXyz",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk",
    "https://web.push.apple.com/QMx1abc",
    "https://api.push.apple.com/3/device/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%3d",
    "https://db5p.notify.windows.com/w/?token=x",
    "https://fcm.googleapis.com:443/fcm/send/abc", // 443 е портът по подразбиране
  ]) {
    assert.ok(isPushEndpoint(ok), ok);
  }
});

test("isPushEndpoint: вътрешни адреси, http, чужди хостове и трикове → отказ (SSRF)", () => {
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc", // само https
    "http://x.com/a",
    "javascript:alert(1)",
    "https://attacker.example/slow/1", // чужд хост
    "https://127.0.0.1/a",
    "https://127.0.0.1:8443/x",
    "https://localhost/a",
    "https://[::1]/a",
    "https://10.0.0.5/admin",
    "https://10.1.2.3/a",
    "https://192.168.0.1/a",
    "https://172.16.0.1/a",
    "https://169.254.169.254/latest/meta-data/",
    "https://x.internal/a",
    "https://fcm.googleapis.com:8443/fcm/send/abc", // чужд порт
    "https://fcm.googleapis.com@evil.com/a", // потребител в адреса
    "https://user:pass@fcm.googleapis.com/a",
    "https://fcm.googleapis.com.evil.com/a", // наставка-капан
    "https://evilfcm.googleapis.com/a",
    "https://fcm.googleapis.com./a", // крайна точка в хоста
    "https://evil-notify.windows.com/a", // без точка преди notify.windows.com
    "https://notify.windows.com.evil.com/a",
    "https://push.services.mozilla.com/a", // само поддомейн на услугата
    "https://push.apple.com.evil.com/a",
    "https://evil.com\\@fcm.googleapis.com/a", // „\\“ — различни парсери
    "https://evil.com\\fcm.googleapis.com/a",
    "https://fcm.googleapis.com/a b",
    "https://fcm.googleapis.com/\nX",
    "https://" + "a".repeat(1000) + ".fcm.googleapis.com/a",
    "",
  ]) {
    assert.ok(!isPushEndpoint(bad), JSON.stringify(bad));
  }
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
