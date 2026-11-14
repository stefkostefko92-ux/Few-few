// "Something broken on this site?" — quick fixes first, then an optional report the
// user sends from THEIR OWN email app (mailto:) or copies. The extension itself sends
// nothing; the preview shows every word before it leaves.
const $ = (id) => document.getElementById(id);
const L = (key, fallback, subs) => (window.saI18n && window.saI18n.t(key, subs)) ||
  String(fallback || "").replace(/\$(\d)/g, (m, i) => (subs && subs[i - 1] != null ? subs[i - 1] : m));
const REPORT_TO = "info@carbonstealth.eu";

const q = new URLSearchParams(location.search);
const tabId = Number(q.get("tab"));
let pageUrl = "";
let host = "";
let log = [];
let lists = [];
let features = {};
// 5.6: what was tried here and whether it helped — goes into the report, so we know which fix worked
const tried = [];
let lastFix = null;
// from the lightest fix to the strongest: "No, still broken" points to the next one. Allowing the site
// for good is the same rule as "for 1 hour" without the end — when the hour did not help, it cannot
// either (it would only leave the site unprotected), so the pause comes next.
const FIXES = ["fixCosm", "fixHour", "fixAllow", "fixPause"];
const SKIP_AFTER = { fixHour: ["fixAllow"] };
const FIX_NAME = { fixCosm: "element hiding off here", fixHour: "allowed here for 1 hour", fixAllow: "allowed here", fixPause: "paused everywhere for 30 minutes" };

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
    ...(tried.length ? ["Tried: " + tried.map((x) => FIX_NAME[x.fix] + " → " + (x.result || "not answered")).join("; ")] : []),
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
function done(msg, fix) {
  $("fixHint").textContent = msg;
  if (!fix) return;
  lastFix = fix;
  tried.push({ fix, result: "" });
  $("fixedHint").textContent = "";
  $("fixedAsk").hidden = false;
  renderPreview();
}
function answered(result) {
  const last = tried[tried.length - 1];
  if (last) last.result = result;
  $("fixedAsk").hidden = true;
  renderPreview();
}
$("fixedYes").addEventListener("click", () => {
  answered("worked");
  $("fixedHint").textContent = L("rep_fixed_yes_note", "Glad it works. If you tell us below, the report says which fix worked, so we can fix the site for everyone.");
  $("what").focus(); // the answer buttons are gone: keyboard and screen-reader users continue at the report
});
$("fixedNo").addEventListener("click", () => {
  answered("still broken");
  const next = FIXES.slice(FIXES.indexOf(lastFix) + 1).filter((id) => !(SKIP_AFTER[lastFix] || []).includes(id))
    .map((id) => $(id)).find((b) => b && !b.disabled);
  if (next) {
    $("fixedHint").textContent = L("rep_fixed_next", "Try the next one: $1", [next.textContent.trim()]);
    next.focus();
  } else {
    $("fixedHint").textContent = L("rep_fixed_none", "Then please tell us below: we will look at the site.");
    $("what").focus();
  }
});

$("fixCosm").addEventListener("click", () => {
  if (!host) return;
  chrome.runtime.sendMessage({ type: "setNoCosmetics", host, off: true }, () => { reloadTab(); done(L("rep_done_cosm", "Element hiding is off on this site. Reloaded — is it fixed?"), "fixCosm"); });
});
$("fixAllow").addEventListener("click", () => {
  if (!host) return;
  chrome.runtime.sendMessage({ type: "setAllow", host, allow: true }, () => { reloadTab(); done(L("rep_done_allow", "Ads are allowed on this site. Reloaded — is it fixed?"), "fixAllow"); });
});
// for a while only: the SW takes the site off the allowlist again after an hour (alarm "allow-expire")
$("fixHour").addEventListener("click", () => {
  if (!host) return;
  chrome.runtime.sendMessage({ type: "setAllow", host, allow: true, minutes: 60 }, () => { reloadTab(); done(L("rep_done_hour", "Ads are allowed on this site for 1 hour. Reloaded — is it fixed?"), "fixHour"); });
});
$("fixPause").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pause", minutes: 30 }, () => { reloadTab(); done(L("rep_done_pause", "Paused for 30 minutes. If the site works now, please tell us below."), "fixPause"); });
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
  $("webmail").textContent = L("rep_webmail", "No email app? Copy the report and send it to $1 from your webmail.", [REPORT_TO]);
  $("host").textContent = host || "—";
  for (const b of [$("fixCosm"), $("fixHour"), $("fixAllow")]) b.disabled = !host;
  const d = await chrome.storage.local.get(["features"]);
  features = d.features || {};
  await new Promise((res) => chrome.runtime.sendMessage({ type: "getLists" }, (r) => { lists = r ? r.lists.filter((e) => e.on).map((e) => e.id) : []; res(); }));
  if (tabId >= 0) await new Promise((res) => chrome.runtime.sendMessage({ type: "getTabLog", tabId }, (r) => { log = r && r.ok ? r.items : []; res(); }));
  renderPreview();
})();
