import test from "node:test";
import assert from "node:assert/strict";
import {
  canonical,
  breadcrumbLd,
  faqPageLd,
  organizationLd,
  websiteLd,
  webPageLd,
  buildMetadata,
  cityLd,
  howToLd,
  latestDate,
  withBrandKeyword,
  ORG_ID,
  WEBSITE_ID,
  CITY_ID,
  MUNICIPALITY_ID,
} from "@/lib/seo";

test("canonical строи абсолютни адреси без двойна наклонена черта", () => {
  assert.ok(/^https?:\/\//.test(canonical("/")));
  assert.ok(canonical("/uslugi").endsWith("/uslugi"));
  assert.ok(!canonical("/uslugi").includes("//uslugi"));
});

test("breadcrumbLd номерира позициите от 1", () => {
  const b = breadcrumbLd([
    { name: "Начало", path: "/" },
    { name: "Услуги", path: "/uslugi" },
  ]) as { itemListElement: { position: number; name: string }[] };
  assert.equal(b.itemListElement[0].position, 1);
  assert.equal(b.itemListElement[1].position, 2);
  assert.equal(b.itemListElement[1].name, "Услуги");
});

test("faqPageLd произвежда валиден FAQPage граф", () => {
  const f = faqPageLd([{ question: "Въпрос?", answerText: "Отговор." }]) as {
    "@type": string;
    mainEntity: { "@type": string; acceptedAnswer: { text: string } }[];
  };
  assert.equal(f["@type"], "FAQPage");
  assert.equal(f.mainEntity[0]["@type"], "Question");
  assert.equal(f.mainEntity[0].acceptedAnswer.text, "Отговор.");
});

test("графът е свързан чрез устойчиви @id", () => {
  const org = organizationLd() as { "@id": string; logo: unknown };
  const web = websiteLd() as { "@id": string; publisher: { "@id": string } };
  assert.equal(org["@id"], ORG_ID);
  assert.equal(web["@id"], WEBSITE_ID);
  // WebSite сочи към Organization като издател
  assert.equal(web.publisher["@id"], ORG_ID);
  assert.ok(org.logo, "организацията има лого");
});

test("organizationLd добавя sameAs само при подадени профили", () => {
  const without = organizationLd() as Record<string, unknown>;
  assert.ok(!("sameAs" in without));
  const withFb = organizationLd({ sameAs: ["https://facebook.com/x"] }) as {
    sameAs: string[];
  };
  assert.deepEqual(withFb.sameAs, ["https://facebook.com/x"]);
});

test("webPageLd включва speakable за гласови асистенти", () => {
  const p = webPageLd({ name: "Тест", path: "/x" }) as {
    speakable: { cssSelector: string[] };
    isPartOf: { "@id": string };
  };
  assert.ok(Array.isArray(p.speakable.cssSelector));
  assert.equal(p.isPartOf["@id"], WEBSITE_ID);
});

test("градът е отделен възел с @id и проверени sameAs (Wikidata/Wikipedia)", () => {
  const c = cityLd() as {
    "@type": string;
    "@id": string;
    sameAs: string[];
    containedInPlace: { "@id": string };
  };
  assert.equal(c["@type"], "City");
  assert.equal(c["@id"], CITY_ID);
  assert.ok(c.sameAs.includes("https://www.wikidata.org/wiki/Q405175"));
  assert.ok(c.sameAs.some((u) => u.startsWith("https://bg.wikipedia.org/wiki/")));
  assert.equal(c.containedInPlace["@id"], MUNICIPALITY_ID);
});

test("Organization обслужва града по @id, но НЕ твърди, че е общината", () => {
  const org = organizationLd({ sameAs: ["https://carbonstealth.eu"] }) as {
    sameAs: string[];
    areaServed: { "@type": string; "@id": string; sameAs?: string[] }[];
  };
  const city = org.areaServed.find((a) => a["@type"] === "City");
  assert.equal(city?.["@id"], CITY_ID);
  const muni = org.areaServed.find((a) => a["@type"] === "AdministrativeArea");
  assert.equal(muni?.["@id"], MUNICIPALITY_ID);
  assert.deepEqual(muni?.sameAs, ["https://www.wikidata.org/wiki/Q2401761"]);
  // sameAs на нашата организация: нито Wikidata/Wikipedia на града, нито сайт на общината.
  for (const u of org.sameAs) {
    assert.ok(!/wikidata|wikipedia|bobovdol\.bg|egov\.bg/.test(u), u);
  }
  const web = websiteLd() as { about: { "@id": string } };
  assert.equal(web.about["@id"], CITY_ID);
});

test("buildMetadata: ключови думи винаги с „Carbon Stealth“, без повторения", () => {
  const m = buildMetadata({ title: "Т", path: "/x", keywords: ["Как да", "как да", "Бобов дол"] });
  assert.deepEqual(m.keywords, ["Как да", "Бобов дол", "Carbon Stealth"]);
  assert.deepEqual(withBrandKeyword(["carbon stealth", "а"]), ["carbon stealth", "а"]);
  assert.ok(!("keywords" in buildMetadata({ title: "Т" })), "без подадени — наследява от layout");
});

test("buildMetadata: noindex по подразбиране е nofollow; follow се включва изрично", () => {
  const a = buildMetadata({ noindex: true }).robots as { index: boolean; follow: boolean };
  assert.deepEqual([a.index, a.follow], [false, false]);
  const b = buildMetadata({ noindex: true, follow: true }).robots as {
    index: boolean;
    follow: boolean;
  };
  assert.deepEqual([b.index, b.follow], [false, true]);
});

test("howToLd дава дата и автор САМО при реална проверка", () => {
  const plain = howToLd({ name: "Х", steps: ["а"], url: "https://x/y" }) as Record<string, unknown>;
  assert.ok(!("dateModified" in plain) && !("author" in plain));
  assert.equal(plain.url, "https://x/y");
  const rev = howToLd({ name: "Х", steps: ["а"], url: "https://x/y", reviewedAt: "2026-10-12" }) as {
    dateModified: string;
    author: { "@id": string };
  };
  assert.equal(rev.dateModified, "2026-10-12");
  assert.equal(rev.author["@id"], ORG_ID);
});

test("latestDate взема най-новата реална дата, иначе резервната", () => {
  const fb = new Date("2026-06-30T00:00:00Z");
  assert.equal(latestDate([], fb), fb);
  assert.equal(latestDate([null, undefined, new Date("invalid")], fb), fb);
  const d = latestDate(
    [new Date("2026-01-01T00:00:00Z"), null, new Date("2026-09-09T00:00:00Z")],
    fb,
  );
  assert.equal(d.toISOString(), "2026-09-09T00:00:00.000Z");
});
