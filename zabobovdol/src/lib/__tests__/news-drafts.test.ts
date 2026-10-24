import test from "node:test";
import assert from "node:assert/strict";
import { isNotNewsDraft, isPortalPage, newsPatterns } from "@/app/admin/novini/drafts";
import { MUNICIPALITY_SOURCE } from "@/lib/ingest-news-parse";

const PORTAL = "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol";
const patterns = newsPatterns(undefined);
const draft = (sourceUrl: string, source = MUNICIPALITY_SOURCE) => ({ source, sourceUrl });

test("страница от менюто на портала (HTML) = не е новина", () => {
  assert.equal(isNotNewsDraft(draft(`${PORTAL}/municipality/harakteristiki`), patterns), true);
  assert.equal(isNotNewsDraft(draft(`${PORTAL}/administration/kmet/pravomoshtia`), patterns), true);
});

test("новина от портала по шаблона остава за преглед", () => {
  assert.equal(isNotNewsDraft(draft(`${PORTAL}/actual/news/remont-na-ulitsa`), patterns), false);
});

// RSS/Atom каналът не минава през шаблона: записите му не бива да се броят за
// „не са новини“ (скрити от „Чакащи преглед“ и предложени за изтриване) само
// защото адресът им е извън шаблона на портала.
test("запис от RSS/Atom канал (адрес извън портала) НЕ е „не е новина“", () => {
  for (const u of [
    "https://bobovdol.bg/2026/10/24/remont-na-ulitsa/",
    "https://www.bobovdol.bg/novini/sesiya-na-obshtinskiya-savet",
    "https://bobovdol.bg/?p=1234",
  ]) {
    assert.equal(isNotNewsDraft(draft(u), patterns), false, u);
  }
});

test("ръчни чернови и други източници никога не са „не е новина“", () => {
  assert.equal(isNotNewsDraft(draft(""), patterns), false);
  assert.equal(isNotNewsDraft(draft(`${PORTAL}/municipality/x`, "Ръчно"), patterns), false);
});

test("адрес от портала: само http(s) и точно хостът на портала", () => {
  assert.equal(isPortalPage(`${PORTAL}/actual/news`), true);
  assert.equal(isPortalPage("https://BOBOVDOL.egov.bg/x"), true);
  assert.equal(isPortalPage("https://bobovdol.egov.bg.evil.example/x"), false);
  assert.equal(isPortalPage("https://bobovdol.bg/x"), false);
  assert.equal(isPortalPage("javascript:alert(1)"), false);
  assert.equal(isPortalPage("не е адрес"), false);
});
