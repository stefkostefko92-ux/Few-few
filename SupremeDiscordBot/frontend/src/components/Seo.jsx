// frontend/src/components/Seo.jsx
// Lightweight head manager — no external dependency (react-helmet not needed).
// Manages per-route: <title>, meta description, canonical, robots, Open Graph
// overrides, hreflang alternates, html[lang], and an optional JSON-LD block.
//
// Googlebot renders JavaScript, so tags injected here are picked up during
// indexing. hreflang is ALSO declared in public/sitemap.xml (crawlable
// without JS) — keep both in sync via SITE + LOCALES below.

import { useEffect } from "react";

export const SITE = "https://supreme.carbonstealth.eu";

// Landing locales — every entry produces a hreflang alternate on landing routes.
// "en" lives at the root; everything else at /<locale>.
export const LANDING_LOCALES = ["en", "bg", "de", "es", "fr", "it", "nl", "pl"];

export function landingPath(locale) {
  return locale === "en" ? "/" : `/${locale}`;
}

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) return;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel, href, extra = {}) {
  const selector = extra.hreflang
    ? `link[rel="${rel}"][hreflang="${extra.hreflang}"]`
    : `link[rel="${rel}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    if (extra.hreflang) el.setAttribute("hreflang", extra.hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

function clearHreflangs() {
  document.head.querySelectorAll("link[rel='alternate'][hreflang]").forEach((el) => el.remove());
}

function setJsonLd(json) {
  const ID = "seo-route-jsonld";
  let el = document.getElementById(ID);
  if (!json) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = ID;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(json);
}

/**
 * @param {Object} props
 * @param {string} props.title          - Document title
 * @param {string} props.description    - Meta description
 * @param {string} props.path           - Canonical path ("/", "/terms", "/de"…)
 * @param {string} [props.lang]         - html[lang] + og:locale base ("en", "de"…)
 * @param {boolean} [props.noindex]     - Set robots noindex,follow
 * @param {boolean} [props.hreflang]    - Emit hreflang alternates for all landing locales
 * @param {Object} [props.jsonLd]       - Route-specific JSON-LD object
 * @param {string[]} [props.keywords]   - Route-specific keyword override (≥5, always
 *                                         include "Carbon Stealth" — root CLAUDE.md rule).
 *                                         Falls back to index.html's default set if omitted.
 */
export default function Seo({ title, description, path, lang = "en", noindex = false, hreflang = false, jsonLd = null, keywords = null }) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
      setMeta("name", "twitter:description", description);
    }
    if (keywords && keywords.length) {
      setMeta("name", "keywords", keywords.join(", "));
    }
    if (title) {
      setMeta("property", "og:title", title);
      setMeta("name", "twitter:title", title);
    }
    setMeta("name", "robots", noindex
      ? "noindex, follow"
      : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");

    const url = `${SITE}${path}`;
    setLink("canonical", url);
    setMeta("property", "og:url", url);

    document.documentElement.setAttribute("lang", lang);

    clearHreflangs();
    if (hreflang) {
      for (const loc of LANDING_LOCALES) {
        setLink("alternate", `${SITE}${landingPath(loc)}`, { hreflang: loc });
      }
      setLink("alternate", `${SITE}/`, { hreflang: "x-default" });
    }

    setJsonLd(jsonLd);

    return () => {
      // Reset transient route artifacts when navigating away
      setJsonLd(null);
    };
  }, [title, description, path, lang, noindex, hreflang, jsonLd, keywords]);

  return null;
}
