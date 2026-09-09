// Общ harness за тестовете: симулиран MAIN world (window/document/cookie jar)
// + зареждане на shipped engine-а и на service worker-а (с Proxy chrome stub).
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
export const ok = (name, cond) => {
  if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); }
};
export const done = () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

// Минимален cookie jar със семантиката на document.cookie (set/expire/read).
function makeCookieJar() {
  const jar = new Map();
  return {
    get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
    set cookie(str) {
      const parts = String(str).split(/;\s*/);
      const [name, ...rest] = parts[0].split("=");
      const value = rest.join("=");
      const expired = parts.some((p) => /^max-age=0$/i.test(p) || /^expires=.*1970/i.test(p));
      if (expired) jar.delete(name); else jar.set(name, value);
    },
  };
}

// Симулиран свят. Capture listener-ите на window се викат ПРЕДИ document-ните,
// както в реалния DOM (capture фаза).
export function makeWorld(hostname = "www.example.com") {
  const g = globalThis;
  const win = { _cap: {}, _bub: {}, addEventListener(t, f, cap) { ((cap ? this._cap : this._bub)[t] ||= []).push(f); } };
  const docL = {};
  const nodes = {};
  const jar = makeCookieJar();
  g.window = win;
  g.location = { hostname, href: `https://${hostname}/p` };
  g.performance = { now: () => 1 };
  g.CSS = { escape: (s) => s };
  g.MutationObserver = class { observe() {} };
  g.Response = class { json() { return Promise.resolve({}); } };
  g.EventTarget = class { addEventListener() {} };
  g.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  g.document = {
    currentScript: null,
    get cookie() { return jar.cookie; },
    set cookie(v) { jar.cookie = v; },
    addEventListener(t, f) { (docL[t] ||= []).push(f); },
    dispatchEvent(ev) {
      (win._cap[ev.type] || []).forEach((f) => f(ev));
      (docL[ev.type] || []).forEach((f) => f(ev));
      return true;
    },
    querySelectorAll(sel) { return nodes[sel] || []; },
  };
  win.setTimeout = () => 42;
  win.setInterval = () => 77;
  win.open = () => ({ closed: false });
  win.fetch = (u) => Promise.resolve("REAL:" + u);
  win.RTCPeerConnection = function () {};
  win.JSON = JSON;
  return { g, win, docL, nodes, jar };
}

export function loadEngine(file = join(ROOT, "scriptlets", "main.js")) {
  runInThisContext(readFileSync(file, "utf8"), { filename: file });
}

// Доставя live директиви точно както content.js (JSON низ на DOM събитие).
export const sendLive = (list) =>
  globalThis.document.dispatchEvent(new globalThis.CustomEvent("sa-scriptlets", { detail: JSON.stringify(list) }));

// Зарежда background.js с Proxy chrome stub и връща вътрешните функции.
export function loadBackground(opts = {}) {
  const mk = () => new Proxy(function () {}, { get: (_, p) => (p === "then" ? undefined : mk()), apply: () => mk() });
  globalThis.chrome = opts.chrome || mk();
  // Simulate importScripts("scriptlets/policy.js"): prepend the policy, stub the call.
  const policy = readFileSync(join(ROOT, "scriptlets", "policy.js"), "utf8");
  globalThis.importScripts = () => {};
  let body = readFileSync(join(ROOT, "background.js"), "utf8");
  if (opts.patch) body = opts.patch(body);
  const extra = opts.exports ? ", " + opts.exports : "";
  const src = policy + "\n" + body +
    "\n;globalThis.__bg = { sanitizeConfig, safeSelector, parseUserDomains, domainBlockRules" + extra + " };";
  runInThisContext(src, { filename: "background.js" });
  return globalThis.__bg;
}

export const mkAnchor = (href, text = "") => {
  const attrs = { href };
  return { textContent: text, getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; }, get href() { return attrs.href; } };
};
