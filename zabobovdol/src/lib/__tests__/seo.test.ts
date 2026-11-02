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
  summarize,
  postHasBody,
  postDescription,
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

// --- Описание на новина (meta description) — никога празно ---

test("summarize връща цели изречения до лимита", () => {
  const s = summarize(
    "Първото изречение е кратко. Второто изречение също е тук и е малко по-дълго от първото. " +
      "Третото изречение вече не се събира в лимита и трябва да отпадне изцяло.",
    100,
  );
  assert.equal(
    s,
    "Първото изречение е кратко. Второто изречение също е тук и е малко по-дълго от първото.",
  );
  assert.ok(s.length <= 100);
});

test("summarize реже по дума с „…“, ако първото изречение е твърде дълго", () => {
  const s = summarize("дума ".repeat(80), 155);
  assert.ok(s.length <= 155);
  assert.ok(s.endsWith("…"));
  assert.ok(!s.endsWith(" …"));
});

test("summarize маха Markdown и връща кратък текст без промяна", () => {
  assert.equal(summarize("**Важно:** вижте [сайта](https://egov.bg)."), "Важно: вижте сайта.");
});

test("postHasBody: само заглавие + връзка няма тяло; резюме или текст — има", () => {
  assert.equal(postHasBody({ content: "", excerpt: "" }), false);
  assert.equal(postHasBody({ content: "  \n ", excerpt: "  " }), false);
  assert.equal(postHasBody({ content: "", excerpt: "Кратко резюме." }), true);
  assert.equal(postHasBody({ content: "Текст.", excerpt: "" }), true);
});

test("postDescription спазва реда: SEO описание → резюме → текст", () => {
  const base = { title: "Заглавие", content: "Текст на новината.", excerpt: "Резюме." };
  assert.equal(postDescription({ ...base, seoDescription: "Ръчно описание." }), "Ръчно описание.");
  assert.equal(postDescription({ ...base, seoDescription: "  " }), "Резюме.");
  assert.equal(postDescription({ ...base, excerpt: "" }), "Текст на новината.");
});

test("postDescription от дълъг текст е до ~155 знака", () => {
  const content = "Общината обявява ремонт на улица „Христо Ботев“. ".repeat(10);
  const d = postDescription({ title: "Ремонт", content, excerpt: "" });
  assert.ok(d.length > 0 && d.length <= 155, `дължина ${d.length}`);
});

test("postDescription никога не е празно — фактическо описание по заглавие и източник", () => {
  const withSource = postDescription({
    title: "Устройствен правилник",
    content: "",
    excerpt: "",
    seoDescription: null,
    source: "Община Бобов дол",
    sourceUrl: "https://bobovdol.egov.bg/x",
  });
  assert.ok(withSource.startsWith("Устройствен правилник"));
  assert.ok(withSource.includes("Община Бобов дол"));
  const bare = postDescription({ title: "Съобщение", content: "", excerpt: "" });
  assert.ok(bare.startsWith("Съобщение"));
  assert.ok(bare.length > "Съобщение".length);
});
