// foreign.js — reads a backup or export of another ad blocker (uBlock Origin,
// AdGuard, Adblock Plus / AdBlock) for Settings → "Import from another ad blocker".
// Classic script (root.ForeignImport), pure: no I/O, no chrome.*; the options page
// hands it the file's text and sends what comes out to the service worker, which
// checks everything again (valid hosts, the allowlist cap, only the filter lines
// "My filters" can apply). The file is someone else's data, never code: nothing in
// it is evaluated, it is only split into lines.
//
// What it takes:
//   • the sites the user allowed — uBO "trusted sites" (whitelist / netWhitelist),
//     AdGuard's allowlist, ABP/AdBlock `@@||site^$document` lines, a trusted-sites
//     export (one site per line);
//   • the user's own filter lines — uBO userFilters, AdGuard user rules, ABP's
//     [Subscription filters], a plain filter list.
// Never the subscribed lists or the settings of the other blocker.
(function (root) {
"use strict";

const MAX_TEXT = 10 * 1024 * 1024;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
// uBO's trusted-site directives that are not sites
const UBO_SCHEMES = /^(?:about|chrome|chrome-extension|moz-extension|edge|opera|vivaldi|brave|safari-web-extension)-scheme$|^behind-the-scene$/;

function toHost(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s || s.length > 300) return "";
  s = s.replace(/^\*\./, "").replace(/\.$/, "");
  try { s = new URL("http://" + s).hostname; } catch (e) { return ""; }
  s = s.replace(/^www\./, "");
  return HOST_RE.test(s) ? s : "";
}

// A trusted-site entry that means a whole site: `example.com`, `*.example.com`,
// `https://example.com/` or `https://example.com/*`. A path, a regex or a scheme
// directive is not a site — left out.
function siteOf(entry) {
  const e = String(entry || "").trim();
  if (!e || e.startsWith("/") || UBO_SCHEMES.test(e)) return "";
  const m = /^(?:(?:https?|\*):\/\/)?([^/\s?#]+)(\/\*?)?$/i.exec(e);
  return m ? toHost(m[1].replace(/:\d+$/, "")) : "";
}

// `@@||example.com^$document` (any order of options, without domain=): the
// ABP / AdBlock / AdGuard way of allowing a whole site.
function allowOfFilter(line) {
  const m = /^@@\|\|([^\/^$*|]+)\^?\$(.+)$/.exec(line);
  if (!m) return "";
  const opts = m[2].toLowerCase().split(",").map((o) => o.trim());
  if (!opts.some((o) => o === "document" || o === "doc") || opts.some((o) => o.startsWith("domain=") || o.startsWith("from="))) return "";
  return toHost(m[1]);
}

const lines = (text) => String(text || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
const isComment = (l) => l.startsWith("!") || /^\[(?:adblock|ublock|adguard)/i.test(l);

function result(source, allow, filterLines) {
  const allowSet = new Set();
  for (const h of allow) if (h) allowSet.add(h);
  const keep = [];
  for (const l of filterLines) {
    if (isComment(l)) continue;
    const site = allowOfFilter(l);
    if (site) { allowSet.add(site); continue; }
    keep.push(l);
  }
  return { source, allowlist: [...allowSet], filters: keep.join("\n") };
}

function fromJson(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  // uBlock Origin backup (my-ublock-backup_*.txt)
  if (typeof o.userFilters === "string" && ("whitelist" in o || "netWhitelist" in o || "selectedFilterLists" in o || "userSettings" in o)) {
    const trusted = Array.isArray(o.whitelist) ? o.whitelist : typeof o.netWhitelist === "string" ? o.netWhitelist.split("\n") : [];
    return result("ublock", trusted.map(siteOf), lines(o.userFilters));
  }
  // AdGuard (Settings → Export settings): filters.user-filter + filters.whitelist (allowlist in newer builds)
  const f = o.filters;
  if (f && typeof f === "object" && ("user-filter" in f || "whitelist" in f || "allowlist" in f || "protocol-version" in o)) {
    const uf = f["user-filter"] || {};
    const off = new Set(lines(uf["disabled-rules"]));
    const rules = uf.enabled === false ? [] : lines(uf.rules).filter((l) => !off.has(l));
    const wl = f.allowlist || f.whitelist || {};
    // inverted = "block only on these sites" — not something an allowlist can say
    const sites = wl.enabled === false || wl.inverted === true || !Array.isArray(wl.domains) ? [] : wl.domains.map(siteOf);
    return result("adguard", sites, rules);
  }
  // our own settings file — its allowlist and filters, added (Import settings replaces)
  if (Array.isArray(o.allowlist) && ("features" in o || "userFilters" in o)) {
    return result("supreme", o.allowlist.map(siteOf), lines(typeof o.userFilters === "string" ? o.userFilters : ""));
  }
  return null;
}

// Adblock Plus backup (patterns.ini): [Subscription] blocks with key=value lines, the
// user's own filters under [Subscription filters]; a leading "[" in a filter is "\[".
function fromAbpBackup(all) {
  const keep = [];
  let inFilters = false;
  for (const l of all) {
    if (/^\[[^\]]*\]$/.test(l)) { inFilters = /^\[subscription filters\]$/i.test(l); continue; }
    if (inFilters) keep.push(l.startsWith("\\[") ? l.slice(1) : l);
  }
  return result("abp", [], keep);
}

function parse(text, fileName) {
  let s = String(text || "");
  if (s.length > MAX_TEXT) return { error: "too-large" };
  s = s.replace(/^﻿/, "").trim();
  if (!s) return { error: "empty" };
  if (s.startsWith("{")) {
    let o = null;
    try { o = JSON.parse(s); } catch (e) { return { error: "unknown" }; }
    return fromJson(o) || { error: "unknown" };
  }
  const all = lines(s);
  if (/^#\s*adblock plus preferences/i.test(all[0] || "") || all.some((l) => /^\[subscription filters\]$/i.test(l))) return fromAbpBackup(all);
  // a trusted-sites / allowlist export: nothing but sites (and uBO's scheme lines). A
  // bare domain in a FILTER list would block it, so a file of only sites is read as
  // the sites to allow unless its name says it holds filters.
  const body = all.filter((l) => !isComment(l) && !l.startsWith("#"));
  const onlySites = body.length > 0 && body.every((l) => UBO_SCHEMES.test(l) || (!/[|^$#@]/.test(l) && siteOf(l)));
  const name = String(fileName || "").toLowerCase();
  const saysFilters = /filter|rule|block/.test(name.replace(/ublock|adblock|adguard/g, "")); // "my-ublock-…" is no "block"
  if (onlySites && !saysFilters) return result(/ublock/.test(name) ? "ublock" : "text", body.map(siteOf), []);
  return result("text", [], all);
}

root.ForeignImport = { parse, siteOf, allowOfFilter };
})(typeof self !== "undefined" ? self : this);
