// brochure.mjs — печатната брошура А5 (BG/EN/IT): 6 страници, същите данни като сайта (демота · проекти ·
// цени от pricing.mjs · процес · защо · контакт). HTML версията е достъпна (noindex — тя е печатен асет);
// tools/brochure.mjs я печата в PDF през headless Chromium → public/broshura/*.pdf (линк в подножието).
import { esc, join, head, credit, PATHS, SITE, BRAND_EMAIL, BRAND_URL, BROCHURE_PDF, demoPath } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { DEMOS } from "../demos/index.mjs";
import { DEMO_ICONS } from "./icons.mjs";
import { PROJECTS } from "../projects.mjs";
import { TIERS, ADDONS, money, shown } from "../pricing.mjs";
import { HUB_FONTS, BRAND_BG } from "./hub.mjs";

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const HOST = SITE.replace(/^https?:\/\//, "");

export function renderBrochure(lang) {
  const ui = I18N[lang], b = ui.brochure, p = ui.pricing, path = PATHS.brochure[lang];
  const vars = { n: DEMOS.length, date: new Date().toISOString().slice(0, 10) };
  const foot = (n) => `<footer class="bp-foot"><span>${HOST}</span><span>${esc(b.page)} ${n}</span></footer>`;
  const cover = `<section class="bp bp-cover"><picture><source srcset="/logo.webp" type="image/webp"><img src="/logo.png" alt="Carbon Stealth VCC" width="673" height="160"></picture><p class="bp-tag">${esc(b.coverTag)}</p><h1>${esc(b.coverTitle)}</h1><p class="bp-sub">${esc(fill(b.coverSub, vars))}</p><p class="bp-url">${HOST}</p></section>`;
  const demos = `<section class="bp"><h2>${esc(fill(b.demosTitle, vars))}</h2><p class="bp-lede">${esc(b.demosLede)}</p><ul class="bp-demos">${DEMOS.map((d) => `<li>${DEMO_ICONS[d.icon] || ""}<b>${esc(d.t[lang].name)}</b><span>${esc(d.t[lang].category)}</span><small>${HOST}${demoPath(lang, d)}</small></li>`).join("")}</ul>${foot(2)}</section>`;
  const shots = PROJECTS.filter((pr) => pr.shot).slice(0, 6);
  const projects = `<section class="bp"><h2>${esc(b.projectsTitle)}</h2><ul class="bp-projects">${shots.map((pr) => { const t = pr.t[lang]; return `<li><img src="/img/projects/${pr.id}.webp" alt="${esc(t.name)}" width="960" height="600"><b>${esc(t.name)}</b><span>${esc(t.category)}</span><small>${pr.url.replace(/^https?:\/\//, "")}</small></li>`; }).join("")}</ul>${foot(3)}</section>`;
  const tiers = `<section class="bp"><h2>${esc(b.pricingTitle)}</h2><ul class="bp-tiers">${TIERS.map((t) => { const tt = p.tiers[t.id]; return `<li${t.popular ? ' class="pop"' : ""}><span class="bp-ttag">${esc(tt.tag)}</span><b>${esc(tt.name)}</b><strong>${money(shown(t.price, lang), lang)}</strong><small>${esc(p.delivery)}: ${t.days[0]}–${t.days[1]} ${esc(p.days)}</small><ul>${tt.features.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></li>`; }).join("")}</ul><h3>${esc(b.addonsTitle)}</h3><table class="bp-addons"><tbody>${ADDONS.map((a) => `<tr><td>${esc(p.addons[a.id])}</td><td>${money(shown(a.price, lang), lang)}${a.kind === "monthly" ? ` ${esc(p.perMonth)}` : ""}</td></tr>`).join("")}</tbody></table><p class="bp-note">${esc(b.pricingNote)}</p>${foot(4)}</section>`;
  const process = `<section class="bp"><h2>${esc(b.processTitle)}</h2><ol class="bp-steps">${ui.process.steps.map((s) => `<li><div><b>${esc(s.t)}</b><p>${esc(s.d)}</p></div></li>`).join("")}</ol><h2>${esc(b.whyTitle)}</h2><ul class="bp-why">${ui.why.items.map((w) => `<li><b>${esc(w.t)}</b><p>${esc(w.d)}</p></li>`).join("")}</ul>${foot(5)}</section>`;
  const back = `<section class="bp bp-back"><h2>${esc(b.contactTitle)}</h2><p class="bp-lede">${esc(b.contactLede)}</p><p class="bp-big">${BRAND_EMAIL}</p><p class="bp-big">${HOST}</p><p class="bp-scan">${esc(b.scan)} <b>${HOST}${PATHS.hub[lang]}</b></p><p class="bp-where">${esc(ui.contact.where)}</p><p class="bp-imp">${esc(ui.brand.impressum)} · ${BRAND_URL.replace(/^https?:\/\//, "")}</p><p class="bp-upd">${esc(fill(b.updated, vars))}</p>${credit(lang)}</section>`;
  return join([
    head({ lang, title: b.title, description: b.metaDesc, keywords: b.keywords, path, paths: PATHS.brochure, fonts: HUB_FONTS, css: ["/assets/brochure.css"], themeColor: BRAND_BG, noindex: true }),
    `<body class="brochure">`,
    `<nav class="bp-bar" aria-label="Brochure"><a href="${PATHS.hub[lang]}">← Carbon Stealth Portfolio</a><a class="bp-dl" href="${BROCHURE_PDF[lang]}" download>${esc(b.download)}</a></nav>`,
    `<main id="main">`, cover, demos, projects, tiers, process, back, `</main>`,
    `</body></html>`,
  ]);
}
