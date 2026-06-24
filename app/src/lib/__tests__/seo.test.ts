import test from "node:test";
import assert from "node:assert/strict";
import {
  canonical,
  breadcrumbLd,
  faqPageLd,
  organizationLd,
  websiteLd,
  webPageLd,
  ORG_ID,
  WEBSITE_ID,
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
