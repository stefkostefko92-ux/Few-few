// Опасните сайтове: отварянето на домейн от URLhaus отива на blocked/blocked.html#<адрес>
// (динамично redirect правило — статичното правило на листа не хваща main_frame), „Продължи
// въпреки това“ пуска само сайт, който наистина е в списъка, само http(s), до затваряне на
// браузъра. Включено по подразбиране за нови инсталации; разрешен сайт и пауза са над него.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ok, done, loadBackground } from "./_harness.mjs";
import { makeChrome, sendMessage } from "./_chrome.mjs";

const mock = makeChrome({ storage: { enabled: true, features: { malware: true } } });
let session = [];
mock.chrome.declarativeNetRequest.getSessionRules = async () => structuredClone(session);
mock.chrome.declarativeNetRequest.updateSessionRules = async ({ removeRuleIds = [], addRules = [] }) => {
  session = session.filter((r) => !removeRuleIds.includes(r.id)).concat(structuredClone(addRules));
};
// packaged files, as the service worker fetches them
globalThis.fetch = async (url) => {
  const p = String(url).replace("chrome-extension://test-ext/", "");
  try { const t = readFileSync(join(ROOT, p), "utf8"); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; }
  catch { return { ok: false, status: 404, json: async () => ({}), text: async () => "" }; }
};
globalThis.chrome = mock.chrome;
const bg = loadBackground({ chrome: mock.chrome, exports: "applyState, syncDangerRedirect, DEFAULTS" });

const listed = JSON.parse(readFileSync(join(ROOT, "rules", "urlhaus.json"), "utf8")).flatMap((r) => r.condition.requestDomains || []);
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const urlhaus = JSON.parse(readFileSync(join(ROOT, "rules", "urlhaus.json"), "utf8"));
ok("the static urlhaus rules never match main_frame (that is why the warning rule exists)", urlhaus.every((r) => !(r.condition.resourceTypes || []).includes("main_frame")));
ok("new installs: malware protection on by default", bg.DEFAULTS.features.malware === true);

await bg.applyState();
const danger = () => mock.dynamic().filter((r) => r.id >= 69000 && r.id < 69050);
const d = danger();
ok(`protection on + malware on → warning rules for every listed domain (${d.length} rule(s))`,
  d.length >= 1 && d.flatMap((r) => r.condition.requestDomains).length === new Set(listed).size);
ok("…main_frame only, a redirect to the packaged warning page with the address after #",
  d.every((r) => r.action.type === "redirect" && r.action.redirect.regexSubstitution === "chrome-extension://test-ext/blocked/blocked.html#\\0" &&
    r.condition.regexFilter === "^https?://.*" && r.condition.resourceTypes.join() === "main_frame"));
ok("…priority 2: above the list's blocks, below an allowed site (10000), the YouTube bypass and a pause", d.every((r) => r.priority === 2));
ok("the warning page is web-accessible (Chrome only redirects a navigation to such a page), without a dynamic URL",
  manifest.web_accessible_resources.some((w) => w.resources.includes("blocked/blocked.html") && !w.use_dynamic_url));

mock.store.set("features", { malware: false });
await bg.applyState();
ok("malware switch off → no warning rules", danger().length === 0);
mock.store.set("features", { malware: true });
mock.store.set("enabled", false);
await bg.applyState();
ok("protection off → no warning rules", danger().length === 0);
mock.store.set("enabled", true);
await bg.applyState();

const h = await sendMessage(mock.listeners, { type: "getHealth" });
ok(`engine health: the warning page is armed for every listed site, and the rule budget is shown (${JSON.stringify(h && h.capacity)})`,
  h && h.malwareOn === true && h.dynamic.danger === new Set(listed).size && h.capacity && h.capacity.dynamic === mock.dynamic().length && h.capacity.dynamicMax === 30000 &&
  h.capacity.regex === mock.dynamic().filter((x) => x.condition && x.condition.regexFilter).length && h.capacity.regex >= danger().length && h.capacity.regexMax === 1000);

// "Continue anyway"
const host = listed.find((x) => /^[a-z0-9-]+\.(com|net|org)$/.test(x));
let r = await sendMessage(mock.listeners, { type: "proceedDangerous", url: `http://www.${host}/a?b=1#c` });
ok(`continue to a listed site (www.${host}) → one session allow rule for that host, main_frame`, r && r.ok && r.url === `http://www.${host}/a?b=1#c` &&
  session.length === 1 && session[0].action.type === "allow" && session[0].priority === 3 && session[0].condition.requestDomains.join() === `www.${host}` && session[0].condition.resourceTypes.join() === "main_frame");
r = await sendMessage(mock.listeners, { type: "proceedDangerous", url: `http://www.${host}/other` });
ok("…the same site again adds nothing", r.ok && session.length === 1);
r = await sendMessage(mock.listeners, { type: "proceedDangerous", url: "https://www.example.org/" });
ok("a site that is not on the list is refused", r.ok === false && session.length === 1);
for (const bad of [`javascript:alert(1)//${host}`, `file:///${host}`, `ftp://${host}/`, "not a url", ""]) {
  r = await sendMessage(mock.listeners, { type: "proceedDangerous", url: bad });
  if (r.ok !== false) ok(`refused: ${bad}`, false);
}
ok("anything but http(s) is refused", session.length === 1);
r = await sendMessage(mock.listeners, { type: "proceedDangerous", url: `http://${host}/` }, { id: "test-ext", url: `https://${host}/`, tab: { id: 2 }, frameId: 0 });
ok("a web page (content script) cannot ask for it", r === undefined);

// the page itself
const page = readFileSync(join(ROOT, "blocked", "blocked.js"), "utf8");
ok("blocked.js does nothing inside a frame (no click-jacking of “Continue”)", /if \(window\.top !== window\) \{\s*document\.documentElement\.textContent = "";/.test(page));
ok("blocked.js only follows an http(s) address, and only after the SW said yes", /\/\^https\?:\$\/\.test\(u\.protocol\)/.test(page) && /type: "proceedDangerous"/.test(page) && /location\.replace\(r\.url\)/.test(page));
ok("blocked.js writes no HTML and evaluates nothing", !/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(page));

done();
