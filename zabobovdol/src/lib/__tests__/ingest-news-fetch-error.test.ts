import test from "node:test";
import assert from "node:assert/strict";
import { SourceHttpError, describeFetchError } from "@/lib/ingest-news-parse";

// Бъг (16.11.2026): сайтът на общината не приемаше връзки от нашия сървър, а
// панелът казваше „Грешка при сваляне… Проверете адреса (MUNICIPALITY_NEWS_URL)“ —
// пращаше човека да пипа настройка, която е вярна. Съобщението трябва да казва
// истинската причина.

/** Като грешката на fetch в Node (undici): TypeError("fetch failed") с cause.code. */
const fetchFailed = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

test("новини: изтичане на времето / няма връзка → сайтът не отговаря, НЕ „проверете адреса“", () => {
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  for (const err of [
    timeout,
    fetchFailed("UND_ERR_CONNECT_TIMEOUT"),
    fetchFailed("UND_ERR_HEADERS_TIMEOUT"),
    fetchFailed("ETIMEDOUT"),
  ]) {
    const m = describeFetchError(err);
    assert.match(m, /не отговаря/);
    assert.doesNotMatch(m, /MUNICIPALITY_NEWS_URL/);
  }
});

test("новини: отказана или прекъсната връзка", () => {
  for (const code of ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_SOCKET"]) {
    const m = describeFetchError(fetchFailed(code));
    assert.match(m, /връзката/);
    assert.doesNotMatch(m, /MUNICIPALITY_NEWS_URL/);
  }
});

test("новини: несъществуващ адрес (DNS) и 404 → тогава да, проверете адреса", () => {
  assert.match(describeFetchError(fetchFailed("ENOTFOUND")), /MUNICIPALITY_NEWS_URL/);
  assert.match(describeFetchError(new SourceHttpError(404)), /MUNICIPALITY_NEWS_URL/);
  assert.match(describeFetchError(new SourceHttpError(410)), /MUNICIPALITY_NEWS_URL/);
});

test("новини: 5xx → временно не работи; 403/429 → спира автоматичните заявки", () => {
  const m503 = describeFetchError(new SourceHttpError(503));
  assert.match(m503, /503/);
  assert.match(m503, /временно/);
  assert.doesNotMatch(m503, /MUNICIPALITY_NEWS_URL/);
  assert.match(describeFetchError(new SourceHttpError(403)), /403/);
  assert.match(describeFetchError(new SourceHttpError(429)), /429/);
});

test("новини: проблем със сертификата (HTTPS)", () => {
  for (const code of ["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "SELF_SIGNED_CERT_IN_CHAIN"])
    assert.match(describeFetchError(fetchFailed(code)), /сертификат/);
});

test("новини: непозната грешка — общо съобщение без вътрешни подробности", () => {
  const m = describeFetchError(new Error("нещо /secret/path"));
  assert.equal(m, "Грешка при сваляне на източника.");
  assert.equal(describeFetchError("низ"), "Грешка при сваляне на източника.");
  assert.equal(describeFetchError(null), "Грешка при сваляне на източника.");
});

// Бъг (16.11.2026, доказан на сървъра): защитната стена на egov.bg прекъсва
// връзката (ECONNRESET) според User-Agent: „node“ и „ZaBobovDolBot/1.0“ — да,
// „curl/8.5.0“ — не. Честно представяне без „Bot“; при прекъсване — следващият.
import { newsUserAgents, retryWithNextAgent } from "@/lib/ingest-news-parse";

test("новини: User-Agent — честен, без „bot“, с адреса на сайта; от .env пръв", () => {
  const list = newsUserAgents(undefined);
  assert.ok(list.length >= 2);
  for (const ua of list) {
    assert.doesNotMatch(ua, /bot/i, ua);
    assert.match(ua, /ZaBobovDol\/1\.0/);
    assert.match(ua, /https:\/\/zabobovdol\.carbonstealth\.eu/);
  }
  assert.deepEqual(newsUserAgents("  Custom/2.0  ")[0], "Custom/2.0");
  assert.equal(newsUserAgents("  ").length, list.length);
});

test("новини: следващ User-Agent само при прекъсната връзка или 403/429", () => {
  assert.equal(retryWithNextAgent(fetchFailed("ECONNRESET")), true);
  assert.equal(retryWithNextAgent(fetchFailed("UND_ERR_SOCKET")), true);
  assert.equal(retryWithNextAgent(new SourceHttpError(403)), true);
  assert.equal(retryWithNextAgent(new SourceHttpError(429)), true);
  assert.equal(retryWithNextAgent(new SourceHttpError(404)), false);
  assert.equal(retryWithNextAgent(new SourceHttpError(503)), false);
  assert.equal(retryWithNextAgent(fetchFailed("ENOTFOUND")), false);
  assert.equal(retryWithNextAgent(Object.assign(new Error("t"), { name: "TimeoutError" })), false);
});
