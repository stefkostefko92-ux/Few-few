// trust-check.test.mjs — сигналите за доверие на сайт: чисти функции върху HTML, заглавия и security.txt (без мрежа).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseSecurityTxt, YMYL } from "./trust-check.mjs";

const NOW = new Date("2026-11-24T10:00:00Z");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const ORG = {
  "@context": "https://schema.org", "@type": "Organization", "@id": "https://carbonstealth.eu/#org", name: "Carbon Stealth VCC",
  legalName: "Карбон Стелт ВКЦ ЕООД", vatID: "BG208725180", logo: "https://carbonstealth.eu/logo.png",
  sameAs: ["https://www.linkedin.com/company/carbonstealth", "https://github.com/carbonstealth"],
  email: "info@carbonstealth.eu", telephone: "+359 88 000 0000",
};
const LINKS = `<a href="/za-nas">За нас</a><a href="/kontakt">Контакт</a><a href="/privacy">Поверителност</a><a href="/impressum">Правна информация</a>
  <p>info@carbonstealth.eu · +359 88 000 0000</p>`;
const SEC_OK = { status: 200, contentType: "text/plain; charset=utf-8", text: "Contact: mailto:security@carbonstealth.eu\nExpires: 2027-06-01T00:00:00Z\n" };
const HEAD_OK = { "strict-transport-security": "max-age=31536000; includeSubDomains" };
const by = (r, id) => r.checks.find((c) => c.id === id);

test("пълен набор сигнали → нула твърди провали", () => {
  const r = analyze({ url: "https://carbonstealth.eu", html: ld(ORG) + LINKS, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.deepEqual(r.checks.filter((c) => !c.ok && c.level === "твърда").map((c) => c.id), []);
  assert.equal(by(r, "org-sameAs").ok, true);
  assert.equal(by(r, "hsts").ok, true);
  assert.equal(by(r, "security-txt").ok, true);
  assert.equal(by(r, "nap").ok, true);
});

test("счупен JSON-LD и липсваща организация са твърди провали", () => {
  const r = analyze({ url: "https://x.it", html: `<script type="application/ld+json">{"@type": "Restaurant",}</script>`, headers: {}, security: { status: 404 }, now: NOW });
  assert.equal(by(r, "jsonld-valid").ok, false);
  assert.equal(by(r, "jsonld-valid").level, "твърда");
  assert.equal(by(r, "org").ok, false);
});

test("собствени звезди (aggregateRating/review) върху Organization или LocalBusiness подтип са твърд провал; върху Product — бележка", () => {
  const rest = { "@context": "https://schema.org", "@type": "Restaurant", name: "K", aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6, reviewCount: 134 } };
  const r = analyze({ url: "https://k.it", html: ld(rest) + LINKS, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(r, "self-serving-rating").ok, false);
  assert.equal(by(r, "self-serving-rating").level, "твърда");
  const graph = { "@context": "https://schema.org", "@graph": [{ ...ORG, review: [{ "@type": "Review" }] }] };
  assert.equal(by(analyze({ url: "https://c.eu", html: ld(graph) + LINKS, headers: HEAD_OK, security: SEC_OK, now: NOW }), "self-serving-rating").ok, false);
  const app = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "A", aggregateRating: { ratingValue: 5, ratingCount: 3 } };
  const ra = analyze({ url: "https://a.eu", html: ld(ORG) + ld(app) + LINKS, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(ra, "self-serving-rating").ok, true);
  assert.equal(by(ra, "product-rating").ok, false);
  assert.equal(by(ra, "product-rating").level, "бележка");
});

test("страниците за доверие се откриват по BG, EN и IT; поверителност и контакт са твърди", () => {
  const it = analyze({ url: "https://p.it", html: ld(ORG) + `<a href="/chi-siamo">Chi siamo</a><a href="/contatti">Contatti</a><a href="/privacy-policy">Privacy</a><a href="/note-legali">Note legali</a>`, headers: HEAD_OK, security: SEC_OK, now: NOW });
  for (const id of ["page-about", "page-contact", "page-privacy", "page-legal"]) assert.equal(by(it, id).ok, true, id);
  const none = analyze({ url: "https://n.eu", html: ld(ORG), headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(none, "page-privacy").level, "твърда");
  assert.equal(by(none, "page-contact").level, "твърда");
  assert.equal(by(none, "page-privacy").ok, false);
});

test("YMYL: контакт в организацията и „За нас“ са твърди; извън YMYL са бележки", () => {
  assert.ok(YMYL.has("medqr.carbonstealth.eu"));
  const bare = { "@context": "https://schema.org", "@type": "Organization", name: "M" };
  const y = analyze({ url: "https://medqr.carbonstealth.eu", html: ld(bare) + `<a href="/privacy">Privacy</a><a href="/contact">Contact</a>`, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(y, "org-contact").level, "твърда");
  assert.equal(by(y, "page-about").level, "твърда");
  const n = analyze({ url: "https://mastilko-bg.com", html: ld(bare) + `<a href="/privacy">Privacy</a><a href="/contact">Contact</a>`, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(n, "org-contact").level, "бележка");
  assert.equal(by(n, "page-about").level, "бележка");
});

test("HSTS под 6 месеца и NAP, който не се вижда в страницата, са бележки", () => {
  const r = analyze({ url: "https://c.eu", html: ld(ORG) + `<a href="/privacy">p</a><a href="/kontakt">к</a>`, headers: { "strict-transport-security": "max-age=300" }, security: SEC_OK, now: NOW });
  assert.equal(by(r, "hsts").ok, false);
  assert.equal(by(r, "hsts").level, "бележка");
  assert.equal(by(r, "nap").ok, false);
});

test("security.txt по RFC 9116: Contact и Expires задължителни; изтекъл или над година напред — провал", () => {
  assert.equal(parseSecurityTxt(SEC_OK, NOW).ok, true);
  assert.equal(parseSecurityTxt({ status: 200, contentType: "text/plain", text: "Contact: mailto:a@b.c\n" }, NOW).ok, false);
  assert.match(parseSecurityTxt({ status: 200, contentType: "text/plain", text: "Contact: mailto:a@b.c\nExpires: 2026-01-01T00:00:00Z\n" }, NOW).why, /изтекъл/);
  assert.match(parseSecurityTxt({ status: 200, contentType: "text/plain", text: "Contact: mailto:a@b.c\nExpires: 2029-01-01T00:00:00Z\n" }, NOW).why, /година/);
  assert.match(parseSecurityTxt({ status: 200, contentType: "text/html", text: "<html>" }, NOW).why, /text\/plain/);
  assert.equal(parseSecurityTxt({ status: 404 }, NOW).ok, false);
});

test("sameAs само към https; празен sameAs е бележка, не твърд провал", () => {
  const o = { ...ORG, sameAs: ["http://facebook.com/x", "https://github.com/x"] };
  const r = analyze({ url: "https://c.eu", html: ld(o) + LINKS, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(r, "org-sameAs").ok, false);
  assert.match(by(r, "org-sameAs").msg, /https/);
  const e = analyze({ url: "https://c.eu", html: ld({ ...ORG, sameAs: [] }) + LINKS, headers: HEAD_OK, security: SEC_OK, now: NOW });
  assert.equal(by(e, "org-sameAs").level, "бележка");
});

test("контакт: mailto:/tel: връзка от началната е контакт, и без думата „контакт“", () => {
  const html = ld(ORG) + `<a href="/privacy">Privacy</a><a href="mailto:info@carbonstealth.eu">info@carbonstealth.eu</a>`;
  assert.equal(by(analyze({ url: "https://x.example", html, now: NOW }), "page-contact").ok, true, "mailto");
  const tel = ld(ORG) + `<a href="tel:+359877414874">0877 414 874</a>`;
  assert.equal(by(analyze({ url: "https://x.example", html: tel, now: NOW }), "page-contact").ok, true, "tel");
});

test("правни данни: legalName/vatID/taxID на parentOrganization важат за проекта", () => {
  const proj = { "@context": "https://schema.org", "@type": "Organization", "@id": "https://p.example/#org", name: "Проект", email: "a@b.c",
    parentOrganization: { "@type": "Organization", "@id": "https://carbonstealth.eu/#org", legalName: "Карбон Стелт ЕДПК", vatID: "BG208725180" } };
  const r = analyze({ url: "https://p.example", html: ld(proj), now: NOW });
  assert.equal(by(r, "org-legal-ids").ok, true);
  const bare = { ...proj, parentOrganization: { "@type": "Organization", name: "X" } };
  assert.equal(by(analyze({ url: "https://p.example", html: ld(bare), now: NOW }), "org-legal-ids").ok, false);
});
