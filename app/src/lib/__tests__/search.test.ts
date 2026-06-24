import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTermGroups,
  classifyIntent,
  rankIndex,
  type SearchIndex,
} from "@/lib/search";

const flat = (q: string) => buildTermGroups(q).flat();

// Малък индекс, който възпроизвежда реалния случай: въпрос „телефон на
// общината“ не бива да връща статия за Wi-Fi само защото в нея пише „телефон“.
const idx: SearchIndex = {
  faqs: [
    {
      slug: "wifi-na-telefona",
      question: "Как да вляза в интернет на телефона (Wi-Fi)?",
      answer:
        "Wi-Fi е безплатен интернет от рутер. Свържете телефона веднъж и той помни мрежата.",
      tags: "интернет, wi-fi, телефон, мрежа",
      category: "Интернет",
    },
    {
      slug: "kak-platya-danak",
      question: "Как да платя местните данъци онлайн?",
      answer: "Може да платите данък сгради и такса смет през egov.bg с електронен подпис.",
      tags: "данъци, плащане, онлайн",
      category: "Пари",
    },
  ],
  services: [
    {
      slug: "obshtina-bobov-dol",
      name: "Община Дупница",
      description: "Общинска администрация — административни услуги за гражданите.",
      address: "ул. „27-ми октомври“ № 2, гр. Дупница",
      phone: "0702 62323",
      phone2: "0893 653 530",
      category: "ADMIN",
    },
  ],
  businesses: [],
  events: [],
};

test("„телефон на общината“ връща Общината, а не Wi-Fi статията", () => {
  const res = rankIndex(idx, "телефон на общината", 5);
  assert.ok(res.length > 0, "трябва да има резултат");
  assert.equal(res[0].type, "service");
  assert.equal(res[0].title, "Община Дупница");
  // Wi-Fi статията изобщо не бива да е по-горе от общината.
  const wifi = res.find((r) => r.url.includes("wifi"));
  if (wifi) assert.ok(res[0].score > wifi.score);
});

test("намерението за контакт се разпознава, „как да…“ — не", () => {
  assert.equal(classifyIntent("телефон на общината").contact, true);
  assert.equal(classifyIntent("как да платя данък").howto, true);
  assert.equal(classifyIntent("как да платя данък").contact, false);
});

test("контактните думи се махат от съвпадението (телефон, номер)", () => {
  const terms = flat("телефон на общината");
  assert.ok(!terms.includes("телефон"));
  assert.ok(terms.includes("община"));
});

test("„как да платя данък“ извежда статията, не я потиска", () => {
  const res = rankIndex(idx, "как да платя данък онлайн", 5);
  assert.equal(res[0].type, "faq");
  assert.match(res[0].title, /данъци/);
});

test("разговорна дума намира официалния термин (доктор → лекар)", () => {
  assert.ok(flat("доктор").includes("лекар"));
});

test("израз от няколко думи активира понятие (няма ток → електричество)", () => {
  const terms = flat("няма ток вкъщи");
  assert.ok(terms.includes("електричество"));
});

test("членувана форма се разпознава (боклука → смет/отпадъци)", () => {
  const terms = flat("кога вдигат боклука");
  assert.ok(terms.includes("смет") || terms.includes("отпадъци"));
});

test("израз-понятие се добавя само веднъж (без дублиране на групи)", () => {
  const groups = buildTermGroups("плащане на данък мпс");
  const carGroups = groups.filter((g) => g.includes("данък мпс"));
  assert.equal(carGroups.length, 1);
});

test("дума извън понятията запазва вариантите си за стемване", () => {
  const groups = buildTermGroups("компостиране");
  const g = groups.find((x) => x.includes("компостиране"));
  assert.ok(g);
  assert.ok(g!.length > 1, "трябва да има поне един стем-вариант");
});

test("празна заявка не връща групи", () => {
  assert.equal(buildTermGroups("   ").length, 0);
});
