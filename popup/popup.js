const $ = (id) => document.getElementById(id);

const toggle = $("toggle");
const hero = $("hero");
const heroTitle = $("heroTitle");
const statusText = $("statusText");
const blockedTotal = $("blockedTotal");
const savedData = $("savedData");
const savedTime = $("savedTime");
const siteHost = $("siteHost");
const allowToggle = $("allowToggle");
const allowLabel = $("allowLabel");
const listDot = $("listDot");

let currentHost = null;

function fmtData(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  if (mb >= 1) return Math.round(mb) + " MB";
  return Math.round(mb * 1024) + " KB";
}

function fmtTime(sec) {
  if (sec >= 3600) return (sec / 3600).toFixed(1) + " h";
  if (sec >= 60) return Math.round(sec / 60) + " min";
  if (sec >= 10) return Math.round(sec) + " s";
  if (sec > 0) return sec.toFixed(1) + " s";
  return "0 s";
}

function load() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs[0]?.url || "";
    chrome.runtime.sendMessage({ type: "getStats", tabUrl }, (res) => {
      if (!res) return;
      toggle.checked = res.enabled;
      blockedTotal.textContent = res.blockedTotal.toLocaleString();
      savedData.textContent = fmtData(res.saved.mb);
      savedTime.textContent = fmtTime(res.saved.seconds);
      setStatus(res.enabled);

      listDot.textContent = (res.filterCount || 0) + "+ filters";

      currentHost = res.host;
      if (currentHost) {
        siteHost.textContent = currentHost;
        allowToggle.checked = !res.allowed;
        setAllowLabel(!res.allowed);
      } else {
        siteHost.textContent = "this page";
        allowToggle.disabled = true;
      }
    });
  });
}

function setStatus(enabled) {
  heroTitle.textContent = enabled ? "Protected" : "Paused";
  statusText.textContent = enabled
    ? "Active — ads are being blocked"
    : "Paused — ads are shown";
  hero.classList.toggle("off", !enabled);
}

function setAllowLabel(blocking) {
  allowLabel.textContent = blocking ? "Blocking" : "Allowed";
}

toggle.addEventListener("change", () => {
  setStatus(toggle.checked);
  chrome.runtime.sendMessage({ type: "toggle", enabled: toggle.checked });
});

allowToggle.addEventListener("change", () => {
  if (!currentHost) return;
  const blocking = allowToggle.checked;
  setAllowLabel(blocking);
  chrome.runtime.sendMessage(
    { type: "setAllow", host: currentHost, allow: !blocking },
    () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.reload(tabs[0].id);
      });
    }
  );
});

$("pickBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "startPicker" }, () => window.close());
});

$("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.addEventListener("DOMContentLoaded", load);
