// projects.mjs — реалните проекти: карта (ползва се и в хъба) + страница /proekti/ · /projects/ · /progetti/.
// Снимка = реален скрийншот (public/img/projects/<id>.webp); без снимка → типографска обложка със стека.
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, LANGS } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { PROJECTS, CASE_STUDY_PATH } from "../projects.mjs";
import { siteNav, siteFooter, ghost, contact, HUB_FONTS, BRAND_BG } from "./hub.mjs";

const initials = (name) => name.replace(/[„“"]/g, "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/** Една карта. full=true (страницата) показва и фактите; в хъба — само стек + линкове. */
export function projectCard(lang, pr, ui, i, full) {
  const t = pr.t[lang], p = ui.projects;
  const cover = pr.shot
    ? `<img class="pj-shot" src="/img/projects/${pr.id}-sm.webp" srcset="/img/projects/${pr.id}-sm.webp 960w, /img/projects/${pr.id}.webp 1920w" sizes="(max-width:900px) 100vw, 33vw" alt="${esc(t.name)} — ${esc(t.category)}" width="960" height="600" loading="lazy" decoding="async">`
    : `<span class="pj-type" style="--pa:${pr.accent}" aria-hidden="true"><b>${esc(initials(t.name))}</b><i>${esc(pr.stack.slice(0, 3).join(" · "))}</i></span>`;
  const cs = pr.caseStudy ? `<a class="pj-cs" href="${CASE_STUDY_PATH[lang](pr.caseStudy)}" target="_blank" rel="noopener">${esc(p.caseStudy)} ↗</a>` : "";
  return `<article class="cell pj"><a class="pj-cover" href="${pr.url}" target="_blank" rel="noopener" aria-label="${esc(p.visit)}: ${esc(t.name)}">${cover}<span class="live" aria-hidden="true">${esc(p.live)}</span></a><div class="pj-meta"><span class="cat">${esc(t.category)}</span><${full ? "h2" : "h3"}>${esc(t.name)}</${full ? "h2" : "h3"}><p>${esc(t.desc)}</p>${full ? `<ul class="pj-facts">${t.facts.map((f) => `<li>${ICON.check}${esc(f)}</li>`).join("")}</ul>` : ""}<div class="pj-stack" aria-label="${esc(p.stack)}">${pr.stack.map((s) => `<span>${esc(s)}</span>`).join("")}</div><div class="pj-links"><a class="pj-visit" href="${pr.url}" target="_blank" rel="noopener">${esc(p.visit)} ↗</a>${cs}${!pr.shot && full ? `<span class="pj-note">${esc(p.noShot)}</span>` : ""}</div></div></article>`;
}

function schema(lang, ui, path) {
  return jsonLd({ "@context": "https://schema.org", "@graph": [
    ORG,
    { "@type": "CollectionPage", "@id": SITE + path, url: SITE + path, name: ui.meta.projectsTitle, description: ui.meta.projectsDesc, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": ORG["@id"] },
      hasPart: PROJECTS.map((pr) => ({ "@type": "CreativeWork", name: pr.t[lang].name, url: pr.url, about: pr.t[lang].category, description: pr.t[lang].desc, creator: { "@id": ORG["@id"] } })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: ui.nav.projects, item: SITE + path }] },
  ] });
}

export function renderProjects(lang) {
  const ui = I18N[lang], p = ui.projects, path = PATHS.projects[lang];
  return join([
    head({ lang, title: ui.meta.projectsTitle, description: ui.meta.projectsDesc, keywords: ui.meta.projectsKeywords, path, paths: PATHS.projects, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema(lang, ui, path) }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.projects),
    `<main id="main"><section class="section" id="projects" style="padding-top:140px"><div class="wrap"><div class="tag">${esc(p.eyebrow)}</div><h1 class="h2">${p.title}</h1><p class="lede">${esc(p.pageLede)}</p><ul class="stats" style="margin:0 0 48px;grid-template-columns:repeat(3,1fr)"><li><b>${PROJECTS.length}</b><span>${esc(p.countLabel)}</span></li><li><b>${PROJECTS.filter((x) => x.caseStudy).length}</b><span>${esc(p.caseStudy)}</span></li><li><b>3</b><span>BG · EN · IT</span></li></ul><div class="grid1 projects">${PROJECTS.map((pr, i) => projectCard(lang, pr, ui, i, true)).join("")}</div></div></section>`,
    contact(lang, ui), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
