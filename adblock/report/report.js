// "Something broken on this site?" — quick fixes first, then an optional report the
// user sends from THEIR OWN email app (mailto:) or copies. The extension itself sends
// nothing; the preview shows every word before it leaves.
const $ = (id) => document.getElementById(id);
const L = (key, fallback, subs) => (window.saI18n && window.saI18n.t(key, subs)) || fallback;
const REPORT_TO = "info@carbonstealth.eu";

const q = new URLSearchParams(location.search);
const tabId = Number(q.get("tab"));
let pageUrl = "";
let host = "";
let log = [];
let lists = [];
let features = {};

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function report() {
  const m = chrome.runtime.getManifest();
  const ua = navigator.userAgentData;
  const browser = ua && ua.brands ? ua.brands.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => b.brand + " " + b.version).join(", ") : navigator.userAgent;
  const off = Object.keys(features).filter((k) => features[k] === false);
  const lines = [
    "Site: " + (($("fullUrl").checked && pageUrl) ? pageUrl : host),
    "Problem: " + ($("what").value.trim() || "—"),
    "",
    "Supreme AdBlock " + m.version + " · " + browser,
    "Lists on: " + (lists.join(", ") || "—"),
    "Features off: " + (off.join(", ") || "—"),
    "Blocked on the page: " + (log.map((i) => i.list + " ×" + i.n).join(", ") || "—"),
  ];
  return lines.join("\n");
}

function renderPreview() {
  const body = report();
  $("preview").textContent = "To: " + REPORT_TO + "\n\n" + body;
  const subject = "Broken site: " + (host || "?");
  $("sendMail").href = "mailto:" + REPORT_TO + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
}

function reloadTab() {
  if (tabId >= 0) chrome.tabs.reload(tabId).catch(() => {});
}
function done(msg) {
  $("fixHint").textContent = msg;
}

$("fixCosm").addEventListener("click", () => {
  if (!host) return;
  chrome.runtime.sendMessage({ type: "setNoCosmetics", host, off: true }, () => { reloadTab(); done(L("rep_done_cosm", "Element hiding is off on this site. Reloaded — is it fixed?")); });
});
$("fixAllow").addEventListener("click", () => {
  if (!host) return;
  chrome.runtime.sendMessage({ type: "setAllow", host, allow: true }, () => { reloadTab(); done(L("rep_done_allow", "Ads are allowed on this site. Reloaded — is it fixed?")); });
});
$("fixPause").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pause", minutes: 30 }, () => { reloadTab(); done(L("rep_done_pause", "Paused for 30 minutes. If the site works now, please tell us below.")); });
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText("To: " + REPORT_TO + "\n\n" + report()); $("sendHint").textContent = L("rep_copied", "Copied."); }
  catch { $("sendHint").textContent = ""; }
});
$("what").addEventListener("input", renderPreview);
$("fullUrl").addEventListener("change", renderPreview);

(async () => {
  if (tabId >= 0) {
    try { pageUrl = (await chrome.tabs.get(tabId)).url || ""; } catch {}
  }
  host = hostOf(pageUrl);
  $("host").textContent = host || "—";
  for (const b of [$("fixCosm"), $("fixAllow")]) b.disabled = !host;
  const d = await chrome.storage.local.get(["features"]);
  features = d.features || {};
  await new Promise((res) => chrome.runtime.sendMessage({ type: "getLists" }, (r) => { lists = r ? r.lists.filter((e) => e.on).map((e) => e.id) : []; res(); }));
  if (tabId >= 0) await new Promise((res) => chrome.runtime.sendMessage({ type: "getTabLog", tabId }, (r) => { log = r && r.ok ? r.items : []; res(); }));
  renderPreview();
})();
